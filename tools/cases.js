// Кейс дня: собирает пул скидок в docs/cases.json и публикует пост с кнопкой.
const fs = require('fs');
const https = require('https');
const path = require('path');

const TOKEN = (process.env.TELEGRAM_TOKEN || '').trim();
const CHAT = (process.env.CHANNEL_ID || '-1004418793414').trim();
const CASE_URL = (process.env.CASE_URL || 'https://d62260043-lgtm.github.io/deal-radar/').trim();
const OUT = path.join(__dirname, '..', 'docs', 'cases.json');

const photo = id => 'https://cdn.akamai.steamstatic.com/steam/apps/' + id + '/capsule_616x353.jpg';
const rub = (f, kop) => (f || (kop / 100).toFixed(2) + ' ₽').replace(/\s+/g, ' ').trim();

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

async function main() {
  const feed = await getJson('https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&sortBy=Deal%20Rating&pageSize=60');
  const items = [];
  for (const d of feed) {
    if (items.length >= 12) break;
    const appid = d.steamAppID;
    if (!appid || Number(d.savings) < 25) continue;
    try {
      const j = await getJson('https://store.steampowered.com/api/appdetails?appids=' + appid + '&cc=ru&l=russian&filters=price_overview');
      const dd = j[String(appid)];
      const p = dd && dd.success && dd.data && dd.data.price_overview;
      if (!p || !p.final || !p.discount_percent) continue;
      items.push({
        title: d.title,
        appid,
        photo: photo(appid),
        final: rub(p.final_formatted, p.final),
        initial: rub(p.initial_formatted, p.initial),
        discount: p.discount_percent,
        rating: d.steamRatingPercent && Number(d.steamRatingPercent) > 0 ? d.steamRatingPercent : 0,
        url: 'https://store.steampowered.com/app/' + appid + '/',
      });
    } catch (e) {}
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), items }, null, 1));
  console.log('cases: ' + items.length + ' игр в кейсе');

  if (!TOKEN || process.argv.includes('--no-post')) { console.log('только файл, без поста'); return; }
  const text = '🎁 <b>Кейс дня</b>\n\n' +
    'Запусти кейс и узнай, какая игра сегодня просит лучшую цену. Внутри ' + items.length + ' скидок — ' +
    'выпадет одна, проверять честно, всё бесплатно.\n\n' +
    '<i>#кейсдня #скидки</i>';
  const ans = JSON.parse(await api('sendMessage', {
    chat_id: CHAT,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: [[{ text: '🎁 Открыть кейс', url: CASE_URL }]] },
  }));
  if (!ans.ok) { console.error('send FAIL ' + JSON.stringify(ans).slice(0, 200)); process.exitCode = 1; return; }
  console.log('case post sent, message_id=' + ans.result.message_id);
}

module.exports = { run: main };
if (require.main === module) main().catch(e => { console.error("ERR " + e.message); process.exit(1); });
