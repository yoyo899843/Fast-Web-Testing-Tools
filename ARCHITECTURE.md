# Fast Web Testing Tools — 架構總覽

於 Kali Linux 上執行資安檢測腳本，加速滲透測試 / 弱點掃描的作業效率。本文件整理目前程式碼的實際架構與工作流，供之後新增工具或除錯時參考。

## 1. 部署拓樸

```
docker-compose.yml
├── backend   (kalilinux/kali-rolling + FastAPI, uvicorn --workers 1)
│     127.0.0.1:8001 -> 8000
│     volume: fwtt_data:/data  (SQLite DB + git-dump 掉落的檔案)
└── frontend  (node:20-alpine + Vite dev server)
      127.0.0.1:8081 -> 8081
```

- Backend image 內建 CLI 工具：`sqlmap`、`dirsearch`、`gitleaks`、`wpscan`、`whatweb`、`git-dumper`。
- **`uvicorn` 被鎖死 `--workers 1`**：`job_engine.JOB_REGISTRY`（執行中 job 的記憶體索引）與 `job_broadcast` 的 WebSocket 訂閱清單都是 process-內狀態，多 worker 會讓取消功能與即時推播失效。
- 兩個 port 都只 bind `127.0.0.1`，屬於本機/內網工具，未做身分驗證（`terminal.py` 的 `/ws/terminal` 也因此直接開 root shell，僅用連線數上限 5 做軟性防護）。
- backend 設了 `extra_hosts: host.docker.internal:host-gateway`：job 要打在 **Docker 宿主機** 上的目標（例如本機架的漏洞測試站）時，URL 要用 `http://host.docker.internal:<port>`，容器內的 `127.0.0.1` 指的是容器自己。

## 2. 核心工作流程

```
建立 Workspace
   → 匯入 Asset（貼上 URL 清單 / 上傳 CSV，正規化 + 去重）
      → 在某個工具頁面選 Asset（或自訂輸入，如 sqlmap 貼 raw request）→ 送出建立 Job
         → Job 進 pending，非同步背景執行（asyncio task）
            → 執行中：log 逐行寫 DB + WebSocket 即時推播；progress 定期更新
            → 結束：completed / failed / cancelled / interrupted
               → 前端 JobPage 依 job.type 渲染對應 ResultsPanel，向 /jobs/<tool>/{id}/results 拿結構化結果
```

一個 Workspace 是一次任務／一個目標範圍的容器，底下的 Asset 是正規化後的 URL，各工具的 Job 都掛在 Workspace 之下、可選擇性地綁定一批 Asset。

## 3. Backend

### 3.1 目錄結構

```
Backend/app/
├── main.py                 # FastAPI app, CORS, lifespan(init_db → load_all_handlers → reconcile_interrupted_jobs)
├── db.py                   # SQLite engine, WAL, init_db()
├── models/                 # SQLModel tables
├── schemas/                # pydantic request/response
├── routers/                # HTTP + WebSocket endpoints
├── services/
│   ├── job_engine.py        # Job 生命週期、JobContext、JOB_REGISTRY
│   ├── subprocess_job.py    # run_subprocess() / run_per_target()
│   ├── workspace_utils.py   # create_scoped_job()：驗證 asset 屬於該 workspace
│   ├── job_handlers/        # 每個工具一支檔案，@register_job_handler 自動掃描註冊
│   ├── importer.py          # asset 匯入（貼上 / CSV）與正規化/去重
│   ├── url_normalize.py
│   ├── http_request_parse.py   # sqlmap 用：解析 raw GET URL / raw POST request
│   ├── sqlmap_log_parse.py     # sqlmap 用：解析 --output-dir 的 log 檔取得注入點
│   ├── proc_utils.py           # SIGTERM→SIGKILL 整個 process group
│   └── wp2shell.py             # WP REST batch SQLi→RCE exploit 腳本（純 stdlib），由 job_handlers/wp2shell.py 以 python subprocess 執行
└── ws/job_broadcast.py      # 每個 job_id 一組 asyncio.Queue 訂閱者，best-effort 廣播
```

### 3.2 「工具即 Job」模式

新增一個資安工具只要照這個模式加檔案，**不用改動核心引擎**：

| 檔案 | 內容 |
|---|---|
| `app/models/<tool>.py` | SQLModel table 存結果，外鍵指向 `jobs.id`；記得加進 `db.py::init_db()` 的 import 清單 |
| `app/schemas/<tool>_schemas.py` | request/response pydantic schema |
| `app/routers/<tool>.py` | `POST /workspaces/{id}/jobs/<tool>` 建 job、`GET /jobs/<tool>/{job_id}/results` 拿結果；記得在 `main.py` `include_router` |
| `app/services/job_handlers/<tool>.py` | 實際執行邏輯，`@register_job_handler("<tool>")` 註冊；`load_all_handlers()` 用 `pkgutil.iter_modules` 自動掃描載入，不用手動維護清單 |

