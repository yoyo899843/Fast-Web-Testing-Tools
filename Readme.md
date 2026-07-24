# Fast Web Testing Tools

本機用的 Web 資產檢測管理平台。FastAPI 後端(跑在 Kali Linux base image 上,內建 sqlmap/dirsearch/gitleaks/wpscan/git-dumper)+ 獨立 React 前端,Docker Compose 部署,僅監聽 `127.0.0.1`,不對外公開。

## 執行

```bash
docker compose up --build
```

- 前端:http://127.0.0.1:5173
- 後端 API 文件:http://127.0.0.1:8000/docs

## 目前功能(MVP)

1. **URL 匯入**:貼上多行 URL 或上傳 `.txt`/`.csv`,自動去除空白、驗證格式、正規化並去重,顯示總筆數/有效/重複/無效統計與逐列錯誤原因。
2. **存活檢測**:從資產清冊勾選 URL,設定併發數/逾時/重試/每秒請求上限,即時看進度與 log(WebSocket),完成後可篩「存活」並匯出。
3. **Container Shell**:前端內建一個連到後端 app container 內部的互動終端機(xterm.js + WebSocket + PTY),可以直接下 dirsearch/gitleaks/sqlmap/wpscan/git-dumper 等指令。

## 安全注意事項

- **`docker-compose.yml` 裡兩個服務都只綁 `127.0.0.1`,絕對不要把這個 port mapping 改成 `0.0.0.0` 或對外暴露**——`/ws/terminal` 端點等於是這個 container 的無認證 root shell,只有「只能從本機連」這件事在擋著它。
- 後端 uvicorn 一定要維持 `--workers 1`(已寫在 `Backend/Dockerfile` 的 CMD 裡):背景任務的進度/log 廣播是 process 內的記憶體狀態,多 worker 會導致「job 開始了但前端收不到即時 log」。

## 架構

- 背景任務(存活檢測等)用 in-process asyncio(`asyncio.create_task` + `Semaphore` + `aiolimiter`),搭配 SQLite 逐筆落地進度與結果,不是只存在記憶體裡,瀏覽器重整後查 DB 一樣看得到正確狀態。
- 之後要加新的檢測模組(例如 dirsearch/gitleaks scan)時,只需要在 `Backend/app/services/job_handlers/` 底下新增一個檔案並用 `@register_job_handler("類型名")` 註冊即可,`jobs`/`job_logs` 表、WebSocket 串流端點都不用改。

## 目錄結構

```
Backend/    FastAPI 後端(SQLite + job engine + 各檢測模組)
Frontend/   React 前端(Vite)
```
