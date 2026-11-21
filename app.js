'use strict';
/* =====================================================================
   Kem — quản lý công việc, tài chính, học tập, ghi chú
   Dữ liệu lưu trong trình duyệt (localStorage). Nhớ sao lưu thường xuyên!
   ===================================================================== */

/* ---------- Tiện ích ---------- */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const money = n => Math.round(num(n)).toLocaleString('vi-VN') + '₫';
const short = n => {
  n = num(n); const a = Math.abs(n);
  if (a >= 1e9) return +(n / 1e9).toFixed(1) + ' tỷ';
  if (a >= 1e6) return +(n / 1e6).toFixed(1) + 'tr';
  if (a >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(n);
};
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => ymd(new Date());
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const fmtDate = s => { if (!s) return '—'; const [y, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const fmtDT = s => s ? `${s.slice(11, 16)} · ${fmtDate(s)}` : '';
const mk = s => (s ? s.slice(0, 7) : '');
const curMonth = () => todayStr().slice(0, 7);
const shiftMonth = (m, delta) => {
  let [y, mo] = m.split('-').map(Number); mo += delta;
  while (mo < 1) { mo += 12; y--; } while (mo > 12) { mo -= 12; y++; }
  return `${y}-${pad(mo)}`;
};
const monthLabel = m => { const [y, mo] = m.split('-'); return `Tháng ${+mo}/${y}`; };
const daysLeft = s => s ? Math.round((new Date(s + 'T00:00:00') - new Date(todayStr() + 'T00:00:00')) / 864e5) : null;
const sum = (arr, f) => arr.reduce((s, x) => s + num(f(x)), 0);
const pct = (a, b) => b ? Math.round((a - b) / Math.abs(b) * 100) : null;
const DOW_FULL = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const COLORS = ['pink', 'blue', 'green', 'yellow', 'purple'];
const colorOf = s => { let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };

const STATUS = {
  todo:   { t: 'Sắp làm',      c: 'blue' },
  doing:  { t: 'Đang làm',     c: 'pink' },
  review: { t: 'Chờ feedback', c: 'yellow' },
  done:   { t: 'Hoàn thành',   c: 'green' },
};
const EXP_CATS = ['Ăn uống', 'Đi lại', 'Nhà ở', 'Hóa đơn', 'Học tập', 'Phần mềm & Thiết bị', 'Giải trí', 'Mua sắm', 'Sức khỏe', 'Khác'];
const INC_CATS = ['Lương', 'Thưởng', 'Bán asset', 'Đầu tư', 'Khác'];
const CAT_ICON = { 'Ăn uống': '🍜', 'Đi lại': '🛵', 'Nhà ở': '🏠', 'Hóa đơn': '🧾', 'Học tập': '📚', 'Phần mềm & Thiết bị': '💻',
  'Giải trí': '🎮', 'Mua sắm': '🛍️', 'Sức khỏe': '💊', 'Lương': '💼', 'Thưởng': '🎁', 'Bán asset': '🎨', 'Đầu tư': '📈', 'Khác': '✨', 'Job': '💼' };

/* ---------- Dữ liệu ---------- */
const KEY = 'pixeldesk-v1';
const EMPTY = () => ({ settings: { name: 'Kem Sama', demo: false, lastBackup: '', lastDeadlineCheck: '', weeklyGoal: 150 }, jobs: [], tx: [], courses: [], goals: [], notes: [], gold: [], goldPrices: {}, wplan: [], wlogs: [] });

function migrate(d) {
  const o = Object.assign(EMPTY(), d);
  o.settings = Object.assign(EMPTY().settings, d.settings || {});
  if (!o.settings.name || o.settings.name === 'bạn') o.settings.name = 'Kem Sama';
  ['jobs', 'tx', 'courses', 'goals', 'notes', 'gold', 'wplan', 'wlogs'].forEach(k => { if (!Array.isArray(o[k])) o[k] = []; });
  if (!o.goldPrices || typeof o.goldPrices !== 'object') o.goldPrices = {};
  o.courses.forEach(c => { if (!Array.isArray(c.logs)) c.logs = []; });
  return o;
}
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return migrate(JSON.parse(raw)); } catch (e) { /* bỏ qua */ }
  return EMPTY(); // lần đầu mở: trống, muốn xem mẫu thì vào Cài đặt → Nạp dữ liệu mẫu
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('⚠️ Không lưu được dữ liệu vào trình duyệt', 'err'); }
}

function seed() {
  const m = curMonth(), day = new Date().getDate();
  const inM = d => `${m}-${pad(Math.min(d, day))}`;
  const pm = (k, d) => `${shiftMonth(m, -k)}-${pad(d)}`;
  const job = o => Object.assign({ id: uid(), client: '', type: '', deadline: '', amount: 0, status: 'todo', progress: 0, paid: false, paidDate: '', doneDate: '', note: '' }, o);
  const jobs = [
    job({ name: '5 emote Twitch động', client: 'chị Mây (Twitch)', type: 'Animation sticker / emote', deadline: addDays(2), amount: 3500000, deposit: 1500000, depositDate: addDays(-6), stage: 'color', status: 'doing', progress: 75, revisions: 1 }),
    job({ name: 'Intro kênh YouTube 10s', client: 'anh Tú', type: 'Intro / Outro', deadline: addDays(6), amount: 6000000, deposit: 3000000, depositDate: addDays(-3), stage: 'key', status: 'doing', progress: 40 }),
    job({ name: 'Lyric video "Mưa Hồng"', client: 'Band Kẹo', type: 'Animated MV / Lyric', deadline: addDays(12), amount: 15000000, deposit: 5000000, depositDate: addDays(-10), stage: 'sent', status: 'review', progress: 95, revisions: 3 }),
    job({ name: 'Rig Spine nhân vật chibi', client: 'Indie dev Minh', type: 'Rigging (Spine / Live2D)', deadline: addDays(20), amount: 4000000, deposit: 2000000, stage: 'brief', status: 'todo', progress: 5 }),
    job({ name: 'Sticker Zalo mèo béo (8 cái)', client: 'shop Mèo Ú', type: 'Animation sticker / emote', deadline: inM(10), amount: 5000000, deposit: 2000000, depositDate: inM(2), stage: 'final', status: 'done', progress: 100, paid: true, paidDate: inM(12), doneDate: inM(9), revisions: 2 }),
    job({ name: 'Motion poster sự kiện', client: 'CLB Cosplay', type: 'Motion graphic', deadline: inM(6), amount: 2500000, stage: 'final', status: 'done', progress: 100, doneDate: inM(6) }),
  ];
  [14, 9, 0, 18, 12].forEach((v, i) => v && jobs.push(job({ name: `Job tháng ${+shiftMonth(m, -(i + 1)).slice(5)}`, client: ['anh Tú', 'chị Mây (Twitch)', '', 'Band Kẹo', 'shop Mèo Ú'][i], type: i % 2 ? 'Intro / Outro' : 'Animation sticker / emote', stage: 'final',
    deadline: pm(i + 1, 14), amount: v * 1e6, status: 'done', progress: 100, paid: true, paidDate: pm(i + 1, 15), doneDate: pm(i + 1, 13) })));
  const tx = [];
  const t = (kind, amount, category, date, note = '') => tx.push({ id: uid(), kind, amount, category, date, note });
  t('expense', 5000000, 'Nhà ở', inM(1), 'Tiền nhà');
  t('expense', 4200000, 'Ăn uống', inM(8));
  t('expense', 1500000, 'Phần mềm & Thiết bị', inM(3), 'Gói phần mềm');
  t('expense', 900000, 'Hóa đơn', inM(5), 'Điện, nước, internet');
  t('expense', 2000000, 'Học tập', inM(4), 'Khóa Spine');
  t('expense', 800000, 'Giải trí', inM(9));
  t('income', 2000000, 'Bán asset', inM(7), 'Bán brush pack');
  [14, 13, 15, 16, 12].forEach((v, i) => { t('expense', 5000000, 'Nhà ở', pm(i + 1, 1)); t('expense', (v - 5) * 1e6, 'Ăn uống', pm(i + 1, 20)); });
  return {
    settings: { name: 'Kem Sama', demo: true, lastBackup: '', lastDeadlineCheck: '', weeklyGoal: 150 },
    jobs, tx,
    courses: [
      { id: uid(), name: 'Spine – Advanced', progress: 80, done: false, doneDate: '', logs: [{ date: addDays(0), hours: 1.5, note: 'Mesh deform' }, { date: addDays(-1), hours: 2 }, { date: addDays(-2), hours: 1 }] },
      { id: uid(), name: 'After Effects – Motion & Transition', progress: 60, done: false, doneDate: '', logs: [{ date: addDays(-3), hours: 2 }] },
      { id: uid(), name: 'Unity – Animator Workflow', progress: 100, done: true, doneDate: inM(5), logs: [{ date: inM(5), hours: 3 }] },
    ],
    goals: [
      { id: uid(), name: 'Nâng cấp PC', icon: '💻', target: 50000000, saved: 21500000 },
      { id: uid(), name: 'Quỹ dự phòng', icon: '🛟', target: 30000000, saved: 12000000 },
    ],
    gold: [
      { id: uid(), date: pm(2, 10), kind: 'Vàng 24K (999.9)', brand: 'Bảo Tín Minh Châu', qty: 2, buyPrice: 14200000, place: '', note: '', sold: false, sellPrice: 0, sellDate: '' },
      { id: uid(), date: inM(3), kind: 'Vàng 24K (999.9)', brand: 'Phú Quý', qty: 1, buyPrice: 15000000, place: '', note: 'Mua tích lũy', sold: false, sellPrice: 0, sellDate: '' },
    ],
    wplan: [
      { id: 'p1', dow: 1, activity: 'Gym', time: '18:00', minutes: 60, note: 'Chân + mông' },
      { id: 'p2', dow: 3, activity: 'Chạy bộ', time: '06:00', minutes: 30, note: '' },
      { id: 'p3', dow: 5, activity: 'Yoga', time: '20:00', minutes: 45, note: '' },
      { id: 'p4', dow: 6, activity: 'Đạp xe', time: '07:00', minutes: 60, note: 'Công viên' },
      { id: 'p5', dow: new Date().getDay(), activity: 'Giãn cơ', time: '21:30', minutes: 15, note: 'Sau giờ vẽ' },
    ],
    wlogs: [1, 2, 4, 6, 8, 9, 11, 13, 15, 16, 20].map((n, i) => ({ id: uid(), date: addDays(-n), activity: ['Gym', 'Chạy bộ', 'Yoga', 'Đạp xe'][i % 4], minutes: [60, 30, 45, 50][i % 4], kcal: [350, 280, 150, 400][i % 4], note: '', planId: '' })),
    goldPrices: { 'Vàng 24K (999.9)|Bảo Tín Minh Châu': { price: 14800000, date: todayStr() }, 'Vàng 24K (999.9)|Phú Quý': { price: 15300000, date: todayStr() } },
    notes: [
      { id: uid(), text: 'Gửi bản anim v2 cho Studio A', remindAt: addDays(1) + 'T09:00', done: false, pinned: false, notified: false },
      { id: uid(), text: 'Họp brief job mới', remindAt: addDays(1) + 'T14:00', done: false, pinned: false, notified: false },
      { id: uid(), text: 'Thanh toán hóa đơn Internet', remindAt: '', done: true, pinned: false, notified: true },
      { id: uid(), text: 'Backup file project mỗi ngày!', remindAt: '', done: false, pinned: true, notified: true },
    ],
  };
}

let db = load();
const ui = { month: curMonth(), calMonth: curMonth(), selDay: todayStr(), jobTab: 'active', homeJobTab: 'active', noteTab: 'all', statsRange: 'month' };

/* ---------- Vàng ---------- */
const GOLD_KINDS = ['Vàng 24K (999.9)', 'Vàng miếng', 'Vàng 18K', 'Vàng 14K', 'Khác'];
const GOLD_BRANDS = ['Bảo Tín Minh Châu', 'Bảo Tín Mạnh Hải', 'Kim Ngân Phúc', 'Huy Thanh', 'Phú Quý'];
/* Chỉ vàng 24K mới được tự cập nhật giá hằng ngày */
const is24k = kind => /24k|9999|999\.9/i.test(kind || '');
const normBrand = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
let goldFeed = null; // dữ liệu giá đọc từ data/gold.json (GitHub Actions cập nhật mỗi sáng)
function feedFor(brand) {
  if (!goldFeed || !goldFeed.brands) return null;
  const n = normBrand(brand);
  const k = Object.keys(goldFeed.brands).find(b => normBrand(b) === n);
  return k ? goldFeed.brands[k] : null;
}
function applyGoldFeed() {
  if (!goldFeed) return 0;
  let n = 0;
  db.gold.filter(g => !g.sold && is24k(g.kind)).forEach(g => {
    const f = feedFor(g.brand);
    if (f && num(f.buy) > 0) {
      const cur = db.goldPrices[goldKey(g)];
      if (!cur || cur.price !== num(f.buy) || cur.date !== goldFeed.date) { db.goldPrices[goldKey(g)] = { price: num(f.buy), date: goldFeed.date, auto: true }; n++; }
    }
  });
  if (n) save();
  return n;
}
async function loadGoldFeed() {
  if (!location.protocol.startsWith('http')) return;
  try {
    const r = await fetch('data/gold.json', { cache: 'no-store' });
    if (!r.ok) return;
    goldFeed = await r.json();
    applyGoldFeed();
    if (route() === 'savings' || route() === 'home') render();
  } catch (e) { /* không có mạng: giữ giá cũ */ }
}
const goldKey = g => `${g.kind}|${g.brand || ''}`;
const goldNow = g => { const p = db.goldPrices[goldKey(g)]; return p && num(p.price) ? num(p.price) : null; };
const fmtQty = q => `${+num(q).toFixed(2)} chỉ`;
function goldStats() {
  const hold = db.gold.filter(g => !g.sold);
  const qty = sum(hold, g => g.qty);
  const cost = sum(hold, g => num(g.qty) * num(g.buyPrice));
  const value = sum(hold, g => num(g.qty) * (goldNow(g) ?? num(g.buyPrice)));
  const realized = sum(db.gold.filter(g => g.sold), g => num(g.qty) * (num(g.sellPrice) - num(g.buyPrice)));
  return { hold, qty, cost, value, profit: value - cost, realized };
}

/* ---------- Tập luyện ---------- */
const ACTS = { 'Chạy bộ': '🏃', 'Đi bộ': '🚶', 'Gym': '🏋️', 'Yoga': '🧘', 'Đạp xe': '🚴', 'Bơi': '🏊', 'Nhảy dây': '🪢', 'Cầu lông': '🏸',
  'Bóng đá': '⚽', 'Nhảy / Dance': '💃', 'Giãn cơ': '🤸', 'Thiền': '🌿', 'Pilates': '🩰', 'Leo núi': '🧗' };
const actIco = a => ACTS[a] || '✨';
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return ymd(d); };
function workStats() {
  const t = todayStr(), ws = weekStart(), m = curMonth();
  const week = db.wlogs.filter(l => l.date >= ws && l.date <= t);
  const month = db.wlogs.filter(l => mk(l.date) === m);
  const days = new Set(db.wlogs.map(l => l.date));
  let streak = 0; const d = new Date();
  if (!days.has(ymd(d))) d.setDate(d.getDate() - 1);
  while (days.has(ymd(d))) { streak++; d.setDate(d.getDate() - 1); }
  const todayPlans = db.wplan.filter(p => +p.dow === new Date().getDay()).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const doneIds = new Set(db.wlogs.filter(l => l.date === t && l.planId).map(l => l.planId));
  return { weekMin: sum(week, l => l.minutes), monthMin: sum(month, l => l.minutes), monthCount: month.length, monthKcal: sum(month, l => l.kcal),
    streak, todayPlans, doneIds, todoToday: todayPlans.filter(p => !doneIds.has(p.id)).length, goal: num(db.settings.weeklyGoal) || 150 };
}

/* ---------- Job 2D animation: công đoạn, cọc, sửa ---------- */
const STAGES = [
  { k: 'brief',  t: 'Nhận brief',        s: 'Brief',   p: 5,   i: '📩' },
  { k: 'story',  t: 'Storyboard / Animatic', s: 'Story', p: 20, i: '🎞️' },
  { k: 'key',    t: 'Key pose',          s: 'Key',     p: 40,  i: '✏️' },
  { k: 'tween',  t: 'In-between',        s: 'Tween',   p: 60,  i: '🌀' },
  { k: 'color',  t: 'Clean & Color',     s: 'Color',   p: 75,  i: '🎨' },
  { k: 'comp',   t: 'Comp / Render',     s: 'Render',  p: 88,  i: '🎬' },
  { k: 'sent',   t: 'Đã gửi khách',      s: 'Gửi',     p: 95,  i: '📤' },
  { k: 'final',  t: 'Chốt xong',         s: 'Xong',    p: 100, i: '🏆' },
];
const stageIdx = k => Math.max(0, STAGES.findIndex(s => s.k === k));
function jobStage(j) {
  if (j.stage && STAGES.some(s => s.k === j.stage)) return j.stage;
  if (j.status === 'done') return 'final';
  if (j.status === 'review') return 'sent';
  if (j.status === 'todo') return 'brief';
  const p = num(j.progress); let best = STAGES[1];
  STAGES.forEach(s => { if (s.p <= p && s.k !== 'final') best = s; });
  return best.k;
}
const statusOfStage = k => k === 'final' ? 'done' : k === 'sent' ? 'review' : k === 'brief' ? 'todo' : 'doing';
const depositGot = j => (num(j.deposit) > 0 && j.depositDate) ? num(j.deposit) : 0;
const jobRemain = j => Math.max(0, num(j.amount) - depositGot(j));

