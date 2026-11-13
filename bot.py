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
    urllib.request.urlopen(req)

def trigger_action(workflow, inputs=None):
    url = f"https://api.github.com/repos/{REPO}/actions/workflows/{workflow}/dispatches"
    data = {"ref": "main"}
    if inputs: data["inputs"] = inputs
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), method="POST")
    req.add_header("Authorization", f"token {GITHUB_TOKEN}")
    req.add_header("Accept", "application/vnd.github.v3+json")
    try:
        urllib.request.urlopen(req)
        return True
    except Exception as e:
        print(e)
        return False

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers['Content-Length'])
            body = json.loads(self.rfile.read(length).decode('utf-8'))
            
            if "message" in body and "text" in body["message"]:
                text = body["message"]["text"]
                chat_id = body["message"]["chat"]["id"]
                
                if text == "/post":
                    send_message("Запускаю пост в канал...")
                    if trigger_action("autopilot.yml"):
                        send_message("Команда отправлена в GitHub. Пост скоро появится.")
                    else:
                        send_message("Ошибка GitHub.")
                
                elif text == "/video":
                    send_message("Запускаю генерацию видео...")
                    if trigger_action("video.yml"):
                        send_message("Сборка видео запущена. Ожидай в личке.")
                
                else:
                    send_message("Доступные команды:\n/post - сделать пост\n/video - сделать видео")
        except Exception as e:
            print(e)
        
        self.send_response(200)
        self.end_headers()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(('0.0.0.0', port), Handler)
    print("ROCKET Webhook слушает порт", port)
    server.serve_forever()
