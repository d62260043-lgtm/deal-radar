// Статистика канала -> личка владельцу.
const fs = require('fs');
const https = require('https');
const path = require('path');

const TOKEN = (process.env.TELEGRAM_TOKEN || '').trim();
const CHANNEL = (process.env.CHANNEL_ID || '-1004418793414').trim();
const OWNER = (process.env.OWNER_CHAT_ID || '').trim();
const STATE_DIR = process.env.STATE_DIR || path.join(__dirname, '..', 'state');
const STATE = path.join(STATE_DIR, 'stats.json');

const plural = n => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return 'подписчиков';
  if (b === 1) return 'подписчик';
  if (b >= 2 && b <= 4) return 'подписчика';
  return 'подписчиков';
};

function req(pathname, method, payload) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'api.telegram.org', path: pathname, method, timeout: 25000 };
    const body = payload ? JSON.stringify(payload) : null;
    if (body) opts.headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    const q = https.request(opts, s => { let d = ''; s.on('data', c => d += c); s.on('end', () => resolve(d)); });
    q.on('timeout', () => q.destroy(new Error('timeout')));
    q.on('error', reject);
    q.end(body || undefined);
  });
}

async function stats() {
  if (!TOKEN || !OWNER) throw new Error('TELEGRAM_TOKEN/OWNER_CHAT_ID пусты');
  const r = JSON.parse(await req('/bot' + TOKEN + '/getChatMemberCount?chat_id=' + CHANNEL, 'GET'));
  if (!r.ok) throw new Error('getChatMemberCount: ' + JSON.stringify(r).slice(0, 160));
  const count = r.result;
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) {}
  const delta = prev ? count - prev.count : 0;
  const sign = delta > 0 ? '+' + delta : String(delta);
  const msk = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' }).format(new Date());
  const text = '📊 <b>Радар Скидок</b>\n<b>' + count + ' ' + plural(count) + '</b>\n' +
    (prev ? 'За сутки: ' + sign + '\n' : '') + '<i>' + msk + ' МСК</i>';
  const ans = JSON.parse(await req('/bot' + TOKEN + '/sendMessage', 'POST', {
    chat_id: OWNER, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true },
  }));
  if (!ans.ok) throw new Error('sendMessage: ' + JSON.stringify(ans).slice(0, 160));
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({ day: new Date().toISOString().slice(0, 10), count }));
  console.log('stats: ' + count + ' (' + sign + ')');
}

module.exports = { stats };
if (require.main === module) stats().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