/* ---------- Tính toán ---------- */
function jobRows(m) {
  const rows = [];
  db.jobs.forEach(j => {
    if (depositGot(j) && mk(j.depositDate) === m) rows.push({ j, date: j.depositDate, amount: depositGot(j), label: 'Tiền cọc' });
    if (j.paid && mk(j.paidDate) === m) rows.push({ j, date: j.paidDate, amount: jobRemain(j), label: depositGot(j) ? 'Thanh toán phần còn lại' : 'Thanh toán' });
  });
  return rows.filter(r => r.amount > 0);
}
function summary(m) {
  const paidRows = jobRows(m);
  const paidJobs = [...new Set(paidRows.map(r => r.j))];
  const incTx = db.tx.filter(t => t.kind === 'income' && mk(t.date) === m);
  const expTx = db.tx.filter(t => t.kind === 'expense' && mk(t.date) === m);
  const income = sum(paidRows, r => r.amount) + sum(incTx, t => t.amount);
  const expense = sum(expTx, t => t.amount);
  const doneJobs = db.jobs.filter(j => j.status === 'done' && mk(j.doneDate) === m);
  const onTime = doneJobs.filter(j => !j.deadline || j.doneDate <= j.deadline).length;
  const coursesDone = db.courses.filter(c => c.done && mk(c.doneDate) === m);
  const hours = sum(db.courses.flatMap(c => c.logs).filter(l => mk(l.date) === m), l => l.hours);
  return { income, expense, saved: income - expense, paidRows, paidJobs, incTx, expTx, doneJobs, onTime, coursesDone, hours };
}

/* Quỹ sống sót: tiền dự trữ (heo + vàng) chia chi tiêu trung bình 3 tháng gần nhất */
function runway() {
  const reserve = sum(db.goals, g => g.saved) + goldStats().value;
  const exps = [1, 2, 3].map(i => summary(shiftMonth(curMonth(), -i)).expense).filter(v => v > 0);
  const avg = exps.length ? sum(exps, v => v) / exps.length : summary(curMonth()).expense;
  return { reserve, avg, months: avg > 0 ? reserve / avg : null };
}

/* ---------- Rank tháng kiểu LMHT ---------- */
const RANKS = [
  { n: 'Sắt', lp: 0, c: '#8a7f86' }, { n: 'Đồng', lp: 50, c: '#b8734a' }, { n: 'Bạc', lp: 110, c: '#9fb2c2' },
  { n: 'Vàng', lp: 180, c: '#f0b429' }, { n: 'Bạch Kim', lp: 260, c: '#3fc9b0' }, { n: 'Lục Bảo', lp: 350, c: '#19b46a' },
  { n: 'Kim Cương', lp: 450, c: '#5b8cff' }, { n: 'Cao Thủ', lp: 580, c: '#b05cff' }, { n: 'Đại Cao Thủ', lp: 720, c: '#ff4060' },
  { n: 'Thách Đấu', lp: 880, c: '#ffcf3d' },
];
function monthLP(m = curMonth()) {
  const s = summary(m);
  const late = s.doneJobs.length - s.onTime;
  const parts = [
    ['Job đúng hạn', s.onTime * 40], ['Job trễ hạn', late * 15],
    ['Buổi tập', db.wlogs.filter(l => mk(l.date) === m).length * 8],
    ['Giờ học', Math.round(s.hours * 4)],
    ['Việc lặt vặt xong', db.notes.filter(n => n.done && mk(n.doneDate || '') === m).length * 2],
  ];
  if (s.saved > 0) parts.push(['Có tiết kiệm', 30]);
  const lp = sum(parts, p => p[1]);
  let i = 0; RANKS.forEach((r, k) => { if (lp >= r.lp) i = k; });
  const next = RANKS[i + 1];
  return { lp, rank: RANKS[i], next, pct: next ? (lp - RANKS[i].lp) / (next.lp - RANKS[i].lp) * 100 : 100, parts: parts.filter(p => p[1] > 0) };
}
const rankGem = (r, size = 44) => `<span class="rank-gem" style="--rc:${r.c};width:${size}px;height:${size}px"><i></i></span>`;

