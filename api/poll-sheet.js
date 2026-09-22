const { getValues } = require('./_lib/google');
const { sbGet, sbPost, sbPatch, sbDelete } = require('./_lib/supabase');
const { MEMBER_FIELDS, DISH_MONTHS, SPECIAL_BENEFITS, buildHeaderIndex, colLetter } = require('./_lib/columns');
const { getCycleStart, toISODate, toMalaysiaISODate, todayInMalaysia, parseLocalDate } = require('./_lib/dishLogic');

// 由 Supabase pg_cron 每隔几分钟呼叫一次（见 sync-setup.sql），
// 读整张 Sheet，跟 Supabase 现在的资料比对，把 Jolee 手动在 Sheet 上改的东西（
// system→Sheet 那个 webhook 顾不到的方向）写回 Supabase。
module.exports = async function handler(req, res) {
  if (req.headers['x-sync-secret'] !== process.env.SYNC_WEBHOOK_SECRET) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const headerRowData = await getValues('A1:Z1');
    const headerRow = headerRowData[0] || [];
    const headerIndex = buildHeaderIndex(headerRow);
    const dataRows = await getValues(`A2:${colLetter(headerRow.length - 1)}5000`);

    const [members, monthly, special] = await Promise.all([
      sbGet('/members?select=id,member_code,name,ic,phone,referrer,register_date,payment_method'),
      sbGet('/monthly_redemptions?select=id,member_id,dish_month,period,redeemed_at,redeemed_by'),
      sbGet('/special_redemptions?select=id,member_id,benefit_type,period,redeemed_at,redeemed_by'),
    ]);

    const membersByCode = {};
    members.forEach(m => { membersByCode[m.member_code] = m; });

    const monthlyKey = (memberId, dishMonth, period) => `${memberId}|${dishMonth}|${period}`;
    const monthlyByKey = {};
    monthly.forEach(r => { monthlyByKey[monthlyKey(r.member_id, r.dish_month, r.period)] = r; });

    const specialKey = (memberId, benefitType, period) => `${memberId}|${benefitType}|${period}`;
    const specialByKey = {};
    special.forEach(r => { specialByKey[specialKey(r.member_id, r.benefit_type, r.period)] = r; });

    let updated = 0;
    const failedCodes = []; // 一行出错不该拖累其他人，记下来但继续跑下一行

    for (const row of dataRows) {
      const code = (row[headerIndex.MemberCode] || '').toString().trim();
      if (!code) continue;

      try {
        await processRow({ row, code });
      } catch (err) {
        console.error(`poll-sheet: 处理 ${code} 出错`, err);
        failedCodes.push(code);
      }
    }

    res.status(200).json({ ok: true, updated, failedCodes });
    return;

    async function processRow({ row, code }) {
      let member = membersByCode[code];

      if (!member) {
        const name = (row[headerIndex.Name] || '').toString().trim();
        const phone = (row[headerIndex['Phone Number']] || '').toString().trim();
        if (!name || !phone) return; // 资料不够，没办法建会员，跳过

        const created = await sbPost('/members', {
          member_code: code,
          name,
          ic: (row[headerIndex.IC] || '').toString().trim() || null,
          phone,
          referrer: (row[headerIndex.Referrer] || '').toString().trim() || null,
          register_date: (row[headerIndex.RegisterDate] || '').toString().trim(),
          payment_method: (row[headerIndex['Payment Method']] || '').toString().trim() || null,
          created_by: 'Google Sheet',
        }, { Prefer: 'return=representation' });
        member = Array.isArray(created) ? created[0] : created;
        membersByCode[code] = member;
        updated++;
        return; // 刚建的会员，领取记录下一次轮询再处理
      }

      // 比对基本资料栏位，Sheet 跟资料库不一样就以 Sheet 为准写回去
      const patch = {};
      Object.entries(MEMBER_FIELDS).forEach(([header, col]) => {
        if (headerIndex[header] === undefined) return;
        const sheetValue = (row[headerIndex[header]] || '').toString().trim();
        const dbValue = (member[col] || '').toString().trim();
        if (sheetValue && sheetValue !== dbValue) patch[col] = sheetValue;
      });
      if (Object.keys(patch).length > 0) {
        await sbPatch(`/members?id=eq.${member.id}`, patch);
        Object.assign(member, patch);
        updated++;
      }

      const registerDate = parseLocalDate(member.register_date);
      const currentPeriod = toISODate(getCycleStart(registerDate, todayInMalaysia()));

      for (const [header, dishMonth] of Object.entries(DISH_MONTHS)) {
        if (headerIndex[header] === undefined) continue;
        const changed = await syncCellToSupabase({
          sheetValue: (row[headerIndex[header]] || '').toString().trim(),
          existing: monthlyByKey[monthlyKey(member.id, dishMonth, currentPeriod)],
          insertPath: '/monthly_redemptions',
          insertExtra: { member_id: member.id, dish_month: dishMonth, period: currentPeriod },
          deletePath: `/monthly_redemptions?member_id=eq.${member.id}&dish_month=eq.${dishMonth}&period=eq.${currentPeriod}`,
        });
        if (changed) updated++;
      }

      for (const [header, benefitType] of Object.entries(SPECIAL_BENEFITS)) {
        if (headerIndex[header] === undefined) continue;
        const changed = await syncCellToSupabase({
          sheetValue: (row[headerIndex[header]] || '').toString().trim(),
          existing: specialByKey[specialKey(member.id, benefitType, currentPeriod)],
          insertPath: '/special_redemptions',
          insertExtra: { member_id: member.id, benefit_type: benefitType, period: currentPeriod },
          deletePath: `/special_redemptions?member_id=eq.${member.id}&benefit_type=eq.${benefitType}&period=eq.${currentPeriod}`,
        });
        if (changed) updated++;
      }
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
};

// 单一格子（一个月份的菜品 或 一个一次性福利）在 Sheet 跟 Supabase 之间的比对同步
async function syncCellToSupabase({ sheetValue, existing, insertPath, insertExtra, deletePath }) {
  // "作废"是 /api/mark-expired 自动填的提示文字，不是真的领取日期，不能当日期处理。
  // 之前漏了这个检查，导致整个轮询在遇到第一个"作废"儲存格时就直接报错中断，
  // 后面所有会员（包括这个人自己改的其他栏位）都没机会同步到。
  if (sheetValue === '作废') return false;

  if (sheetValue) {
    if (!existing) {
      await sbPost(insertPath, { ...insertExtra, redeemed_at: sheetValue, redeemed_by: 'Google Sheet' });
      return true;
    }
    const existingDate = toMalaysiaISODate(existing.redeemed_at);
    if (existingDate !== sheetValue) {
      await sbPatch(`${insertPath}?id=eq.${existing.id}`, { redeemed_at: sheetValue });
      return true;
    }
    return false;
  }
  if (existing) {
    await sbDelete(deletePath);
    return true;
  }
  return false;
}
