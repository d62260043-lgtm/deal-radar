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
