// Ролик с озвучкой (edge-tts), анимацией карточек и «живым ртом» маскота.
const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawnSync } = require('child_process');
const { Resvg } = require('@resvg/resvg-js');

const TOKEN = (process.env.TELEGRAM_TOKEN || '').trim();
const OWNER = (process.env.OWNER_CHAT_ID || '').trim();
const VOICE = process.env.TTS_VOICE || 'ru-RU-DmitryNeural';
const TMP = '/tmp/v2';
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const FONT2 = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const W = 1080, H = 1920, FPS = 12;   // fps маскота

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
const ff = (args) => run('ffmpeg', args);
const ffprobe = (file) => {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return parseFloat(String(r.stdout).trim());
};
const textFile = (name, text) => { const p = path.join(TMP, name); fs.writeFileSync(p, text); return p; };

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

/* ---------- маскот ---------- */
function mascotSvg(open, bob) {
  const m = Math.round(open * 100);           // 0..100 — насколько открыт рот
  const mouthH = 6 + m * 0.42;
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
    <circle cx="170" cy="196" r="26" fill="#f5c451"/><circle cx="290" cy="196" r="26" fill="#f5c451"/>
    <circle cx="178" cy="188" r="8" fill="#0c1018"/><circle cx="298" cy="188" r="8" fill="#0c1018"/>
    <ellipse cx="230" cy="${272}" rx="${34 + m * 0.10}" ry="${mouthH}" fill="#f5c451"/>
  </g>
</svg>`;
}

function renderMascotFrames(count, envelope, dir) {
  const renders = [];
  let prev = null;
  for (let i = 0; i < count; i++) {
    const open = envelope[i] || 0;
    const bob = Math.round(Math.sin(i / 6) * 5);
    const svg = mascotSvg(open, bob);
    if (svg !== prev) {
      const r = new Resvg(svg, { fitTo: { mode: 'width', value: 460 } });
      fs.writeFileSync(path.join(dir, 'f' + String(i).padStart(4, '0') + '.png'), r.render().asPng());
      prev = svg;
    } else {
      fs.copyFileSync(path.join(dir, 'f' + String(i - 1).padStart(4, '0') + '.png'), path.join(dir, 'f' + String(i).padStart(4, '0') + '.png'));
    }
    renders.push(i);
  }
  return renders.length;
}

/* ---------- звук ---------- */
function tts(text, out) {
  const args = ['--voice', VOICE, '--rate=+8%', '--text', text, '--write-media', out];
  try { run('edge-tts', args); return; } catch (e) { console.log('CLI edge-tts не сработал, пробую python -m'); }
  run('python3', ['-m', 'edge_tts'].concat(args));
}

function envelopeFromWav(wav, frameDur, total) {
  // WAV: 16-bit PCM mono, читаем заголовок и сэмплы
  const buf = fs.readFileSync(wav);
  let off = 12, sampleRate = 8000, bits = 16, ch = 1, dataOff = 44, dataLen = buf.length - 44;
  while (off < buf.length - 8) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') { sampleRate = buf.readUInt32LE(off + 12); ch = buf.readUInt16LE(off + 10); bits = buf.readUInt16LE(off + 22); }
    if (id === 'data') { dataOff = off + 8; dataLen = size; break; }
    off += 8 + size + (size % 2);
  }
  const step = bits === 16 ? 2 : 1;
  const totalSamples = Math.floor(dataLen / (step * ch));
  const perFrame = Math.max(1, Math.floor(sampleRate * frameDur));
  const frames = Math.ceil(total / frameDur);
  const env = [];
  let peak = 1;
  const raw = [];
  for (let f = 0; f < frames; f++) {
    let sum = 0, n = 0;
    for (let i = f * perFrame; i < Math.min(totalSamples, (f + 1) * perFrame); i++) {
      const p = dataOff + i * step * ch;
      const v = bits === 16 ? buf.readInt16LE(p) / 32768 : (buf.readUInt8(p) - 128) / 128;
      sum += v * v; n++;
    }
    const rms = n ? Math.sqrt(sum / n) : 0;
    raw.push(rms);
    if (rms > peak) peak = rms;
  }
  for (const v of raw) env.push(Math.min(1, Math.pow(v / peak, 0.6) * 1.25));
  return env;
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

/* ---------- сборка ---------- */
(async () => {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP + '/frames', { recursive: true });

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
  if (picks.length < 3) throw new Error('мало скидок для ролика');
  log('скидки: ' + picks.map(p => p.title + ' −' + p.discount + '%').join(' | '));

  // 2. Голос
  const speak = (s) => s.replace(/руб\./g, 'рублей').replace(/₽/g, 'рублей').replace(/\s+/g, ' ').trim();
  const voiceText = 'Скидки в Steam на сегодня. Первая игра: ' + speak(picks[0].final) + ' вместо ' + speak(picks[0].initial) + ', скидка ' + picks[0].discount + ' процентов. ' +
    'Вторая: ' + speak(picks[1].final) + ' вместо ' + speak(picks[1].initial) + ', минус ' + picks[1].discount + ' процентов. ' +
    'Третья: ' + speak(picks[2].final) + ' вместо ' + speak(picks[2].initial) + ', тоже минус ' + picks[2].discount + '. ' +
    'Полный список — в канале Радар Скидок. И бесплатный кейс дня: три попытки каждый день.';
  log('озвучка: ' + voiceText.slice(0, 80) + '...');
  tts(voiceText, TMP + '/voice.mp3');
  const voiceDur = ffprobe(TMP + '/voice.mp3');
  log('длительность голоса: ' + voiceDur.toFixed(1) + ' с');
  ff(['-y', '-i', TMP + '/voice.mp3', '-ar', '8000', '-ac', '1', '-c:a', 'pcm_s16le', TMP + '/voice.wav']);

  // 3. Карточки
  for (const p of picks) await download('https://cdn.akamai.steamstatic.com/steam/apps/' + p.appid + '/capsule_616x353.jpg', TMP + '/img' + p.appid + '.jpg');

  const intro = 2.2, outro = 2.4;
  const cardDur = Math.max(3.2, (voiceDur - intro - outro) / 3);

  const segs = [];
  // интро
  let t1 = textFile('i1.txt', 'Скидки в Steam');
  let t2 = textFile('i2.txt', 'сегодня, в рублях');
  ff(['-y', '-f', 'lavfi', '-i', 'color=c=0x0b0e14:s=' + W + 'x' + H + ':d=' + intro + ':r=30',
    '-vf', 'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + t1 + ':fontcolor=white:fontsize=104:x=(w-text_w)/2:y=(h-text_h)/2-90:alpha=\'min(1,t/0.5)\',' +
      'drawtext=expansion=none:fontfile=' + FONT2 + ':textfile=' + t2 + ':fontcolor=0xf5c451:fontsize=58:x=(w-text_w)/2:y=(h-text_h)/2+60:alpha=\'min(1,max(0,(t-0.4)/0.5))\'',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', TMP + '/s0.mp4']);
  segs.push(TMP + '/s0.mp4');

  // карточки
  for (let i = 0; i < 3; i++) {
    const p = picks[i];
    const cap = textFile('c' + i + '.txt', p.title);
    const pr = textFile('p' + i + '.txt', p.final + ' вместо ' + p.initial);
    const dc = textFile('d' + i + '.txt', '−' + p.discount + '%');
    ff(['-y', '-loop', '1', '-i', TMP + '/img' + p.appid + '.jpg',
      '-filter_complex',
      '[0:v]scale=' + W + ':' + H + ':force_original_aspect_ratio=increase,crop=' + W + ':' + H + ',boxblur=26:7,eq=brightness=-0.3[bg];' +
      '[0:v]scale=1000:-2[fg];' +
      '[bg][fg]overlay=(W-w)/2:(H-h)/2-180:format=auto,' +
      'zoompan=z=\'min(1.06,1+0.0008*on)\':d=1:s=' + W + 'x' + H + ',format=yuv420p,' +
      'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + cap + ':fontcolor=white:fontsize=52:box=1:boxcolor=black@0.55:boxborderw=22:x=(w-text_w)/2:y=h-660:alpha=\'min(1,t/0.4)\',' +
      'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + pr + ':fontcolor=0xf5c451:fontsize=62:x=(w-text_w)/2:y=h-540:alpha=\'min(1,max(0,(t-0.3)/0.4))\',' +
      'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + dc + ':fontcolor=#ff5c5c:fontsize=96:x=(w-text_w)/2:y=h-440:alpha=\'min(1,max(0,(t-0.5)/0.5))\'',
      '-t', String(cardDur), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', TMP + '/s' + (i + 1) + '.mp4']);
    segs.push(TMP + '/s' + (i + 1) + '.mp4');
  }

  // аутро
  let o1 = textFile('o1.txt', 'Всё в канале');
  let o2 = textFile('o2.txt', '@deal_radar1');
  ff(['-y', '-f', 'lavfi', '-i', 'color=c=0x0b0e14:s=' + W + 'x' + H + ':d=' + outro + ':r=30',
    '-vf', 'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + o1 + ':fontcolor=white:fontsize=66:x=(w-text_w)/2:y=(h-text_h)/2-80,' +
      'drawtext=expansion=none:fontfile=' + FONT + ':textfile=' + o2 + ':fontcolor=0xf5c451:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2+40',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', TMP + '/s9.mp4']);
  segs.push(TMP + '/s9.mp4');

  // 4. Склейка
  const list = TMP + '/list.txt';
  fs.writeFileSync(list, segs.map(s => "file '" + s + "'").join('\n') + '\n');
  ff(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', TMP + '/main.mp4']);
  const mainDur = ffprobe(TMP + '/main.mp4');
  log('картинка: ' + mainDur.toFixed(1) + ' с');

  // 5. Кадры маскота по громкости голоса
  const env = envelopeFromWav(TMP + '/voice.wav', 1 / FPS, mainDur);
  const n = renderMascotFrames(env.length, env, TMP + '/frames');
  log('кадров маскота: ' + n);

  // 6. Финал: маскот поверх + голос
  ff(['-y', '-i', TMP + '/main.mp4', '-framerate', String(FPS), '-start_number', '0', '-i', TMP + '/frames/f%04d.png', '-i', TMP + '/voice.mp3',
    '-filter_complex', '[0:v][1:v]overlay=W-w-30:H-h-30:format=auto[v]',
    '-map', '[v]', '-map', '2:a',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', TMP + '/final.mp4']);
  const size = fs.statSync(TMP + '/final.mp4').size;
  log('готово: ' + Math.round(size / 1024) + ' КБ, ' + ffprobe(TMP + '/final.mp4').toFixed(1) + ' с');

  if (!TOKEN || !OWNER) { log('без токена: файл только на раннере'); return; }
  const r = await sendVideo(TMP + '/final.mp4', 'Новая версия: голос + живой маскот. Хэштеги: #скидкинаигры #steam #распродажа #игры');
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
