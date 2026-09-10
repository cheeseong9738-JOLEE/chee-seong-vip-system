// Google Sheet 栏位名称 <-> Supabase 栏位/概念 的对应表
// 用栏位名字找栏位（不是写死字母），这样以后 Sheet 里插入/调换栏位顺序也不会坏掉

const MEMBER_FIELDS = {
  Name: 'name',
  IC: 'ic',
  'Phone Number': 'phone',
  Referrer: 'referrer',
  RegisterDate: 'register_date',
  'Payment Method': 'payment_method',
};

const DISH_MONTHS = {
  JanDish_Date: 1, FebDish_Date: 2, MarDish_Date: 3, AprDish_Date: 4,
  MayDish_Date: 5, JunDish_Date: 6, JulDish_Date: 7, AugDish_Date: 8,
  SepDish_Date: 9, OctDish_Date: 10, NovDish_Date: 11, DecDish_Date: 12,
};

const SPECIAL_BENEFITS = {
  RM10_Date: 'RM10',
  RM20_Date: 'RM20',
  RM30_Date: 'RM30',
  BirthdayCake_Date: 'BirthdayCake',
  CNYSet_Date: 'CNYSet',
  ParentsSet_Date: 'ParentsSet',
  MidAutumnSet_Date: 'MidAutumnSet',
};

// 把 header 数组变成 {栏位名: 索引}
function buildHeaderIndex(headerRow) {
  const map = {};
  headerRow.forEach((h, i) => { map[String(h).trim()] = i; });
  return map;
}

// 0-based 索引转 Sheet 栏位字母：0->A, 25->Z, 26->AA ...
function colLetter(index) {
  let n = index + 1;
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function padRow(row, length) {
  const padded = row.slice(0, length).map(v => (v == null ? '' : String(v)));
  while (padded.length < length) padded.push('');
  return padded;
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

module.exports = { MEMBER_FIELDS, DISH_MONTHS, SPECIAL_BENEFITS, buildHeaderIndex, colLetter, padRow, arraysEqual };
