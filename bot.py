import os
import json
import urllib.request
import urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer

# Настройки
BOT_TOKEN = os.environ.get("ROCKET_BOT_TOKEN")
ALTROUTER_KEY = os.environ.get("ALTROUTER_KEY")
API_URL = "https://api.altrouter.ai/v1/chat/completions"

class TelegramHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Получаем данные от Telegram
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        update = json.loads(post_data.decode('utf-8'))

        if "message" in update and "text" in update["message"]:
            chat_id = update["message"]["chat"]["id"]
            user_text = update["message"]["text"]
            
            # Отправляем "печатает..." (опционально)
            send_telegram_message(chat_id, "Думаю...")

            # Запрос к AltRouter
            reply = ask_ai(user_text)
            
            # Отправляем ответ
            send_telegram_message(chat_id, reply)

        self.send_response(200)
        self.end_headers()

def ask_ai(text):
    payload = {
        "model": "gemini-3.1-pro",
        "messages": [
            {"role": "system", "content": "Ты — ROCKET, ИИ-продюсер Telegram-канала 'Радар Скидок'. Отвечай кратко, по делу."},
            {"role": "user", "content": text}
        ],
        "max_tokens": 1024
    }
    
    req = urllib.request.Request(API_URL, data=json.dumps(payload).encode('utf-8'))
    req.add_header('Authorization', f'Bearer {ALTROUTER_KEY}')
    req.add_header('Content-Type', 'application/json')
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"Ошибка ИИ: {e}"

def send_telegram_message(chat_id, text):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": text}
    
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'))
    req.add_header('Content-Type', 'application/json')
    
    try:
        urllib.request.urlopen(req)
    except Exception as e:
        print(f"Ошибка Telegram: {e}")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(('0.0.0.0', port), TelegramHandler)
    print(f"Сервер запущен на порту {port}")
    server.serve_forever()
