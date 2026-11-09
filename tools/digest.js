// Радар Скидок: сборка и публикация постов. Одна игра — один пост.
const fs = require('fs');
const https = require('https');
const path = require('path');

const TOKEN = (process.env.TELEGRAM_TOKEN || '').trim();
const CHAT = (process.env.CHANNEL_ID || '-1004418793414').trim();
const STATE_DIR = process.env.STATE_DIR || path.join(__dirname, '..', 'state');
const POSTED = path.join(STATE_DIR, 'posted.json');
const DEDUPE_MS = 14 * 24 * 3600 * 1000;

const MODES = {
  morning: { count: 5, head: '☀️ <b>Утренний дайджест</b> — 5 скидок на сегодня' },
  noon:    { count: 1, head: '🔥 <b>Горячая находка дня</b>' },
  evening: { count: 3, head: '🌙 <b>Вечерняя подборка</b> — 3 предложения' },
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rub = (f, kop) => (f || (kop / 100).toFixed(2) + ' ₽').replace(/\s+/g, ' ').trim();
const photoUrl = id => 'https://cdn.akamai.steamstatic.com/steam/apps/' + id + '/header.jpg';
const itemText = p => '<b>' + esc(p.title) + '</b>\n' +
  '💰 ' + p.final + ' вместо ' + p.initial + ' · скидка ' + p.discount + '%' +
  (p.rating && Number(p.rating) > 0 ? '\n⭐ ' + p.rating + '% положительных отзывов' : '') +
  '\n<a href="https://store.steampowered.com/app/' + p.appid + '/">→ Открыть в Steam</a>';

function httpGet(url, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'deal-radar/1.0' }, timeout }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpGet(res.headers.location, timeout));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout ' + url)));
    req.on('error', reject);
  });
}

async function getJson(url) {
  const r = await httpGet(url);
  if (r.status !== 200) throw new Error('HTTP ' + r.status + ' ' + url);
  return JSON.parse(r.body);
}

function api(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: 'api.telegram.org', path: '/bot' + TOKEN + '/' + method, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 40000,
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
    req.on('timeout', () => req.destroy(new Error('tg timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

async function rubPrice(appid) {
  try {
    const j = await getJson('https://store.steampowered.com/api/appdetails?appids=' + appid + '&cc=ru&l=russian&filters=price_overview');
    const d = j[String(appid)];
    if (!d || !d.success || !d.data || !d.data.price_overview) return null;
    const p = d.data.price_overview;
    if (!p.final || !p.discount_percent) return null;
    return { final: rub(p.final_formatted, p.final), initial: rub(p.initial_formatted, p.initial), discount: p.discount_percent };
  } catch (e) { return null; }
}

function loadState() { try { return JSON.parse(fs.readFileSync(POSTED, 'utf8')); } catch (e) { return { ids: {} }; } }
function saveState(s) { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(POSTED, JSON.stringify(s, null, 1)); }

async function digest(mode) {
  const cfg = MODES[mode];
  if (!cfg) throw new Error('unknown mode: ' + mode);
  if (!TOKEN) throw new Error('TELEGRAM_TOKEN is empty');

  const state = loadState();
  const now = Date.now();
  const feed = await getJson('https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&sortBy=Deal%20Rating&pageSize=60');
  const picks = [], used = new Set();
  for (const d of feed) {
    if (picks.length >= cfg.count) break;
    const appid = d.steamAppID;
    if (!appid || used.has(appid)) continue;
    const seen = state.ids[appid];
    if (seen && now - seen < DEDUPE_MS) continue;
    if (Number(d.savings) < 20) continue;
    used.add(appid);
    const price = await rubPrice(appid);
    if (!price) continue;
    picks.push({ title: d.title, appid, rating: d.steamRatingPercent, ...price });
  }
  if (!picks.length) { console.log(mode + ': нет подходящих скидок'); return; }

  const tag = '<i>#скидки #steam</i>';
  let sent = 0;
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    const caption = (i === 0 ? cfg.head + '\n\n' : '') + itemText(p) + (i === picks.length - 1 ? '\n\n' + tag : '');
    let ok = false;
    try {
      const j = JSON.parse(await api('sendPhoto', { chat_id: CHAT, photo: photoUrl(p.appid), caption, parse_mode: 'HTML' }));
      ok = !!j.ok;
      if (!ok) console.log('photo FAIL ' + p.title + ': ' + JSON.stringify(j).slice(0, 160));
    } catch (e) { console.log('photo ERR ' + p.title + ': ' + e.message); }
    if (!ok) {
      try {
        const j = JSON.parse(await api('sendMessage', { chat_id: CHAT, text: caption, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }));
        ok = !!j.ok;
      } catch (e) { console.log('text ERR ' + e.message); }
    }
    if (ok) { sent++; state.ids[p.appid] = now; saveState(state); }
    if (i < picks.length - 1) await sleep(2000);
  }
  console.log(mode + ': sent ' + sent + '/' + picks.length);
  if (!sent) process.exitCode = 1;
}

module.exports = { digest };
if (require.main === module) digest(process.argv[2]).catch(e => { console.error('ERR ' + e.message); process.exit(1); });
