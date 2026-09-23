const { getValues, batchUpdateValues } = require('./_lib/google');
const { sbGet } = require('./_lib/supabase');
const { DISH_MONTHS, buildHeaderIndex, colLetter } = require('./_lib/columns');
const { getDishStatus, parseLocalDate, todayInMalaysia } = require('./_lib/dishLogic');

// 由 Supabase pg_cron 每天呼叫一次（见 sync-setup.sql 的 mark-expired-dishes 排程）。
// "已作废"不是一次性的资料库事件，是时间到了自然发生的状态，没有东西会主动通知系统，
// 所以只能定时扫描：找出 Sheet 里还空着、但状态其实已经过期作废的月份，填上"作废"两个字。
// 只处理空白儲存格——已经有日期或字样的完全不碰。
module.exports = async function handler(req, res) {
  if (req.headers['x-sync-secret'] !== process.env.SYNC_WEBHOOK_SECRET) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const headerRowData = await getValues('A1:Z1');
    const headerRow = headerRowData[0] || [];
    const headerIndex = buildHeaderIndex(headerRow);
    const dataRows = await getValues(`A2:${colLetter(headerRow.length - 1)}5000`);

    const members = await sbGet('/members?select=member_code,register_date');
    const membersByCode = {};
    members.forEach(m => { membersByCode[m.member_code] = m; });

    const today = todayInMalaysia();
    // 先把所有要改的儲存格收集起来，最后一次打包写入——
    // 逐格呼叫 Sheets API 在会员/月份多的时候会撞到「每分钟 60 次写入」的配额上限而中断。
    const updates = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const code = (row[headerIndex.MemberCode] || '').toString().trim();
      if (!code) continue;
      const member = membersByCode[code];
      if (!member) continue;
      const registerDate = parseLocalDate(member.register_date);

      for (const [header, dishMonth] of Object.entries(DISH_MONTHS)) {
        if (headerIndex[header] === undefined) continue;
        const currentCell = (row[headerIndex[header]] || '').toString().trim();
        if (currentCell) continue; // 已经有东西了（日期或"作废"），不要动

        const status = getDishStatus(registerDate, dishMonth, today, false);
        if (status === '已作废') {
          const col = colLetter(headerIndex[header]);
          updates.push({ a1: `${col}${i + 2}`, value: '作废' });
        }
      }
    }

    await batchUpdateValues(updates);

    res.status(200).json({ ok: true, updated: updates.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
};
