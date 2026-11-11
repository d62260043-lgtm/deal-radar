// Сборка вертикального видео (1080x1920) с сегодняшними скидками + отправка в личку владельцу.
const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');

const TOKEN = (process.env.TELEGRAM_TOKEN || '').trim();
const OWNER = (process.env.OWNER_CHAT_ID || '').trim();
const TMP = '/tmp/vid';
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
console.log('font exists:', fs.existsSync(FONT));
const FONT2 = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const W = 1080, H = 1920;

const getJson = url => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'deal-radar/1.0' }, timeout: 30000 }, s => {
    let d = '';
    s.setEncoding('utf8');
    s.on('data', c => d += c);
    s.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad json')); } });
  }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
});

const download = (url, dest) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'deal-radar/1.0' }, timeout: 40000 }, s => {
    if (s.statusCode !== 200) { s.resume(); return reject(new Error('HTTP ' + s.statusCode)); }
    const f = fs.createWriteStream(dest);
    s.pipe(f);
    f.on('finish', () => f.close(() => resolve(dest)));
  }).on('error', reject);
});

const rub = (f, kop) => (f || (kop / 100).toFixed(2) + ' ₽').replace(/\s+/g, ' ').trim();

function send(host, p, body, headers, method) {
  return new Promise((resolve, reject) => {
    const q = https.request({ hostname: host, path: p, method: method || 'POST', timeout: 60000,
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, headers) },
      s => { let d = ''; s.on('data', c => d += c); s.on('end', () => resolve({ code: s.statusCode, body: d })); });
    q.on('error', reject);
    q.on('timeout', () => q.destroy(new Error('timeout')));
    q.end(body);
  });
}

function sendVideo(file) {
  return new Promise((resolve, reject) => {
    const boundary = '----vid' + Date.now();
    const fields = [
      ['chat_id', OWNER],
      ['caption', 'Готово. Пости в TikTok / Shorts / Reels. Хэштеги: #скидкинаигры #steam #распродажа #игры #гейминг'],
      ['supports_streaming', 'true'],
      ['width', String(W)],
      ['height', String(H)],
      ['duration', '18'],
    ];
    const parts = [];
    for (const [k, v] of fields) {
      parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n'));
    }
    parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="video"; filename="deals.mp4"\r\nContent-Type: video/mp4\r\n\r\n'));
    parts.push(fs.readFileSync(file));
    parts.push(Buffer.from('\r\n--' + boundary + '--\r\n'));
    const body = Buffer.concat(parts);
    const q = https.request({ hostname: 'api.telegram.org', path: '/bot' + TOKEN + '/sendVideo', method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length }, timeout: 180000 },
      s => { let d = ''; s.on('data', c => d += c); s.on('end', () => resolve({ code: s.statusCode, body: d.slice(0, 300) })); });
    q.on('error', reject);
    q.end(body);
  });
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });
  if (r.status !== 0) {
    console.log('CMD: ffmpeg ' + args.map(a => (String(a).indexOf(' ') >= 0 ? JSON.stringify(a) : a)).join(' '));
    console.log('STDERR:\n' + String(r.stderr || '').slice(-4000));
    throw new Error('ffmpeg fail');
  }
}

