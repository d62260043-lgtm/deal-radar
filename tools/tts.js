async function tts(text, tmp, outWav) {
  const mp3 = path.join(tmp, 'tts_' + Date.now() + '.mp3');
  let lastErr = null;

  // Пробуем 3 раза, потому что Microsoft иногда просто не отвечает
  for (let attempt = 1; attempt <= 3; attempt++) {
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
    console.warn('[WARN] edge-tts попытка ' + attempt + ' не удалась, пробую еще...');
    // Ждем 2 секунды перед следующей попыткой
    await new Promise(res => setTimeout(res, 2000));
  }

  throw new Error('edge-tts не ответил после 3 попыток: ' + lastErr);
}