核心引擎完全與工具無關：

- **`job_engine.py`**
  - `Job` 狀態機：`pending → running → completed / failed / cancelled / interrupted`
  - `JobContext`：`log()`（寫 `job_logs` 表 + 透過 `job_broadcast.publish` 推 WS）、`update_progress()`（寫 `jobs.progress_*` 欄位 + 推播）
  - `JOB_REGISTRY: dict[job_id, JobContext]`：只存執行中的 job，用來路由 `cancel_job()`；process 重啟後清空 → 啟動時 `reconcile_interrupted_jobs()` 把仍是 `running` 的 job 標成 `interrupted`（避免殭屍狀態）
  - `launch_job()` 用 `asyncio.create_task` 背景跑，HTTP handler 立即回傳 job 物件
- **`subprocess_job.py`**
  - `run_subprocess(cmd, ctx, label)`：跑一支 CLI，stdout/stderr 合併、逐行（也處理只用 `\r` 更新進度列的工具，如 dirsearch）灌進 job log；`ctx.cancel_event` 觸發時對整個 process group SIGTERM→SIGKILL（`start_new_session=True` 取得獨立 pgid）
  - `run_per_target(ctx, assets, target_concurrency, handle_target)`：給「對一批 asset 逐一掃描」的工具用的併發控制 + done/success/fail 進度統計（dirsearch / git-dump / whatweb）。**sqlmap 不用這個**，因為它是單一 raw request/URL 貼上去掃，不是對 asset 清單跑（liveness 也自己手刻併發迴圈，因為它需要 per-asset 的 rate limiter）
- **`workspace_utils.create_scoped_job()`**：需要 asset 清單的工具都走這裡，先驗證 `asset_ids` 屬於該 workspace 再建 job；不需要 asset 清單的工具（sqlmap）直接呼叫 `job_engine.create_job()`
- **`ws/job_broadcast.py`**：`/ws/jobs/{job_id}` 訂閱後先收 DB 裡已有的 log/progress 快照，再接後續即時訊息；佇列滿了會丟最舊的訊息而非阻塞（best-effort，DB 才是 source of truth）

### 3.3 已知工具（job type）

| job type | 對象 | 併發方式 | 特點 |
|---|---|---|---|
| `liveness` | 一批 asset | 自訂 semaphore + `AsyncLimiter`（rps 限流） | httpx 打 GET，判斷可達性、抓 `<title>`、分類 TLS/timeout 錯誤，順帶更新 `assets.last_alive` |
| `dirsearch` | 一批 asset | `run_per_target` | CLI 工具，JSON report 解析成 `DirsearchResult` |
| `git-dump` | 一批 asset | `run_per_target` | 先 HEAD `.git/HEAD` 判斷是否暴露，暴露才呼叫 `git-dumper` 下載到 `DATA_DIR/git_dumps/<job_id>/<asset_id>/` |
| `whatweb` | 一批 asset | `run_per_target` | CLI 指紋辨識，`--log-json` 解析出 plugins |
| `sqlmap` | 單一 raw request/URL | 無（單一 subprocess） | GET 模式走 `-u`，POST/raw 模式走 `-r`（暫存成檔案），選定參數走 `-p`；掃完解析 `--output-dir` 下的 `log` 檔取得注入技術 |
| `wp2shell` | 單一 WP URL | 無（單一 subprocess） | 跑 `services/wp2shell.py`（純 stdlib，用 `sys.executable` 執行，無需額外安裝）：`--test` 做時序盲測檢測、`--bash --command` 走完整利用鏈（建 admin → 上傳外掛 → RCE 執行單一指令後自毀外掛）；腳本用 `--output` 寫 JSON 結果檔供 handler 解析（同 sqlmap 解析 output-dir 的思路）。**侵入性操作**：會實際建立管理員帳號與上傳外掛，前端 bash 模式有二次確認 |

Job 的 `params_json` 存工具參數，`target_asset_ids_json` 存目標 asset（sqlmap 為 null）。

### 3.4 Workspace / Asset / Import

- `Workspace` — 任務容器
- `Asset` — 正規化後的 URL（`normalize_url()`），`(workspace_id, normalized_url)` 唯一；`importer.py::run_import()` 處理貼上文字或 CSV，逐行分類成 valid / duplicate_in_batch / duplicate_existing / invalid，並記錄在 `ImportBatch` / `ImportRow`
- 除了工具結果，`Asset` 上也快取了最近一次 liveness 結果（`last_alive` / `last_checked_at` / `last_liveness_job_id`），方便清冊列表直接顯示

