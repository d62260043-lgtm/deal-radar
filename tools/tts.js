// Голос: сначала Silero (живой), при неудаче — Piper (запасной).
const fs = require('fs');
const { spawnSync } = require('child_process');

const PIPER_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium';

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, Object.assign({ encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 }, opts || {}));
  if (r.status !== 0) {
    console.log('CMD: ' + cmd + ' ' + args.join(' '));
    console.log('STDERR:\n' + String(r.stderr || '').slice(-2000));
    throw new Error(cmd + ' fail');
  }
  return r;
}

function download(url, dest, min) {
  const m = min || 10000;
  if (fs.existsSync(dest) && fs.statSync(dest).size >= m) return dest;
  run('curl', ['-sL', '--max-time', '300', '-o', dest, url]);
  const size = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
  if (size < m) throw new Error('не скачался ' + url);
  return dest;
}

function silero(text, tmp, outWav) {
  const f = tmp + '/silero_say.txt';
  fs.writeFileSync(f, text);
  run('python3', [__dirname + '/tts_silero.py', f, outWav]);
  if (!fs.existsSync(outWav) || fs.statSync(outWav).size < 5000) throw new Error('silero пусто');
}

function piper(text, tmp, outWav) {
  const model = download(PIPER_BASE + '.onnx', tmp + '/dmitri.onnx');
  download(PIPER_BASE + '.onnx.json', tmp + '/dmitri.onnx.json', 200);
  fs.writeFileSync(tmp + '/say.txt', text);
  run('piper', ['--model', model, '--length_scale', '1.1', '--output_file', tmp + '/raw.wav'], { input: fs.readFileSync(tmp + '/say.txt') });
  run('ffmpeg', ['-y', '-i', tmp + '/raw.wav', '-af', 'asetrate=22050*0.94,aresample=22050,atempo=1.064', '-ar', '22050', '-ac', '1', outWav]);
}

// Единая точка: живой голос, при неудаче — запасной
function tts(text, tmp, outWav) {
  try {
    silero(text, tmp, outWav);
    console.log('голос: Silero (' + (process.env.TTS_SPEAKER || 'aidar') + ')');
    return;
  } catch (e) {
    console.log('Silero не получился (' + e.message + '), беру Piper');
  }
  piper(text, tmp, outWav);
  console.log('голос: Piper dmitri');
}

module.exports = { tts };