/* ---------- Kem mood: tranh của bạn đổi theo tình hình ---------- */
const MOODS = {
  angry:    { tag: '🔥 RAGE MODE' },
  focus:    { tag: '🎧 CÀY ĐÊM' },
  money:    { tag: '💰 TING TING' },
  chill:    { tag: '🐟 MÙA KHÔ JOB' },
  party:    { tag: '👑 VICTORY' },
  icecream: { tag: '♡ LOVE WHAT YOU DO' },
  dream:    { tag: '☁️ SẠC PIN' },
};
function pickMood() {
  const act = activeJobs(), t = todayStr(), h = new Date().getHours(), name = db.settings.name;
  const late = act.filter(j => j.deadline && daysLeft(j.deadline) < 0);
  const soon = act.filter(j => j.deadline && daysLeft(j.deadline) >= 0 && daysLeft(j.deadline) <= 2);
  const doneToday = db.jobs.filter(j => j.status === 'done' && j.doneDate === t).length;
  const paidRecent = db.jobs.some(j => (j.paid && j.paidDate && -daysLeft(j.paidDate) <= 1) || (depositGot(j) && -daysLeft(j.depositDate) <= 1));
  const bday = db.settings.birthday && t.slice(5) === db.settings.birthday;
  if (bday) return ['party', [`HAPPY BIRTHDAY ${name.toUpperCase()}! 👑 Hôm nay cấm làm việc!`, 'Sinh nhật vui vẻ nha! Ăn kem đi 🍨']];
  if (late.length) return ['angry', [`${late.length} job trễ hạn rồi đó! Đập nó như đập gián đi!! 🔥`, `"${late[0].name}" quá hạn ${-daysLeft(late[0].deadline)} ngày. ALL IN!`, 'Deadline trễ = gián. Xử lý NGAY! 🪳🍳']];
  if (doneToday) return ['party', [doneToday > 1 ? `${['', '', 'DOUBLE', 'TRIPLE', 'QUADRA'][doneToday] || 'PENTA'} KILL! ${doneToday} job xong hôm nay 👑` : 'VICTORY! Xong job rồi, thưởng ly kem nào 🍨', 'GG WP! Khách mà chê là khách sai 😎']];
  if (paidRecent) return ['money', ['Ting ting! Tiền về rồi 💰 Nhớ bỏ heo một ít nha!', 'Có tiền rồi! Đừng tiêu hết vào skin nha 👀']];
  if (soon.length) { const j = soon[0], d = daysLeft(j.deadline); return ['focus', [`"${j.name}" còn ${d === 0 ? 'HÔM NAY' : d + ' ngày'}. Chế độ cày: ON 🎧`, 'Tai nghe vào, Sting mở nắp. Cày thôi!', 'Tắt Liên Minh đi, deadline tới rồi 😤']]; }
  if (h >= 23 || h < 5) return ['focus', ['Khuya rồi đó... bớt Sting, đi ngủ đi 😾', 'Rank để mai leo, giờ ngủ đi!', 'Mắt thâm như gấu trúc rồi kìa 🐼']];
  if (!act.length) return ['chill', ['Hết job rồi! Chơi với mèo, leo rank, hay cập nhật portfolio? 🐟', 'Mùa khô job = mùa luyện skill. Vẽ một clip ngắn cho portfolio đi!', 'Không có job? Đăng bài khoe animation mới để khách tìm tới nè ✨']];
  if (new Date().getDay() === 0) return ['dream', ['Chủ nhật. Sạc pin nha ☁️', 'Nghỉ ngơi cũng là một phần của công việc 🦋']];
  return ['icecream', ['Love what you do ♡', `Hôm nay làm gì nè ${name}? 🍨`, 'Mỗi frame một chút, rồi cũng xong cả scene 🎞️', 'Uống nước chưa? Sting không tính là nước đâu nha!']];
}
let moodLine = -1;
const activeJobs = () => db.jobs.filter(j => j.status !== 'done').sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
function studyStreak() {
  const days = new Set(db.courses.flatMap(c => c.logs).map(l => l.date));
  let n = 0, d = new Date();
  if (!days.has(ymd(d))) d.setDate(d.getDate() - 1);
  while (days.has(ymd(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function eventsByDate() {
  const map = {}; const add = (d, e) => (map[d] = map[d] || []).push(e);
  db.jobs.forEach(j => j.deadline && add(j.deadline, { kind: 'job', j }));
  db.notes.forEach(n => n.remindAt && add(n.remindAt.slice(0, 10), { kind: 'note', n }));
  db.wlogs.forEach(l => l.date && add(l.date, { kind: 'work', l }));
  return map;
}

/* ---------- Thành phần giao diện ---------- */
const icon = (e, c) => `<span class="ico ${c}">${e}</span>`;
const empty = (e, t) => `<div class="empty"><span class="e-ico">${e}</span>${t}</div>`;
const bar = (p, c = '') => `<div class="bar ${c}"><i style="width:${Math.max(0, Math.min(100, num(p)))}%"></i></div>`;
const mnav = (act, m) => `<span class="mnav"><button data-act="${act}" data-d="-1" title="Tháng trước">‹</button><span>${monthLabel(m)}</span><button data-act="${act}" data-d="1" title="Tháng sau">›</button></span>`;
const statBox = (e, label, v, c) => `<div class="stat ${c}"><span class="si">${e}</span><div><small>${label}</small><b data-count="${num(v)}">${money(v)}</b></div></div>`;

function ring(p) {
  const r = 46, C = 2 * Math.PI * r, v = Math.max(0, Math.min(100, p));
  return `<div class="ring"><svg viewBox="0 0 110 110">
    <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3d9a"/><stop offset="1" stop-color="#12c97c"/></linearGradient></defs>
    <circle cx="55" cy="55" r="${r}" fill="none" stroke="#f2ebf8" stroke-width="12"/>
    <circle cx="55" cy="55" r="${r}" fill="none" stroke="url(#rg)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C * v / 100} ${C}"/>
  </svg><div><b>${p}%</b><small>tiết kiệm</small></div></div>`;
}

function deadlineInfo(j) {
  if (j.status === 'done' || !j.deadline) return '';
  const d = daysLeft(j.deadline);
  if (d < 0) return `<span class="dl late">⚠ Trễ ${-d} ngày</span>`;
  if (d === 0) return `<span class="dl late">🔥 Hôm nay</span>`;
  if (d <= 3) return `<span class="dl soon">⏳ Còn ${d} ngày</span>`;
  return `<span class="dl ok">Còn ${d} ngày</span>`;
}

function jobTable(list, opts = {}) {
  if (!list.length) return empty('🌱', opts.emptyText || 'Chưa có job nào ở đây.');
  return `<table class="tbl"><thead><tr><th>Tên job</th><th>Loại</th><th>Deadline</th><th>Trạng thái</th><th class="r">Thành tiền</th><th></th></tr></thead><tbody>
  ${list.map(j => {
    const st = STATUS[j.status] || STATUS.todo, c = colorOf(j.type);
    return `<tr>
      <td><div class="job-name"><span class="ava ${c}">${esc((j.type || j.name || '?').trim()[0] || '?').toUpperCase()}</span><div><b>${esc(j.name)}</b><small>${esc(j.client || '—')}</small></div></div></td>
      <td>${j.type ? `<span class="tag">${esc(j.type)}</span>` : '<small>—</small>'}</td>
      <td style="white-space:nowrap">${fmtDate(j.deadline)}${deadlineInfo(j)}${j.startDate ? `<small>nhận ${fmtDate(j.startDate)}</small>` : ''}</td>
      <td><span class="pill ${st.c}">${STAGES[stageIdx(jobStage(j))].i} ${STAGES[stageIdx(jobStage(j))].s}</span>${num(j.revisions) ? ` <span class="pill ${num(j.revisions) >= 3 ? 'red' : 'purple'}">🔁${num(j.revisions)}</span>` : ''}${j.status !== 'done' ? `<div class="bar thin"><i style="width:${STAGES[stageIdx(jobStage(j))].p}%"></i></div>` : ''}</td>
      <td class="r"><span class="money">${money(j.amount)}</span><small>${j.paid ? '✅ Đã trả đủ' : depositGot(j) ? `🟢 Đã cọc ${short(depositGot(j))}` : '⏳ Chưa nhận'}</small></td>
      <td class="acts">
        ${j.status !== 'done' ? `<button class="ibtn" title="Đánh dấu hoàn thành" data-act="doneJob" data-id="${j.id}">✅</button>` : ''}
        ${!j.paid ? `<button class="ibtn" title="Đã nhận tiền" data-act="payJob" data-id="${j.id}">💰</button>` : ''}
        <button class="ibtn" title="Tạo job tiếp theo (copy, tăng số trong tên)" data-act="dupJob" data-id="${j.id}">➕</button>
        <button class="ibtn" title="Sửa" data-act="editJob" data-id="${j.id}">✏️</button>
        <button class="ibtn" title="Xóa" data-act="delJob" data-id="${j.id}">🗑️</button>
      </td></tr>`;
  }).join('')}</tbody></table>`;
}

function calGrid(m, big) {
  const [y, mo] = m.split('-').map(Number);
  const startDow = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
  const days = new Date(y, mo, 0).getDate();
  const ev = eventsByDate(), t = todayStr();
  let h = `<div class="cal ${big ? 'big' : 'mini'}">` + ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((d, i) => `<div class="dow ${i === 6 ? 'sun' : ''}">${d}</div>`).join('');
  for (let i = 0; i < startDow; i++) h += '<div class="day blank"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${m}-${pad(d)}`, es = ev[ds] || [];
    let inner = '';
    if (big) {
      inner = es.slice(0, 3).map(e => e.kind === 'job'
        ? `<span class="chip job ${e.j.status === 'done' ? 'done' : (ds < t ? 'late' : '')}" title="${esc(e.j.name)}">💼 ${esc(e.j.name)}</span>`
        : e.kind === 'work' ? `<span class="chip work" title="${esc(e.l.activity)}">${actIco(e.l.activity)} ${esc(e.l.activity)} ${num(e.l.minutes)}'</span>`
        : `<span class="chip note" title="${esc(e.n.text)}">⏰ ${esc(e.n.text)}</span>`).join('') + (es.length > 3 ? `<small>+${es.length - 3} nữa</small>` : '');
    } else if (es.length) {
      inner = `<div class="dots">${es.slice(0, 3).map(e => `<i class="${e.kind === 'note' ? 'c-blue' : e.kind === 'work' ? 'c-purple' : e.j.status === 'done' ? 'c-green' : ds < t ? 'c-red' : 'c-pink'}"></i>`).join('')}</div>`;
    } else inner = '<div class="dots"></div>';
    h += `<div class="day ${ds === t ? 'today' : ''} ${big && ds === ui.selDay ? 'sel' : ''}" data-act="pickDay" data-d="${ds}"><span class="dn">${d}</span>${inner}</div>`;
  }
  return h + '</div>';
}

function noteItem(n) {
  const late = n.remindAt && !n.done && new Date(n.remindAt) < new Date();
  return `<div class="note ${n.done ? 'done' : ''} ${n.pinned ? 'pinned' : ''}">
    <button class="cbx ${n.done ? 'on' : ''}" data-act="toggleNote" data-id="${n.id}" title="Đánh dấu xong">${n.done ? '✓' : ''}</button>
    <div class="nt">${n.pinned ? '⭐ ' : ''}${esc(n.text)}${n.remindAt ? `<small style="color:${late ? '#d63c5c' : ''}">⏰ ${fmtDT(n.remindAt)}${late ? ' · đã qua' : ''}</small>` : ''}</div>
    <button class="ibtn" title="${n.pinned ? 'Bỏ ghim' : 'Ghim'}" data-act="pinNote" data-id="${n.id}">${n.pinned ? '📌' : '📍'}</button>
    <button class="ibtn" title="Sửa" data-act="editNote" data-id="${n.id}">✏️</button>
    <button class="ibtn" title="Xóa" data-act="delNote" data-id="${n.id}">🗑️</button>
  </div>`;
}
const sortNotes = list => [...list].sort((a, b) => (a.done - b.done) || (b.pinned - a.pinned) || (a.remindAt || '9999').localeCompare(b.remindAt || '9999'));

function barChart(keys) {
  const data = keys.map(k => ({ k, ...summary(k) }));
  const max = Math.max(1, ...data.map(d => Math.max(d.income, d.expense)));
  const W = 560, H = 230, pl = 46, pb = 26, pt = 12, cw = (W - pl - 8) / keys.length, bw = Math.min(20, cw / 3);
  const y = v => H - pb - (v / max) * (H - pb - pt);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ thu chi">`;
  for (let i = 0; i <= 4; i++) {
    const v = max * i / 4, yy = y(v);
    s += `<line x1="${pl}" x2="${W - 4}" y1="${yy}" y2="${yy}" stroke="#efe7f6" stroke-dasharray="${i ? '4 4' : ''}"/><text x="${pl - 8}" y="${yy + 4}" text-anchor="end">${short(v)}</text>`;
  }
  data.forEach((d, i) => {
    const cx = pl + i * cw + cw / 2, cur = d.k === curMonth();
    s += `<rect style="animation-delay:${i * 70}ms" x="${cx - bw - 2}" y="${y(d.income)}" width="${bw}" height="${H - pb - y(d.income)}" rx="6" fill="${cur ? '#12c97c' : '#5eb6ff'}"><title>${monthLabel(d.k)} · Thu: ${money(d.income)}</title></rect>`;
    s += `<rect style="animation-delay:${i * 70 + 40}ms" x="${cx + 2}" y="${y(d.expense)}" width="${bw}" height="${H - pb - y(d.expense)}" rx="6" fill="${cur ? '#ff3d9a' : '#ff9ccb'}"><title>${monthLabel(d.k)} · Chi: ${money(d.expense)}</title></rect>`;
    s += `<text x="${cx}" y="${H - 7}" text-anchor="middle" style="${cur ? 'fill:#3b3452;font-weight:900' : ''}">T${+d.k.slice(5)}${keys.length > 6 ? '' : '/' + d.k.slice(2, 4)}</text>`;
  });
  return s + '</svg><div class="legend"><span><i style="background:#5eb6ff"></i>Thu</span><span><i style="background:#ff9ccb"></i>Chi</span><span><i style="background:linear-gradient(90deg,#12c97c,#ff3d9a)"></i>Tháng hiện tại</span></div>';
}

function compareBox(m) {
  const a = summary(m), b = summary(shiftMonth(m, -1));
  const row = (label, cur, prev, goodUp = true) => {
    const p = pct(cur, prev);
    if (p === null) return `<div>➖ ${label}: chưa có dữ liệu tháng trước</div>`;
    const up = p >= 0, good = up === goodUp;
    return `<div class="${good ? 'up' : 'down'}">${up ? '▲' : '▼'} ${up ? '+' : ''}${p}% ${label}</div>`;
  };
  return `<div class="cmp"><div class="muted" style="font-size:12.5px">So với tháng trước</div>
    ${row('thu nhập', a.income, b.income)}${row('tiết kiệm', a.saved, b.saved)}${row('chi tiêu', a.expense, b.expense, false)}</div>`;
}

function banners() {
  let h = '';
  if (db.settings.demo) h += `<div class="banner yellow">🧸 <span>Đây là <b>dữ liệu mẫu</b> để bạn xem thử. Khi sẵn sàng, xóa đi để bắt đầu nhập thật nhé.</span><span class="sp"></span><button class="btn sm primary" data-act="clearDemo">Bắt đầu dữ liệu thật</button></div>`;
  else {
    const last = db.settings.lastBackup, d = last ? -daysLeft(last) : null;
    const has = db.jobs.length + db.tx.length + db.notes.length > 0;
    if (has && (d === null || d >= 7)) h += `<div class="banner blue">💾 <span>${d === null ? 'Bạn chưa sao lưu dữ liệu lần nào.' : `Đã ${d} ngày chưa sao lưu.`} Dữ liệu chỉ nằm trong trình duyệt này, sao lưu để không bị mất nhé.</span><span class="sp"></span><button class="btn sm blue" data-act="exportData">Sao lưu ngay</button></div>`;
  }
  return h;
}

/* ---------- Các trang ---------- */
function summaryCard(m, cls) {
  const s = summary(m), rate = s.income > 0 ? Math.max(0, Math.round(s.saved / s.income * 100)) : 0;
  const r = runway();
  return `<section class="card ${cls}">
    <div class="card-h"><h2>${icon('📊', 'pink')} Tổng kết</h2>${mnav('month', m)}</div>
    <div class="summary-wrap"><div class="stats3">${statBox('💵', 'Tổng thu', s.income, 'green')}${statBox('🛍️', 'Tổng chi', s.expense, 'pink')}${statBox('🐷', 'Tiết kiệm', s.saved, 'blue')}</div>${ring(rate)}</div>
    ${r.months !== null ? `<div class="runway-line">🛟 Quỹ sống sót: dự trữ <b>${money(r.reserve)}</b>, đủ sống <b>${r.months.toFixed(1)} tháng</b> nếu tạm không có job ${r.months < 3 ? '· <span class="warn">nên để dành thêm nha!</span>' : r.months >= 6 ? '· vững như kiềng 💪' : ''}</div>` : ''}
  </section>`;
}

function highlightCard(m, cls) {
  const s = summary(m), items = [];
  if (s.doneJobs.length) items.push(`Hoàn thành ${s.doneJobs.length} job (${s.onTime} đúng hạn)`);
  s.coursesDone.forEach(c => items.push(`Học xong: ${esc(c.name)}`));
  if (s.hours) items.push(`Đã học ${+s.hours.toFixed(1)} giờ trong tháng`);
  const wl = db.wlogs.filter(l => mk(l.date) === m);
  if (wl.length) items.push(`Tập luyện ${wl.length} buổi · ${sum(wl, l => l.minutes)} phút`);
  if (s.saved > 0) items.push(`Tiết kiệm được ${money(s.saved)} (${s.income ? Math.round(s.saved / s.income * 100) : 0}% thu nhập)`);
  const unpaid = db.jobs.filter(j => j.status === 'done' && !j.paid);
  return `<section class="card ${cls}">
    <div class="card-h"><h2>${icon('🏆', 'yellow')} Điểm nổi bật · ${monthLabel(m)}</h2></div>
    ${items.length ? `<ul class="hl">${items.map(t => `<li><span class="ck">✓</span><span>${t}</span></li>`).join('')}</ul>` : empty('💪', 'Tháng này chưa có gì, cố lên nhé!')}
    ${unpaid.length ? `<div class="banner yellow mt" style="margin-bottom:0">💸 <span>${unpaid.length} job đã xong nhưng <b>chưa nhận tiền</b>: ${money(sum(unpaid, jobRemain))}</span></div>` : ''}
  </section>`;
}

function jobTabs(key, tabs) {
  return `<div class="tabs">${tabs.map(([v, t, n]) => `<button class="tab ${ui[key] === v ? 'on' : ''}" data-act="tab" data-k="${key}" data-v="${v}">${t}${n !== undefined ? ` (${n})` : ''}</button>`).join('')}</div>`;
}
function jobsFiltered(tab) {
  const m = curMonth();
  switch (tab) {
    case 'active': return activeJobs().filter(j => j.status === 'doing' || j.status === 'review');
    case 'todo': return activeJobs().filter(j => j.status === 'todo');
    case 'doneMonth': return db.jobs.filter(j => j.status === 'done' && mk(j.doneDate) === m);
    case 'done': return db.jobs.filter(j => j.status === 'done').sort((a, b) => (b.doneDate || '').localeCompare(a.doneDate || ''));
    case 'unpaid': return db.jobs.filter(j => j.status === 'done' && !j.paid);
    default: return [...activeJobs(), ...db.jobs.filter(j => j.status === 'done').sort((a, b) => (b.doneDate || '').localeCompare(a.doneDate || ''))];
  }
}

function homeWorkout() {
  const w = workStats();
  return `<section class="card">
    <div class="card-h"><h2>${icon('🏃', 'green')} Tập luyện hôm nay</h2><span class="sp"></span><a class="link" href="#workout">Lịch tập →</a></div>
    ${w.todayPlans.length ? w.todayPlans.map(p => `<div class="note"><span class="wp-ico">${actIco(p.activity)}</span><div class="nt">${esc(p.activity)}<small>⏰ ${p.time || '—'} · ${num(p.minutes)} phút</small></div>
      ${w.doneIds.has(p.id) ? '<span class="pill green">✅ Xong</span>' : `<button class="btn green sm" data-act="doPlan" data-id="${p.id}">✔️ Xong</button>`}</div>`).join('') : empty('😴', 'Hôm nay là ngày nghỉ, thư giãn nhé!')}
    <div class="mt" style="display:flex;justify-content:space-between;font-weight:800;font-size:13px"><span class="muted">Tuần này</span><span>${w.weekMin}/${w.goal} phút</span></div>
    <div style="margin-top:6px">${bar(Math.min(100, w.weekMin / w.goal * 100), 'green')}</div>
  </section>`;
}

/* "📥 nhận 15/11 · đã làm 6 ngày / tổng 9 ngày" */
function jobDates(j) {
  if (!j.startDate) return '';
  const passed = -daysLeft(j.startDate);
  const total = j.deadline ? Math.round((new Date(j.deadline + 'T00:00:00') - new Date(j.startDate + 'T00:00:00')) / 864e5) : null;
  const bits = [`📥 nhận ${fmtDate(j.startDate).slice(0, 5)}`];
  if (passed >= 0) bits.push(passed === 0 ? 'mới nhận hôm nay' : `đã làm ${passed} ngày${total > 0 ? ` / ${total}` : ''}`);
  return `<small class="jc-dates">${bits.join(' · ')}</small>`;
}
function jobCard(j) {
  const st = jobStage(j), si = stageIdx(st), S = STAGES[si], d = j.deadline ? daysLeft(j.deadline) : null;
  const dl = d === null ? '<span class="cd none">chưa có deadline</span>'
    : d < 0 ? `<span class="cd late">TRỄ <b>${-d}</b> NGÀY</span>`
    : d === 0 ? '<span class="cd late"><b>HÔM NAY</b></span>'
    : `<span class="cd ${d <= 3 ? 'soon' : ''}">còn <b>${d}</b> ngày</span>`;
  const rev = num(j.revisions), last = si >= STAGES.length - 2;
  return `<div class="jcard ${d !== null && d < 0 ? 'is-late' : d !== null && d <= 2 ? 'is-soon' : ''}">
    <div class="jc-top"><span class="ava ${colorOf(j.type)}">${S.i}</span><div class="jc-name"><b>${esc(j.name)}</b><small>${esc(j.client || 'Khách lẻ')}${j.type ? ' · ' + esc(j.type) : ''}</small>${jobDates(j)}</div>${dl}</div>
    <div class="pipe">${STAGES.map((s, i) => `<span class="pp ${i < si ? 'ok' : i === si ? 'now' : ''}" title="${s.t}"><i></i><small>${s.s}</small></span>`).join('')}</div>
    <div class="jc-bar">${bar(S.p, d !== null && d < 0 ? 'pink' : '')}<b>${S.p}%</b></div>
    <div class="jc-foot">
      <span class="money">${money(j.amount)}</span>
      ${depositGot(j) ? `<span class="pill green">đã cọc ${short(depositGot(j))}</span>` : num(j.deposit) ? `<span class="pill yellow">chờ cọc ${short(j.deposit)}</span>` : ''}
      ${rev ? `<span class="pill ${rev >= 3 ? 'red' : 'purple'}" title="Số lần khách bắt sửa">🔁 sửa ${rev} lần${rev >= 3 ? ' 😤' : ''}</span>` : ''}
      <span class="sp"></span>
      <button class="ibtn" title="Tạo job tiếp theo (copy, tăng số trong tên)" data-act="dupJob" data-id="${j.id}">➕</button>
      <button class="ibtn" title="Khách bắt sửa (+1 lần)" data-act="addRev" data-id="${j.id}">🔁</button>
      <button class="ibtn" title="Sửa thông tin job" data-act="editJob" data-id="${j.id}">✏️</button>
      <button class="btn ${last ? 'gold' : 'green'} sm" title="Chuyển sang công đoạn tiếp theo" data-act="nextStage" data-id="${j.id}">${last ? '🏆 Chốt xong' : `▶ ${STAGES[si + 1].s}`}</button>
    </div>
  </div>`;
}
function jobBoard(cls) {
  const act = activeJobs();
  if (!act.length) return noJobCard(cls);
  return `<section class="card ${cls}">
    <div class="card-h"><h2>${icon('🎬', 'pink')} Tiến độ job</h2><span class="pill gray">${act.length} job · ${money(sum(act, j => j.amount))}</span><span class="sp"></span><a class="link" href="#jobs">Tất cả job →</a><button class="btn primary sm" data-act="addJob">＋ Job mới</button></div>
    <div class="jboard">${act.map(jobCard).join('')}</div>
  </section>`;
}
function noJobCard(cls) {
  const r = runway();
  const oldClients = [...new Set([...db.jobs].sort((a, b) => (b.doneDate || '').localeCompare(a.doneDate || '')).map(j => j.client).filter(Boolean))].slice(0, 4);
  return `<section class="card ${cls} nojob">
    <div class="card-h"><h2>${icon('🐟', 'blue')} Mùa khô job</h2><span class="sp"></span><button class="btn primary sm" data-act="addJob">＋ Có job mới rồi!</button></div>
    <div class="nojob-body">
      <img src="assets/logo.png" alt="" style="image-rendering:pixelated">
      <div class="nj-text">
        <h3>Không có job cũng không sao 🐟</h3>
        <div class="runway">🛟 Tiền dự trữ (heo + vàng): <b>${money(r.reserve)}</b><br>
          ${r.months !== null ? `Nếu không có job, bạn trụ được khoảng <b class="big">${r.months.toFixed(1)} tháng</b>` : 'Ghi chi tiêu vài tháng để Kem tính xem bạn trụ được bao lâu nhé'}</div>
        <ul class="hl">
          <li><span class="ck">1</span><span>Làm một clip ngắn 3–5 giây cho portfolio</span></li>
          <li><span class="ck">2</span><span>Đăng animation mới lên FB / TikTok / X để khách thấy</span></li>
          <li><span class="ck">3</span><span>${oldClients.length ? `Nhắn hỏi thăm khách cũ: <b>${oldClients.map(esc).join(', ')}</b>` : 'Nhắn hỏi thăm khách cũ, biết đâu họ có job'}</span></li>
          <li><span class="ck">4</span><span>Học thêm một kỹ năng mới (Spine, Live2D, AE...)</span></li>
          <li><span class="ck">5</span><span>Leo rank vừa phải thôi nha 😼</span></li>
        </ul>
      </div>
    </div>
  </section>`;
}
function rankCard(cls) {
  const r = monthLP();
  return `<section class="card ${cls}">
    <div class="card-h"><h2>${icon('⚔️', 'purple')} Rank tháng ${+curMonth().slice(5)}</h2></div>
    <div class="rank-wrap">${rankGem(r.rank, 70)}<div class="rk"><b class="rank-name" style="color:${r.rank.c}">${r.rank.n.toUpperCase()}</b>
      <small>${r.lp} LP${r.next ? ` · còn ${r.next.lp - r.lp} LP lên <b>${r.next.n}</b>` : ' · đỉnh server rồi! 👑'}</small>${bar(r.pct, 'purple')}</div></div>
    <div class="lp-list">${r.parts.length ? r.parts.map(p => `<span>${p[0]} <b>+${p[1]}</b></span>`).join('') : '<small>Xong job đúng hạn +40, tập luyện +8, mỗi giờ học +4... Kiếm LP thôi!</small>'}</div>
  </section>`;
}

function viewHome() {
  const m = ui.month;
  const active = db.courses.filter(c => !c.done);
  const goal = db.goals[0];
  const notes = sortNotes(db.notes).slice(0, 5);
  return `${banners()}<div class="grid">
    ${jobBoard('span-12')}
    ${summaryCard(m, 'span-8')}
    ${rankCard('span-4')}
    ${highlightCard(m, 'span-4')}
    <section class="card span-4">
      <div class="card-h"><h2>${icon('🔔', 'yellow')} Ghi chú & Nhắc nhở</h2><span class="sp"></span><button class="link" data-act="addNote">＋ Thêm</button></div>
      ${notes.length ? notes.map(noteItem).join('') : empty('📝', 'Chưa có ghi chú nào.')}
    </section>
    <div class="span-4 stack">${homeWorkout()}</div>
    <section class="card span-4">
      <div class="card-h"><h2>${icon('📅', 'pink')} Lịch</h2><span class="sp"></span>${mnav('calMonth', ui.calMonth)}</div>
      ${calGrid(ui.calMonth, false)}
      <div class="legend"><span><i class="c-pink"></i>Deadline</span><span><i class="c-red"></i>Trễ hạn</span><span><i class="c-green"></i>Đã xong</span><span><i class="c-blue"></i>Nhắc nhở</span><span><i class="c-purple"></i>Tập luyện</span></div>
    </section>
    <div class="span-4 stack">
      <section class="card">
        <div class="card-h"><h2>${icon('📚', 'blue')} Học tập</h2><span class="sp"></span><a class="link" href="#study">Chi tiết →</a></div>
        ${active.length ? active.slice(0, 4).map(c => `<div class="prow"><span>${esc(c.name)}</span>${bar(c.progress)}<span class="pv">${num(c.progress)}%</span></div>`).join('') : empty('📖', 'Chưa có mục học nào.')}
        <div class="flex mt"><span class="pill purple">🔥 Chuỗi ${studyStreak()} ngày</span><span class="pill blue">⏱ ${+summary(curMonth()).hours.toFixed(1)} giờ tháng này</span></div>
      </section>
      <section class="card">
        <div class="card-h"><h2>${icon('🐷', 'green')} Mục tiêu tiết kiệm</h2><span class="sp"></span><a class="link" href="#savings">Chi tiết →</a></div>
        ${goal ? `<div class="flex" style="justify-content:space-between;font-weight:800"><span>${esc(goal.icon || '🎯')} ${esc(goal.name)}</span><span>${Math.round(num(goal.saved) / Math.max(1, num(goal.target)) * 100)}%</span></div>
          <div class="mt">${bar(num(goal.saved) / Math.max(1, num(goal.target)) * 100, 'green')}</div>
          <small class="mt" style="display:block;font-weight:700">${money(goal.saved)} / ${money(goal.target)}</small>` : empty('🎯', 'Đặt một mục tiêu tiết kiệm nhé!')}
      </section>
    </div>
    <section class="card span-4">
      <div class="card-h"><h2>${icon('📈', 'blue')} Thu chi 6 tháng</h2><span class="sp"></span><a class="link" href="#stats">Thống kê →</a></div>
      ${barChart([5, 4, 3, 2, 1, 0].map(i => shiftMonth(curMonth(), -i)))}
    </section>
  </div>`;
}

function viewJobs() {
  const unpaid = jobsFiltered('unpaid');
  const pipeline = sum(activeJobs(), j => j.amount);
  return `<div class="page-h"><h2>💼 Công việc</h2><span class="sp"></span><button class="btn primary" data-act="addJob">＋ Thêm job</button></div>
  <div class="grid">
    <div class="span-4">${statBoxCard('🎬', 'Đang có trong tay', pipeline, 'purple', `${activeJobs().length} job chưa xong`)}</div>
    <div class="span-4">${statBoxCard('💸', 'Khách còn nợ', sum(unpaid, jobRemain), 'yellow', `${unpaid.length} job đã xong chưa trả đủ`)}</div>
    <div class="span-4">${statBoxCard('✅', 'Đã nhận tháng này', sum(summary(curMonth()).paidRows, r => r.amount), 'green', `${monthLabel(curMonth())} (gồm cả cọc)`)}</div>
    <section class="card span-12">
      ${jobTabs('jobTab', [['active', 'Đang làm', jobsFiltered('active').length], ['todo', 'Sắp làm', jobsFiltered('todo').length], ['unpaid', 'Chưa thanh toán', unpaid.length], ['done', 'Hoàn thành', jobsFiltered('done').length], ['all', 'Tất cả', db.jobs.length]])}
      ${jobTable(jobsFiltered(ui.jobTab), { emptyText: 'Không có job nào trong mục này.' })}
    </section>
  </div>`;
}
const statBoxCard = (e, label, v, c, sub) => `<div class="stat ${c}" style="box-shadow:var(--shadow);border-color:#fff"><span class="si">${e}</span><div><small>${label}</small><b data-count="${num(v)}">${money(v)}</b><small>${sub}</small></div></div>`;

function viewCalendar() {
  const ev = (eventsByDate()[ui.selDay] || []);
  return `<div class="page-h"><h2>📅 Lịch & Deadline</h2><span class="sp"></span>${mnav('calMonth', ui.calMonth)}<button class="btn ghost" data-act="calToday">Hôm nay</button></div>
  <div class="grid">
    <section class="card span-8">${calGrid(ui.calMonth, true)}
      <div class="legend"><span><i class="c-pink"></i>Deadline job</span><span><i class="c-red"></i>Trễ hạn</span><span><i class="c-green"></i>Đã xong</span><span><i class="c-blue"></i>Nhắc nhở</span><span><i class="c-purple"></i>Tập luyện</span></div></section>
    <section class="card span-4">
      <div class="card-h"><h2>${icon('🗓️', 'blue')} ${DOW_FULL[new Date(ui.selDay + 'T00:00:00').getDay()]}, ${fmtDate(ui.selDay)}</h2></div>
      ${ev.length ? ev.map(e => e.kind === 'job'
        ? `<div class="note"><span class="ava ${colorOf(e.j.type)}" style="width:30px;height:30px">💼</span><div class="nt">${esc(e.j.name)}<small>${STATUS[e.j.status].t} · ${money(e.j.amount)}</small></div><button class="ibtn" data-act="editJob" data-id="${e.j.id}">✏️</button></div>`
        : e.kind === 'work' ? workItem(e.l) : noteItem(e.n)).join('') : empty('☁️', 'Ngày này trống.')}
      <div class="flex mt"><button class="btn primary sm" data-act="addJob" data-date="${ui.selDay}">＋ Job deadline ngày này</button><button class="btn blue sm" data-act="addNote" data-date="${ui.selDay}">＋ Nhắc nhở</button></div>
    </section>
  </div>`;
}

function viewFinance() {
  const m = ui.month, s = summary(m);
  const rows = [
    ...s.paidRows.map(r => ({ date: r.date, kind: 'income', category: 'Job', note: `${r.j.name} · ${r.label}`, amount: r.amount, job: r.j.id })),
    ...s.incTx, ...s.expTx,
  ].sort((a, b) => b.date.localeCompare(a.date));
  const byCat = {}; s.expTx.forEach(t => byCat[t.category] = (byCat[t.category] || 0) + num(t.amount));
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  return `<div class="page-h"><h2>💰 Tài chính</h2><span class="sp"></span><button class="btn green" data-act="addTx" data-kind="income">＋ Thu nhập</button><button class="btn primary" data-act="addTx" data-kind="expense">＋ Chi tiêu</button></div>
  <div class="grid">
    ${summaryCard(m, 'span-12')}
    <section class="card span-7">
      <div class="card-h"><h2>${icon('🧾', 'purple')} Giao dịch trong tháng</h2></div>
      ${rows.length ? `<table class="tbl"><tbody>${rows.map(r => `<tr>
        <td style="width:46px"><span class="ico ${r.kind === 'income' ? 'green' : 'pink'}">${CAT_ICON[r.category] || '✨'}</span></td>
        <td><b>${esc(r.category)}</b><small>${esc(r.note || '')}</small></td>
        <td><small>${fmtDate(r.date)}</small></td>
        <td class="r"><span class="money ${r.kind === 'income' ? 'plus' : 'minus'}">${r.kind === 'income' ? '+' : '−'}${money(r.amount)}</span></td>
        <td class="acts">${r.job ? `<button class="ibtn" title="Sửa job" data-act="editJob" data-id="${r.job}">✏️</button>` : `<button class="ibtn" data-act="editTx" data-id="${r.id}">✏️</button><button class="ibtn" data-act="delTx" data-id="${r.id}">🗑️</button>`}</td>
      </tr>`).join('')}</tbody></table>` : empty('🪙', 'Chưa có giao dịch nào trong tháng này.')}
      <small style="display:block;margin-top:8px">💡 Tiền từ job tự động tính vào thu nhập khi bạn đánh dấu "Đã nhận tiền" (💰).</small>
    </section>
    <section class="card span-5">
      <div class="card-h"><h2>${icon('🍩', 'yellow')} Chi theo danh mục</h2></div>
      ${cats.length ? cats.map(([c, v], i) => `<div class="cat-row"><span>${CAT_ICON[c] || '✨'} ${esc(c)}</span>${bar(v / s.expense * 100, COLORS[i % 5])}<span class="money">${money(v)}</span></div>`).join('') : empty('🌸', 'Chưa có khoản chi nào.')}
      <div class="mt">${compareBox(m)}</div>
    </section>
  </div>`;
}

function viewStudy() {
  const m = curMonth(), s = summary(m);
  const logs = db.courses.flatMap(c => c.logs.map((l, i) => ({ ...l, course: c.name, cid: c.id, i }))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  const list = [...db.courses].sort((a, b) => a.done - b.done);
  return `<div class="page-h"><h2>📚 Học tập & Phát triển</h2><span class="sp"></span>${db.courses.length ? '<button class="btn danger" data-act="clearStudy">🧹 Xóa hết học tập</button>' : ''}<button class="btn primary" data-act="addCourse">＋ Thêm mục học</button></div>
  <div class="grid">
    <div class="span-3"><div class="stat blue" style="box-shadow:var(--shadow)"><span class="si">⏱</span><div><small>Giờ học tháng này</small><b>${+s.hours.toFixed(1)} giờ</b></div></div></div>
    <div class="span-3"><div class="stat purple" style="box-shadow:var(--shadow)"><span class="si">🔥</span><div><small>Chuỗi ngày học</small><b>${studyStreak()} ngày</b></div></div></div>
    <div class="span-3"><div class="stat pink" style="box-shadow:var(--shadow)"><span class="si">📖</span><div><small>Đang học</small><b>${db.courses.filter(c => !c.done).length} mục</b></div></div></div>
    <div class="span-3"><div class="stat green" style="box-shadow:var(--shadow)"><span class="si">🎓</span><div><small>Đã hoàn thành</small><b>${db.courses.filter(c => c.done).length} mục</b></div></div></div>
    <div class="span-8">${list.length ? `<div class="cards">${list.map(c => `<div class="mini-card">
        <h3>${c.done ? '🎓' : '📘'} ${esc(c.name)}</h3>
        <div class="row"><span>Tiến độ</span><b style="color:var(--ink)">${num(c.progress)}%</b></div>
        ${bar(c.progress, c.done ? 'green' : '')}
        <div class="row"><span>⏱ ${+sum(c.logs, l => l.hours).toFixed(1)} giờ</span><span>${c.done ? `Xong ${fmtDate(c.doneDate)}` : c.logs.length ? `Học gần nhất ${fmtDate([...c.logs].sort((a, b) => b.date.localeCompare(a.date))[0].date)}` : 'Chưa bắt đầu'}</span></div>
        <div class="btns">${!c.done ? `<button class="btn blue sm" data-act="logStudy" data-id="${c.id}">⏱ Ghi giờ học</button><button class="btn green sm" data-act="doneCourse" data-id="${c.id}">✓ Xong</button>` : ''}
          <button class="ibtn" data-act="editCourse" data-id="${c.id}">✏️</button><button class="ibtn" data-act="delCourse" data-id="${c.id}">🗑️</button></div>
      </div>`).join('')}</div>` : `<div class="card">${empty('📖', 'Thêm khóa học, kỹ năng hoặc sách bạn đang học.')}</div>`}</div>
    <section class="card span-4">
      <div class="card-h"><h2>${icon('📝', 'blue')} Nhật ký học gần đây</h2></div>
      ${logs.length ? logs.map(l => `<div class="note"><div class="nt">${esc(l.course)}<small>${fmtDate(l.date)}${l.note ? ' · ' + esc(l.note) : ''}</small></div><span class="pill blue">${l.hours}h</span><button class="ibtn" title="Xóa buổi học này" data-act="delLog" data-cid="${l.cid}" data-i="${l.i}">🗑️</button></div>`).join('') : empty('🌙', 'Chưa có buổi học nào.')}
    </section>
  </div>`;
}

function viewSavings() {
  const months = [5, 4, 3, 2, 1, 0].map(i => shiftMonth(curMonth(), -i));
  const totalGoal = sum(db.goals, g => g.saved);
  return `<div class="page-h"><h2>🐷 Tiết kiệm & Mục tiêu</h2><span class="sp"></span><button class="btn primary" data-act="addGoal">＋ Mục tiêu mới</button></div>
  <div class="grid">
    <div class="span-12">${db.goals.length ? `<div class="cards">${db.goals.map(g => {
      const p = Math.round(num(g.saved) / Math.max(1, num(g.target)) * 100);
      return `<div class="mini-card"><h3><span class="goal-big">${esc(g.icon || '🎯')}</span> ${esc(g.name)}</h3>
        <div class="row"><span>${money(g.saved)} / ${money(g.target)}</span><b style="color:var(--green-d)">${p}%</b></div>
        ${bar(p, 'green')}
        <div class="row"><span>${p >= 100 ? '🎉 Đã đạt mục tiêu!' : `Còn thiếu ${money(num(g.target) - num(g.saved))}`}</span></div>
        ${(g.history || []).length ? `<div class="g-hist">${[...g.history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4).map(h => `<div class="gh ${h.amount < 0 ? 'out' : 'in'}">
          <span>${fmtDate(h.date).slice(0, 5)}</span><span class="gh-note">${esc(h.note || (h.amount < 0 ? 'Rút ra' : 'Bỏ heo'))}</span><b>${h.amount < 0 ? '−' : '+'}${money(Math.abs(h.amount))}</b>
          <button class="ibtn" title="Xóa dòng này (hoàn lại số tiền)" data-act="delGoalHist" data-id="${g.id}" data-h="${h.id}">✕</button></div>`).join('')}</div>` : ''}
        <div class="btns"><button class="btn green sm" data-act="deposit" data-id="${g.id}" data-sign="1">＋ Bỏ heo</button><button class="btn ghost sm" data-act="deposit" data-id="${g.id}" data-sign="-1">－ Rút / Tiêu</button>
          <button class="ibtn" data-act="editGoal" data-id="${g.id}">✏️</button><button class="ibtn" data-act="delGoal" data-id="${g.id}">🗑️</button></div></div>`;
    }).join('')}</div>` : `<div class="card">${empty('🎯', 'Tạo mục tiêu như "Mua laptop", "Quỹ dự phòng"... để theo dõi tiến độ.')}</div>`}</div>
    ${goldCard()}
    <section class="card span-7">
      <div class="card-h"><h2>${icon('📒', 'green')} Tiết kiệm theo tháng</h2></div>
      <table class="tbl"><thead><tr><th>Tháng</th><th class="r">Thu</th><th class="r">Chi</th><th class="r">Tiết kiệm</th><th class="r">Tỉ lệ</th></tr></thead><tbody>
      ${months.reverse().map(k => { const s = summary(k); return `<tr><td><b>${monthLabel(k)}</b></td><td class="r money plus">${money(s.income)}</td><td class="r money minus">${money(s.expense)}</td><td class="r money" style="color:${s.saved >= 0 ? 'var(--blue-d)' : '#d63c5c'}">${money(s.saved)}</td><td class="r"><span class="pill ${s.saved >= 0 ? 'green' : 'red'}">${s.income ? Math.round(s.saved / s.income * 100) : 0}%</span></td></tr>`; }).join('')}
      </tbody></table>
    </section>
    <section class="card span-5">
      <div class="card-h"><h2>${icon('💎', 'purple')} Tổng quan</h2></div>
      <div class="stack">${statBox('🐷', 'Tổng đã bỏ heo (các mục tiêu)', totalGoal, 'green')}${statBox('🪙', 'Giá trị vàng đang giữ', goldStats().value, 'yellow')}${statBox('📆', 'Tiết kiệm 6 tháng qua', sum(months, k => summary(k).saved), 'blue')}</div>
      <small style="display:block;margin-top:10px">💡 Mẹo: mỗi khi nhận tiền job, bấm "Bỏ heo" ngay một phần (ví dụ 20%) để tạo thói quen.</small>
    </section>
  </div>`;
}

function goldBoard() {
  if (!goldFeed || !goldFeed.brands) return '';
  const at = goldFeed.updatedAt ? new Date(goldFeed.updatedAt) : null;
  const when = at && !isNaN(at) ? `${pad(at.getHours())}:${pad(at.getMinutes())} · ${pad(at.getDate())}/${pad(at.getMonth() + 1)}/${at.getFullYear()}` : fmtDate(goldFeed.date);
  return `<div class="gold-board"><div class="gb-h">📊 Giá vàng 24K hôm nay <small>cập nhật ${when}</small></div>
    <table class="tbl"><thead><tr><th>Hãng</th><th>Sản phẩm</th><th class="r">Mua vào / chỉ</th><th class="r">Bán ra / chỉ</th></tr></thead><tbody>
    ${GOLD_BRANDS.map(b => { const f = feedFor(b); const st = f && f.sourceTime ? `${f.sourceTime.slice(11, 16)} ${f.sourceTime.slice(8, 10)}/${f.sourceTime.slice(5, 7)}` : '';
      return `<tr><td><b>${esc(b)}</b>${f && f.ok === false ? ' <span class="pill red" title="Lần lấy giá gần nhất bị lỗi, đang hiện giá cũ">giá cũ</span>' : ''}</td><td><small>${f ? esc(f.product || '24K') + (st ? ` · tiệm cập nhật ${st}` : '') : 'chưa lấy được giá'}</small></td>
      <td class="r"><span class="money">${f && f.buy ? money(f.buy) : '—'}</span></td><td class="r"><span class="money">${f && f.sell ? money(f.sell) : '—'}</span></td></tr>`; }).join('')}
    </tbody></table></div>`;
}
function goldCard() {
  const s = goldStats();
  const combos = [...new Set(s.hold.map(goldKey))];
  const lastUpd = combos.map(k => db.goldPrices[k]?.date || '').sort().pop();
  const list = [...db.gold].sort((a, b) => (a.sold - b.sold) || (b.date || '').localeCompare(a.date || ''));
  const pl = v => v === null ? '<small>—</small>' : `<span class="money ${v >= 0 ? 'plus' : 'minus'}">${v >= 0 ? '+' : '−'}${money(Math.abs(v))}</span>`;
  const rows = list.map(g => {
    const now = goldNow(g), q = num(g.qty), buy = num(g.buyPrice);
    const profit = g.sold ? q * (num(g.sellPrice) - buy) : now !== null ? q * (now - buy) : null;
    return `<tr>
      <td><div class="job-name"><span class="ava yellow">🪙</span><div><b>${esc(g.kind)}</b><small>${esc(g.brand || '—')}${g.place ? ' · ' + esc(g.place) : ''}${g.note ? ' · ' + esc(g.note) : ''}</small></div></div></td>
      <td style="white-space:nowrap">${fmtDate(g.date)}</td>
      <td class="r"><b>${fmtQty(q)}</b>${q >= 10 ? `<small>${+(q / 10).toFixed(2)} lượng</small>` : ''}</td>
      <td class="r"><span class="money">${money(buy)}</span><small>Vốn ${money(q * buy)}</small></td>
      <td class="r">${g.sold ? `<span class="money">${money(g.sellPrice)}</span><small>Bán ${fmtDate(g.sellDate)}</small>` : now !== null ? `<span class="money">${money(now)}</span><small>Trị giá ${money(q * now)}</small>` : '<small>Chưa có giá</small>'}</td>
      <td class="r">${pl(profit)}</td>
      <td>${g.sold ? '<span class="pill gray">Đã bán</span>' : '<span class="pill yellow">Đang giữ</span>'}</td>
      <td class="acts">${!g.sold ? `<button class="ibtn" title="Bán" data-act="sellGold" data-id="${g.id}">💱</button>` : ''}<button class="ibtn" title="Sửa" data-act="editGold" data-id="${g.id}">✏️</button><button class="ibtn" title="Xóa" data-act="delGold" data-id="${g.id}">🗑️</button></td>
    </tr>`;
  }).join('');
  return `<section class="card span-12 gold-card">
    <div class="card-h"><h2>${icon('🪙', 'yellow')} Vàng tích trữ</h2><span class="sp"></span>
      ${combos.length ? `<small>Giá cập nhật: <b>${lastUpd ? fmtDate(lastUpd) : 'chưa có'}</b></small><button class="btn ghost sm" data-act="goldPrice">📈 Cập nhật giá hôm nay</button>` : ''}
      <button class="btn gold" data-act="addGold">＋ Thêm vàng đã mua</button></div>
    <div class="grid" style="gap:12px;margin-bottom:10px">
      <div class="span-3"><div class="stat yellow"><span class="si">🪙</span><div><small>Đang giữ</small><b>${fmtQty(s.qty)}</b></div></div></div>
      <div class="span-3"><div class="stat purple"><span class="si">💸</span><div><small>Tổng vốn</small><b>${money(s.cost)}</b></div></div></div>
      <div class="span-3"><div class="stat blue"><span class="si">💎</span><div><small>Giá trị hiện tại</small><b>${money(s.value)}</b></div></div></div>
      <div class="span-3"><div class="stat ${s.profit >= 0 ? 'green' : 'pink'}"><span class="si">${s.profit >= 0 ? '📈' : '📉'}</span><div><small>Lãi / lỗ tạm tính</small><b>${s.profit >= 0 ? '+' : '−'}${money(Math.abs(s.profit))}</b></div></div></div>
    </div>
    ${list.length ? `<table class="tbl"><thead><tr><th>Loại · Hãng</th><th>Ngày mua</th><th class="r">Số lượng</th><th class="r">Giá mua / chỉ</th><th class="r">Giá hiện tại / chỉ</th><th class="r">Lãi / lỗ</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : empty('🪙', 'Chưa có vàng nào. Bấm "Thêm vàng đã mua" để ghi lại.')}
    ${s.realized ? `<small style="display:block;margin-top:8px">Lãi/lỗ đã chốt từ vàng đã bán: ${pl(s.realized)}</small>` : ''}
    ${goldBoard()}
    <small style="display:block;margin-top:6px">💡 Vàng <b>24K</b> của 5 hãng (BTMC, BTMH, Kim Ngân Phúc, Huy Thanh, Phú Quý) được <b>tự cập nhật giá mỗi sáng</b>, tính theo giá tiệm mua vào (giá bạn bán được). Loại khác thì bấm "Cập nhật giá hôm nay" để nhập tay. 1 lượng = 10 chỉ.</small>
  </section>`;
}

const workItem = l => `<div class="note"><span class="wp-ico">${actIco(l.activity)}</span><div class="nt">${esc(l.activity)}<small>${fmtDate(l.date)} · ${num(l.minutes)} phút${num(l.kcal) ? ` · ${num(l.kcal)} kcal` : ''}${l.note ? ' · ' + esc(l.note) : ''}</small></div><button class="ibtn" title="Xóa" data-act="delWlog" data-id="${l.id}">🗑️</button></div>`;

function heatmap() {
  const start = new Date(); start.setDate(start.getDate() - 27);
  const byDay = {}; db.wlogs.forEach(l => byDay[l.date] = (byDay[l.date] || 0) + num(l.minutes));
  let h = '<div class="heat">' + Array.from({ length: 7 }, (_, i) => `<div class="dow">${DOW_FULL[(start.getDay() + i) % 7]}</div>`).join('');
  for (let i = 0; i < 28; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const ds = ymd(d), m = byDay[ds] || 0, lv = m === 0 ? 0 : m < 30 ? 1 : m < 60 ? 2 : 3;
    h += `<div class="hc l${lv} ${ds === todayStr() ? 'today' : ''}" title="${fmtDate(ds)}: ${m} phút" style="animation-delay:${i * 18}ms">${d.getDate()}</div>`;
  }
  return h + '</div><div class="legend"><span><i class="hc l0"></i>Nghỉ</span><span><i class="hc l1"></i>&lt;30 phút</span><span><i class="hc l2"></i>30–60</span><span><i class="hc l3"></i>60+ phút</span></div>';
}

function viewWorkout() {
  const w = workStats(), today = new Date().getDay();
  const recent = [...db.wlogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const wp = Math.min(100, w.weekMin / w.goal * 100);
  return `<div class="page-h"><h2>🏃 Lịch tập thể dục</h2><span class="sp"></span><button class="btn ghost" data-act="addWlog">📝 Ghi buổi tập</button><button class="btn green" data-act="addPlan">＋ Thêm lịch tập</button></div>
  <div class="grid">
    <div class="span-3"><div class="stat green" style="box-shadow:var(--shadow)"><span class="si">🎯</span><div style="flex:1"><small>Tuần này · mục tiêu <button class="link" data-act="editWeekGoal">${w.goal} phút ✏️</button></small><b>${w.weekMin} phút</b>${bar(wp, 'green')}</div></div></div>
    <div class="span-3"><div class="stat pink" style="box-shadow:var(--shadow)"><span class="si">🔥</span><div><small>Chuỗi ngày tập</small><b>${w.streak} ngày</b></div></div></div>
    <div class="span-3"><div class="stat blue" style="box-shadow:var(--shadow)"><span class="si">💪</span><div><small>Tháng này</small><b>${w.monthCount} buổi · ${w.monthMin}'</b></div></div></div>
    <div class="span-3"><div class="stat yellow" style="box-shadow:var(--shadow)"><span class="si">⚡</span><div><small>Calo đốt tháng này</small><b>${w.monthKcal.toLocaleString('vi-VN')} kcal</b></div></div></div>
    <section class="card span-12">
      <div class="card-h"><h2>${icon('🗓️', 'green')} Lịch tập trong tuần</h2><span class="sp"></span><small>Bấm ✔️ ở cột hôm nay khi tập xong</small></div>
      <div class="week">${DOW_ORDER.map(dw => {
        const plans = db.wplan.filter(p => +p.dow === dw).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        const isT = dw === today;
        return `<div class="wday ${isT ? 'today' : ''}"><div class="wd-h"><b>${DOW_FULL[dw]}</b>${isT ? '<span class="pill pink">Hôm nay</span>' : ''}</div>
          ${plans.length ? plans.map(p => { const done = isT && w.doneIds.has(p.id); return `<div class="wp ${done ? 'done' : ''}">
            <div class="wp-top"><span class="wp-ico">${actIco(p.activity)}</span><b>${esc(p.activity)}</b></div>
            <small>⏰ ${p.time || '—'} · ${num(p.minutes)} phút</small>${p.note ? `<small>${esc(p.note)}</small>` : ''}
            <div class="wp-a">${isT ? (done ? '<span class="pill green">✅ Xong</span>' : `<button class="btn green sm" data-act="doPlan" data-id="${p.id}">✔️ Xong</button>`) : ''}
              <button class="ibtn" title="Sửa" data-act="editPlan" data-id="${p.id}">✏️</button><button class="ibtn" title="Xóa" data-act="delPlan" data-id="${p.id}">🗑️</button></div></div>`; }).join('')
            : '<div class="wd-rest">😴<br>Nghỉ</div>'}
          <button class="wd-add" data-act="addPlan" data-dow="${dw}" title="Thêm lịch ${DOW_FULL[dw]}">＋</button></div>`;
      }).join('')}</div>
    </section>
    <section class="card span-7">
      <div class="card-h"><h2>${icon('📒', 'pink')} Nhật ký tập gần đây</h2></div>
      ${recent.length ? recent.map(workItem).join('') : empty('👟', 'Chưa có buổi tập nào. Tập xong nhớ ghi lại nhé!')}
    </section>
    <section class="card span-5">
      <div class="card-h"><h2>${icon('🟩', 'green')} 28 ngày qua</h2></div>
      ${heatmap()}
    </section>
  </div>`;
}

function viewNotes() {
  const t = ui.noteTab;
  let list = db.notes;
  if (t === 'remind') list = list.filter(n => n.remindAt && !n.done);
  if (t === 'pinned') list = list.filter(n => n.pinned);
  if (t === 'done') list = list.filter(n => n.done);
  if (t === 'all') list = list.filter(n => !n.done);
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  return `<div class="page-h"><h2>📝 Ghi chú & Nhắc nhở</h2><span class="sp"></span><button class="btn primary" data-act="addNote">＋ Thêm ghi chú</button></div>
  ${perm === 'default' ? `<div class="banner blue">🔔 <span>Bật thông báo để máy tính nhắc bạn đúng giờ (khi trang đang mở).</span><span class="sp"></span><button class="btn sm blue" data-act="askNotify">Bật thông báo</button></div>` : ''}
  <section class="card">
    ${jobTabs('noteTab', [['all', 'Chưa xong', db.notes.filter(n => !n.done).length], ['remind', 'Có nhắc giờ', db.notes.filter(n => n.remindAt && !n.done).length], ['pinned', 'Đã ghim', db.notes.filter(n => n.pinned).length], ['done', 'Đã xong', db.notes.filter(n => n.done).length]])}
    ${list.length ? sortNotes(list).map(noteItem).join('') : empty('📭', 'Không có ghi chú nào ở đây.')}
  </section>`;
}

function viewStats() {
  const y = new Date().getFullYear();
  const keys = ui.statsRange === 'year' ? Array.from({ length: 12 }, (_, i) => `${y}-${pad(i + 1)}`) : [5, 4, 3, 2, 1, 0].map(i => shiftMonth(curMonth(), -i));
  const rows = keys.flatMap(k => jobRows(k));
  const paid = [...new Set(rows.map(r => r.j))];
  const byType = {}; rows.forEach(r => byType[r.j.type || 'Khác'] = (byType[r.j.type || 'Khác'] || 0) + r.amount);
  const types = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const totalType = sum(types, t => t[1]);
  const done = db.jobs.filter(j => j.status === 'done' && keys.includes(mk(j.doneDate)));
  const onTime = done.filter(j => !j.deadline || j.doneDate <= j.deadline).length;
  const inc = sum(keys, k => summary(k).income), exp = sum(keys, k => summary(k).expense);
  return `<div class="page-h"><h2>📊 Thống kê & Phân tích</h2><span class="sp"></span>
    <div class="tabs" style="margin:0"><button class="tab ${ui.statsRange === 'month' ? 'on' : ''}" data-act="tab" data-k="statsRange" data-v="month">6 tháng</button><button class="tab ${ui.statsRange === 'year' ? 'on' : ''}" data-act="tab" data-k="statsRange" data-v="year">Năm ${y}</button></div></div>
  <div class="grid">
    <div class="span-3">${statBoxCard('💵', 'Tổng thu', inc, 'green', 'trong khoảng đã chọn')}</div>
    <div class="span-3">${statBoxCard('🛍️', 'Tổng chi', exp, 'pink', 'trong khoảng đã chọn')}</div>
    <div class="span-3">${statBoxCard('🐷', 'Tiết kiệm', inc - exp, 'blue', inc ? `${Math.round((inc - exp) / inc * 100)}% thu nhập` : '—')}</div>
    <div class="span-3"><div class="stat purple" style="box-shadow:var(--shadow);border-color:#fff"><span class="si">🎯</span><div><small>Job hoàn thành</small><b>${done.length} job</b><small>${done.length ? Math.round(onTime / done.length * 100) : 0}% đúng hạn</small></div></div></div>
    <section class="card span-8"><div class="card-h"><h2>${icon('📈', 'blue')} Thu & chi theo tháng</h2></div>${barChart(keys)}</section>
    <div class="span-4 stack">
      <section class="card">${compareBox(curMonth())}</section>
      <section class="card"><div class="card-h"><h2>${icon('🎨', 'pink')} Thu nhập theo loại job</h2></div>
        ${types.length ? types.map(([t, v], i) => `<div class="prow" style="grid-template-columns:1fr 90px 44px"><span>${esc(t)}</span>${bar(v / totalType * 100, COLORS[i % 5])}<span class="pv">${Math.round(v / totalType * 100)}%</span></div>`).join('') : empty('🎨', 'Chưa có job nào được thanh toán.')}
        ${paid.length ? `<small style="display:block;margin-top:8px">Giá trị trung bình mỗi job: <b>${money(sum(paid, j => j.amount) / paid.length)}</b></small>` : ''}
      </section>
    </div>
  </div>`;
}

function viewSettings() {
  const st = db.settings;
  return `<div class="page-h"><h2>⚙️ Cài đặt</h2></div>
  <div class="grid">
    <section class="card span-6">
      <div class="card-h"><h2>${icon('🙋', 'pink')} Cá nhân</h2></div>
      <div class="flex"><span>Tên: <b>${esc(st.name)}</b> · Sinh nhật: <b>${st.birthday ? st.birthday.split('-').reverse().join('/') : 'chưa nhập'}</b></span><button class="btn ghost sm" data-act="editName">Sửa hồ sơ</button></div>
      <div class="flex mt"><span>💻 Ứng dụng máy tính: <b>${isStandalone() ? 'Đang chạy như app ✓' : 'Chưa cài'}</b></span>${!isStandalone() ? '<button class="btn primary sm" data-act="installApp">💻 Cài Kem lên máy</button>' : ''}</div>
      <div class="flex mt"><span>🌗 Giao diện: <b>${{ auto: 'Tự đổi theo giờ (đêm 18h → 6h)', day: 'Luôn sáng', night: 'Luôn tối' }[st.theme || 'auto']}</b></span><button class="btn ghost sm" data-act="cycleTheme">Đổi</button></div>
      <div class="flex mt"><span>✦ Lấp lánh theo chuột: <b>${st.sparkle === false ? 'Tắt' : 'Bật'}</b></span><button class="btn ghost sm" data-act="toggleSparkle">${st.sparkle === false ? 'Bật lên' : 'Tắt đi'}</button></div>
      <div class="flex mt"><span>Thông báo nhắc nhở: <b>${('Notification' in window) ? ({ granted: 'Đã bật', denied: 'Đã chặn (bật lại trong cài đặt trình duyệt)', default: 'Chưa bật' }[Notification.permission]) : 'Không hỗ trợ'}</b></span>
        ${('Notification' in window) && Notification.permission === 'default' ? '<button class="btn blue sm" data-act="askNotify">Bật</button>' : ''}</div>
    </section>
    <section class="card span-6">
      <div class="card-h"><h2>${icon('💾', 'blue')} Sao lưu dữ liệu</h2></div>
      <p class="muted" style="margin:0 0 12px;font-weight:600">Dữ liệu được lưu <b>trong trình duyệt này</b> trên máy bạn. Nếu xóa dữ liệu trình duyệt hoặc đổi máy, hãy dùng file sao lưu để khôi phục.</p>
      <div class="flex"><button class="btn blue" data-act="exportData">⬇ Tải file sao lưu</button><button class="btn ghost" data-act="importData">⬆ Khôi phục từ file</button></div>
      <small style="display:block;margin-top:10px">Lần sao lưu gần nhất: <b>${st.lastBackup ? fmtDate(st.lastBackup) : 'chưa có'}</b></small>
    </section>
    <section class="card span-12">
      <div class="card-h"><h2>${icon('🧹', 'yellow')} Dữ liệu</h2></div>
      <div class="flex"><button class="btn danger" data-act="clearPick">🧹 Xóa dữ liệu (chọn mục)</button><button class="btn ghost" data-act="loadDemo">🧸 Nạp dữ liệu mẫu</button><button class="btn danger" data-act="resetAll">🗑 Xóa toàn bộ</button></div>
      <small style="display:block;margin-top:10px">Hai thao tác này sẽ thay thế dữ liệu hiện tại. Hãy sao lưu trước nếu cần.</small>
    </section>
  </div>`;
}

/* ---------- Điều hướng ---------- */
const VIEWS = {
  home:     { t: 'Trang chủ',       i: '🏠', r: viewHome },
  jobs:     { t: 'Công việc',       i: '💼', r: viewJobs },
  calendar: { t: 'Lịch & Deadline', i: '📅', r: viewCalendar },
  finance:  { t: 'Tài chính',       i: '💰', r: viewFinance },
  study:    { t: 'Học tập',         i: '📚', r: viewStudy },
  workout:  { t: 'Tập luyện',       i: '🏃', r: viewWorkout },
  savings:  { t: 'Tiết kiệm',       i: '🐷', r: viewSavings },
  notes:    { t: 'Ghi chú',         i: '📝', r: viewNotes },
  stats:    { t: 'Thống kê',        i: '📊', r: viewStats },
  settings: { t: 'Cài đặt',         i: '⚙️', r: viewSettings },
};
const route = () => { const k = location.hash.slice(1); return VIEWS[k] ? k : 'home'; };

function render() {
  const k = route();
  const lateJobs = activeJobs().filter(j => j.deadline && daysLeft(j.deadline) <= 1).length;
  const dueNotes = db.notes.filter(n => !n.done && n.remindAt && n.remindAt.slice(0, 10) <= todayStr()).length;
  const badges = { jobs: lateJobs, notes: dueNotes, workout: workStats().todoToday };
  $('#nav').innerHTML = Object.entries(VIEWS).map(([key, v]) =>
    `<a class="nav-i ${key === k ? 'on' : ''}" href="#${key}"><span class="ni">${v.i}</span><span>${v.t}</span>${badges[key] ? `<span class="badge">${badges[key]}</span>` : ''}</a>`).join('');
  $('#view').innerHTML = VIEWS[k].r();
  if (k !== lastRoute) { lastRoute = k; animateEnter(); }
  renderHero(lateJobs, dueNotes);
  const last = db.settings.lastBackup;
  const doneAll = db.jobs.filter(j => j.status === 'done').length;
  $('#sideFoot').innerHTML = `<div class="win-bar"><span>💾 backup.sys</span><i></i><i></i><i></i></div>
    <div class="sf-body">${last ? `Lần cuối: <b>${fmtDate(last)}</b>` : 'Chưa sao lưu lần nào'}<br><button class="link" data-act="exportData">Sao lưu ngay →</button>
    <div class="counter"><small>job đã xong</small><span>${String(doneAll).padStart(5, '0')}</span></div></div>`;
  document.title = `${VIEWS[k].t} · Kem`;
}

function renderHero(lateJobs, dueNotes) {
  const h = new Date().getHours();
  const hi = h < 5 ? 'Khuya rồi' : h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : h < 23 ? 'Chào buổi tối' : 'Khuya rồi';
  $('#greet').innerHTML = `<span class="chrome">${esc(hi)}, ${esc(db.settings.name)}!</span> ✨`;
  const parts = [];
  const today = activeJobs().filter(j => j.deadline === todayStr()).length;
  if (today) parts.push(`🔥 ${today} deadline hôm nay`);
  else if (lateJobs) parts.push(`⏳ ${lateJobs} job sắp tới hạn`);
  if (dueNotes) parts.push(`🔔 ${dueNotes} nhắc nhở`);
  const wk = workStats();
  if (wk.todoToday) parts.push(`🏃 ${wk.todoToday} buổi tập hôm nay`);
  parts.push(activeJobs().length ? `💼 ${activeJobs().length} job đang chạy` : '🐟 đang không có job');
  $('#greetSub').textContent = parts.join('  •  ');
  renderMood();
}

let lastMood = '';
function renderMood(poke = false) {
  const [key, lines] = pickMood(), m = MOODS[key];
  if (key !== lastMood) { moodLine = -1; lastMood = key; }
  if (moodLine < 0) moodLine = (new Date().getDate() + new Date().getHours()) % lines.length;
  if (poke) moodLine = (moodLine + 1) % lines.length;
  $('#mood').dataset.mood = key;
  $('#moodSay').innerHTML = `<b class="mood-tag">${esc(m.tag)}</b>${esc(lines[moodLine])}`;
}

function tickClock() {
  const d = new Date();
  $('#lcdDate').textContent = `${DOW_FULL[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  $('#lcdTime').textContent = `${pad(d.getHours())}${d.getSeconds() % 2 ? ':' : ' '}${pad(d.getMinutes())}`;
}

/* ---------- Form & modal ---------- */
/* ---------- Ô ngày kiểu Việt Nam: dd/mm/yyyy ---------- */
// "05/10/2026" | "5/10/2026" | "05102026" | "5-10-2026" | "5/10" (năm nay) → "2026-10-05"
function parseVnDate(s) {
  s = String(s || '').trim().replace(/[-.\s]+/g, '/');
  if (!s) return null;
  if (/^\d{8}$/.test(s)) s = `${s.slice(0, 2)}/${s.slice(2, 4)}/${s.slice(4)}`;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  let y = m[3] ? +m[3] : new Date().getFullYear();
  if (y < 100) y += 2000;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}
window.kemDateMask = el => {
  let v = el.value.replace(/[^\d/]/g, '');
  if (!v.includes('/')) { // chỉ gõ số: tự chèn dấu "/"
    const d = v.slice(0, 8);
    v = d.slice(0, 2) + (d.length > 2 ? '/' + d.slice(2, 4) : '') + (d.length > 4 ? '/' + d.slice(4) : '');
  }
  el.value = v.slice(0, 10);
  el.classList.toggle('bad', el.value.length >= 8 && !parseVnDate(el.value));
};
window.kemDatePick = btn => {
  const box = btn.parentElement, nat = box.querySelector('.dnative'), txt = box.querySelector('input[type=text]');
  nat.value = parseVnDate(txt.value) || todayStr();
  try { nat.showPicker(); } catch (e) { nat.focus(); nat.click(); }
};
window.kemDateFromNative = nat => {
  const txt = nat.parentElement.querySelector('input[type=text]');
  if (nat.value) { txt.value = fmtDate(nat.value); txt.classList.remove('bad'); }
};
window.kemDateToday = btn => {
  const txt = btn.parentElement.querySelector('input[type=text]');
  txt.value = fmtDate(todayStr()); txt.classList.remove('bad');
};

function openForm({ title, fields, values = {}, submit = 'Lưu', onSave }) {
  const html = fields.map(fd => {
    const v = values[fd.k] ?? fd.def ?? '';
    let inp;
    if (fd.type === 'select') {
      inp = `<select name="${fd.k}">${fd.options.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
    } else if (fd.type === 'days') {
      const sel = new Set((Array.isArray(v) ? v : [v]).filter(x => x !== '' && x != null).map(Number));
      inp = `<div class="daypick">${DOW_ORDER.map(i => `<label><input type="checkbox" name="${fd.k}" value="${i}" ${sel.has(i) ? 'checked' : ''}><span>${DOW_FULL[i]}</span></label>`).join('')}</div>`;
    } else if (fd.type === 'date') {
      inp = `<div class="datefield">
        <input type="text" name="${fd.k}" value="${v ? fmtDate(v) : ''}" placeholder="ngày/tháng/năm" inputmode="numeric" maxlength="10" autocomplete="off" ${fd.req ? 'required' : ''} oninput="kemDateMask(this)">
        <button type="button" class="dbtn" title="Chọn trên lịch" onclick="kemDatePick(this)">📅</button>
        <button type="button" class="dbtn" title="Điền ngày hôm nay" onclick="kemDateToday(this)">Hôm nay</button>
        <input type="date" class="dnative" tabindex="-1" aria-hidden="true" onchange="kemDateFromNative(this)">
      </div>`;
    } else if (fd.type === 'textarea') {
      inp = `<textarea name="${fd.k}" rows="3" placeholder="${esc(fd.ph || '')}">${esc(v)}</textarea>`;
    } else if (fd.type === 'checkbox') {
      inp = `<label class="chk"><input type="checkbox" name="${fd.k}" ${v ? 'checked' : ''}> ${esc(fd.text || '')}</label>`;
    } else if (fd.type === 'range') {
      inp = `<div class="range"><input type="range" name="${fd.k}" min="0" max="100" step="5" value="${num(v)}" oninput="this.nextElementSibling.textContent=this.value+'%'"><span>${num(v)}%</span></div>`;
    } else if (fd.type === 'money') {
      inp = `<input type="number" name="${fd.k}" min="0" step="1000" value="${esc(v)}" ${fd.req ? 'required' : ''} placeholder="0" oninput="this.nextElementSibling.textContent=(+this.value||0).toLocaleString('vi-VN')+'₫'"><span class="hint">${money(v)}</span>`;
    } else {
      inp = `<input type="${fd.type || 'text'}" name="${fd.k}" value="${esc(v)}" ${fd.req ? 'required' : ''} ${fd.step ? `step="${fd.step}" min="0"` : ''} ${fd.list ? `list="dl_${fd.k}"` : ''} placeholder="${esc(fd.ph || '')}">` +
        (fd.list ? `<datalist id="dl_${fd.k}">${fd.list.map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : '');
    }
    return `<div class="field ${fd.half ? 'half' : ''}">${fd.label ? `<label>${esc(fd.label)}</label>` : ''}${inp}</div>`;
  }).join('');
  const modal = $('#modal');
  modal.innerHTML = `<form class="modal-box" id="mform" autocomplete="off"><div class="modal-h"><h3>${title}</h3><button type="button" class="x" data-act="closeModal">✕</button></div>
    <div class="fields">${html}</div><div class="modal-f"><button type="button" class="btn ghost" data-act="closeModal">Hủy</button><button class="btn primary">${submit}</button></div></form>`;
  modal.classList.remove('hidden');
  const form = $('#mform');
  setTimeout(() => form.querySelector('input:not([type=checkbox]),select,textarea')?.focus(), 30);
  form.onsubmit = async e => {
    e.preventDefault();
    const out = {};
    let badDate = null;
    fields.forEach(fd => {
      if (fd.type === 'days') { out[fd.k] = [...form.querySelectorAll(`input[name="${fd.k}"]:checked`)].map(x => +x.value); return; }
      const el = form.elements[fd.k];
      if (fd.type === 'date') {
        const raw = el.value.trim(), iso = parseVnDate(raw);
        if (raw && !iso) { badDate = badDate || el; el.classList.add('bad'); }
        out[fd.k] = iso || '';
        return;
      }
      out[fd.k] = fd.type === 'checkbox' ? el.checked : ['number', 'money', 'range'].includes(fd.type) ? num(el.value) : el.value.trim();
    });
    if (badDate) { toast('Ngày chưa đúng, nhập dạng ngày/tháng/năm, ví dụ 05/10/2026', 'err'); badDate.focus(); return; }
    if ((await onSave(out)) === false) return;
    save(); closeModal(); render();
  };
}
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; }

/* ---------- Hiệu ứng động ---------- */
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let lastPt = { x: innerWidth / 2, y: innerHeight / 2 };
function boom(x = lastPt.x, y = lastPt.y, n = 26, shapes = ['', '', '♥', '★', '✦']) {
  if (calm()) return;
  const colors = ['#ff3d9a', '#ffb800', '#12c97c', '#2f94ff', '#8b5cff'];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span'), sh = shapes[i % shapes.length], c = colors[i % colors.length];
    const a = Math.random() * Math.PI * 2, dist = 50 + Math.random() * 110;
    s.className = 'confetti' + (sh ? ' sym' : '');
    s.textContent = sh;
    s.style.cssText = `left:${x}px;top:${y}px;color:${c};${sh ? '' : `background:${c};`}--dx:${Math.cos(a) * dist}px;--dy:${Math.sin(a) * dist - 50}px;--r:${Math.random() * 720 - 360}deg;animation-delay:${Math.random() * 60}ms`;
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1300);
  }
}
function countUp() {
  if (calm()) return;
  document.querySelectorAll('#view [data-count]').forEach(el => {
    const to = num(el.dataset.count), t0 = performance.now(), dur = 900;
    const step = t => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = money(to * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
let lastSpark = 0;
document.addEventListener('mousemove', e => {
  if (db.settings.sparkle === false || calm()) return;
  const t = performance.now(); if (t - lastSpark < 55) return; lastSpark = t;
  const s = document.createElement('span');
  s.className = 'spark';
  s.textContent = ['✦', '✧', '⋆', '♡', '★'][Math.floor(Math.random() * 5)];
  s.style.cssText = `left:${e.clientX + 8}px;top:${e.clientY + 10}px;color:${['#ff3d9a', '#8b5cff', '#2f94ff', '#ffb800', '#12c97c'][Math.floor(Math.random() * 5)]}`;
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 760);
});
let lastRoute = null, enterTimer = 0;
function animateEnter() {
  const v = $('#view');
  v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
  countUp();
  clearTimeout(enterTimer); enterTimer = setTimeout(() => v.classList.remove('enter'), 1500);
}

function toast(text, kind = '', ms = 2600) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* ---------- Các form cụ thể ---------- */
/* ---------- Nhân bản job: DOT-LV41 → DOT-LV42, LV43... ---------- */
// Tách tên thành phần chữ + số cuối + đuôi: "DOT-LV41" → ["DOT-LV", "41", ""]
const splitNum = name => { const m = String(name || '').match(/^(.*?)(\d+)(\D*)$/); return m ? { pre: m[1], num: m[2], suf: m[3] } : null; };
function nextJobNames(j, count) {
  const p = splitNum(j.name);
  if (!p) return Array.from({ length: count }, (_, i) => `${j.name} (${i + 2})`);
  const same = new RegExp('^' + p.pre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)' + p.suf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
  let max = +p.num;
  db.jobs.forEach(x => { const m = String(x.name || '').match(same); if (m) max = Math.max(max, +m[1]); });
  return Array.from({ length: count }, (_, i) => p.pre + String(max + 1 + i).padStart(p.num.length, '0') + p.suf);
}
function dupJobForm(j) {
  const first = nextJobNames(j, 1)[0];
  openForm({
    title: `➕ Tạo tiếp từ "${esc(j.name)}"`, submit: 'Tạo job',
    values: { count: 1, stage: jobStage(j), amount: j.amount, startDate: todayStr(), deadline: j.deadline && j.deadline >= todayStr() ? j.deadline : '' },
    fields: [
      { k: 'count', label: `Số job muốn tạo (job đầu tiên sẽ là "${first}")`, type: 'number', step: '1', req: true },
      { k: 'stage', label: 'Công đoạn', type: 'select', half: true, options: STAGES.map(s => [s.k, `${s.i} ${s.t}`]) },
      { k: 'amount', label: 'Tiền mỗi job (₫)', type: 'money', half: true },
      { k: 'startDate', label: 'Ngày nhận job', type: 'date', half: true },
      { k: 'deadline', label: 'Deadline', type: 'date', half: true },
    ],
    onSave(v) {
      const n = Math.round(num(v.count));
      if (n < 1 || n > 50) { toast('Nhập từ 1 đến 50 job nhé', 'err'); return false; }
      const st = STAGES[stageIdx(v.stage)], done = st.k === 'final';
      const names = nextJobNames(j, n);
      const at = db.jobs.indexOf(j) + 1;
      const fresh = names.map(name => ({
        id: uid(), name, client: j.client || '', type: j.type || '', note: '',
        startDate: v.startDate, deadline: v.deadline, amount: v.amount,
        stage: st.k, status: statusOfStage(st.k), progress: st.p, doneDate: done ? todayStr() : '',
        deposit: 0, depositDate: '', paid: false, paidDate: '', revisions: 0,
      }));
      db.jobs.splice(at, 0, ...fresh);
      toast(n === 1 ? `➕ Đã tạo ${names[0]}` : `➕ Đã tạo ${n} job: ${names[0]} → ${names[n - 1]}`);
    },
  });
}

function jobForm(j, date) {
  const types = [...new Set(['Animation nhân vật', 'Motion graphic', 'Animation sticker / emote', 'Intro / Outro', 'Animated MV / Lyric', 'Frame by frame', 'Rigging (Spine / Live2D)', 'Storyboard', ...db.jobs.map(x => x.type).filter(Boolean)])];
  const clients = [...new Set(db.jobs.map(x => x.client).filter(Boolean))];
  openForm({
    title: j ? '✏️ Sửa job' : '🎬 Job mới về!',
    values: j ? { ...j, stage: jobStage(j) } : { startDate: todayStr(), deadline: date || '', stage: 'brief' },
    fields: [
      { k: 'name', label: 'Tên job *', req: true, ph: 'VD: Emote Twitch 5 cái cho chị A' },
      { k: 'client', label: 'Khách (tên / nick FB / Discord)', half: true, list: clients },
      { k: 'type', label: 'Loại job', half: true, list: types },
      { k: 'startDate', label: 'Ngày nhận job', type: 'date', half: true },
      { k: 'deadline', label: 'Deadline', type: 'date', half: true },
      { k: 'stage', label: 'Đang ở công đoạn', type: 'select', half: true, options: STAGES.map(s => [s.k, `${s.i} ${s.t}`]) },
      { k: 'amount', label: 'Tổng tiền job (₫)', type: 'money', half: true },
      { k: 'deposit', label: 'Tiền cọc (₫) · để 0 nếu không cọc', type: 'money', half: true },
      { k: 'depositDate', label: 'Ngày nhận cọc (trống = chưa nhận)', type: 'date', half: true },
      { k: 'paid', label: '', type: 'checkbox', text: '💰 Khách đã trả đủ', half: true },
      { k: 'paidDate', label: 'Ngày nhận phần còn lại', type: 'date', half: true },
      { k: 'revisions', label: '🔁 Số lần khách bắt sửa', type: 'number', step: '1', half: true },
      { k: 'note', label: 'Ghi chú (link brief, yêu cầu của khách...)', type: 'textarea' },
    ],
    onSave(v) {
      const st = STAGES[stageIdx(v.stage)];
      v.status = statusOfStage(st.k);
      v.progress = st.p;
      if (v.status === 'done') v.doneDate = (j && j.doneDate) || todayStr(); else v.doneDate = '';
      if (v.paid && !v.paidDate) v.paidDate = todayStr();
      if (!v.paid) v.paidDate = '';
      if (num(v.deposit) > num(v.amount) && num(v.amount) > 0) { toast('Tiền cọc lớn hơn tổng tiền job rồi 🤔', 'err'); return false; }
      if (j) Object.assign(j, v); else db.jobs.push({ id: uid(), ...v });
      toast(j ? '✨ Đã cập nhật job' : '🎬 Job mới! Brief kỹ trước khi làm nha');
    },
  });
}
function txForm(t, kind) {
  kind = t ? t.kind : kind;
  openForm({
    title: kind === 'income' ? (t ? '✏️ Sửa khoản thu' : '💵 Thêm thu nhập') : (t ? '✏️ Sửa khoản chi' : '🛍️ Thêm chi tiêu'),
    values: t || { date: todayStr(), category: kind === 'income' ? 'Khác' : 'Ăn uống' },
    fields: [
      { k: 'amount', label: 'Số tiền (₫) *', type: 'money', req: true },
      { k: 'category', label: 'Danh mục', type: 'select', half: true, options: (kind === 'income' ? INC_CATS : EXP_CATS).map(c => [c, `${CAT_ICON[c] || ''} ${c}`]) },
      { k: 'date', label: 'Ngày', type: 'date', half: true, req: true },
      { k: 'note', label: 'Ghi chú', ph: 'VD: Tiền điện tháng 11' },
    ],
    onSave(v) {
      if (v.amount <= 0) { toast('Số tiền phải lớn hơn 0', 'err'); return false; }
      if (t) Object.assign(t, v); else db.tx.push({ id: uid(), kind, ...v });
      ui.month = mk(v.date);
    },
  });
}
function courseForm(c) {
  openForm({
    title: c ? '✏️ Sửa mục học' : '📚 Thêm mục học',
    values: c || { progress: 0 },
    fields: [
      { k: 'name', label: 'Tên khóa học / kỹ năng *', req: true, ph: 'VD: Spine – Advanced' },
      { k: 'progress', label: 'Tiến độ', type: 'range' },
    ],
    onSave(v) {
      if (c) { Object.assign(c, v); if (v.progress >= 100 && !c.done) { c.done = true; c.doneDate = todayStr(); } }
      else db.courses.push({ id: uid(), ...v, done: v.progress >= 100, doneDate: v.progress >= 100 ? todayStr() : '', logs: [] });
    },
  });
}
function logForm(c) {
  openForm({
    title: `⏱ Ghi giờ học · ${esc(c.name)}`,
    values: { date: todayStr(), hours: 1, progress: c.progress },
    fields: [
      { k: 'date', label: 'Ngày', type: 'date', half: true, req: true },
      { k: 'hours', label: 'Số giờ', type: 'number', step: '0.25', half: true, req: true },
      { k: 'progress', label: 'Tiến độ mới', type: 'range' },
      { k: 'note', label: 'Học được gì?', ph: 'VD: Mesh deform, IK constraint' },
    ],
    onSave(v) {
      if (v.hours <= 0) { toast('Số giờ phải lớn hơn 0', 'err'); return false; }
      c.logs.push({ date: v.date, hours: v.hours, note: v.note });
      c.progress = v.progress;
      if (v.progress >= 100) { c.done = true; c.doneDate = todayStr(); toast('🎓 Chúc mừng, đã hoàn thành!'); }
      else toast(`📚 +${v.hours} giờ học. Giỏi lắm!`);
    },
  });
}
function goalForm(g) {
  openForm({
    title: g ? '✏️ Sửa mục tiêu' : '🎯 Mục tiêu tiết kiệm mới',
    values: g || { icon: '🎯', saved: 0 },
    fields: [
      { k: 'name', label: 'Tên mục tiêu *', req: true, ph: 'VD: Mua máy tính bảng' },
      { k: 'icon', label: 'Biểu tượng', type: 'select', half: true, options: ['🎯', '💻', '📱', '🎨', '✈️', '🏠', '🛵', '🛟', '🎓', '💍', '🎮', '🐷'] },
      { k: 'target', label: 'Số tiền mục tiêu (₫) *', type: 'money', half: true, req: true },
      { k: 'saved', label: 'Đã có sẵn (₫)', type: 'money' },
    ],
    onSave(v) { if (g) Object.assign(g, v); else db.goals.push({ id: uid(), ...v }); },
  });
}
function goldForm(g) {
  const brands = [...new Set([...GOLD_BRANDS, ...db.gold.map(x => x.brand).filter(Boolean)])];
  openForm({
    title: g ? '✏️ Sửa vàng' : '🪙 Thêm vàng đã mua',
    values: g || { date: todayStr(), qty: 1, kind: 'Vàng 24K (999.9)', brand: 'Bảo Tín Minh Châu' },
    fields: [
      { k: 'kind', label: 'Loại vàng', type: 'select', half: true, options: GOLD_KINDS },
      { k: 'brand', label: 'Hãng / thương hiệu', half: true, list: brands, ph: 'VD: SJC, PNJ, DOJI' },
      { k: 'qty', label: 'Số lượng (chỉ) *', type: 'number', step: '0.01', half: true, req: true },
      { k: 'date', label: 'Ngày mua', type: 'date', half: true, req: true },
      { k: 'buyPrice', label: 'Giá lúc mua / 1 chỉ (₫) *', type: 'money', req: true },
      { k: 'place', label: 'Nơi mua', half: true, ph: 'VD: PNJ Quận 1' },
      { k: 'note', label: 'Ghi chú', half: true, ph: 'VD: quà sinh nhật' },
    ],
    onSave(v) {
      if (v.qty <= 0 || v.buyPrice <= 0) { toast('Số lượng và giá mua phải lớn hơn 0', 'err'); return false; }
      if (g) Object.assign(g, v); else db.gold.push({ id: uid(), ...v, sold: false, sellPrice: 0, sellDate: '' });
      if (!db.goldPrices[goldKey(v)]) db.goldPrices[goldKey(v)] = { price: v.buyPrice, date: v.date };
      toast(g ? '✨ Đã cập nhật' : `🪙 Đã thêm ${fmtQty(v.qty)} ${v.kind}`);
    },
  });
}
function sellGoldForm(g) {
  openForm({
    title: `💱 Bán vàng · ${esc(g.kind)} ${esc(g.brand || '')}`, submit: 'Xác nhận đã bán',
    values: { sellPrice: goldNow(g) || g.buyPrice, sellDate: todayStr() },
    fields: [
      { k: 'sellPrice', label: `Giá bán / 1 chỉ (₫) · đang có ${fmtQty(g.qty)}, mua ${money(g.buyPrice)}/chỉ`, type: 'money', req: true },
      { k: 'sellDate', label: 'Ngày bán', type: 'date', req: true },
    ],
    onSave(v) {
      if (v.sellPrice <= 0) { toast('Giá bán phải lớn hơn 0', 'err'); return false; }
      Object.assign(g, v, { sold: true });
      const p = num(g.qty) * (v.sellPrice - num(g.buyPrice));
      toast(p >= 0 ? `📈 Đã bán, lãi ${money(p)}` : `📉 Đã bán, lỗ ${money(-p)}`);
    },
  });
}
function goldPriceForm() {
  const combos = [...new Set(db.gold.filter(g => !g.sold).map(goldKey))];
  const values = {}; combos.forEach((k, i) => { values['p' + i] = db.goldPrices[k]?.price || ''; });
  openForm({
    title: '📈 Cập nhật giá vàng hôm nay', values,
    fields: combos.map((k, i) => { const [kind, brand] = k.split('|'); return { k: 'p' + i, label: `${kind}${brand ? ' · ' + brand : ''} (giá tiệm mua vào / chỉ)`, type: 'money' }; }),
    onSave(v) {
      combos.forEach((k, i) => { if (v['p' + i] > 0) db.goldPrices[k] = { price: v['p' + i], date: todayStr() }; });
      toast('📈 Đã cập nhật giá vàng');
    },
  });
}
function planForm(p, dow) {
  openForm({
    title: p ? '✏️ Sửa lịch tập' : '🗓️ Thêm lịch tập',
    values: p ? { ...p, days: [+p.dow] } : { days: [dow !== undefined && dow !== '' ? +dow : new Date().getDay()], time: '18:00', minutes: 30 },
    fields: [
      { k: 'days', label: 'Tập vào những ngày', type: 'days' },
      { k: 'activity', label: 'Môn tập *', req: true, list: Object.keys(ACTS), ph: 'VD: Gym, Yoga, Chạy bộ' },
      { k: 'time', label: 'Giờ tập', type: 'time', half: true },
      { k: 'minutes', label: 'Thời lượng (phút)', type: 'number', step: '5', half: true },
      { k: 'note', label: 'Ghi chú', ph: 'VD: Tập chân, 5km...' },
    ],
    onSave(v) {
      if (!v.days.length) { toast('Chọn ít nhất 1 ngày nhé', 'err'); return false; }
      const base = { activity: v.activity, time: v.time, minutes: v.minutes, note: v.note };
      if (p) { Object.assign(p, base, { dow: v.days[0] }); v.days.slice(1).forEach(d => db.wplan.push({ id: uid(), ...base, dow: d })); }
      else v.days.forEach(d => db.wplan.push({ id: uid(), ...base, dow: d }));
      toast(`${actIco(v.activity)} Đã lên lịch ${v.days.map(d => DOW_FULL[d]).join(', ')}`);
    },
  });
}
function wlogForm() {
  openForm({
    title: '📝 Ghi buổi tập', values: { date: todayStr(), minutes: 30 },
    fields: [
      { k: 'activity', label: 'Môn tập *', req: true, list: Object.keys(ACTS) },
      { k: 'date', label: 'Ngày', type: 'date', half: true, req: true },
      { k: 'minutes', label: 'Số phút', type: 'number', step: '5', half: true, req: true },
      { k: 'kcal', label: 'Calo đốt (không bắt buộc)', type: 'number', step: '10', half: true },
      { k: 'note', label: 'Ghi chú', half: true, ph: 'VD: chạy 5km' },
    ],
    onSave(v) {
      if (v.minutes <= 0) { toast('Số phút phải lớn hơn 0', 'err'); return false; }
      db.wlogs.push({ id: uid(), ...v, planId: '' }); boom(); toast('💪 Giỏi quá! Đã ghi buổi tập');
    },
  });
}
function noteForm(n, date) {
  openForm({
    title: n ? '✏️ Sửa ghi chú' : '📝 Ghi chú / Nhắc nhở mới',
    values: n || { remindAt: date ? date + 'T09:00' : '' },
    fields: [
      { k: 'text', label: 'Nội dung *', type: 'textarea', req: true, ph: 'VD: Gửi file cho khách trước 5h chiều' },
      { k: 'remindAt', label: 'Nhắc lúc (để trống nếu không cần)', type: 'datetime-local', half: true },
      { k: 'pinned', label: '', type: 'checkbox', text: '⭐ Ghim lên đầu', half: true },
    ],
    onSave(v) {
      if (!v.text) { toast('Nhập nội dung ghi chú nhé', 'err'); return false; }
      if (n) { if (v.remindAt !== n.remindAt) n.notified = false; Object.assign(n, v); }
      else db.notes.push({ id: uid(), ...v, done: false, notified: false });
      if (v.remindAt && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    },
  });
}

/* ---------- Xong job: VICTORY / DOUBLE KILL / ... PENTAKILL ---------- */
function showBanner(big, small = '') {
  const el = document.createElement('div');
  el.className = 'victory';
  el.innerHTML = `<div class="v-big chrome">${esc(big)}</div>${small ? `<div class="v-small">${esc(small)}</div>` : ''}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2300);
}
function finishJob(j) {
  const t = todayStr(), before = monthLP().rank;
  const late = j.deadline && t > j.deadline;
  j.stage = 'final'; j.status = 'done'; j.progress = 100; j.doneDate = t;
  const n = db.jobs.filter(x => x.status === 'done' && x.doneDate === t).length;
  const monthN = db.jobs.filter(x => x.status === 'done' && mk(x.doneDate) === curMonth()).length;
  const kill = ['VICTORY!', 'VICTORY!', 'DOUBLE KILL!', 'TRIPLE KILL!', 'QUADRA KILL!'][n] || 'PENTAKILL!';
  boom(innerWidth / 2, innerHeight / 2, 60, ['', '', '★', '✦', '🍨', '♥']);
  save(); render();
  const after = monthLP().rank;
  showBanner(kill, after.n !== before.n ? `THĂNG HẠNG ${after.n.toUpperCase()}! 🎉` : `${late ? '+15' : '+40'} LP · job thứ ${monthN} tháng này${monthN === 5 ? ' · PENTAKILL tháng!' : ''}`);
  toast(j.paid ? '🏆 Xong job và đã nhận đủ tiền!' : `🏆 Xong job! Nhớ đòi nốt ${money(jobRemain(j))} nha 💸`);
}

/* ---------- Hành động ---------- */
const byId = (arr, id) => arr.find(x => x.id === id);
/* Hộp xác nhận tự vẽ (không dùng confirm() của trình duyệt vì có thể bị chặn) */
function askConfirm(msg, { ok = 'Xóa', icon = '🗑️', danger = true } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal confirm-wrap';
    wrap.innerHTML = `<div class="modal-box confirm-box" role="alertdialog" aria-modal="true">
      <div class="modal-h"><h3>${icon} Xác nhận</h3></div>
      <p class="confirm-msg">${esc(msg)}</p>
      <div class="modal-f"><button type="button" class="btn ghost" data-c="0">Thôi, giữ lại</button><button type="button" class="btn ${danger ? 'primary' : 'blue'}" data-c="1">${esc(ok)}</button></div></div>`;
    const done = v => { document.removeEventListener('keydown', onKey, true); wrap.remove(); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); } };
    wrap.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('[data-c]'); if (b) done(b.dataset.c === '1'); else if (e.target === wrap) done(false); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap);
    setTimeout(() => wrap.querySelector('[data-c="1"]').focus(), 30);
  });
}
async function confirmDel(what, fn) {
  if (!(await askConfirm(`Xóa ${what}? Không thể hoàn tác.`))) return;
  fn(); save(); render(); toast('🗑️ Đã xóa');
}
const commit = msg => { save(); render(); if (msg) toast(msg); };

const ACTIONS = {
  closeModal,
  month: d => { ui.month = shiftMonth(ui.month, +d.d); render(); countUp(); },
  moodPoke: (d, el) => {
    el.classList.remove('jump'); void el.offsetWidth; el.classList.add('jump');
    const r = el.querySelector('.bubble').getBoundingClientRect();
    boom(r.left + r.width / 2, r.top + r.height / 2, 18, el.dataset.mood === 'angry' ? ['🔥', '🪳', '💢', '🍳'] : el.dataset.mood === 'money' ? ['💰', '🪙', '✦', '₫'] : ['♥', '♥', '✦', '🍨']);
    renderMood(true);
  },
  calMonth: d => { ui.calMonth = shiftMonth(ui.calMonth, +d.d); render(); },
  calToday: () => { ui.calMonth = curMonth(); ui.selDay = todayStr(); render(); },
  tab: d => { ui[d.k] = d.v; render(); },
  pickDay: d => { ui.selDay = d.d; ui.calMonth = mk(d.d); if (route() !== 'calendar') location.hash = 'calendar'; else render(); },

  addJob: d => jobForm(null, d.date),
  editJob: d => jobForm(byId(db.jobs, d.id)),
  dupJob: d => dupJobForm(byId(db.jobs, d.id)),
  delJob: d => confirmDel('job này', () => { db.jobs = db.jobs.filter(j => j.id !== d.id); }),
  doneJob: d => finishJob(byId(db.jobs, d.id)),
  payJob: d => { const j = byId(db.jobs, d.id); j.paid = true; j.paidDate = todayStr(); boom(undefined, undefined, 22, ['💰', '🪙', '✦', '₫']); commit(`💰 Ting ting! Nhận ${money(jobRemain(j))}`); },
  nextStage: d => {
    const j = byId(db.jobs, d.id), si = stageIdx(jobStage(j));
    if (si >= STAGES.length - 2) return finishJob(j);
    const nx = STAGES[si + 1];
    j.stage = nx.k; j.status = statusOfStage(nx.k); j.progress = nx.p;
    boom(undefined, undefined, 12, ['✦', '★', '']);
    commit(`${nx.i} ${nx.t}! ${nx.k === 'sent' ? 'Cầu cho khách không bắt sửa 🙏' : 'Tiếp tục nào!'}`);
  },
  addRev: d => {
    const j = byId(db.jobs, d.id); j.revisions = num(j.revisions) + 1;
    if (stageIdx(jobStage(j)) >= stageIdx('sent')) { j.stage = 'comp'; j.status = 'doing'; j.progress = STAGES[stageIdx('comp')].p; }
    const r = j.revisions;
    boom(undefined, undefined, 10, ['💢', '🔁']);
    commit(r === 1 ? '🔁 Sửa lần 1. Bình thường thôi!' : r === 2 ? '🔁 Sửa lần 2... hít thở sâu 😮‍💨' : r === 3 ? '🔁 Lần 3 rồi đó 😤 Nhớ báo phí sửa thêm!' : `🔁 Lần ${r}!! Khách này "khó" thật 🪳🔥`);
  },

  addTx: d => txForm(null, d.kind),
  editTx: d => txForm(byId(db.tx, d.id)),
  delTx: d => confirmDel('giao dịch này', () => { db.tx = db.tx.filter(t => t.id !== d.id); }),

  addCourse: () => courseForm(null),
  editCourse: d => courseForm(byId(db.courses, d.id)),
  delCourse: d => confirmDel('mục học này (kèm nhật ký học)', () => { db.courses = db.courses.filter(c => c.id !== d.id); }),
  logStudy: d => logForm(byId(db.courses, d.id)),
  delLog: d => confirmDel('buổi học này', () => { byId(db.courses, d.cid).logs.splice(+d.i, 1); }),
  clearStudy: () => confirmDel(`toàn bộ ${db.courses.length} mục học và nhật ký học`, () => { db.courses = []; }),
  doneCourse: d => { const c = byId(db.courses, d.id); c.done = true; c.progress = 100; c.doneDate = todayStr(); boom(); commit('🎓 Chúc mừng bạn đã học xong!'); },

  addGoal: () => goalForm(null),
  editGoal: d => goalForm(byId(db.goals, d.id)),
  delGoal: d => confirmDel('mục tiêu này', () => { db.goals = db.goals.filter(g => g.id !== d.id); }),
  deposit: d => {
    const g = byId(db.goals, d.id), sign = +d.sign;
    openForm({
      title: sign > 0 ? `🐷 Bỏ heo · ${esc(g.name)}` : `💸 Rút tiền tiết kiệm · ${esc(g.name)}`, submit: sign > 0 ? 'Bỏ heo' : 'Rút',
      values: { date: todayStr() },
      fields: [
        { k: 'amount', label: sign > 0 ? 'Số tiền bỏ vào (₫)' : `Số tiền rút ra (₫) · đang có ${money(g.saved)}`, type: 'money', req: true, half: true },
        { k: 'date', label: 'Ngày', type: 'date', half: true, req: true },
        { k: 'note', label: sign > 0 ? 'Ghi chú (không bắt buộc)' : 'Tiêu vào việc gì?', ph: sign > 0 ? 'VD: tiền job tháng 11' : 'VD: sửa xe, mua bảng vẽ...' },
      ],
      onSave(v) {
        if (v.amount <= 0) { toast('Số tiền phải lớn hơn 0', 'err'); return false; }
        if (sign < 0 && v.amount > num(g.saved)) { toast(`Trong heo chỉ có ${money(g.saved)} thôi`, 'err'); return false; }
        g.saved = Math.max(0, num(g.saved) + sign * v.amount);
        (g.history = g.history || []).push({ id: uid(), date: v.date, amount: sign * v.amount, note: v.note });
        if (sign > 0) boom(innerWidth / 2, innerHeight / 2, g.saved >= g.target ? 50 : 20, ['🐷', '✦', '', '♥']);
        toast(sign > 0 ? (g.saved >= g.target ? '🎉 Đạt mục tiêu rồi!' : '🐷 Ụt ịt, đã bỏ heo!') : `💸 Đã rút ${money(v.amount)}, trong heo còn ${money(g.saved)}`);
      },
    });
  },

  delGoalHist: d => confirmDel('dòng lịch sử này (số tiền trong heo sẽ được hoàn lại như trước)', () => {
    const g = byId(db.goals, d.id), h = (g.history || []).find(x => x.id === d.h);
    if (!h) return;
    g.saved = Math.max(0, num(g.saved) - num(h.amount));
    g.history = g.history.filter(x => x.id !== d.h);
  }),

  addPlan: d => planForm(null, d.dow),
  editPlan: d => planForm(byId(db.wplan, d.id)),
  delPlan: d => confirmDel('lịch tập này', () => { db.wplan = db.wplan.filter(p => p.id !== d.id); }),
  doPlan: d => {
    const p = byId(db.wplan, d.id);
    db.wlogs.push({ id: uid(), date: todayStr(), activity: p.activity, minutes: num(p.minutes), kcal: 0, note: p.note || '', planId: p.id });
    boom(); commit(['💪 Tuyệt vời! +8 LP', '🔥 Quá đỉnh! +8 LP', '🌟 Giữ phong độ nha! +8 LP', '🏆 Thêm 1 buổi tập rồi! +8 LP'][Math.floor(Math.random() * 4)]);
  },
  addWlog: () => wlogForm(),
  delWlog: d => confirmDel('buổi tập này', () => { db.wlogs = db.wlogs.filter(l => l.id !== d.id); }),
  editWeekGoal: () => openForm({ title: '🎯 Mục tiêu tập mỗi tuần', values: { g: db.settings.weeklyGoal || 150 },
    fields: [{ k: 'g', label: 'Số phút mỗi tuần (WHO khuyên ít nhất 150 phút)', type: 'number', step: '10', req: true }],
    onSave(v) { if (v.g <= 0) return false; db.settings.weeklyGoal = v.g; } }),

  addGold: () => goldForm(null),
  editGold: d => goldForm(byId(db.gold, d.id)),
  delGold: d => confirmDel('mục vàng này', () => { db.gold = db.gold.filter(g => g.id !== d.id); }),
  sellGold: d => sellGoldForm(byId(db.gold, d.id)),
  goldPrice: () => goldPriceForm(),

  addNote: d => noteForm(null, d.date),
  editNote: d => noteForm(byId(db.notes, d.id)),
  delNote: d => confirmDel('ghi chú này', () => { db.notes = db.notes.filter(n => n.id !== d.id); }),
  toggleNote: d => { const n = byId(db.notes, d.id); n.done = !n.done; n.doneDate = n.done ? todayStr() : ''; if (n.done) boom(undefined, undefined, 14); commit(n.done ? '✅ Xong! +2 LP' : ''); },
  pinNote: d => { const n = byId(db.notes, d.id); n.pinned = !n.pinned; commit(); },
  askNotify: () => { if ('Notification' in window) Notification.requestPermission().then(render); },

  editName: () => openForm({
    title: '🙋 Hồ sơ của bạn',
    values: { name: db.settings.name, birthday: db.settings.birthday ? `2000-${db.settings.birthday}` : '' },
    fields: [{ k: 'name', label: 'Tên hiển thị', req: true }, { k: 'birthday', label: 'Sinh nhật (chỉ lấy ngày + tháng, năm nào cũng được)', type: 'date' }],
    onSave(v) { db.settings.name = v.name || 'Kem Sama'; db.settings.birthday = v.birthday ? v.birthday.slice(5) : ''; },
  }),
  toggleSparkle: () => { db.settings.sparkle = db.settings.sparkle === false; commit(db.settings.sparkle ? '✦ Đã bật lấp lánh' : 'Đã tắt lấp lánh'); },
  exportData: () => {
    db.settings.lastBackup = todayStr(); save();
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `kem-backup-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    render(); toast('💾 Đã tải file sao lưu');
  },
  importData: () => $('#importFile').click(),
  clearDemo: () => ACTIONS.clearPick(),
  clearPick: () => openForm({
    title: '🧹 Xóa dữ liệu để nhập lại', submit: 'Xóa mục đã chọn',
    values: { jobs: true, tx: true, goals: true, gold: false, courses: false, workout: false, notes: false },
    fields: [
      { k: 'jobs', type: 'checkbox', text: `💼 Tất cả job (${db.jobs.length})` },
      { k: 'tx', type: 'checkbox', text: `💰 Thu nhập & chi tiêu (${db.tx.length} giao dịch)` },
      { k: 'goals', type: 'checkbox', text: `🐷 Mục tiêu & số tiền tiết kiệm (${db.goals.length})` },
      { k: 'gold', type: 'checkbox', text: `🪙 Vàng tích trữ (${db.gold.length})` },
      { k: 'courses', type: 'checkbox', text: `📚 Học tập & nhật ký học (${db.courses.length})` },
      { k: 'workout', type: 'checkbox', text: `🏃 Lịch tập & nhật ký tập (${db.wplan.length + db.wlogs.length})` },
      { k: 'notes', type: 'checkbox', text: `📝 Ghi chú & nhắc nhở (${db.notes.length})` },
    ],
    async onSave(v) {
      const keys = Object.keys(v).filter(k => v[k]);
      if (!keys.length) { toast('Chưa chọn mục nào', 'err'); return false; }
      if (!(await askConfirm('Xóa các mục đã chọn? Không thể hoàn tác nếu chưa sao lưu.'))) return false;
      keys.forEach(k => { if (k === 'workout') { db.wplan = []; db.wlogs = []; } else db[k] = []; });
      if (v.gold) db.goldPrices = {};
      db.settings.demo = false;
      toast('🌱 Đã xóa, sẵn sàng nhập lại từ đầu!');
    },
  }),
  loadDemo: async () => { if (await askConfirm('Thay dữ liệu hiện tại bằng dữ liệu mẫu?', { ok: 'Nạp mẫu', icon: '🧸', danger: false })) { db = seed(); commit('🧸 Đã nạp dữ liệu mẫu'); } },
  resetAll: async () => { if (await askConfirm('Xóa TOÀN BỘ dữ liệu? Không thể hoàn tác nếu chưa sao lưu.', { ok: 'Xóa toàn bộ' })) { const name = db.settings.name; db = EMPTY(); db.settings.name = name; commit('Đã xóa toàn bộ dữ liệu'); } },
};

document.addEventListener('click', e => {
  lastPt = { x: e.clientX, y: e.clientY };
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
$('#importFile').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    let d = null;
    try { d = JSON.parse(r.result); if (!d || !Array.isArray(d.jobs)) throw new Error('bad'); }
    catch (err) { toast('File không hợp lệ', 'err'); e.target.value = ''; return; }
    e.target.value = '';
    if (!(await askConfirm('Khôi phục sẽ thay thế dữ liệu hiện tại. Tiếp tục?', { ok: 'Khôi phục', icon: '📦', danger: false }))) return;
    db = migrate(d); commit('✅ Đã khôi phục dữ liệu');
  };
  r.readAsText(f);
});

/* ---------- Nhắc nhở ---------- */
function notify(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body }); } catch (e) { /* bỏ qua */ } }
}
function checkReminders() {
  const now = new Date(); let changed = false;
  db.notes.forEach(n => {
    if (n.remindAt && !n.done && !n.notified && new Date(n.remindAt) <= now) {
      n.notified = true; changed = true;
      toast('⏰ ' + n.text, 'remind', 10000); notify('⏰ Nhắc nhở', n.text);
    }
  });
  if (db.settings.lastDeadlineCheck !== todayStr()) {
    db.settings.lastDeadlineCheck = todayStr(); changed = true;
    const due = activeJobs().filter(j => j.deadline && daysLeft(j.deadline) <= 1);
    if (due.length) {
      const msg = due.map(j => `${j.name} (${daysLeft(j.deadline) < 0 ? 'trễ hạn' : daysLeft(j.deadline) === 0 ? 'hôm nay' : 'ngày mai'})`).join(', ');
      setTimeout(() => toast('🔥 Deadline gần: ' + msg, 'remind', 10000), 800); notify('🔥 Deadline sắp tới', msg);
    }
  }
  if (changed) { save(); if (['home', 'notes'].includes(route())) render(); }
}

