const { getValues, updateValues, appendRow } = require('./_lib/google');
const { MEMBER_FIELDS, DISH_MONTHS, SPECIAL_BENEFITS, buildHeaderIndex, colLetter, padRow, arraysEqual } = require('./_lib/columns');
const { getCycleStart, toISODate, toMalaysiaISODate, todayInMalaysia, parseLocalDate } = require('./_lib/dishLogic');

// 由 Supabase 的 Postgres trigger（见 sync-setup.sql）在 members / monthly_redemptions /
// special_redemptions 有变动时呼叫，把变动同步写进 Google Sheet。
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  if (req.headers['x-sync-secret'] !== process.env.SYNC_WEBHOOK_SECRET) {
    return res.status(401).send('Unauthorized');
  }

  try {
    const { table, type, record, member_code, register_date } = req.body;

    const headerRowData = await getValues('A1:Z1');
    const headerRow = headerRowData[0] || [];
    const headerIndex = buildHeaderIndex(headerRow);
    const width = headerRow.length;

    const dataRows = await getValues(`A2:${colLetter(width - 1)}5000`);
    const codeToRow = {};
    dataRows.forEach((row, i) => {
      const code = (row[headerIndex.MemberCode] || '').toString().trim();
      if (code) codeToRow[code] = { rowNumber: i + 2, row };
    });

    if (table === 'members') {
      await syncMemberRow({ type, record, headerIndex, width, codeToRow });
    } else {
      await syncRedemption({ table, type, record, member_code, register_date, headerIndex, codeToRow });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
};

async function syncMemberRow({ type, record, headerIndex, width, codeToRow }) {
  const rowInfo = codeToRow[record.member_code];

  if (!rowInfo) {
    if (type === 'DELETE') return; // 没有对应的行，不用管
    const newRow = new Array(width).fill('');
    newRow[headerIndex.MemberCode] = record.member_code;
    Object.entries(MEMBER_FIELDS).forEach(([header, col]) => {
      if (headerIndex[header] !== undefined && record[col] != null) newRow[headerIndex[header]] = record[col];
    });
    await appendRow(newRow);
    return;
  }

  if (type === 'DELETE') {
    const blank = new Array(width).fill('');
    await updateValues(`A${rowInfo.rowNumber}:${colLetter(width - 1)}${rowInfo.rowNumber}`, [blank]);
    return;
  }

  const padded = padRow(rowInfo.row, width);
  const updated = [...padded];
  updated[headerIndex.MemberCode] = record.member_code;
  Object.entries(MEMBER_FIELDS).forEach(([header, col]) => {
    if (headerIndex[header] !== undefined && record[col] != null) updated[headerIndex[header]] = String(record[col]);
  });

  if (!arraysEqual(padded, updated)) {
    await updateValues(`A${rowInfo.rowNumber}:${colLetter(width - 1)}${rowInfo.rowNumber}`, [updated]);
  }
}

async function syncRedemption({ table, type, record, member_code, register_date, headerIndex, codeToRow }) {
  const rowInfo = codeToRow[member_code];
  if (!rowInfo) return; // 会员那一行还没同步过去，先跳过

  // Sheet 是宽表格式，一个月/一个福利只有一格，只能放"当前这个会员周期"的领取记录，
  // 续会后历史周期的旧记录就不往 Sheet 写了
  const registerDate = parseLocalDate(register_date);
  const currentPeriod = toISODate(getCycleStart(registerDate, todayInMalaysia()));
  if (record.period !== currentPeriod) return;

  const map = table === 'monthly_redemptions' ? DISH_MONTHS : SPECIAL_BENEFITS;
  const key = table === 'monthly_redemptions' ? record.dish_month : record.benefit_type;
  const headerName = Object.keys(map).find(h => map[h] === key);
  if (!headerName || headerIndex[headerName] === undefined) return;

  const targetValue = type === 'DELETE' ? '' : toMalaysiaISODate(record.redeemed_at);
  const currentValue = (rowInfo.row[headerIndex[headerName]] || '').toString().trim();
  if (currentValue === targetValue) return; // 已经一样了，跳过，避免无意义写入

  await updateValues(`${colLetter(headerIndex[headerName])}${rowInfo.rowNumber}`, [[targetValue]]);
}
