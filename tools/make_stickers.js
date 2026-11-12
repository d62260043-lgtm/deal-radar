// Стикерпак с Робиком. Рендер PNG -> создание набора через Bot API.
const fs = require('fs');
const https = require('https');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const TOKEN = (process.env.TELEGRAM_TOKEN || '').trim();
const OWNER = (process.env.OWNER_CHAT_ID || '').trim();
const BOT_ID = 9207119054;
const SET = 'radar_case_by_gamedeals_poster_bot';
const TITLE = 'Радар Скидок';
const TMP = '/tmp/stickers';

const STICKERS = [
  { id: 'hi', eyes: 'normal', mouth: 'smile', label: 'привет!' },
  { id: 'shock', eyes: 'wide', mouth: 'o', label: '−90%?!' },
  { id: 'wink', eyes: 'wink', mouth: 'smile', label: '' },
  { id: 'gift', eyes: 'normal', mouth: 'grin', label: 'кейс дня' },
  { id: 'sad', eyes: 'sad', mouth: 'frown', label: 'дорого…' },
  { id: 'lol', eyes: 'closed', mouth: 'grin', label: 'ха-ха' },
  { id: 'ok', eyes: 'normal', mouth: 'smile', label: 'беру!' },
  { id: 'cta', eyes: 'normal', mouth: 'smile', label: 'канал в профиле' },
];

function eyesSvg(kind) {
  const P = '#f5c451', D = '#0c1018';
  if (kind === 'wide') return `<ellipse cx="170" cy="196" rx="30" ry="34" fill="${P}"/><ellipse cx="290" cy="196" rx="30" ry="34" fill="${P}"/><circle cx="170" cy="196" r="12" fill="${D}"/><circle cx="290" cy="196" r="12" fill="${D}"/>`;
  if (kind === 'wink') return `<ellipse cx="170" cy="196" rx="26" ry="26" fill="${P}"/><circle cx="178" cy="188" r="8" fill="${D}"/><path d="M262 196 q28 18 56 0" stroke="${P}" stroke-width="14" fill="none" stroke-linecap="round"/>`;
  if (kind === 'closed') return `<path d="M146 196 q24 -22 48 0" stroke="${P}" stroke-width="14" fill="none" stroke-linecap="round"/><path d="M266 196 q24 -22 48 0" stroke="${P}" stroke-width="14" fill="none" stroke-linecap="round"/>`;
  if (kind === 'sad') return `<ellipse cx="170" cy="196" rx="26" ry="26" fill="${P}"/><ellipse cx="290" cy="196" rx="26" ry="26" fill="${P}"/><circle cx="170" cy="204" r="8" fill="${D}"/><circle cx="290" cy="204" r="8" fill="${D}"/>`;
  return `<ellipse cx="170" cy="196" rx="26" ry="26" fill="${P}"/><ellipse cx="290" cy="196" rx="26" ry="26" fill="${P}"/><circle cx="178" cy="188" r="8" fill="${D}"/><circle cx="298" cy="188" r="8" fill="${D}"/>`;
}

function mouthSvg(kind) {
  const P = '#f5c451';
  if (kind === 'o') return `<ellipse cx="230" cy="272" rx="26" ry="32" fill="${P}"/>`;
  if (kind === 'grin') return `<path d="M180 258 q50 62 100 0 q-50 20 -100 0" fill="${P}"/>`;
  if (kind === 'frown') return `<path d="M186 284 q44 -34 88 0" stroke="${P}" stroke-width="16" fill="none" stroke-linecap="round"/>`;
  return `<path d="M190 264 q40 40 80 0" stroke="${P}" stroke-width="16" fill="none" stroke-linecap="round"/>`;
}

function svg(s) {
  const label = s.label
    ? `<text x="256" y="486" font-family="DejaVu Sans, sans-serif" font-size="46" font-weight="bold" fill="#f5c451" text-anchor="middle">${s.label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#39435c"/><stop offset="100%" stop-color="#1b2130"/></linearGradient>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffd977"/><stop offset="100%" stop-color="#f0b73c"/></linearGradient></defs>
  <g transform="translate(26 8) scale(1.0)">
    <line x1="230" y1="86" x2="230" y2="44" stroke="#3d4864" stroke-width="10" stroke-linecap="round"/><circle cx="230" cy="38" r="15" fill="url(#g)"/>
    <rect x="60" y="86" width="340" height="280" rx="88" fill="url(#b)" stroke="#4a556f" stroke-width="5"/>
    <rect x="30" y="176" width="36" height="80" rx="18" fill="#242c3d" stroke="#4a556f" stroke-width="3"/>
    <rect x="394" y="176" width="36" height="80" rx="18" fill="#242c3d" stroke="#4a556f" stroke-width="3"/>
    <rect x="92" y="118" width="276" height="212" rx="62" fill="#0c1018" stroke="#2c3547" stroke-width="4"/>
    ${eyesSvg(s.eyes)}
    ${mouthSvg(s.mouth)}
  </g>
  ${label}
</svg>`;
}

function api(method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const q = https.request({ hostname: 'api.telegram.org', path: '/bot' + TOKEN + '/' + method, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 30000 },
      s => { let d = ''; s.on('data', c => d += c); s.on('end', () => resolve(d)); });
    q.on('error', reject);
    q.end(body);
  });
}

// создание набора: multipart, файлы стикеров
function createSet(files) {
  return new Promise((resolve, reject) => {
    const boundary = '----st' + Date.now();
    const parts = [];
    const field = (k, v) => parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n'));
    field('user_id', String(BOT_ID));
    field('name', SET);
    field('title', TITLE);
    field('format', 'static');
    const stickers = files.map((f, i) => ({ file: 'f' + i, emoji: '🎁' }));
    field('stickers', JSON.stringify(stickers));
    files.forEach((f, i) => {
      parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="f' + i + '"; filename="' + path.basename(f) + '"\r\nContent-Type: image/png\r\n\r\n'));
      parts.push(fs.readFileSync(f));
      parts.push(Buffer.from('\r\n'));
    });
    parts.push(Buffer.from('--' + boundary + '--\r\n'));
    const body = Buffer.concat(parts);
    const q = https.request({ hostname: 'api.telegram.org', path: '/bot' + TOKEN + '/createNewStickerSet', method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length }, timeout: 120000 },
      s => { let d = ''; s.on('data', c => d += c); s.on('end', () => resolve({ code: s.statusCode, body: d.slice(0, 300) })); });
    q.on('error', reject);
    q.end(body);
  });
}

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  const files = [];
  for (const s of STICKERS) {
    const png = new Resvg(svg(s), { fitTo: { mode: 'width', value: 512 } }).render().asPng();
    const f = path.join(TMP, s.id + '.png');
    fs.writeFileSync(f, png);
    files.push(f);
  }
  console.log('стикеров отрендерено: ' + files.length);
  if (!TOKEN) { console.log('без токена: только файлы'); return; }

  const r = await createSet(files);
  console.log('createNewStickerSet:', r.code + ' ' + r.body);

  const link = 'https://t.me/addstickers/' + SET;
  if (OWNER) {
    await api('sendMessage', {
      chat_id: OWNER,
      text: 'Стикерпак готов: ' + link + '\n\nДобавь себе и можешь ставить стикеры где угодно — это бесплатная реклама канала.',
      parse_mode: 'HTML',
    });
  }
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
