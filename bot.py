import os
import json
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

BOT_TOKEN = os.environ.get("ROCKET_BOT_TOKEN")
OWNER_ID = os.environ.get("OWNER_CHAT_ID")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
REPO = "d62260043-lgtm/deal-radar"

def send_message(text):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = json.dumps({"chat_id": OWNER_ID, "text": text}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req)
        print(f"Сообщение отправлено: {text}")
    except Exception as e:
        print(f"Ошибка отправки в ТГ: {e}")

def trigger_action(workflow):
    url = f"https://api.github.com/repos/{REPO}/actions/workflows/{workflow}/dispatches"
    data = {"ref": "main"}
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), method="POST")
    req.add_header("Authorization", f"token {GITHUB_TOKEN}")
    req.add_header("Accept", "application/vnd.github.v3+json")
    try:
        urllib.request.urlopen(req)
        print(f"GitHub Action {workflow} успешно запущен!")
        return True
    except Exception as e:
        print(f"Ошибка запуска GitHub Action: {e}")
        return False

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length == 0:
                self.send_response(200)
                self.end_headers()
                return
                
            body = json.loads(self.rfile.read(length).decode('utf-8'))
            print(f"Получен запрос от Telegram: {body}")
            
            if "message" in body and "text" in body["message"]:
                text = body["message"]["text"].strip().lower()
                
                if text == "/post":
                    send_message("Запускаю пост в канал...")
                    trigger_action("autopilot.yml")
                elif text == "/video":
                    send_message("Запускаю генерацию видео...")
                    trigger_action("video.yml")
                else:
                    send_message("Я ROCKET. Доступные команды:\n/post - сделать пост\n/video - сделать видео")
        except Exception as e:
            print(f"Ошибка обработки: {e}")
        
        self.send_response(200)
        self.end_headers()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(('0.0.0.0', port), Handler)
    print(f"ROCKET слушает порт {port}...")
    server.serve_forever()
