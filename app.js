// ==================== 常量 ====================

const DISH_MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

const SPECIAL_BENEFITS = [
  { key: 'RM10', label: 'RM10 现金券' },
  { key: 'RM20', label: 'RM20 现金券' },
  { key: 'RM30', label: 'RM30 现金券' },
  { key: 'BirthdayCake', label: '生日蛋糕' },
  { key: 'CNYSet', label: '新年套餐' },
  { key: 'ParentsSet', label: '父亲节/母亲节套餐' },
  { key: 'MidAutumnSet', label: '中秋套餐' },
];

const PAYMENT_METHODS = ['现金', 'Touch \'n Go'];

// 操作员 / 推荐人共用同一份员工名单
const STAFF_LIST = ['BENZ', 'YAN', 'SHUQI', 'PAULINE', 'ANGEL', 'XIAOHAO', 'SOBU', 'PEIQI', 'EZAC', 'CRYSTAL'];
const OTHER_VALUE = '__other__';

// 马来西亚电话格式：0 开头，区码 2~3 位，中间一定要有 "-"，后面 6~8 位数字
// 例：013-8900455 / 03-88123456
const PHONE_PATTERN = /^0\d{1,2}-\d{6,8}$/;

// 马来西亚 IC 格式：出生日期6位-州属2位-序号4位，例：000000-00-0000
const IC_PATTERN = /^\d{6}-\d{2}-\d{4}$/;

// ==================== Supabase ====================

const sb = (window.SUPABASE_URL && window.SUPABASE_ANON_KEY)
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

if (!sb) {
  document.getElementById('config-warning').style.display = 'block';
}

// ==================== 日期工具 ====================

// 把 <input type="date"> 的 "YYYY-MM-DD" 或 Postgres 的 date 字符串解析成本地时间午夜的 Date，
// 避免 new Date("YYYY-MM-DD") 被当成 UTC 午夜、在东八区显示会差一天的问题
function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addYears(date, n) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d;
}

function startOfToday() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

// ==================== 核心业务逻辑（纯函数） ====================

// 会员当前所处的周年周期起始日：registerDate 每年的同月同日中，
// 小于等于 today 的最近一次（也就是最近一次的"入会周年日"）
function getCycleStart(registerDate, today) {
  const rm = registerDate.getMonth();
  const rd = registerDate.getDate();
  let cycleStart = new Date(today.getFullYear(), rm, rd);
  if (cycleStart > today) {
    cycleStart = new Date(today.getFullYear() - 1, rm, rd);
  }
  // registerDate 本身还没到第一个周年日之前，cycleStart 就是 registerDate 当年那次
  if (cycleStart < registerDate) {
    cycleStart = new Date(registerDate);
  }
  return cycleStart;
}

function isMemberExpired(registerDate, today) {
  const expiry = addYears(registerDate, 1);
  return today >= expiry;
}

// dishMonth: 1~12。redeemed: 该会员当前周期内这个月是否已有领取记录
// 返回 '未开放' | '可领取' | '已作废' | '已领取'
function getDishStatus(registerDate, dishMonth, today, redeemed) {
  if (redeemed) return '已领取';

  const cycleStart = getCycleStart(registerDate, today);
  const cycleEnd = addYears(cycleStart, 1);
  const rm = registerDate.getMonth() + 1; // 1~12

  if (dishMonth === rm) {
    // 入会当月比较特别：入会那一刻到当月月底算一个窗口（比如 3/31 入会，
    // 就只有 3/31 这一天）；过了就先"未开放"，一直到明年同一个月的 1 号
    // 再重新开放一次，直到周年日前一天为止（周年日当天已经算续会/过期）。
    // 中间那段空窗期不算"已作废"——留到明年还有一次机会。
    // 但如果是当月 1 号入会，"明年重新开放"那个窗口长度是 0（windowBStart == cycleEnd），
    // 代表根本没有下一次机会了，这种情况过了当月就该直接算"已作废"，不能一直挂着"未开放"
    // 让人误以为以后还会开。
    const windowAEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, 1);
    const windowBStart = new Date(cycleEnd.getFullYear(), cycleEnd.getMonth(), 1);

    if (today >= cycleStart && today < windowAEnd) return '可领取';
    if (today >= windowBStart && today < cycleEnd) return '可领取';
    if (windowBStart >= cycleEnd) return '已作废'; // 没有第二个窗口，永远不会再开放
    return '未开放';
  }

  // 其余月份：属于 cycleStart 那一年还是次年，取决于是否已经"轮到"过 register month
  const year = dishMonth >= rm ? cycleStart.getFullYear() : cycleStart.getFullYear() + 1;
  const start = new Date(year, dishMonth - 1, 1);
  const end = new Date(year, dishMonth, 1); // 次月1号 00:00

  if (today < start) return '未开放';
  if (today >= end) return '已作废';
  return '可领取';
}

