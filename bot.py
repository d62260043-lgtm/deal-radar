import os
import json
import urllib.request
import base64
from http.server import BaseHTTPRequestHandler, HTTPServer

# Переменные окружения (берутся из Render)
BOT_TOKEN = os.environ.get("ROCKET_BOT_TOKEN")
ALTROUTER_KEY = os.environ.get("ALTROUTER_KEY")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
REPO = "d62260043-lgtm/deal-radar"

API_URL = "https://api.altrouter.ai/v1/chat/completions"

def ask_ai(text):
    system_prompt = """Ты — ROCKET, продвинутый ИИ-агент и разработчик проекта 'Радар Скидок'. 
Ты управляешь GitHub репозиторием. Если пользователь просит что-то сделать (прочитать файл, изменить код, запустить видео), ты ДОЛЖЕН вернуть ТОЛЬКО JSON с командой.
Доступные команды:
1. Читать файл: {"command": "read_file", "path": "autopilot.js"}
2. Обновить файл: {"command": "update_file", "path": "autopilot.js", "content": "новый код", "message": "коммит"}
3. Запустить Action: {"command": "run_workflow", "workflow_id": "video.yml"}

Если пользователь просто болтает, отвечай обычным текстом без JSON.
"""
    
    payload = {
        "model": "gemini-3.1-pro",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text}
        ],
        "max_tokens": 2048
    }
    
    req = urllib.request.Request(API_URL, data=json.dumps(payload).encode('utf-8'))
    req.add_header('Authorization', f'Bearer {ALTROUTER_KEY}')
    req.add_header('Content-Type', 'application/json')
    
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            data = json.loads(response.read().decode('utf-8'))
            return data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"Ошибка ИИ: {e}"

def github_api_request(endpoint, method="GET", data=None):
    url = f"https://api.github.com/repos/{REPO}/{endpoint}"
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"token {GITHUB_TOKEN}")
    req.add_header("Accept", "application/vnd.github.v3+json")
    
    if data:
        req.data = json.dumps(data).encode('utf-8')
        req.add_header("Content-Type", "application/json")
        
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        return {"error": str(e)}

def execute_command(cmd_json):
    cmd = cmd_json.get("command")
    
    if cmd == "read_file":
        res = github_api_request(f"contents/{cmd_json['path']}")
        if "content" in res:
            return base64.b64decode(res["content"]).decode('utf-8')
        return "Файл не найден."
        
    elif cmd == "update_file":
        res = github_api_request(f"contents/{cmd_json['path']}")
        sha = res.get("sha") if "sha" in res else None
        
        content_b64 = base64.b64encode(cmd_json["content"].encode('utf-8')).decode('utf-8')
        
        data = {
            "message": cmd_json.get("message", "Update via ROCKET"),
            "content": content_b64
        }
        if sha:
            data["sha"] = sha
            
        github_api_request(f"contents/{cmd_json['path']}", method="PUT", data=data)
        return f"Файл {cmd_json['path']} успешно обновлен."
        
    elif cmd == "run_workflow":
        data = {"ref": "main"}
        github_api_request(f"actions/workflows/{cmd_json['workflow_id']}/dispatches", method="POST", data=data)
        return f"Воркфлоу {cmd_json['workflow_id']} запущен."

    return "Неизвестная команда."

def send_telegram_message(chat_id, text):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    payload = {"chat_id": chat_id, "text": text}
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'))
    req.add_header('Content-Type', 'application/json')
    urllib.request.urlopen(req)

class TelegramHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        update = json.loads(post_data.decode('utf-8'))

        if "message" in update and "text" in update["message"]:
            chat_id = update["message"]["chat"]["id"]
            user_text = update["message"]["text"]
            
            send_telegram_message(chat_id, "Думаю...")
            reply = ask_ai(user_text)
            
            # Пытаемся найти JSON команду в ответе
            try:
                start = reply.find('{')
                end = reply.rfind('}')
                if start != -1 and end != -1:
                    cmd_json = json.loads(reply[start:end+1])
                    if "command" in cmd_json:
                        result = execute_command(cmd_json)
                        send_telegram_message(chat_id, f"Выполнено: {result}")
                        self.send_response(200)
                        self.end_headers()
                        return
            except:
                pass
            
            send_telegram_message(chat_id, reply)

        self.send_response(200)
        self.end_headers()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(('0.0.0.0', port), TelegramHandler)
    print(f"Сервер запущен на порту {port}")
    server.serve_forever()
