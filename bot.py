import os
import json
import urllib.request
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer

BOT_TOKEN = os.environ.get("ROCKET_BOT_TOKEN")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
REPO = "d62260043-lgtm/deal-radar"

def send_message(chat_id, text, reply_markup=None):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req)
    except Exception as e:
        print(f"Ошибка отправки ТГ: {e}")

def trigger_action(workflow):
    url = f"https://api.github.com/repos/{REPO}/actions/workflows/{workflow}/dispatches"
    data = {"ref": "main"}
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), method="POST")
    req.add_header("Authorization", f"token {GITHUB_TOKEN}")
    req.add_header("Accept", "application/vnd.github.v3+json")
    try:
        urllib.request.urlopen(req)
        return True
    except Exception as e:
        return f"Ошибка GitHub: {e}"

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length).decode('utf-8'))
            
            if "message" in body and "text" in body["message"]:
                chat_id = body["message"]["chat"]["id"] # Берем ID из сообщения!
                text = body["message"]["text"].strip().lower()
                
                # Кнопки меню
                keyboard = {
                    "keyboard": [
                        [{"text": "🎬 Сделать видео"}, {"text": "📝 Сделать пост"}]
                    ],
                    "resize_keyboard": True
                }

                if text in ["/start", "привет"]:
                    send_message(chat_id, "Я ROCKET. Управляю каналом 24/7. Выбери действие:", keyboard)
                
                elif text == "/video" or text == "🎬 сделать видео":
                    send_message(chat_id, "Запускаю генерацию видео...")
                    res = trigger_action("video.yml")
                    if res is True:
                        send_message(chat_id, "✅ Сборка видео запущена. Ожидай в личке.")
                    else:
                        send_message(chat_id, f"❌ {res}")
                
                elif text == "/post" or text == "📝 сделать пост":
                    send_message(chat_id, "Запускаю пост в канал...")
                    res = trigger_action("autopilot.yml")
                    if res is True:
                        send_message(chat_id, "✅ Пост отправлен в GitHub. Скоро появится.")
                    else:
                        send_message(chat_id, f"❌ {res}")
                
                else:
                    send_message(chat_id, "Неизвестная команда. Используй кнопки ниже.", keyboard)
                    
        except Exception as e:
            error_text = f"ОШИБКА: {traceback.format_exc()}"
            print(error_text)
            # Если что-то упало, пробуем отправить ошибку в чат
            try:
                if "chat_id" in locals():
                    send_message(chat_id, error_text[:4000])
            except:
                pass
            
        self.send_response(200)
        self.end_headers()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(('0.0.0.0', port), Handler)
    print(f"ROCKET слушает порт {port}...")
    server.serve_forever()