/* ---------- Ngày / đêm theo giờ ---------- */
const NIGHT_FROM = 18, NIGHT_TO = 6; // 18h tối → 6h sáng là chế độ đêm
function themeNow() {
  const t = db.settings.theme || 'auto';
  if (t !== 'auto') return t;
  const h = new Date().getHours();
  return (h >= NIGHT_FROM || h < NIGHT_TO) ? 'night' : 'day';
}
let curTheme = '';
function applyTheme(announce = false) {
  const th = themeNow();
  if (th !== curTheme) {
    const first = !curTheme;
    curTheme = th;
    document.documentElement.dataset.theme = th;
    if (!first && announce) toast(th === 'night' ? '🌙 Trời tối rồi, Kem chuyển sang chế độ đêm' : '☀️ Trời sáng rồi! Bật chế độ ngày rực rỡ');
  }
  const t = db.settings.theme || 'auto';
  document.querySelectorAll('#themeSeg button').forEach(b => b.classList.toggle('on', b.dataset.v === t));
}
ACTIONS.setTheme = d => {
  db.settings.theme = d.v;
  save(); applyTheme(); if (route() === 'settings') render();
  toast({ auto: '🕐 Tự đổi theo giờ (tối từ 18h đến 6h)', day: '☀️ Luôn sáng', night: '🌙 Luôn tối' }[d.v]);
};
ACTIONS.cycleTheme = () => {
  const order = ['auto', 'day', 'night'];
  db.settings.theme = order[(order.indexOf(db.settings.theme || 'auto') + 1) % 3];
  save(); applyTheme(); if (route() === 'settings') render();
  toast({ auto: '🕐 Tự đổi theo giờ (đêm từ 18h đến 6h)', day: '☀️ Luôn sáng', night: '🌙 Luôn tối' }[db.settings.theme]);
};

