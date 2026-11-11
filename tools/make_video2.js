// Ролик: хук в интро, низкий голос, описания игр, маскот с мимикой и ногами-анимацией.
const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');
const { Resvg } = require('@resvg/resvg-js');
const { tts } = require('./tts');

const TOKEN = (process.env.TELEGRAM_TOKEN || '').trim();
const OWNER = (process.env.OWNER_CHAT_ID || '').trim();
const TMP = '/tmp/v3';
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const FONT2 = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const W = 1080, H = 1920, FPS = 12;
const PIPER_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium';

const log = s => console.log(s);
const run = (cmd, args, opts) => {
  const r = spawnSync(cmd, args, Object.assign({ encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 }, opts || {}));
  if (r.status !== 0) {
    console.log('CMD: ' + cmd + ' ' + args.join(' '));
    console.log('STDERR:\n' + String(r.stderr || '').slice(-3000));
    throw new Error(cmd + ' fail');
  }
  return r;
};
const ff = a => run('ffmpeg', a);
const ffprobe = f => parseFloat(String(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout).trim());
const textFile = (n, t) => { const p = path.join(TMP, n); fs.writeFileSync(p, t); return p; };

const getJson = url => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'deal-radar/1.0' }, timeout: 30000 }, s => {
    let d = ''; s.setEncoding('utf8');
    s.on('data', c => d += c);
    s.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad json')); } });
  }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
});
const download = (url, dest) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'deal-radar/1.0' }, timeout: 40000 }, s => {
    if (s.statusCode !== 200) { s.resume(); return reject(new Error('HTTP ' + s.statusCode)); }
    const f = fs.createWriteStream(dest); s.pipe(f); f.on('finish', () => f.close(() => resolve(dest)));
  }).on('error', reject);
});
const rub = (f, kop) => (f || (kop / 100).toFixed(2) + ' ₽').replace(/\s+/g, ' ').trim();
const num = s => String(s).replace(/[^\d]/g, '');

