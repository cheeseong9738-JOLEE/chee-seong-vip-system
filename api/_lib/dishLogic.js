// 跟 app.js 里同一套逻辑（会员周年周期计算），后端同步用得到
// 两边分开维护是因为一个跑在浏览器（<script>），一个跑在 Vercel serverless（CommonJS）

function addYears(date, n) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d;
}

// 会员当前所处的周年周期起始日
function getCycleStart(registerDate, today) {
  const rm = registerDate.getMonth();
  const rd = registerDate.getDate();
  let cycleStart = new Date(today.getFullYear(), rm, rd);
  if (cycleStart > today) {
    cycleStart = new Date(today.getFullYear() - 1, rm, rd);
  }
  if (cycleStart < registerDate) {
    cycleStart = new Date(registerDate);
  }
  return cycleStart;
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 把 "YYYY-MM-DD" 解析成本地时间午夜的 Date，避免时区偏移
function parseLocalDate(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Vercel serverless 函数默认跑在 UTC，不是马来西亚时间——
// 如果直接用 new Date() 取"今天"，在马来西亚午夜到早上8点这段时间会拿到 UTC 的前一天，
// 导致周期/月份判断整个错一天。这两个函数强制换算成马来西亚的当地日期。
function todayInMalaysia() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return parseLocalDate(parts);
}

function toMalaysiaISODate(dateOrTimestamp) {
  const d = dateOrTimestamp instanceof Date ? dateOrTimestamp : new Date(dateOrTimestamp);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// 跟 app.js 里的 getDishStatus 逐字同步——那边改了这里也要跟着改。
// 返回 '未开放' | '可领取' | '已作废' | '已领取'
function getDishStatus(registerDate, dishMonth, today, redeemed) {
  if (redeemed) return '已领取';

  const cycleStart = getCycleStart(registerDate, today);
  const cycleEnd = addYears(cycleStart, 1);
  const rm = registerDate.getMonth() + 1;

  if (dishMonth === rm) {
    const windowAEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, 1);
    const windowBStart = new Date(cycleEnd.getFullYear(), cycleEnd.getMonth(), 1);

    if (today >= cycleStart && today < windowAEnd) return '可领取';
    if (today >= windowBStart && today < cycleEnd) return '可领取';
    if (windowBStart >= cycleEnd) return '已作废';
    return '未开放';
  }

  const year = dishMonth >= rm ? cycleStart.getFullYear() : cycleStart.getFullYear() + 1;
  const start = new Date(year, dishMonth - 1, 1);
  const end = new Date(year, dishMonth, 1);

  if (today < start) return '未开放';
  if (today >= end) return '已作废';
  return '可领取';
}

module.exports = {
  addYears, getCycleStart, toISODate, parseLocalDate, todayInMalaysia, toMalaysiaISODate, getDishStatus,
};
