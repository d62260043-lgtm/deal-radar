// Кейс дня: собирает пул (скидки + бесплатные игры) в docs/cases.json и публикует пост.
const fs = require('fs');
const https = require('https');
const path = require('path');

const TOKEN = (process.env.TELEGRAM_TOKEN || '').trim();
const CHAT = (process.env.CHANNEL_ID || '-1004418793414').trim();
const CASE_URL = (process.env.CASE_URL || 'https://d62260043-lgtm.github.io/deal-radar/').trim();
const OUT = path.join(__dirname, '..', 'docs', 'cases.json');
const STATE = path.join(__dirname, '..', 'state', 'case.json');
const MIN_GAP_MS = 20 * 3600 * 1000;

// Постоянно бесплатные игры в Steam — «бесплатная» редкость
const F2P = [
  { appid: 730, title: 'Counter-Strike 2' },
  { appid: 570, title: 'Dota 2' },
  { appid: 440, title: 'Team Fortress 2' },
  { appid: 1172470, title: 'Apex Legends' },
  { appid: 230410, title: 'Warframe' },
  { appid: 238960, title: 'Path of Exile' },
  { appid: 304930, title: 'Unturned' },
  { appid: 1085660, title: 'Destiny 2' },
  { appid: 236390, title: 'War Thunder' },
  { appid: 444090, title: 'Paladins' },
];

const photo = id => 'https://cdn.akamai.steamstatic.com/steam/apps/' + id + '/capsule_616x353.jpg';
const rub = (f, kop) => (f || (kop / 100).toFixed(2) + ' ₽').replace(/\s+/g, ' ').trim();
const log = s => console.log(s);

const getJson = url => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'deal-radar/1.0' }, timeout: 25000 }, s => {
    let d = '';
    s.setEncoding('utf8');
    s.on('data', c => d += c);
    s.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad json ' + url)); } });
  }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
});

function api(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org', path: '/bot' + TOKEN + '/' + method, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end(body);
  });
}


function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function buildSeo(data) {
  const day = new Date(Date.now() + 3 * 3600 * 1000);
  const dateStr = day.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const deals = data.items.slice().sort((a, b) => b.discount - a.discount);
  const rows = deals.map(p => '<tr>' +
    '<td><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a></td>' +
    '<td class="d">−' + p.discount + '%</td>' +
    '<td class="p">' + esc(p.final) + '</td>' +
    '<td class="o">' + esc(p.initial) + '</td>' +
    '<td class="r">' + (p.rating ? p.rating + '%' : '—') + '</td></tr>').join('');
  const free = (data.free || []).map(p => '<li><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a></li>').join('');
  return '<!DOCTYPE html>\n<html lang="ru"><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width, initial-scale=1">' +
'<title>Скидки на игры Steam сегодня — цены в рублях, ' + dateStr + '</title>' +
'<meta name="description" content="Подборка скидок на игры в Steam на ' + dateStr + ': цены в рублях, размер скидки и рейтинг отзывов. Обновляется каждый день автоматически.">' +
'<meta name="robots" content="index,follow">' +
'<style>body{margin:0;background:#0e121a;color:#eef1f7;font-family:-apple-system,Roboto,system-ui,sans-serif;padding:18px 14px 40px}' +
'.w{max-width:720px;margin:0 auto}h1{font-size:22px;margin:0 0 8px}.sub{color:#8b93a7;font-size:13px;margin:0 0 18px;line-height:1.5}' +
'table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px 6px;border-bottom:1px solid #2b3344;text-align:left}' +
'th{color:#8b93a7;font-weight:600;font-size:11.5px;text-transform:uppercase}a{color:#8fd0ff;text-decoration:none}' +
'td.d{color:#f5c451;font-weight:800;white-space:nowrap}td.p{font-weight:700;white-space:nowrap}td.o{color:#8b93a7;text-decoration:line-through;white-space:nowrap}td.r{color:#8b93a7;white-space:nowrap}' +
'.cta{display:block;text-align:center;margin:22px 0 10px;padding:14px;border-radius:14px;background:linear-gradient(180deg,#ffd977,#f5c451);color:#1a1400;font-weight:800;text-decoration:none}' +
'.cta2{display:block;text-align:center;margin:8px 0 24px;padding:12px;border-radius:14px;border:1px solid #39435a;color:#eef1f7;text-decoration:none;font-weight:600}' +
'h2{font-size:15px;margin:24px 0 10px}ul{padding-left:18px;font-size:13px;line-height:1.7;color:#c9d0de}' +
'.f{color:#5d6579;font-size:11.5px;margin-top:26px;line-height:1.6}</style></head><body><div class="w">' +
'<h1>Скидки на игры в Steam — ' + dateStr + '</h1>' +
'<p class="sub">' + deals.length + ' игр со скидкой от 25%. Цены в рублях, регион РФ, как в самом Steam. Обновляется автоматически каждый день.</p>' +
'<table><thead><tr><th>Игра</th><th>Скидка</th><th>Цена</th><th>Было</th><th>Отзывы</th></tr></thead><tbody>' + rows + '</tbody></table>' +
'<a class="cta" href="https://t.me/deal_radar1">🎁 Скидки в Telegram — подписаться</a>' +
'<a class="cta2" href="./">Открыть кейс дня — бесплатно</a>' +
'<h2>Бесплатные игры в Steam</h2><ul>' + free + '</ul>' +
'<p class="f">Канал «Радар Скидок» — подборки скидок на игры с ценами в рублях. ' +
'Посты выходят несколько раз в день, есть бесплатный кейс с бонусными открытиями. Данные о ценах: Steam API.</p>' +
'</div></body></html>';
}

