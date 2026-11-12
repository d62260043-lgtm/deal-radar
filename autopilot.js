const BOT_TOKEN = process.env.TELEGRAM_TOKEN; 
const CHAT_ID = process.env.CHANNEL_ID;       
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

// Память (какие игры уже постили). В идеале её нужно хранить в файле, но для простоты мы просто берем рандом.
// В будущем мы научим его сохранять историю в файл state.json.

async function getRandomGame() {
    // Ищем скидки в Steam через открытый API
    const url = 'https://store.steampowered.com/api/featuredcategories?cc=ru&l=russian';
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        // Берем список игр со скидками
        const specials = data.specials.items;
        if (!specials || specials.length === 0) return null;

        // Выбираем случайную игру из тех, что со скидкой
        const randomGame = specials[Math.floor(Math.random() * specials.length)];
        
        return {
            name: randomGame.name,
            discount: randomGame.discount_percent,
            original_price: randomGame.original_price / 100, // API отдает в копейках
            final_price: randomGame.final_price / 100,
            url: `https://store.steampowered.com/app/${randomGame.id}`
        };
    } catch (e) {
        console.log("Ошибка парсинга Steam: ", e);
        return null;
    }
}

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
        if (data.ok) console.log("✅ Пост успешно отправлен!");
        else console.log("❌ Ошибка Telegram: ", data.description);
    } catch (e) {
        console.log("❌ Ошибка сети: ", e);
    }
}

async function main() {
    const now = new Date();
    const mskTime = new Date(now.getTime() + (3 * 60 * 60 * 1000));
    const hour = mskTime.getHours();
    
    console.log(`Текущее время по МСК: ${hour}:00`);

    let message = "";
    
    // Если это время для поста
    if ([10, 12, 15, 18, 21].includes(hour)) {
        console.log("Время для поста! Ищу игру...");
        const game = await getRandomGame();
        
        if (game) {
            message = `🔥 <b>Скидка дня в Steam!</b>\n\n`;
            message += `🎮 <b>${game.name}</b>\n`;
            message += `💰 Цена: <s>${game.original_price} ₽</s> <b>${game.final_price} ₽</b> (-${game.discount}%)\n\n`;
            message += `👉 <a href="${game.url}">Купить в Steam</a>\n\n`;
            message += `А еще у нас есть бесплатный кейс дня! Заходи в мини-приложение.`;
        } else {
            message = "Не удалось найти скидки. Проверьте логи.";
        }
        
        await postToChannel(message);
    } else {
        console.log("Не время для поста. Ждем следующего часа.");
        return;
    }
}

main();
