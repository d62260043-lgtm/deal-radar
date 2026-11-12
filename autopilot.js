// Используем встроенный fetch (в Node.js 18+ он есть)
const BOT_TOKEN = process.env.TELEGRAM_TOKEN; // Твое название!
const CHAT_ID = process.env.CHANNEL_ID;       // Твое название!
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

async function postToChannel(text) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.log("Ошибка: Не заданы TELEGRAM_TOKEN или CHANNEL_ID в Secrets");
        return;
    }
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: text,
                parse_mode: 'HTML',
                disable_web_page_preview: false
            })
        });
        const data = await response.json();
        if (data.ok) {
            console.log("✅ Пост успешно отправлен!");
        } else {
            console.log("❌ Ошибка Telegram: ", data.description);
        }
    } catch (e) {
        console.log("❌ Ошибка сети: ", e);
    }
}

async function main() {
    // В GitHub Actions время в UTC! 
    // МСК = UTC + 3.
    // Значит, если нам нужно 10:00 МСК, то скрипт запустится в 07:00 UTC.
    // Но так как мы запускаем скрипт каждый час, он просто проверит текущий час.
    
    const now = new Date();
    // Переводим в МСК
    const mskTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    const hour = mskTime.getHours();
    
    console.log(`Текущее время по МСК: ${hour}:00`);

    let message = "";
    
    if (hour === 10) {
        message = "🔥 <b>Доброе утро!</b>\n\nНачинаем день с отличных скидок в Steam. Загляни в наш мини-кейс — сегодня там бесплатная игра!";
    } else if (hour === 12) {
        message = "🎁 <b>Кейс дня уже доступен!</b>\n\nТри бесплатных открытия ждут тебя. Шансы: 33/33/22/10/2%. Забирай свои скидки!";
    } else if (hour === 15) {
        message = "🎮 <b>Находка дня</b>\n\nНашел отличную игру за копейки. Проверь закрепленное сообщение, чтобы забрать бесплатный кейс!";
    } else if (hour === 18) {
        message = "📊 <b>Статистика дня</b>\n\nКак прошел день? Успел забрать свои скидки? Напоминаю, что каждый 16-й кейс гарантирует скидку от 85%!";
    } else if (hour === 21) {
        message = "🌙 <b>Вечерний дайджест</b>\n\nУстал после работы? Самое время зайти в канал и забрать свои 3 бесплатных кейса. Там точно есть что-то стоящее!";
    } else {
        console.log("Не время для поста. Ждем следующего часа.");
        return;
    }

    await postToChannel(message);
}

main();