/* ---------- Màn hình chào ---------- */
function renderSplash() {
  const h = new Date().getHours(), name = db.settings.name;
  const bday = db.settings.birthday && todayStr().slice(5) === db.settings.birthday;
  $('#spHello').textContent = bday ? `Happy birthday ${name}!` : `Xin chào ${name},`;
  const act = activeJobs(), near = act.filter(j => j.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
  const d = new Date(), bits = [`${DOW_FULL[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`];
  bits.push(act.length ? `${act.length} job đang chờ` : 'đang rảnh job 🐟');
  if (near) { const n = daysLeft(near.deadline); bits.push(n < 0 ? `⚠ có job trễ hạn` : n === 0 ? '🔥 deadline hôm nay' : `deadline gần nhất còn ${n} ngày`); }
  if (h >= 23 || h < 5) bits.push('khuya rồi đó 😾');
  $('#spInfo').textContent = bits.join('  ·  ');
  $('#spInstall').style.display = isStandalone() ? 'none' : '';
}
ACTIONS.start = (d, el) => {
  const sp = $('#splash');
  if (!splashShown() || sp.classList.contains('leave')) return;
  const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  boom(r.left + r.width / 2, r.top + r.height / 2, 30, ['♥', '✦', '★', '', '🍨']);
  sp.classList.add('leave');
  setTimeout(() => {
    sp.classList.remove('leave');
    sp.classList.add('gone');
    document.body.classList.remove('splash-on');
    lastRoute = null; render();
  }, 650);
};
ACTIONS.toSplash = () => {
  renderSplash();
  $('#splash').classList.remove('gone');
  document.body.classList.add('splash-on');
};
const splashShown = () => !$('#splash').classList.contains('gone');
document.addEventListener('keydown', e => { if (e.key === 'Enter' && splashShown() && $('#modal').classList.contains('hidden')) ACTIONS.start(); });

/* ---------- Cài thành app (PWA) ---------- */
let installEvt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (route() === 'settings') render(); });
window.addEventListener('appinstalled', () => { installEvt = null; toast('💻 Đã cài Kem! Tìm icon Kem ở Start menu / Desktop nhé'); boom(innerWidth / 2, innerHeight / 2, 40); if (route() === 'settings') render(); });
function installHelp() {
  const ua = navigator.userAgent, edge = /Edg\//.test(ua), chrome = /Chrome\//.test(ua) && !edge;
  const onFile = location.protocol === 'file:';
  const wrap = document.createElement('div');
  wrap.className = 'modal confirm-wrap';
  wrap.innerHTML = `<div class="modal-box confirm-box" style="width:min(520px,100%)">
    <div class="modal-h"><h3>💻 Cài Kem lên máy tính</h3></div>
    <div class="confirm-msg" style="font-weight:700;font-size:14.5px">
      ${onFile ? `<p>Bạn đang mở file trên máy nên chưa cài được. Hãy mở link này bằng <b>Chrome</b> hoặc <b>Edge</b>:</p>
        <p><b>https://nguyenhanh-animaton.github.io/kem/</b></p>` : ''}
      ${edge ? `<p><b>Trên Edge:</b> bấm <b>⋯</b> (góc phải trên) → <b>Ứng dụng</b> → <b>Cài đặt Kem</b>.<br>Hoặc bấm biểu tượng <b>⊕</b> ở cuối thanh địa chỉ.</p>`
        : chrome ? `<p><b>Trên Chrome:</b> bấm biểu tượng <b>màn hình có mũi tên ⊕</b> ở cuối thanh địa chỉ → <b>Cài đặt</b>.<br>Hoặc bấm <b>⋮</b> → <b>Truyền, lưu và chia sẻ</b> → <b>Cài đặt trang dưới dạng ứng dụng</b>.</p>`
        : `<p>Trình duyệt này có thể không hỗ trợ cài app. Hãy mở link bằng <b>Chrome</b> hoặc <b>Edge</b>.</p>`}
      <p style="margin-bottom:0">Không thấy? Bấm <b>Ctrl + Shift + R</b> để tải bản mới nhất rồi thử lại.<br>
      Lưu ý: khung xem trong ứng dụng Claude <b>không</b> cài app được.</p>
    </div>
    <div class="modal-f"><button type="button" class="btn primary" data-c="1">Đã hiểu</button></div></div>`;
  wrap.addEventListener('click', e => { e.stopPropagation(); if (e.target === wrap || e.target.closest('[data-c]')) wrap.remove(); });
  document.body.appendChild(wrap);
}
ACTIONS.installApp = async () => {
  if (!installEvt) { installHelp(); return; }
  installEvt.prompt();
  await installEvt.userChoice;
  installEvt = null;
  if (route() === 'settings') render();
};
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ---------- Khởi động ---------- */
save();
applyTheme();
renderSplash();
render();
loadGoldFeed();
setInterval(() => applyTheme(true), 60000);
setInterval(loadGoldFeed, 3 * 60 * 60 * 1000); // app mở lâu thì 3 tiếng đọc lại giá một lần
tickClock();
setInterval(tickClock, 1000);
checkReminders();
setInterval(checkReminders, 30000);
setInterval(() => { if (!$('#modal').classList.contains('hidden')) return; renderHero(activeJobs().filter(j => j.deadline && daysLeft(j.deadline) <= 1).length, db.notes.filter(n => !n.done && n.remindAt && n.remindAt.slice(0, 10) <= todayStr()).length); }, 60000);