### 3.5 `app/services/wp2shell.py`（exploit 腳本本體）

放在 `services/` 下的獨立腳本（**不是** job handler，沒有 `@register_job_handler`）：WordPress REST API Batch SQL injection → 建管理員帳號 → 上傳惡意外掛 → RCE 的完整利用鏈。已收編為 `wp2shell` job type，由 `job_handlers/wp2shell.py` 以 subprocess 執行。腳本本身的 CLI 參數（CLI 單獨使用時行為不變）：

- `--test` / `--bash`：時序檢測 / 完整利用鏈
- `-k/--insecure`：跳過 SSL 憑證驗證（自簽憑證的 HTTPS 目標用），job 表單有對應勾選框
- `-c/--command`：`--bash` 模式要執行的指令；省略時 fallback 回互動式 `input()`（subprocess 下由 router 層保證必帶）
- `-o/--output`：把結構化結果（`vulnerable` / `username` / `password` / `command_output` / `error`）增量寫成 JSON 檔，handler 掃完後讀取入庫；腳本被中途 kill 也留有部分結果

## 4. Frontend

### 4.1 目錄結構

```
Frontend/src/
├── App.jsx                    # 路由表
├── apiConfig.js                # API_BASE_URL / WS_BASE_URL
├── layouts/WorkspaceLayout.jsx # 工作區導覽列 + <Outlet/>
├── pages/
│   ├── WorkspaceListPage.jsx
│   ├── AssetsPage.jsx          # 匯入 + 清冊
│   ├── <Tool>Page.jsx          # 表單 + AssetPicker/自訂輸入 + JobHistoryList → 送出後 navigate(/jobs/:id)
│   ├── JobPage.jsx             # 依 job.type 條件渲染對應 ResultsPanel
│   └── TerminalPage.jsx
├── components/
│   ├── AssetPicker.jsx
│   ├── JobHistoryList.jsx / JobProgress.jsx / LiveLogView.jsx
│   └── <Tool>ResultsPanel.jsx  # 只在 job.status 為終止狀態（ended）才渲染
└── hooks/useJobSocket.js       # 接 /ws/jobs/{jobId}，統一提供 logs / progress / ended
```

### 4.2 路由與資料流

```
App.jsx
 ├─ /                                  → WorkspaceListPage
 ├─ /terminal                          → TerminalPage (/ws/terminal)
 ├─ /jobs/:jobId                       → JobPage（工具無關的共用頁）
 └─ /workspaces/:workspaceId           → WorkspaceLayout（導覽列）
      ├─ assets     → AssetsPage
      ├─ liveness   → LivenessPage
      ├─ dirsearch  → DirsearchPage
      ├─ git-dump   → GitDumpPage
      ├─ whatweb    → WhatwebPage
      ├─ sqlmap     → SqlmapPage
      └─ wp2shell   → Wp2shellPage
```

`useJobSocket(jobId)` 建立 WebSocket 連線，把後端推來的 `log` / `progress` / `end` 訊息整理成 `{ logs, progress, ended }`；`JobPage` 用 `ended` 觸發重新抓一次 job 詳情，並依 `job.type` 決定渲染哪個 `<Tool>ResultsPanel`（各自打自己的 `/jobs/<tool>/{id}/results`）。

新增一個工具在前端要手動接三處：`App.jsx` 加 route、`WorkspaceLayout.jsx` 加導覽連結、`JobPage.jsx` 加 `ResultsPanel` 條件渲染（其餘頁面/元件都是新檔案，不影響既有程式碼）。

## 5. 新增一個資安工具的 checklist

1. Backend：`models/<tool>.py`（+ 加進 `db.py::init_db()` import）、`schemas/<tool>_schemas.py`、`routers/<tool>.py`（+ 在 `main.py` include_router）、`services/job_handlers/<tool>.py`（`@register_job_handler`，不用手動註冊清單）
2. 若工具要對一批 asset 掃描：用 `workspace_utils.create_scoped_job()` + `subprocess_job.run_per_target()`；若是單一目標貼上型（像 sqlmap）：直接 `job_engine.create_job()` + 單次 `run_subprocess()`
3. Frontend：`pages/<Tool>Page.jsx` + `components/<Tool>ResultsPanel.jsx`，然後接 `App.jsx` route、`WorkspaceLayout.jsx` 導覽連結、`JobPage.jsx` 條件渲染
4. 若工具是 CLI，記得加進 `Backend/Dockerfile` 的 apt/pip 安裝清單