// 一次性福利：目前比照会员整体有效期——会员未过期就可以领
function getSpecialStatus(registerDate, today, redeemed) {
  if (redeemed) return '已领取';
  if (isMemberExpired(registerDate, today)) return '已过期';
  return '可领取';
}

// ==================== 状态 ====================

let currentMember = null;
let currentMonthlyRedemptions = [];
let currentSpecialRedemptions = [];

// ==================== 核销前二次确认（防止按错） ====================

// options.withDate: 补登历史资料用——跳出日期选择，OK 回传选的日期字串，取消回传 null
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-message').textContent = message;
    const dateInput = document.getElementById('confirm-date');
    dateInput.style.display = options.withDate ? '' : 'none';
    if (options.withDate) dateInput.value = options.defaultDate || toISODate(startOfToday());
    overlay.classList.add('show');

    const cleanup = (result) => {
      overlay.classList.remove('show');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    const onOk = () => cleanup(options.withDate ? (dateInput.value || null) : true);
    const onCancel = () => cleanup(options.withDate ? null : false);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// ==================== 视图切换 ====================

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  document.querySelectorAll('header .nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`header .nav-btn[data-view="${name}"]`);
  if (navBtn) navBtn.classList.add('active');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ==================== 名单下拉 + 其他（操作员/推荐人共用） ====================

function populateStaffSelect(selectEl) {
  selectEl.innerHTML = `<option value="">请选择</option>` +
    STAFF_LIST.map(s => `<option value="${s}">${s}</option>`).join('') +
    `<option value="${OTHER_VALUE}">其他</option>`;
}

function getSelectOtherValue(selectEl, otherInputEl) {
  return selectEl.value === OTHER_VALUE ? otherInputEl.value.trim() : selectEl.value;
}

function setSelectOtherValue(selectEl, otherInputEl, value) {
  if (value && STAFF_LIST.includes(value)) {
    selectEl.value = value;
    otherInputEl.style.display = 'none';
    otherInputEl.value = '';
  } else if (value) {
    selectEl.value = OTHER_VALUE;
    otherInputEl.style.display = '';
    otherInputEl.value = value;
  } else {
    selectEl.value = '';
    otherInputEl.style.display = 'none';
    otherInputEl.value = '';
  }
}

function wireSelectOther(selectEl, otherInputEl, onChange) {
  selectEl.addEventListener('change', () => {
    otherInputEl.style.display = selectEl.value === OTHER_VALUE ? '' : 'none';
    if (selectEl.value === OTHER_VALUE) otherInputEl.focus();
    onChange();
  });
  otherInputEl.addEventListener('input', onChange);
}

// ==================== 操作员姓名（本地记住） ====================

const operatorSelect = document.getElementById('operator-select');
const operatorOther = document.getElementById('operator-other');

function getOperatorName() {
  return getSelectOtherValue(operatorSelect, operatorOther);
}

function initOperatorField() {
  populateStaffSelect(operatorSelect);
  setSelectOtherValue(operatorSelect, operatorOther, localStorage.getItem('vip_operator_name') || '');
  wireSelectOther(operatorSelect, operatorOther, () => {
    localStorage.setItem('vip_operator_name', getOperatorName());
  });
}

// 注册/核销都要求先填操作员姓名，不然以后没办法追查是谁做的
function requireOperatorName() {
  const name = getOperatorName();
  if (name) return true;
  showToast('请先在上面选操作员，才能注册/核销');
  (operatorSelect.value === OTHER_VALUE ? operatorOther : operatorSelect).focus();
  return false;
}

// ==================== 查询会员 ====================

async function searchMembers(keyword) {
  keyword = keyword.trim();
  if (!keyword) return [];
  const { data, error } = await sb
    .from('members')
    .select('*')
    .or(`phone.ilike.%${keyword}%,member_code.ilike.%${keyword}%`)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    showToast('查询失败：' + error.message);
    return [];
  }
  return data;
}

function renderSearchResults(members) {
  const box = document.getElementById('search-results');
  if (members.length === 0) {
    box.innerHTML = `<div class="empty-hint">没有找到符合的会员</div>`;
    return;
  }
  const today = startOfToday();
  box.innerHTML = members.map(m => {
    const expired = isMemberExpired(parseLocalDate(m.register_date), today);
    return `
      <div class="result-card" data-id="${m.id}">
        <div class="result-main">
          <div class="result-name">${escapeHtml(m.name)} <span class="badge ${expired ? 'badge-bad' : 'badge-good'}">${expired ? '已过期' : '有效'}</span></div>
          <div class="result-sub">${escapeHtml(m.member_code)} · ${escapeHtml(m.phone)}</div>
        </div>
        <div class="result-arrow">›</div>
      </div>
    `;
  }).join('');
  box.querySelectorAll('.result-card').forEach(card => {
    card.addEventListener('click', () => openMemberDetail(card.dataset.id));
  });
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ==================== 注册新会员 ====================

// 根据分行前缀（SP/SD）算出下一个还没用过的会员编号，例：现有最大是 SP035 就回传 SP036
async function generateNextMemberCode(prefix) {
  const { data, error } = await sb
    .from('members')
    .select('member_code')
    .ilike('member_code', `${prefix}%`);
  if (error) {
    showToast('产生会员编号失败：' + error.message);
    return '';
  }
  let max = 0;
  const pattern = new RegExp(`^${prefix}(\\d+)$`, 'i');
  (data || []).forEach(m => {
    const match = (m.member_code || '').match(pattern);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

async function registerMember(formData) {
  const { data: existing } = await sb
    .from('members')
    .select('id')
    .eq('member_code', formData.member_code)
    .maybeSingle();
  if (existing) {
    showToast('这个会员编号已经存在了');
    return null;
  }
  const { data, error } = await sb.from('members').insert({
    member_code: formData.member_code,
    name: formData.name,
    ic: formData.ic || null,
    phone: formData.phone,
    referrer: formData.referrer,
    register_date: formData.register_date,
    payment_method: formData.payment_method || null,
    created_by: getOperatorName(),
  }).select().single();
  if (error) {
    showToast('注册失败：' + error.message);
    return null;
  }
  return data;
}

// ==================== 会员详情 / 核销 ====================

async function openMemberDetail(memberId) {
  const { data: member, error } = await sb.from('members').select('*').eq('id', memberId).single();
  if (error || !member) {
    showToast('找不到这个会员');
    return;
  }
  currentMember = member;

  const [{ data: monthly }, { data: special }] = await Promise.all([
    sb.from('monthly_redemptions').select('*').eq('member_id', memberId),
    sb.from('special_redemptions').select('*').eq('member_id', memberId),
  ]);
  currentMonthlyRedemptions = monthly || [];
  currentSpecialRedemptions = special || [];

  renderMemberDetail();
  showView('detail');
}

function renderMemberDetail() {
  const m = currentMember;
  const today = startOfToday();
  const registerDate = parseLocalDate(m.register_date);
  const expired = isMemberExpired(registerDate, today);
  const expiryDate = addYears(registerDate, 1);
  const cycleStart = getCycleStart(registerDate, today);
  const cyclePeriod = toISODate(cycleStart);

  document.getElementById('detail-header').innerHTML = `
    <div class="detail-name">${escapeHtml(m.name)} <span class="badge ${expired ? 'badge-bad' : 'badge-good'}">${expired ? '已过期' : '有效'}</span></div>
    <div class="detail-sub">${escapeHtml(m.member_code)} · ${escapeHtml(m.phone)}${m.ic ? ' · ' + escapeHtml(m.ic) : ''}</div>
    <div class="detail-sub">推荐人：${escapeHtml(m.referrer || '-')} ｜ 付款方式：${escapeHtml(m.payment_method || '-')}</div>
    <div class="detail-sub">入会日期：${m.register_date} ｜ 到期日：${toISODate(expiryDate)}</div>
  `;

  // 每月菜品
  const monthlyBox = document.getElementById('monthly-grid');
  monthlyBox.innerHTML = DISH_MONTH_LABELS.map((label, idx) => {
    const dishMonth = idx + 1;
    const row = currentMonthlyRedemptions.find(r => r.dish_month === dishMonth && r.period === cyclePeriod);
    const status = getDishStatus(registerDate, dishMonth, today, !!row);
    return renderDishTile(label, status, () => redeemMonthly(dishMonth, cyclePeriod), row);
  }).join('');
  monthlyBox.querySelectorAll('.dish-tile.can-redeem').forEach(tile => {
    tile.addEventListener('click', () => redeemMonthly(Number(tile.dataset.month), cyclePeriod));
  });

  // 一次性福利
  const specialBox = document.getElementById('special-grid');
  specialBox.innerHTML = SPECIAL_BENEFITS.map(b => {
    const row = currentSpecialRedemptions.find(r => r.benefit_type === b.key && r.period === cyclePeriod);
    const status = getSpecialStatus(registerDate, today, !!row);
    return renderDishTile(b.label, status, () => redeemSpecial(b.key, cyclePeriod), row, b.key);
  }).join('');
  specialBox.querySelectorAll('.dish-tile.can-redeem').forEach(tile => {
    tile.addEventListener('click', () => redeemSpecial(tile.dataset.benefit, cyclePeriod));
  });
}

function renderDishTile(label, status, onClick, row, benefitKey) {
  const statusClass = {
    '未开放': 'st-locked',
    '可领取': 'st-ready',
    '已作废': 'st-expired',
    '已领取': 'st-done',
    '已过期': 'st-expired',
  }[status];
  // TEMP-BACKFILL：导入旧会员资料期间，除了"已领取"以外都能点，补登历史领取日期
  // （包含"未开放"——入会月的空窗期在旧系统其实早就领过了）。
  // 导入结束后请把这个条件改回 status === '可领取'，同时处理 redeemMonthly、redeemSpecial。
  const clickable = status !== '已领取';
  const dataAttr = benefitKey
    ? `data-benefit="${benefitKey}"`
    : `data-month="${DISH_MONTH_LABELS.indexOf(label) + 1}"`;
  const sub = row && row.redeemed_at
    ? new Date(row.redeemed_at).toLocaleDateString('zh-CN') + (row.redeemed_by ? ' · ' + escapeHtml(row.redeemed_by) : '')
    : status;
  return `
    <div class="dish-tile ${statusClass} ${clickable ? 'can-redeem' : ''}" ${dataAttr}>
      <div class="dish-label">${escapeHtml(label)}</div>
      <div class="dish-status">${sub}</div>
    </div>
  `;
}

async function redeemMonthly(dishMonth, period) {
  if (!requireOperatorName()) return;
  const registerDate = parseLocalDate(currentMember.register_date);
  const already = currentMonthlyRedemptions.some(r => r.dish_month === dishMonth && r.period === period);
  const status = getDishStatus(registerDate, dishMonth, startOfToday(), already);
  if (status === '已领取') return; // TEMP-BACKFILL：除了已领取，其他状态都能补登，导入完请改回 status !== '可领取'

  const label = DISH_MONTH_LABELS[dishMonth - 1];
  let redeemedAt;
  if (status !== '可领取') {
    const picked = await showConfirm(`「${label}」现在状态是"${status}"，这是补登旧系统的历史领取记录吗？请选实际领取日期：`, {
      withDate: true,
      defaultDate: toISODate(startOfToday()),
    });
    if (!picked) return;
    redeemedAt = picked;
  } else {
    const confirmed = await showConfirm(`确定要核销「${currentMember.name}」${label}的菜品吗？`);
    if (!confirmed) return;
    redeemedAt = new Date().toISOString();
  }

  const { error } = await sb.from('monthly_redemptions').insert({
    member_id: currentMember.id,
    dish_month: dishMonth,
    period,
    redeemed_at: redeemedAt,
    redeemed_by: getOperatorName(),
  });
  if (error) {
    showToast('核销失败：' + error.message);
    return;
  }
  showToast(`${DISH_MONTH_LABELS[dishMonth - 1]}菜品核销成功`);
  openMemberDetail(currentMember.id);
}

async function redeemSpecial(benefitKey, period) {
  if (!requireOperatorName()) return;
  const registerDate = parseLocalDate(currentMember.register_date);
  const already = currentSpecialRedemptions.some(r => r.benefit_type === benefitKey && r.period === period);
  const status = getSpecialStatus(registerDate, startOfToday(), already);
  if (status !== '可领取' && status !== '已过期') return; // TEMP-BACKFILL：已过期用于补登旧资料，导入完请删掉

  // TEMP-BACKFILL：一次性福利导入期间一律跳日期选择（不分可领取/已过期），
  // 方便补登旧系统的历史领取日期。导入完请把这段改回原本的简单确认。
  const benefitLabel = SPECIAL_BENEFITS.find(b => b.key === benefitKey)?.label || benefitKey;
  const picked = await showConfirm(`确定要核销「${currentMember.name}」的${benefitLabel}吗？请选实际领取日期：`, {
    withDate: true,
    defaultDate: toISODate(startOfToday()),
  });
  if (!picked) return;
  const redeemedAt = picked;

  const { error } = await sb.from('special_redemptions').insert({
    member_id: currentMember.id,
    benefit_type: benefitKey,
    period,
    redeemed_at: redeemedAt,
    redeemed_by: getOperatorName(),
  });
  if (error) {
    showToast('核销失败：' + error.message);
    return;
  }
  const label = SPECIAL_BENEFITS.find(b => b.key === benefitKey)?.label || benefitKey;
  showToast(`${label}核销成功`);
  openMemberDetail(currentMember.id);
}

// ==================== 核销记录 ====================

async function loadRedemptionLog() {
  const [monthlyRes, specialRes] = await Promise.all([
    sb.from('monthly_redemptions')
      .select('redeemed_at, redeemed_by, dish_month, members(member_code, name, phone)')
      .order('redeemed_at', { ascending: false })
      .limit(100),
    sb.from('special_redemptions')
      .select('redeemed_at, redeemed_by, benefit_type, members(member_code, name, phone)')
      .order('redeemed_at', { ascending: false })
      .limit(100),
  ]);
  if (monthlyRes.error || specialRes.error) {
    showToast('读取核销记录失败');
    return;
  }

  const entries = [
    ...(monthlyRes.data || []).map(r => ({
      redeemed_at: r.redeemed_at,
      redeemed_by: r.redeemed_by,
      itemLabel: `${DISH_MONTH_LABELS[r.dish_month - 1]}菜品`,
      member: r.members,
    })),
    ...(specialRes.data || []).map(r => ({
      redeemed_at: r.redeemed_at,
      redeemed_by: r.redeemed_by,
      itemLabel: SPECIAL_BENEFITS.find(b => b.key === r.benefit_type)?.label || r.benefit_type,
      member: r.members,
    })),
  ];
  entries.sort((a, b) => new Date(b.redeemed_at) - new Date(a.redeemed_at));
  renderLogList(entries.slice(0, 150));
}

function renderLogList(entries) {
  const box = document.getElementById('log-list');
  if (entries.length === 0) {
    box.innerHTML = `<div class="empty-hint">还没有核销记录</div>`;
    return;
  }
  box.innerHTML = entries.map(e => {
    const time = new Date(e.redeemed_at).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    const memberName = e.member ? escapeHtml(e.member.name) : '(会员已删除)';
    const memberCode = e.member ? escapeHtml(e.member.member_code) : '';
    return `
      <div class="log-item">
        <div class="log-item-top">
          <div class="log-item-name">${escapeHtml(e.itemLabel)} · ${memberName}</div>
          <div class="log-item-time">${time}</div>
        </div>
        <div class="log-item-meta">${memberCode} · 操作员：<span class="log-item-operator">${escapeHtml(e.redeemed_by || '-')}</span></div>
      </div>
    `;
  }).join('');
}

// ==================== 会员列表 / 进群标记 ====================

let allMembersCache = [];
let currentBranchFilter = 'all';

function getBranch(memberCode) {
  const code = (memberCode || '').toUpperCase();
  if (code.startsWith('SD')) return 'SD';
  if (code.startsWith('SP')) return 'SP';
  return 'other';
}

async function loadMembersList() {
  const { data, error } = await sb
    .from('members')
    .select('id, member_code, name, phone, register_date, in_group')
    .order('member_code', { ascending: true });
  if (error) {
    showToast('读取会员列表失败：' + error.message);
    return;
  }
  allMembersCache = data || [];
  renderMembersList();
}

function renderMembersList() {
  const box = document.getElementById('members-list');
  const filtered = currentBranchFilter === 'all'
    ? allMembersCache
    : allMembersCache.filter(m => getBranch(m.member_code) === currentBranchFilter);

  if (filtered.length === 0) {
    box.innerHTML = `<div class="empty-hint">没有会员资料</div>`;
    return;
  }

  const today = startOfToday();
  box.innerHTML = filtered.map(m => {
    const expired = isMemberExpired(parseLocalDate(m.register_date), today);
    return `
      <div class="member-item ${m.in_group ? 'in-group' : ''}" data-id="${m.id}">
        <div>
          <div class="member-item-name">${escapeHtml(m.name)} <span class="badge ${expired ? 'badge-bad' : 'badge-good'}">${expired ? '已过期' : '有效'}</span></div>
          <div class="member-item-sub">${escapeHtml(m.member_code)} · ${escapeHtml(m.phone)}</div>
        </div>
        <div class="member-item-status">${m.in_group ? '✓ 已进群' : '未进群'}</div>
      </div>
    `;
  }).join('');

  box.querySelectorAll('.member-item').forEach(item => {
    item.addEventListener('click', () => toggleInGroup(item.dataset.id));
  });
}

async function toggleInGroup(memberId) {
  const member = allMembersCache.find(m => m.id === memberId);
  if (!member) return;
  const newValue = !member.in_group;
  member.in_group = newValue; // 先更新画面，感觉比较即时
  renderMembersList();

  const { error } = await sb.from('members').update({ in_group: newValue }).eq('id', memberId);
  if (error) {
    member.in_group = !newValue; // 失败就改回来
    renderMembersList();
    showToast('更新失败：' + error.message);
  }
}

// ==================== 事件绑定 ====================

document.addEventListener('DOMContentLoaded', () => {
  initOperatorField();

  document.querySelectorAll('header .nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showView(btn.dataset.view);
      if (btn.dataset.view === 'log') loadRedemptionLog();
      if (btn.dataset.view === 'members') loadMembersList();
    });
  });

  document.querySelectorAll('.branch-filter .nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentBranchFilter = btn.dataset.branch;
      document.querySelectorAll('.branch-filter .nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMembersList();
    });
  });

  document.getElementById('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const keyword = document.getElementById('search-input').value;
    const results = await searchMembers(keyword);
    renderSearchResults(results);
  });

  const phoneInput = document.getElementById('phone');
  const phoneError = document.getElementById('phone-error');
  phoneInput.addEventListener('input', () => {
    phoneInput.classList.remove('invalid');
    phoneError.classList.remove('show');
  });

  const icInput = document.getElementById('ic');
  const icError = document.getElementById('ic-error');
  icInput.addEventListener('input', () => {
    icInput.classList.remove('invalid');
    icError.classList.remove('show');
  });

  const referrerSelect = document.getElementById('referrer-select');
  const referrerOther = document.getElementById('referrer-other');
  const referrerError = document.getElementById('referrer-error');
  populateStaffSelect(referrerSelect);
  wireSelectOther(referrerSelect, referrerOther, () => {
    referrerSelect.classList.remove('invalid');
    referrerError.classList.remove('show');
  });

  const branchSelect = document.getElementById('branch-select');
  const branchError = document.getElementById('branch-error');
  const memberCodeInput = document.getElementById('member_code');
  branchSelect.addEventListener('change', async () => {
    branchSelect.classList.remove('invalid');
    branchError.classList.remove('show');
    if (!branchSelect.value) {
      memberCodeInput.value = '';
      return;
    }
    memberCodeInput.value = '产生中…';
    memberCodeInput.value = await generateNextMemberCode(branchSelect.value);
  });

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireOperatorName()) return;
    const form = e.target;

    let firstInvalid = null;

    if (!branchSelect.value) {
      branchSelect.classList.add('invalid');
      branchError.classList.add('show');
      firstInvalid = firstInvalid || branchSelect;
    }

    if (!PHONE_PATTERN.test(form.phone.value.trim())) {
      phoneInput.classList.add('invalid');
      phoneError.classList.add('show');
      firstInvalid = firstInvalid || phoneInput;
    }

    if (!IC_PATTERN.test(form.ic.value.trim())) {
      icInput.classList.add('invalid');
      icError.classList.add('show');
      firstInvalid = firstInvalid || icInput;
    }

    const referrerValue = getSelectOtherValue(referrerSelect, referrerOther);
    if (!referrerValue) {
      referrerSelect.classList.add('invalid');
      referrerError.classList.add('show');
      firstInvalid = firstInvalid || (referrerSelect.value === OTHER_VALUE ? referrerOther : referrerSelect);
    }

    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const formData = {
      member_code: form.member_code.value.trim(),
      name: form.name.value.trim(),
      ic: form.ic.value.trim(),
      phone: form.phone.value.trim(),
      referrer: referrerValue,
      register_date: form.register_date.value,
      payment_method: form.payment_method.value,
    };
    const member = await registerMember(formData);
    if (member) {
      showToast('注册成功');
      form.reset();
      setSelectOtherValue(referrerSelect, referrerOther, '');
      branchSelect.value = '';
      memberCodeInput.value = '';
      form.register_date.value = toISODate(startOfToday());
      openMemberDetail(member.id);
    }
  });

  document.getElementById('back-to-search').addEventListener('click', () => showView('search'));

  // 注册日期默认今天
  document.getElementById('register_date').value = toISODate(startOfToday());

  // 付款方式下拉选项
  const paymentSelect = document.getElementById('payment_method');
  paymentSelect.innerHTML = `<option value="">请选择</option>` +
    PAYMENT_METHODS.map(p => `<option value="${p}">${p}</option>`).join('');
});
