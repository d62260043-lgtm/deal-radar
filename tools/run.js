// Диспетчер: по расписанию или по ручному запуску выбирает режим.
const { digest } = require('./digest');
const { stats } = require('./stats');

const BY_CRON = {
  '0 7 * * *': 'morning',   // 10:00 МСК
  '0 12 * * *': 'noon',     // 15:00 МСК
  '0 15 * * *': 'stats',    // 18:00 МСК
  '0 18 * * *': 'evening',  // 21:00 МСК
};

(async () => {
  const mode = (process.env.INPUT_MODE || '').trim() || BY_CRON[(process.env.SCHEDULE || '').trim()] || '';
  console.log('mode=' + (mode || 'не определён'));
  if (mode === 'stats') await stats();
  else if (mode) await digest(mode);
  else { console.error('Неизвестный режим: SCHEDULE=' + process.env.SCHEDULE); process.exit(1); }
})().catch(e => { console.error('ERR ' + e.message); process.exit(1); });
