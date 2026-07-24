# 用途
於 Kali Linux 上執行之腳本，加速資安檢測效率

# 架構

monorepo：`Backend/`(FastAPI + SQLModel/SQLite) + `Frontend/`(React + Vite)。用 `docker-compose.yml` 起兩個容器，Backend 用 `kalilinux/kali-rolling` image，內建 sqlmap/dirsearch/gitleaks/wpscan/whatweb/git-dumper 等工具。

## Backend 的「工具即 Job」模式

每個資安工具（liveness、dirsearch、git-dump、whatweb、sqlmap）都照同一套模式接上系統，新增一個工具只要照著這個模式加檔案，不用改動核心引擎：

- `app/models/<tool>.py` — SQLModel table，存該工具的掃描結果（外鍵指向 `jobs.id`）。新 model 要記得加進 `app/db.py` 的 `init_db()` import 清單，`create_all` 才會建表。
- `app/schemas/<tool>_schemas.py` — pydantic 的 request/response schema。
- `app/routers/<tool>.py` — 三個典型端點：`POST /workspaces/{id}/jobs/<tool>` 建 job、`GET /jobs/<tool>/{job_id}/results` 拿結果。要記得在 `app/main.py` `include_router`。
- `app/services/job_handlers/<tool>.py` — 實際執行邏輯，用 `@register_job_handler("<tool>")` 註冊；`job_handlers/__init__.py` 用 `pkgutil.iter_modules` 自動掃描載入，新檔案放進去就會被發現，不用手動註冊清單。

核心引擎（不用因為新工具而改動）：
- `app/services/job_engine.py` — `Job` 生命週期（pending → running → completed/failed/cancelled/interrupted）、`JobContext`（log + progress 寫 DB 並透過 `job_broadcast` 推送到 WebSocket）、`JOB_REGISTRY` 追蹤執行中的 job 以支援取消。**要求 `uvicorn --workers 1`**，因為這個 registry 和 WS 訂閱清單是 process-內的記憶體狀態。
- `app/services/subprocess_job.py` — `run_subprocess()` 跑一支 CLI 工具、把 stdout 逐行導進 job log，可回應取消（SIGTERM→SIGKILL）；`run_per_target()` 是給「對一批 asset 逐一掃描」的工具用的併發控制（dirsearch/whatweb/liveness 這類）。sqlmap 不吃這個，因為它是單一 raw request/URL 貼上去掃，不是對 asset 清單跑。
- `app/services/workspace_utils.py` — `create_scoped_job()` 驗證 asset_ids 屬於該 workspace 再建 job；不需要 asset 清單的工具（如 sqlmap）直接呼叫 `job_engine.create_job()`。
- `app/ws/job_broadcast.py` + `routers/jobs.py` 的 `/ws/jobs/{job_id}` — job 的即時 log/progress 用這條 WebSocket 推。

其他固定端點：`/workspaces/{id}/jobs`（列表）、`/jobs/{id}`（單筆狀態）、`/jobs/{id}/cancel`。`routers/terminal.py` 是獨立的 `/ws/terminal`，用 `pty.fork()` 開真正的 bash shell，跟 job 系統無關。

## Frontend 的對應模式

- `pages/<Tool>Page.jsx` — 表單 + `AssetPicker`（選 asset）或自訂輸入 + `JobHistoryList`；送出後 `navigate(/jobs/:id)`。
- `components/<Tool>ResultsPanel.jsx` — 在 `pages/JobPage.jsx` 依 `job.type` 條件渲染，job 跑完（`ended`）才會顯示。
- `hooks/useJobSocket.js` — 接 `/ws/jobs/{jobId}`，統一提供 `logs`/`progress`/`ended` 給 `JobPage`。
- 新工具要手動接三處：`App.jsx` 加 route、`layouts/WorkspaceLayout.jsx` 加導覽連結、`pages/JobPage.jsx` 加 `ResultsPanel` 條件渲染。

## 已知的資安工具 job type

`liveness`（存活性）、`dirsearch`（目錄爆破）、`git-dump`（git 倉庫還原）、`whatweb`（指紋辨識）、`sqlmap`（SQL injection，貼 raw POST request 走 `-r`，貼 GET URL 走 `-u`，選參數走 `-p`，掃完解析 `--output-dir` 的 log 檔取得注入點）。