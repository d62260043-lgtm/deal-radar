import os
import json
import urllib.request
import traceback
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
                text = body["message"]["text"].strip().lower()
                send_message(f"Получил команду: {text}")
                
                if text == "/post":
                    res = trigger_action("autopilot.yml")
                    send_message(f"Результат: {res}" if res is True else str(res))
                elif text == "/video":
                    res = trigger_action("video.yml")
                    send_message(f"Результат: {res}" if res is True else str(res))
                else:
                    send_message("Я жив! Доступные команды: /post, /video")
        except Exception as e:
            error_text = f"ОШИБКА: {traceback.format_exc()}"
            print(error_text)
            send_message(error_text[:4000]) # Отправляем ошибку тебе в ТГ
            
        self.send_response(200)
        self.end_headers()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(('0.0.0.0', port), Handler)
    print(f"ROCKET слушает порт {port}...")
    server.serve_forever()
