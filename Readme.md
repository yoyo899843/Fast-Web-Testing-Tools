# Fast Web Testing Tools

用來快速匯入資產列表來批量做 dirsearch, git-dump 等工具的 **懶人包**

~~純粹只是我打教育體系懶得一個一個跑~~

### 限用於授權環境，禁止使用此工具進行違法用途

## 執行

```bash
docker compose up --build -d
```

**注意：此環境因為授予 root shell，對外開放**
- 前端:http://127.0.0.1:8081
- 後端 API 文件:http://127.0.0.1:8001/docs

## 目前功能(MVP)

1. **URL 匯入**:貼上多行 URL 或上傳 `.txt`/`.csv`,自動去除空白、驗證格式、正規化並去重,顯示總筆數/有效/重複/無效統計與逐列錯誤原因。
2. **存活檢測**:從資產清冊勾選 URL,設定併發數/逾時/重試/每秒請求上限,即時看進度與 log(WebSocket),完成後可篩「存活」並匯出。
3. **Container Shell**:前端內建一個連到後端 app container 內部的互動終端機(xterm.js + WebSocket + PTY),可以直接下 dirsearch/gitleaks/sqlmap/wpscan/git-dumper 等指令。

## 安全注意事項

- **`docker-compose.yml` 裡兩個服務都只綁 `127.0.0.1`,絕對不要把這個 port mapping 改成 `0.0.0.0` 或對外暴露**——`/ws/terminal` 端點等於是這個 container 的無認證 root shell,只有「只能從本機連」這件事在擋著它。
- 後端 uvicorn 一定要維持 `--workers 1`(已寫在 `Backend/Dockerfile` 的 CMD 裡):背景任務的進度/log 廣播是 process 內的記憶體狀態,多 worker 會導致「job 開始了但前端收不到即時 log」。