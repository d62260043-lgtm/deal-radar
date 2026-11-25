cat > tools/tts.js << 'EOF'
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const VOICE = process.env.TTS_VOICE || 'ru-RU-SvetlanaNeural';
const RATE = process.env.TTS_RATE || '+5%';

async function tts(text, tmp, outWav) {
  const mp3 = path.join(tmp, 'tts_' + Date.now() + '.mp3');

  const r = spawnSync('edge-tts', [
    '--voice', VOICE,
    '--rate', RATE,
    '--text', text,
    '--write-media', mp3
  ], { encoding: 'utf8' });

  if (r.status !== 0) throw new Error('edge-tts fail: ' + String(r.stderr || '').slice(-500));
  if (!fs.existsSync(mp3) || fs.statSync(mp3).size < 1000) throw new Error('edge-tts пусто');

  const r2 = spawnSync('ffmpeg', ['-y', '-i', mp3, '-ar', '44100', '-ac', '1', outWav], { encoding: 'utf8' });
  if (r2.status !== 0) throw new Error('ffmpeg fail: ' + String(r2.stderr || '').slice(-500));

  console.log('голос: Edge-TTS (' + VOICE + ')');
  return outWav;
}

module.exports = { tts };
EOF
