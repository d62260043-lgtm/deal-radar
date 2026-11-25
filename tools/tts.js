const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const VOICE = process.env.TTS_VOICE || 'ru-RU-DmitryNeural';
const RATE = process.env.TTS_RATE || '+5%';

async function tts(text, tmp, outWav) {
  const mp3 = path.join(tmp, 'tts_' + Date.now() + '.mp3');
  let lastErr = null;

    for (let attempt = 1; attempt <= 5; attempt++) {
    const r = spawnSync('edge-tts', [
      '--voice', VOICE,
      '--rate', RATE,
      '--text', text,
      '--write-media', mp3
    ], { encoding: 'utf8' });

    if (r.status === 0 && fs.existsSync(mp3) && fs.statSync(mp3).size > 1000) {
      const r2 = spawnSync('ffmpeg', ['-y', '-i', mp3, '-ar', '44100', '-ac', '1', outWav], { encoding: 'utf8' });
      if (r2.status === 0) {
        console.log('голос: Edge-TTS (' + VOICE + ')');
        return outWav;
      }
    }

    lastErr = String(r.stderr || '').slice(-200);
    console.warn('[WARN] edge-tts попытка ' + attempt + '/5 не удалась, пауза 5с...');
    await new Promise(res => setTimeout(res, 5000));
  }

  throw new Error('edge-tts не ответил после 5 попыток: ' + lastErr);
}

module.exports = { tts };
