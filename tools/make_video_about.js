// Обзорный ролик о проекте (~1 минута): канал, расписание, кейсы.
const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');
const { Resvg } = require('@resvg/resvg-js');
const { tts } = require('./tts');

const TOKEN = (process.env.TELEGRAM_TOKEN || '').trim();
const OWNER = (process.env.OWNER_CHAT_ID || '').trim();
const TMP = '/tmp/about';
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

function mascotSvg(open, bob, blink) {
  const m = Math.round(open * 100);
  const mouthH = 5 + m * 0.40;
  const eyeH = blink ? 6 : 52;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="460" viewBox="0 0 460 460">
  <defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#39435c"/><stop offset="100%" stop-color="#1b2130"/></linearGradient>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffd977"/><stop offset="100%" stop-color="#f0b73c"/></linearGradient></defs>
  <g transform="translate(0 ${bob})">
    <line x1="230" y1="86" x2="230" y2="46" stroke="#3d4864" stroke-width="9" stroke-linecap="round"/><circle cx="230" cy="40" r="14" fill="url(#g)"/>
    <rect x="60" y="86" width="340" height="280" rx="88" fill="url(#b)" stroke="#4a556f" stroke-width="4"/>
    <rect x="34" y="176" width="34" height="80" rx="17" fill="#242c3d" stroke="#4a556f" stroke-width="3"/>
    <rect x="392" y="176" width="34" height="80" rx="17" fill="#242c3d" stroke="#4a556f" stroke-width="3"/>
    <rect x="92" y="118" width="276" height="212" rx="62" fill="#0c1018" stroke="#2c3547" stroke-width="3"/>
    <ellipse cx="170" cy="196" rx="26" ry="${eyeH / 2}" fill="#f5c451"/><ellipse cx="290" cy="196" rx="26" ry="${eyeH / 2}" fill="#f5c451"/>
    ${blink ? '' : '<circle cx="178" cy="188" r="8" fill="#0c1018"/><circle cx="298" cy="188" r="8" fill="#0c1018"/>'}
    <ellipse cx="230" cy="272" rx="${34 + m * 0.10}" ry="${mouthH}" fill="#f5c451"/>
  </g></svg>`;
}

function renderFrames(count, env, dir) {
  let prev = null;
  for (let i = 0; i < count; i++) {
    const open = env[i] || 0;
    const bob = Math.round(Math.sin(i / 6) * 5);
    const blink = (i % (6 * FPS)) < 2 && i > 3 * FPS;
    const svg = mascotSvg(open, bob, blink);
    const file = path.join(dir, 'f' + String(i).padStart(4, '0') + '.png');
    if (svg === prev && i > 0) fs.copyFileSync(path.join(dir, 'f' + String(i - 1).padStart(4, '0') + '.png'), file);
    else { fs.writeFileSync(file, new Resvg(svg, { fitTo: { mode: 'width', value: 460 } }).render().asPng()); prev = svg; }
  }
  return count;
}

function sendVideo(file, caption) {
  return new Promise((resolve, reject) => {
    const boundary = '----a' + Date.now();
    const fields = [['chat_id', OWNER], ['caption', caption], ['supports_streaming', 'true'], ['width', String(W)], ['height', String(H)]];
    const parts = [];
    for (const [k, v] of fields) parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n'));
    parts.push(Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="video"; filename="about.mp4"\r\nContent-Type: video/mp4\r\n\r\n'));
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

/* ---------- сценарий ---------- */
const SLIDES = [
  { head: 'Радар Скидок', lines: ['скидки на игры', 'с ценами в рублях'], weight: 1.0, accent: '0xf5c451' },
  { head: 'Что мы делаем', lines: ['каждый день ищем скидки в Steam', 'никаких фейковых цен', 'цена и скидка — честные'], weight: 1.6 },
  { head: 'Расписание', lines: ['10:00 — пять находок', '12:00 — кейс дня', '15:00 — горячая скидка', '18:00 — статистика', '21:00 — подборка из трёх'], weight: 2.2 },
  { head: 'Кейс дня', lines: ['три бесплатных открытия', 'скидки до минус 95%', 'шанс на бесплатную игру', 'каждый 16-й кейс — от −85%'], weight: 2.0 },
  { head: 'Бонусы', lines: ['плюс кейс за подписку', 'плюс за друга и достижения', 'мини-игра и дуэли', 'пять кейсов за 15 звёзд'], weight: 1.6 },
  { head: 'Подписывайся', lines: ['Радар Скидок', '@deal_radar1', 'кейс — бесплатно'], weight: 1.2, accent: '0xf5c451' },
];

(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP + '/frames', { recursive: true });

  const voiceText = 'Привет, это Радар Скидок. ' +
    'Каждый день мы ищем скидки на игры в Steam и показываем реальные цены в рублях. Без фейковых зачёркнутых цифр и без навязчивой рекламы. ' +
    'Расписание простое. В десять утра — пять лучших находок. В полдень — кейс дня. В три часа — одна горячая скидка. В шесть — статистика подписчиков. В девять вечера — подборка из трёх игр. ' +
    'В канале есть бесплатный кейс дня: три открытия каждый день. Внутри игры со скидкой до девяноста пяти процентов и шанс поймать совсем бесплатную. Каждый шестнадцатый кейс гарантирует скидку от восьмидесяти пяти процентов. ' +
    'Ещё кейсы можно заработать: за подписку на канал, за друзей, за достижения, мини-игру и дуэли. А пять дополнительных открытий — за пятнадцать звёзд. ' +
    'Подписывайся на Радар Скидок и открывай кейс. Это бесплатно.';
  log('длина сценария: ' + voiceText.length + ' символов');
  tts(voiceText, TMP, TMP + '/voice.wav');
  const dur = ffprobe(TMP + '/voice.wav');
  log('голос: ' + dur.toFixed(1) + ' с');

  const totalWeight = SLIDES.reduce((s, x) => s + x.weight, 0);
  const segs = [];
  for (let i = 0; i < SLIDES.length; i++) {
    const s = SLIDES[i];
    const d = Math.max(2.2, (s.weight / totalWeight) * dur);
    const headF = textFile('h' + i + '.txt', s.head);
    const vf = [];
    vf.push('drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + headF + ':fontcolor=' + (s.accent || 'white') + ':fontsize=86:x=(w-text_w)/2:y=(h-text_h)/2-260:alpha=\'min(1,t/0.35)\'');
    s.lines.forEach((ln, j) => {
      const lf = textFile('l' + i + '_' + j + '.txt', ln);
      const y = '(h)/2-90+' + (j * 92);
      vf.push('drawtext=expansion=none:fontfile=' + FONT2 + ':textfile=' + lf + ':fontcolor=#dfe5f0:fontsize=46:x=(w-text_w)/2:y=' + y + ':alpha=\'min(1,max(0,(t-' + (0.35 + j * 0.18) + ')/0.35))\'');
    });
    ff(['-y', '-f', 'lavfi', '-i', 'color=c=0x0b0e14:s=' + W + 'x' + H + ':d=' + d + ':r=30',
      '-vf', vf.join(','), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', TMP + '/s' + i + '.mp4']);
    segs.push(TMP + '/s' + i + '.mp4');
  }

  const list = TMP + '/list.txt';
  fs.writeFileSync(list, segs.map(s => "file '" + s + "'").join('\n') + '\n');
  ff(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', TMP + '/main.mp4']);
  const mainDur = ffprobe(TMP + '/main.mp4');
  log('картинка: ' + mainDur.toFixed(1) + ' с');

  const env = envelope(TMP + '/voice.wav', 1 / FPS, mainDur);
  log('кадров маскота: ' + renderFrames(env.length, env, TMP + '/frames'));

  ff(['-y', '-i', TMP + '/main.mp4', '-framerate', String(FPS), '-start_number', '0', '-i', TMP + '/frames/f%04d.png', '-i', TMP + '/voice.wav',
    '-filter_complex', '[0:v][1:v]overlay=W-w-30:H-h-30:format=auto[v]',
    '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', TMP + '/final.mp4']);
  log('готово: ' + Math.round(fs.statSync(TMP + '/final.mp4').size / 1024) + ' КБ, ' + ffprobe(TMP + '/final.mp4').toFixed(1) + ' с');

  if (!TOKEN || !OWNER) { log('без токена: файл только на раннере'); return; }
  const r = await sendVideo(TMP + '/final.mp4', 'Обзорный ролик о проекте (~минута). Голос медленнее, без ускорения.');
  log('send: ' + r.code + ' ' + r.body.slice(0, 160));
  if (r.code !== 200) process.exit(1);
})().catch(async e => {
  console.error('ERR ' + e.message);
  try {
    if (TOKEN && OWNER) {
      const body = JSON.stringify({ chat_id: OWNER, text: 'Обзорный ролик не собрался:\n' + String(e.message).slice(0, 700) });
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
