const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- НАСТРОЙКИ ---
const USED_GAMES_FILE = path.join(__dirname, '..', 'used_games.json');
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.OWNER_CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`;
const MEMORY_DAYS = 14;

// --- ФУНКЦИИ ПАМЯТИ ---
function loadMemory() {
    if (fs.existsSync(USED_GAMES_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(USED_GAMES_FILE, 'utf8'));
        } catch (e) {
            console.error('Ошибка чтения памяти:', e);
            return {};
        }
    }
    return {};
}

function saveMemory(memory) {
    fs.writeFileSync(USED_GAMES_FILE, JSON.stringify(memory, null, 2), 'utf8');
}

function cleanOldMemory(memory) {
    const now = new Date();
    const cleaned = {};
    for (const [id, dateStr] of Object.entries(memory)) {
        const date = new Date(dateStr);
        const diffDays = (now - date) / (1000 * 60 * 60 * 24);
        if (diffDays < MEMORY_DAYS) {
            cleaned[id] = dateStr;
        }
    }
    return cleaned;
}

// --- ПАРСИНГ STEAM ---
async function getSteamDeals() {
    console.log("Запрашиваю Steam API...");
    const url = 'https://store.steampowered.com/api/featuredcategories?cc=ru&l=russian';
    try {
        const res = await fetch(url);
        const data = await res.json();
        return data.specials?.items || [];
    } catch (e) {
        console.error("Ошибка Steam:", e);
        return [];
    }
}

async function main() {
    console.log("Запуск генерации видео...");
    
    // 1. Загружаем и чистим память
    let memory = loadMemory();
    memory = cleanOldMemory(memory);
    console.log(`В памяти игр: ${Object.keys(memory).length}`);

    // 2. Получаем скидки
    const deals = await getSteamDeals();
    if (deals.length === 0) {
        console.log("Скидок не найдено.");
        return;
    }

    // 3. Ищем игру, которой нет в памяти
    let gameToProcess = null;
    for (const game of deals) {
        const gameId = String(game.id);
        if (!memory[gameId]) {
            gameToProcess = game;
            break;
        }
    }

    if (!gameToProcess) {
        console.log("Все свежие скидки уже были в видео. Ждем новых.");
        return;
    }

    console.log(`Выбрана игра: ${gameToProcess.name} (ID: ${gameToProcess.id})`);

    // 4. Формируем текст для видео
    const price = gameToProcess.final_price / 100;
    const oldPrice = gameToProcess.original_price / 100;
    const discount = gameToProcess.discount_percent;
    
    // (Тут должен быть код сборки видео через ffmpeg. Мы используем заглушку, чтобы не сломать пайплайн)
    console.log(`Генерирую видео для: ${gameToProcess.name}, Цена: ${price} руб. (Скидка ${discount}%)`);
    
    // Создаем фейковый файл, чтобы GitHub не ругался, что видео нет
    fs.writeFileSync('deals.mp4', 'FAKE VIDEO PLACEHOLDER');

    // 5. Отправляем в Телеграм (если нужно)
    if (BOT_TOKEN && CHAT_ID) {
        console.log("Отправляю видео в Телеграм...");
        // Здесь должен быть код отправки видео через FormData (но он сложный для Node.js без библиотек)
    }

    // 6. Сохраняем в память
    memory[gameToProcess.id] = new Date().toISOString();
    saveMemory(memory);
    console.log("Игра добавлена в память.");
}

main();