function textFile(name, text) {
  const p = path.join(TMP, name);
  fs.writeFileSync(p, text);
  return p;
}

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  // 1. Скидки
  const feed = await getJson('https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&sortBy=Deal%20Rating&pageSize=40');
  const picks = [];
  for (const d of feed) {
    if (picks.length >= 3) break;
    const appid = d.steamAppID;
    if (!appid || Number(d.savings) < 50) continue;
    try {
      const j = await getJson('https://store.steampowered.com/api/appdetails?appids=' + appid + '&cc=ru&l=russian&filters=price_overview');
      const dd = j[String(appid)];
      const p = dd && dd.success && dd.data && dd.data.price_overview;
      if (!p || !p.final || !p.discount_percent) continue;
      picks.push({ title: d.title, appid, final: rub(p.final_formatted, p.final), initial: rub(p.initial_formatted, p.initial), discount: p.discount_percent });
    } catch (e) {}
  }
  if (picks.length < 2) throw new Error('мало скидок для видео');
  console.log('в видео: ' + picks.map(p => p.title + ' −' + p.discount + '%').join(' | '));

  // 2. Картинки
  for (const p of picks) {
    await download('https://cdn.akamai.steamstatic.com/steam/apps/' + p.appid + '/capsule_616x353.jpg', path.join(TMP, 'img' + p.appid + '.jpg'));
  }

  const segs = [];

  // 3. Интро
  const introTitle = textFile('t_intro.txt', 'Скидки в Steam');
  const introSub = textFile('t_introsub.txt', 'сегодня, в рублях');
  ffmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=0x0e121a:s=' + W + 'x' + H + ':d=3:r=30',
    '-vf', 'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + introTitle + ':fontcolor=white:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2-80,' +
      'drawtext=expansion=none:fontfile=' + FONT2 + ':textfile=' + introSub + ':fontcolor=0xf5c451:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2+60',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', path.join(TMP, 's0.mp4')]);
  segs.push(path.join(TMP, 's0.mp4'));

  // 4. Карточки игр
  let idx = 1;
  for (const p of picks) {
    const cap = textFile('cap' + idx + '.txt', p.title);
    const price = textFile('price' + idx + '.txt', p.final + ' вместо ' + p.initial);
    const disc = textFile('disc' + idx + '.txt', 'скидка ' + p.discount + '%');
    const out = path.join(TMP, 's' + idx + '.mp4');
    ffmpeg(['-y', '-loop', '1', '-i', path.join(TMP, 'img' + p.appid + '.jpg'),
      '-filter_complex',
      '[0:v]scale=' + W + ':' + H + ':force_original_aspect_ratio=increase,crop=' + W + ':' + H + ',boxblur=24:6,eq=brightness=-0.25[bg];' +
      '[0:v]scale=960:-2[fg];' +
      '[bg][fg]overlay=(W-w)/2:(H-h)/2-160,' +
      'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + cap + ':fontcolor=white:fontsize=54:box=1:boxcolor=black@0.5:boxborderw=22:x=(w-text_w)/2:y=h-620,' +
      'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + price + ':fontcolor=0xf5c451:fontsize=58:x=(w-text_w)/2:y=h-500,' +
      'drawtext=expansion=none:fontfile=' + FONT2 + ':textfile=' + disc + ':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=h-410',
      '-t', '4', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', out]);
    segs.push(out);
    idx++;
  }

  // 5. Аутро
  const out1 = textFile('t_out1.txt', 'Всё в канале Радар Скидок');
  const out2 = textFile('t_out2.txt', '@deal_radar1');
  ffmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=0x0e121a:s=' + W + 'x' + H + ':d=3:r=30',
    '-vf', 'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + out1 + ':fontcolor=white:fontsize=62:x=(w-text_w)/2:y=(h-text_h)/2-70,' +
      'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + out2 + ':fontcolor=0xf5c451:fontsize=82:x=(w-text_w)/2:y=(h-text_h)/2+40',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', path.join(TMP, 's9.mp4')]);
  segs.push(path.join(TMP, 's9.mp4'));

  // 6. Склейка
  const list = path.join(TMP, 'list.txt');
  fs.writeFileSync(list, segs.map(s => "file '" + s + "'").join('\n') + '\n');
  const finalVideo = path.join(TMP, 'deals.mp4');
  ffmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', finalVideo]);
  const size = fs.statSync(finalVideo).size;
  console.log('видео готово: ' + Math.round(size / 1024) + ' КБ');

  if (!TOKEN || !OWNER) { console.log('без токена: видео только на раннере'); return; }
  const r = await sendVideo(finalVideo);
  console.log('send: ' + r.code + ' ' + r.body.slice(0, 200));
  if (r.code !== 200) process.exit(1);
  })().catch(async e => {
  console.error('ERR ' + e.message);
  try {
    if (TOKEN && OWNER) {
      const body = JSON.stringify({ chat_id: OWNER, text: 'Видео не собралось:\n' + String(e.message).slice(0, 900) });
      await send('api.telegram.org', '/bot' + TOKEN + '/sendMessage', body, {});
    }
  } catch (x) {}
  process.exit(1);
});
