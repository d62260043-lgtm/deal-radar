import os
import json
import urllib.request
import datetime
import time

# --- НАСТРОЙКИ ---
STEAM_API_URL = "https://store.steampowered.com/api/featuredcategories?cc=ru&l=russian"
MEMORY_FILE = "used_games.json"
DAYS_TO_REMEMBER = 14

def load_memory():
    """Загружает память о том, какие игры уже были."""
    if os.path.exists(MEMORY_FILE):
        with open(MEMORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_memory(memory):
    """Сохраняет память в файл."""
    with open(MEMORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(memory, f, ensure_ascii=False, indent=2)

def get_steam_deals():
    """Получает список скидок из Steam."""
    print("Запрашиваю скидки в Steam...")
    try:
        req = urllib.request.Request(STEAM_API_URL, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data.get('specials', {}).get('items', [])
    except Exception as e:
        print(f"Ошибка Steam API: {e}")
        return []

def find_new_game(deals, memory):
    """Ищет игру, которой нет в памяти."""
    # Очищаем старые записи (старше 14 дней)
    today = datetime.date.today()
    clean_memory = {}
    for app_id, date_str in memory.items():
        game_date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
        if (today - game_date).days < DAYS_TO_REMEMBER:
            clean_memory[app_id] = date_str
    memory.clear()
    memory.update(clean_memory)

    for game in deals:
        app_id = str(game.get('id'))
        if app_id not in memory:
            return game, app_id
    return None, None

def main():
    memory = load_memory()
    deals = get_steam_deals()
    
    if not deals:
        print("Скидок не найдено или ошибка API.")
        return

    game, app_id = find_new_game(deals, memory)
    
    if game:
        print(f"Выбрана новая игра: {game.get('name')} (ID: {app_id})")
        
        # --- ЗДЕСЬ БУДЕТ ГЕНЕРАЦИЯ ВИДЕО ---
        # Пока просто выводим текст
        print(f"Генерирую видео для: {game.get('name')} со скидкой {game.get('discount_percent')}%")
        
        # Запоминаем игру
        memory[app_id] = datetime.date.today().strftime("%Y-%m-%d")
        save_memory(memory)
        print("Память обновлена.")
        
    else:
        print("Все свежие скидки уже были в видео. Ждем новых.")

if __name__ == "__main__":
    main()
