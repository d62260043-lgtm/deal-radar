const fs = require('fs');
const https = require('https');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'cases.json');

function getJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function main() {
    console.log('Обновляю кейсы...');
    
    // 1. Берем скидки из Steam
    const feed = await getJson('https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1&sortBy=Deal%20Rating&pageSize=60');
    
    const deals = [];
    for (const d of feed) {
        if (deals.length >= 24) break;
        if (!d.steamAppID || Number(d.savings) < 25) continue;
        
        try {
            const details = await getJson(`https://store.steampowered.com/api/appdetails?appids=${d.steamAppID}&cc=ru&l=russian&filters=price_overview`);
            const data = details[d.steamAppID]?.data;
            const p = data?.price_overview;
            
            if (p && p.final) {
                deals.push({
                    appid: d.steamAppID,
                    title: d.title,
                    photo: `https://cdn.akamai.steamstatic.com/steam/apps/${d.steamAppID}/capsule_616x353.jpg`,
                    final: p.final_formatted || `${(p.final / 100).toFixed(0)} руб.`,
                    initial: p.initial_formatted || `${(p.initial / 100).toFixed(0)} руб.`,
                    discount: p.discount_percent,
                    rating: d.steamRatingPercent || 0,
                    url: `https://store.steampowered.com/app/${d.steamAppID}/`
                });
            }
        } catch (e) {
            // пропускаем ошибку
        }
    }
    
    // 2. Бесплатные игры (F2P)
    const F2P = [
        { appid: 730, title: 'Counter-Strike 2' },
        { appid: 570, title: 'Dota 2' },
        { appid: 440, title: 'Team Fortress 2' },
        { appid: 1172470, title: 'Apex Legends' },
        { appid: 230410, title: 'Warframe' },
        { appid: 238960, title: 'Path of Exile' },
        { appid: 304930, title: 'Unturned' },
        { appid: 1085660, title: 'Destiny 2' },
        { appid: 236390, title: 'War Thunder' },
        { appid: 444090, title: 'Paladins' },
    ];
    
    const free = F2P.map(g => ({
        appid: g.appid,
        title: g.title,
        photo: `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/capsule_616x353.jpg`,
        final: 'бесплатно',
        initial: '',
        discount: 100,
        rating: 0,
        free: true,
        url: `https://store.steampowered.com/app/${g.appid}/`
    }));
    
    // 3. Сохраняем
    const output = {
        updated: new Date().toISOString(),
        items: deals,
        free: free,
        counts: { deals: deals.length, free: free.length }
    };
    
    fs.writeFileSync(OUT, JSON.stringify(output, null, 1));
    console.log(`Готово! Скидок: ${deals.length}, бесплатных: ${free.length}`);
}

main().catch(console.error);
