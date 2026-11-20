// Lấy giá vàng 24K (VND/chỉ) của 5 hãng từ trang chính thức, ghi ra data/gold.json.
// Chạy bởi GitHub Actions mỗi ngày (.github/workflows/gold.yml). Node 20+, không cần thư viện.
// Hãng nào lỗi thì giữ giá lần trước (đánh dấu ok:false), không làm hỏng cả file.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const OUT = new URL('../data/gold.json', import.meta.url);
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
};

async function get(url, opts = {}, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) }, signal: AbortSignal.timeout(25000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      err = new Error(e.message + (e.cause ? ` (${e.cause.code || e.cause.message})` : ''));
      await new Promise(s => setTimeout(s, 3000 * (i + 1)));
    }
  }
  throw err;
}

// "12,870,000" | "12.880.000" | "12830000" | "12830000.00" | 12830000 -> 12830000
function toNum(v) {
  if (typeof v === 'number') return Math.round(v);
  const s = String(v ?? '').trim();
  if (/^\d+\.\d{1,2}$/.test(s) && !/^\d{1,3}\.\d{3}$/.test(s)) return Math.round(Number(s));
  return Number(s.replace(/[^\d]/g, '')) || 0;
}
const sane = v => v > 3_000_000 && v < 80_000_000; // giá 1 chỉ hợp lý
const p2 = x => String(x).padStart(2, '0');
const stamp = (d, mo, y, h, mi) => `${y}-${p2(mo)}-${p2(d)} ${p2(h)}:${p2(mi)}`;

function htmlText(h) {
  return h
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([\da-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/\s+/g, ' ')
    .normalize('NFC');
}

// API JSON chính thức của BTMC (có thể chặn máy chủ nước ngoài → còn nguồn dự phòng)
async function btmcApi() {
  const j = JSON.parse(await get('https://api.btmc.vn/api/BTMCAPI/getpricebtmc?key=3kd8ub1llcg9t45hnoh8hmn7t5kc2v', {}, 2));
  const rows = (j?.DataList?.Data || []).map(r => {
    const n = r['@row'];
    const m = String(r['@d_' + n] || '').match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+)/);
    return { name: String(r['@n_' + n] || '').normalize('NFC'), buy: toNum(r['@pb_' + n]), sell: toNum(r['@ps_' + n]), at: m ? stamp(m[1], m[2], m[3], m[4], m[5]) : '' };
  });
  const ring = rows.filter(r => /^NHẪN TRÒN TRƠN/i.test(r.name)).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!ring) throw new Error('không thấy dòng NHẪN TRÒN TRƠN');
  return { product: 'Nhẫn tròn trơn 999.9 (Rồng Thăng Long)', buy: ring.buy, sell: ring.sell, sourceTime: ring.at };
}

