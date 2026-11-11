const fs = require('fs');
const https = require('https');
const { Resvg } = require('@resvg/resvg-js');

const TOKEN = (process.env.TELEGRAM_TOKEN || '').trim();
const OWNER = (process.env.OWNER_CHAT_ID || '').trim();
const svg = fs.readFileSync('docs/mascot.svg', 'utf8');

function render(size, out) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: '#0b0e14' });
  const png = r.render().asPng();
  fs.writeFileSync(out, png);
  console.log(out + ': ' + Math.round(png.length / 1024) + ' КБ');
  return png;
}

function sendPhoto(file, caption) {
  return new Promise((resolve, reject) => {
    const boundary = '----m' + Date.now();
    const body = Buffer.concat([
      Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n' + OWNER + '\r\n'),
      Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="caption"\r\n\r\n' + caption + '\r\n'),
      Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="photo"; filename="mascot.png"\r\nContent-Type: image/png\r\n\r\n'),
      fs.readFileSync(file),
      Buffer.from('\r\n--' + boundary + '--\r\n'),
    ]);
    const q = https.request({ hostname: 'api.telegram.org', path: '/bot' + TOKEN + '/sendPhoto', method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length }, timeout: 120000 },
      s => { let d = ''; s.on('data', c => d += c); s.on('end', () => resolve(s.statusCode + ' ' + d.slice(0, 120))); });
    q.on('error', reject);
    q.end(body);
  });
}

(async () => {
  render(1024, 'docs/mascot.png');
  render(512, 'docs/mascot-512.png');
  if (!TOKEN || !OWNER) { console.log('без токена: только файлы'); return; }
  console.log('send:', await sendPhoto('docs/mascot-512.png', 'Черновик маскота «Робик-локатор». Скажи: оставляем, или переделать?'));
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