/* ---------- маскот ---------- */
function mascotSvg(open, bob, blink) {
  const m = Math.round(open * 100);
  const mouthH = 5 + m * 0.40;
  const eyeH = blink ? 6 : 52;
  const eyeY = 196;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="460" viewBox="0 0 460 460">
  <defs>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#39435c"/><stop offset="100%" stop-color="#1b2130"/></linearGradient>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffd977"/><stop offset="100%" stop-color="#f0b73c"/></linearGradient>
  </defs>
  <g transform="translate(0 ${bob})">
    <line x1="230" y1="86" x2="230" y2="46" stroke="#3d4864" stroke-width="9" stroke-linecap="round"/>
    <circle cx="230" cy="40" r="14" fill="url(#g)"/>
    <rect x="60" y="86" width="340" height="280" rx="88" fill="url(#b)" stroke="#4a556f" stroke-width="4"/>
    <rect x="34" y="176" width="34" height="80" rx="17" fill="#242c3d" stroke="#4a556f" stroke-width="3"/>
    <rect x="392" y="176" width="34" height="80" rx="17" fill="#242c3d" stroke="#4a556f" stroke-width="3"/>
    <rect x="92" y="118" width="276" height="212" rx="62" fill="#0c1018" stroke="#2c3547" stroke-width="3"/>
    <ellipse cx="170" cy="${eyeY}" rx="26" ry="${eyeH / 2}" fill="#f5c451"/>
    <ellipse cx="290" cy="${eyeY}" rx="26" ry="${eyeH / 2}" fill="#f5c451"/>
    ${blink ? '' : '<circle cx="178" cy="188" r="8" fill="#0c1018"/><circle cx="298" cy="188" r="8" fill="#0c1018"/>'}
    <ellipse cx="230" cy="272" rx="${34 + m * 0.10}" ry="${mouthH}" fill="#f5c451"/>
  </g>
</svg>`;
}

function renderFrames(count, env, dir) {
  let prev = null;
  const blinkEvery = 6 * FPS, blinkLen = 2;
  for (let i = 0; i < count; i++) {
    const open = env[i] || 0;
    const bob = Math.round(Math.sin(i / 6) * 5);
    const blink = (i % blinkEvery) < blinkLen && i > blinkEvery / 2;
    const svg = mascotSvg(open, bob, blink);
    const file = path.join(dir, 'f' + String(i).padStart(4, '0') + '.png');
    if (svg === prev && i > 0) {
      fs.copyFileSync(path.join(dir, 'f' + String(i - 1).padStart(4, '0') + '.png'), file);
    } else {
      fs.writeFileSync(file, new Resvg(svg, { fitTo: { mode: 'width', value: 460 } }).render().asPng());
      prev = svg;
    }
  }
  return count;
}

/* ---------- звук ---------- */
function ensureFile(url, dest, minSize) {
  const min = minSize || 10000;
  if (fs.existsSync(dest) && fs.statSync(dest).size >= min) return dest;
  run('curl', ['-sL', '--max-time', '240', '-o', dest, url]);
  const size = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
  if (size < min) throw new Error('не скачался ' + url);
  return dest;
}



function envelope(wav, frameDur, total) {
  const buf = fs.readFileSync(wav);
  let off = 12, sampleRate = 22050, bits = 16, ch = 1, dataOff = 44, dataLen = buf.length - 44;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') { sampleRate = buf.readUInt32LE(off + 12); ch = buf.readUInt16LE(off + 10); bits = buf.readUInt16LE(off + 22); }
    if (id === 'data') { dataOff = off + 8; dataLen = size; break; }
    off += 8 + size + (size % 2);
  }
  const step = bits === 16 ? 2 : 1;
  const totalS = Math.floor(dataLen / (step * ch));
  const per = Math.max(1, Math.floor(sampleRate * frameDur));
  const frames = Math.ceil(total / frameDur);
  const raw = [];
  for (let f = 0; f < frames; f++) {
    let sum = 0, n = 0;
    for (let i = f * per; i < Math.min(totalS, (f + 1) * per); i++) {
      const p = dataOff + i * step * ch;
      const v = bits === 16 ? buf.readInt16LE(p) / 32768 : (buf.readUInt8(p) - 128) / 128;
      sum += v * v; n++;
    }
    raw.push(n ? Math.sqrt(sum / n) : 0);
  }
  const peak = raw.reduce((m, v) => Math.max(m, v), 0.0001);
  return raw.map(v => Math.min(1, Math.pow(v / peak, 0.6) * 1.22));
}

/* ---------- отправка ---------- */
function sendVideo(file, caption) {
  return new Promise((resolve, reject) => {
    const boundary = '----v' + Date.now();
    const fields = [['chat_id', OWNER], ['caption', caption], ['supports_streaming', 'true'], ['width', String(W)], ['height', String(H)]];
    const parts = [];
    for (const [k, v] of fields) parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n'));
    parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="video"; filename="deals.mp4"\r\nContent-Type: video/mp4\r\n\r\n'));
    parts.push(fs.readFileSync(file));
    parts.push(Buffer.from('\r\n--' + boundary + '--\r\n'));
    const body = Buffer.concat(parts);
    const q = https.request({ hostname: 'api.telegram.org', path: '/bot' + TOKEN + '/sendVideo', method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': body.length }, timeout: 240000 },
      s => { let d = ''; s.on('data', c => d += c); s.on('end', () => resolve({ code: s.statusCode, body: d.slice(0, 300) })); });
    q.on('error', reject);
    q.end(body);
  });
}

/* ---------- тексты ---------- */
function wrap(text, width) {
  const words = String(text).split(/\s+/);
  const lines = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
    if (lines.length >= 2) break;
  }
  if (cur && lines.length < 2) lines.push(cur);
  return lines.map(l => (l.length > width ? l.slice(0, width - 1) + '…' : l));
}

/* ---------- сборка ---------- */
(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP + '/frames', { recursive: true });

  const feed = await getJson('https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&sortBy=Deal%20Rating&pageSize=40');
  const picks = [];
  for (const d of feed) {
    if (picks.length >= 3) break;
    const appid = d.steamAppID;
    if (!appid || Number(d.savings) < 50) continue;
    try {
      const j = await getJson('https://store.steampowered.com/api/appdetails?appids=' + appid + '&cc=ru&l=russian');
      const dd = j[String(appid)];
      const data = dd && dd.success && dd.data;
      const p = data && data.price_overview;
      if (!p || !p.final || !p.discount_percent) continue;
      const desc = String((data.short_description || '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      picks.push({
        title: d.title, appid,
        final: rub(p.final_formatted, p.final),
        initial: rub(p.initial_formatted, p.initial),
        discount: p.discount_percent,
        desc: desc.slice(0, 150),
      });
    } catch (e) {}
  }
  if (picks.length < 3) throw new Error('мало скидок для ролика');
  log('скидки: ' + picks.map(p => p.title + ' −' + p.discount + '%').join(' | '));

  // Озвучка: хук + цифры без падежного «вместо»
  const hook = 'Девяносто процентов скидки — и это не опечатка. Три игры, которые сегодня стоят дешевле кофе.';
  const mid = picks.map((p, i) => {
    const idx = ['Первая', 'Вторая', 'Третья'][i];
    return idx + ': ' + num(p.final) + ' рублей, а было ' + num(p.initial) + '. Это минус ' + p.discount + ' процентов.';
  }).join(' ');
  const outro = 'Полный список — в канале Радар Скидок. И бесплатный кейс дня: три попытки каждый день.';
  const voiceText = hook + ' ' + mid + ' ' + outro;
  log('озвучка: ' + voiceText.slice(0, 90) + '...');
  tts(voiceText, TMP, TMP + '/voice.wav');
  const voiceDur = ffprobe(TMP + '/voice.wav');
  log('голос: ' + voiceDur.toFixed(1) + ' с');

  for (const p of picks) await download('https://cdn.akamai.steamstatic.com/steam/apps/' + p.appid + '/capsule_616x353.jpg', TMP + '/img' + p.appid + '.jpg');

  const intro = 3.4, outroDur = 2.6;
  const cardDur = Math.max(3.4, (voiceDur - intro - outroDur) / 3);
  const segs = [];

  // интро с хуком
  const i1 = textFile('i1.txt', '−90%');
  const i2 = textFile('i2.txt', 'и это не опечатка');
  const i3 = textFile('i3.txt', 'три игры дешевле кофе');
  ff(['-y', '-f', 'lavfi', '-i', 'color=c=0x0b0e14:s=' + W + 'x' + H + ':d=' + intro + ':r=30',
    '-vf', 'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + i1 + ':fontcolor=0xff5c5c:fontsize=210:x=(w-text_w)/2:y=(h-text_h)/2-260:alpha=\'min(1,t/0.4)\',' +
      'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + i2 + ':fontcolor=white:fontsize=76:x=(w-text_w)/2:y=(h-text_h)/2-40:alpha=\'min(1,max(0,(t-0.5)/0.5))\',' +
      'drawtext=expansion=none:fontfile=' + FONT2 + ':textfile=' + i3 + ':fontcolor=0xf5c451:fontsize=52:x=(w-text_w)/2:y=(h-text_h)/2+70:alpha=\'min(1,max(0,(t-1.1)/0.5))\'',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', TMP + '/s0.mp4']);
  segs.push(TMP + '/s0.mp4');

  // карточки
  for (let i = 0; i < 3; i++) {
    const p = picks[i];
    const cap = textFile('c' + i + '.txt', p.title);
    const pr = textFile('p' + i + '.txt', p.final + ' · было ' + p.initial);
    const dc = textFile('d' + i + '.txt', '−' + p.discount + '%');
    const lines = wrap(p.desc || 'скидка на Steam', 38);
    const dcs = [textFile('ds' + i + '_0.txt', lines[0] || ''), textFile('ds' + i + '_1.txt', lines[1] || '')];
    ff(['-y', '-loop', '1', '-i', TMP + '/img' + p.appid + '.jpg',
      '-filter_complex',
      '[0:v]scale=' + W + ':' + H + ':force_original_aspect_ratio=increase,crop=' + W + ':' + H + ',boxblur=26:7,eq=brightness=-0.32[bg];' +
      '[0:v]scale=1000:-2[fg];' +
      '[bg][fg]overlay=(W-w)/2:(H-h)/2-320:format=auto,' +
      'zoompan=z=\'min(1.06,1+0.0008*on)\':d=1:s=' + W + 'x' + H + ',format=yuv420p,' +
      'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + cap + ':fontcolor=white:fontsize=50:box=1:boxcolor=black@0.55:boxborderw=20:x=(w-text_w)/2:y=h-780:alpha=\'min(1,t/0.35)\',' +
      'drawtext=expansion=none:fontfile=' + FONT2 + ':textfile=' + dcs[0] + ':fontcolor=#c8d0e0:fontsize=34:x=(w-text_w)/2:y=h-700:alpha=\'min(1,max(0,(t-0.25)/0.35))\',' +
      'drawtext=expansion=none:fontfile=' + FONT2 + ':textfile=' + dcs[1] + ':fontcolor=#c8d0e0:fontsize=34:x=(w-text_w)/2:y=h-650:alpha=\'min(1,max(0,(t-0.35)/0.35))\',' +
      'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + pr + ':fontcolor=0xf5c451:fontsize=56:x=(w-text_w)/2:y=h-540:alpha=\'min(1,max(0,(t-0.45)/0.4))\',' +
      'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + dc + ':fontcolor=#ff5c5c:fontsize=104:x=(w-text_w)/2:y=h-440:alpha=\'min(1,max(0,(t-0.6)/0.45))\'',
      '-t', String(cardDur), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', TMP + '/s' + (i + 1) + '.mp4']);
    segs.push(TMP + '/s' + (i + 1) + '.mp4');
  }

  const o1 = textFile('o1.txt', 'Радар Скидок');
  const o2 = textFile('o2.txt', '@deal_radar1');
  ff(['-y', '-f', 'lavfi', '-i', 'color=c=0x0b0e14:s=' + W + 'x' + H + ':d=' + outroDur + ':r=30',
    '-vf', 'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + o1 + ':fontcolor=white:fontsize=76:x=(w-text_w)/2:y=(h-text_h)/2-80,' +
      'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + o2 + ':fontcolor=0xf5c451:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2+40',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', TMP + '/s9.mp4']);
  segs.push(TMP + '/s9.mp4');

  const list = TMP + '/list.txt';
  fs.writeFileSync(list, segs.map(s => "file '" + s + "'").join('\n') + '\n');
  ff(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', TMP + '/main.mp4']);
  const mainDur = ffprobe(TMP + '/main.mp4');
  log('картинка: ' + mainDur.toFixed(1) + ' с');

  const env = envelope(TMP + '/voice.wav', 1 / FPS, mainDur);
  log('кадров маскота: ' + renderFrames(env.length, env, TMP + '/frames'));

  ff(['-y', '-i', TMP + '/main.mp4', '-framerate', String(FPS), '-start_number', '0', '-i', TMP + '/frames/f%04d.png', '-i', TMP + '/voice.wav',
    '-filter_complex', '[0:v][1:v]overlay=W-w-30:H-h-30:format=auto[v]',
    '-map', '[v]', '-map', '2:a',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', TMP + '/final.mp4']);
  log('готово: ' + Math.round(fs.statSync(TMP + '/final.mp4').size / 1024) + ' КБ, ' + ffprobe(TMP + '/final.mp4').toFixed(1) + ' с');

  if (!TOKEN || !OWNER) { log('без токена: файл только на раннере'); return; }
  const r = await sendVideo(TMP + '/final.mp4', 'Версия 3: хук, низкий голос, описания, маскот моргает. Хэштеги: #скидкинаигры #steam #распродажа');
  log('send: ' + r.code + ' ' + r.body.slice(0, 160));
  if (r.code !== 200) process.exit(1);
})().catch(async e => {
  console.error('ERR ' + e.message);
  try {
    if (TOKEN && OWNER) {
      const body = JSON.stringify({ chat_id: OWNER, text: 'Ролик не собрался:\n' + String(e.message).slice(0, 700) });
      await new Promise(res => {
        const q = https.request({ hostname: 'api.telegram.org', path: '/bot' + TOKEN + '/sendMessage', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 20000 },
          s => { s.resume(); s.on('end', res); });
        q.on('error', () => res()); q.end(body);
      });
    }
  } catch (x) {}
  process.exit(1);
});
