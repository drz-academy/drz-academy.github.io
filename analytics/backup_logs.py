import os
import json
import urllib.request
import urllib.parse

WORKER_URL = "https://drz-academy-visitor-log.drz-academy.workers.dev/logs-export"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HISTORY_FILE = os.path.join(SCRIPT_DIR, "historical-logs.json")
CURSOR_FILE = os.path.join(SCRIPT_DIR, "cursor.txt")

def main():
    token = os.environ.get("LOG_READ_TOKEN")
    if not token:
        print("Error: LOG_READ_TOKEN no está definido en el entorno.")
        return

    historical_logs = []
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                historical_logs = json.load(f)
            print(f"Cargados {len(historical_logs)} registros desde {HISTORY_FILE}")
        except Exception as e:
            print(f"Error al leer {HISTORY_FILE}: {e}")
            historical_logs = []

    existing_ids = {log["id"] for log in historical_logs if "id" in log}

    cursor = None
    if os.path.exists(CURSOR_FILE):
        with open(CURSOR_FILE, "r", encoding="utf-8") as f:
            cursor = f.read().strip()

    new_logs_fetched = 0
    
    while True:
        url = f"{WORKER_URL}?token={urllib.parse.quote(token)}"
        if cursor:
            url += f"&cursor={urllib.parse.quote(cursor)}"
            
        print(f"Obteniendo registros... cursor: {cursor[:10] if cursor else 'None'}")
        
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        try:
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode("utf-8"))
        except Exception as e:
            print(f"Error al conectar con el worker: {e}")
            break
            
        if not data.get("ok"):
            print(f"Worker retornó error: {data.get('error')} - {data.get('message', '')}")
            break
            
        logs = data.get("logs", [])
        
        for log in logs:
            if "id" in log and log["id"] not in existing_ids:
                historical_logs.append(log)
                existing_ids.add(log["id"])
                new_logs_fetched += 1
                
        cursor = data.get("cursor")
        list_complete = data.get("list_complete", True)
        
        if list_complete or not cursor:
            print("Se ha llegado al final de la lista.")
            break
            
    print(f"Se obtuvieron {new_logs_fetched} registros nuevos.")
    
    if new_logs_fetched > 0:
        historical_logs.sort(key=lambda x: str(x.get("timestampServer", "")), reverse=True)
        
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(historical_logs, f, ensure_ascii=False, indent=2)
            
        if cursor:
            with open(CURSOR_FILE, "w", encoding="utf-8") as f:
                f.write(cursor)

if __name__ == "__main__":
    main()