function buildSitemap() {
  const base = 'https://d62260043-lgtm.github.io/deal-radar/';
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    '<url><loc>' + base + '</loc><changefreq>daily</changefreq><priority>1.0</priority></url>' +
    '<url><loc>' + base + 'skidy.html</loc><changefreq>daily</changefreq><priority>0.9</priority></url></urlset>';
}

async function main() {
  const feed = await getJson('https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&sortBy=Deal%20Rating&pageSize=60');
  const deals = [];
  for (const d of feed) {
    if (deals.length >= 24) break;
    const appid = d.steamAppID;
    if (!appid || Number(d.savings) < 25) continue;
    try {
      const j = await getJson('https://store.steampowered.com/api/appdetails?appids=' + appid + '&cc=ru&l=russian&filters=price_overview');
      const dd = j[String(appid)];
      const p = dd && dd.success && dd.data && dd.data.price_overview;
      if (!p || !p.final || !p.discount_percent) continue;
      deals.push({
        appid, title: d.title, photo: photo(appid),
        final: rub(p.final_formatted, p.final),
        initial: rub(p.initial_formatted, p.initial),
        discount: p.discount_percent,
        rating: d.steamRatingPercent && Number(d.steamRatingPercent) > 0 ? d.steamRatingPercent : 0,
        url: 'https://store.steampowered.com/app/' + appid + '/',
      });
    } catch (e) {}
  }

  const free = F2P.map(g => ({
    appid: g.appid, title: g.title, photo: photo(g.appid),
    final: 'бесплатно', initial: '', discount: 100, rating: 0, free: true,
    url: 'https://store.steampowered.com/app/' + g.appid + '/',
  }));

  const data = {
    updated: new Date().toISOString(),
    items: deals,
    free,
    counts: { deals: deals.length, free: free.length },
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 1));
  log('пул: скидок ' + deals.length + ', бесплатных ' + free.length);
  try {
    fs.writeFileSync(path.join(path.dirname(OUT), 'skidy.html'), buildSeo({ items: deals, free }));
    fs.writeFileSync(path.join(path.dirname(OUT), 'sitemap.xml'), buildSitemap());
    fs.writeFileSync(path.join(path.dirname(OUT), 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: https://d62260043-lgtm.github.io/deal-radar/sitemap.xml\n');
    log('seo: skidy.html + sitemap.xml + robots.txt');
  } catch (e) { log('seo ERR ' + e.message); }

  const force = process.argv.includes('--force');
  let last = null;
  try { last = JSON.parse(fs.readFileSync(STATE, 'utf8')).lastPost; } catch (e) {}
  if (!force && last && Date.now() - Date.parse(last) < MIN_GAP_MS) {
    log('пост уже был ' + last + ' — пропуск, пул обновлён');
    return;
  }
  if (!TOKEN || process.argv.includes('--no-post')) { log('только файл, без поста'); return; }

  const text = '🎁 <b>Кейс дня</b>\n\n' +
    'Открывай кейс и забирай игру с лучшей ценой на сегодня. Три открытия в день — бесплатно, ' +
    'бонусные за звёзды и за друзей. Внутри ' + deals.length + ' скидок и шанс поймать бесплатную игру.\n\n' +
    '<i>#кейсдня #скидки</i>';
  const ans = JSON.parse(await api('sendMessage', {
    chat_id: CHAT, text, parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[{ text: '🎁 Открыть кейс', url: CASE_URL }]] },
  }));
  if (!ans.ok) { console.error('send FAIL ' + JSON.stringify(ans).slice(0, 200)); process.exitCode = 1; return; }
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ lastPost: new Date().toISOString(), messageId: ans.result.message_id }));
  log('пост отправлен, message_id=' + ans.result.message_id);
}

module.exports = { run: main };
if (require.main === module) main().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