const SOURCES = {
  // BTMC: thử API JSON → trang chủ btmc.vn → webgia.com
  'Bảo Tín Minh Châu': async () => {
    const errs = [];
    try { return await btmcApi(); } catch (e) { errs.push('api: ' + e.message); }
    try {
      const txt = htmlText(await get('https://btmc.vn/'));
      const m = txt.match(/NHẪN TRÒN TRƠN BẢO TÍN MINH CHÂU 999\.9 \(24k\)\s+([\d.,]+)\s+([\d.,]+)/i);
      if (!m) throw new Error('không thấy dòng nhẫn tròn trơn');
      const k = s => { const n = toNum(s); return n < 100000 ? n * 1000 : n; }; // trang ghi nghìn đồng
      return { product: 'Nhẫn tròn trơn 999.9 (Rồng Thăng Long)', buy: k(m[1]), sell: k(m[2]), sourceTime: '' };
    } catch (e) { errs.push('btmc.vn: ' + e.message); }
    try {
      const txt = htmlText(await get('https://webgia.com/gia-vang/bao-tin-minh-chau/'));
      const m = txt.match(/tròn trơn 999\.9 \(24k\)\s+([\d.]+)\s+([\d.]+)/i);
      if (!m) throw new Error('không thấy dòng nhẫn tròn trơn');
      return { product: 'Nhẫn tròn trơn 999.9 (Rồng Thăng Long)', buy: toNum(m[1]), sell: toNum(m[2]), sourceTime: '' };
    } catch (e) { errs.push('webgia: ' + e.message); }
    throw new Error(errs.join(' | '));
  },

  // GraphQL mà chính trang baotinmanhhai.vn dùng
  'Bảo Tín Mạnh Hải': async () => {
    const t = await get('https://baotinmanhhai.vn/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query{goldRates(limit:50){items{code name buy_price sell_price unit last_updated}}}' }),
    });
    const items = JSON.parse(t)?.data?.goldRates?.items || [];
    const it = items.find(i => i.code === 'KGB') || items.find(i => i.code === '9999');
    if (!it) throw new Error('không thấy mã KGB / 9999');
    const sell = toNum(it.sell_price);
    return { product: String(it.name || 'Kim Gia Bảo 24K'), buy: toNum(it.buy_price), sell: sell > 1 ? sell : 0, sourceTime: String(it.last_updated || '').replace('T', ' ').slice(0, 16) };
  },

  // Bảng giá HTML trên trang chủ Phú Quý
  'Phú Quý': async () => {
    const txt = htmlText(await get('https://phuquygroup.vn/'));
    const m = txt.match(/Nhẫn tròn Phú Quý 999\.9\s+([\d.,]+)\s+([\d.,]*)/i);
    if (!m) throw new Error('không thấy dòng Nhẫn tròn Phú Quý 999.9');
    const t = txt.match(/cập nhật lần cuối lúc\s*(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    return { product: 'Nhẫn tròn Phú Quý 999.9', buy: toNum(m[1]), sell: toNum(m[2]), sourceTime: t ? stamp(t[3], t[4], t[5], t[1], t[2]) : '' };
  },

  // Next.js: JSON nhúng trong HTML, dự phòng bằng bảng HTML
  'Huy Thanh': async () => {
    const html = await get('https://huythanhjewelry.vn/gia-vang-hom-nay');
    const a = html.match(/\\"giaban\\":(\d+),\\"giamua\\":(\d+),\\"loaivang\\":\\"24K\\",[^}]*?\\"ngaythaydoigia\\":\\"([^\\]+)\\"/);
    if (a) {
      const t = a[3].match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+)/);
      return { product: 'Vàng Huy Thanh 24K', buy: +a[2], sell: +a[1], sourceTime: t ? stamp(t[1], t[2], t[3], t[4], t[5]) : '' };
    }
    const txt = htmlText(html);
    const b = txt.match(/Vàng Huy Thanh 24k\s+([\d.]+)\s*VNĐ\s+([\d.]+)\s*VNĐ/i);
    if (!b) throw new Error('không thấy dòng Vàng Huy Thanh 24k');
    const t = txt.match(/lúc\s*(\d{1,2}):(\d{2})\s*ngày\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    return { product: 'Vàng Huy Thanh 24K', buy: toNum(b[1]), sell: toNum(b[2]), sourceTime: t ? stamp(t[3], t[4], t[5], t[1], t[2]) : '' };
  },

  // Trang Sapo, bảng gõ tay, đơn vị NGHÌN đồng/chỉ
  'Kim Ngân Phúc': async () => {
    const txt = htmlText(await get('https://kimnganphuc.vn/gia-vang'));
    const m = txt.match(/Nhẫn ép vỉ Kim Ngân Phúc\s*9999\s+([\d.]+)\s+([\d.]+)/i) || txt.match(/Vàng Trang Sức 24K\s+([\d.]+)\s+([\d.]+)/i);
    if (!m) throw new Error('không thấy dòng Nhẫn ép vỉ Kim Ngân Phúc 9999');
    const k = s => toNum(s) * 1000;
    const t = txt.match(/Cập nhật\s*(\d{1,2})\s*:\s*(\d{2})\s*N\s*gày\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/i);
    return { product: 'Nhẫn ép vỉ Kim Ngân Phúc 9999', buy: k(m[1]), sell: k(m[2]), sourceTime: t ? stamp(t[3], t[4], t[5], t[1], t[2]) : '' };
  },
};

let prev = {};
try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* lần đầu */ }

const vnNow = new Date(Date.now() + 7 * 3600e3);
const out = {
  updatedAt: new Date().toISOString(),
  date: vnNow.toISOString().slice(0, 10),
  unit: 'VND/chỉ',
  note: 'Giá vàng 24K, lấy tự động từ trang chính thức của từng hãng. buy = giá tiệm mua vào, sell = giá tiệm bán ra.',
  brands: {},
};

for (const [brand, fn] of Object.entries(SOURCES)) {
  try {
    const v = await fn();
    if (!sane(v.buy)) throw new Error('giá mua bất thường: ' + v.buy);
    if (v.sell && !sane(v.sell)) v.sell = 0;
    out.brands[brand] = { ...v, ok: true };
    console.log(`✓ ${brand}: mua ${v.buy.toLocaleString('vi-VN')} / bán ${v.sell.toLocaleString('vi-VN')} (${v.sourceTime || '?'})`);
  } catch (e) {
    console.log(`✗ ${brand}: ${e.message}`);
    if (prev.brands?.[brand]) out.brands[brand] = { ...prev.brands[brand], ok: false, error: String(e.message).slice(0, 160) };
  }
}

if (!Object.values(out.brands).some(b => b.ok)) {
  console.error('Không lấy được giá của hãng nào, giữ nguyên file cũ.');
  process.exit(1);
}
await mkdir(new URL('../data/', import.meta.url), { recursive: true });
await writeFile(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('Đã ghi data/gold.json');
