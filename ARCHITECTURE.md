# Fast Web Testing Tools — 架構總覽

> 本文件是給「零上下文接手的人/AI」讀的：目標是讀完這份就能直接改 code，不用逐一開檔案。
> 內容以**目前程式碼實際狀態**為準（2026-08 校對）。若之後改了架構，請同步更新本文件。

本機迴圈专用的資安檢測整合平台：匯入一批 URL（Asset）→ 對它們批量跑偵查工具（liveness / whatweb / dirsearch / git-dump）→ 即時 log + 結構化結果。攻擊性工具（sqlmap / wp2shell / php-cgi-Injector）**不走 job 系統**，放在 `tools/`，由內建終端機頁面組指令手動執行。

---

## 1. 部署拓樸與啟動

```bash
docker compose up --build -d        # 前端 http://127.0.0.1:8081, 後端 http://127.0.0.1:8001/docs
```

```
docker-compose.yml
├── backend   kalilinux/kali-rolling + FastAPI
│     port: 127.0.0.1:8001 → 8000 (uvicorn --workers 1，硬性要求)
│     env:  DATABASE_PATH=/data/app.db, CORS_ALLOW_ORIGINS=http://127.0.0.1:8081
│     volume: fwtt_data:/data        ← SQLite DB + git-dump 產物（DATA_DIR）
│     volume: ./tools → /opt/tools   ← 攻擊工具目錄（見 §5）
│     extra_hosts: host.docker.internal:host-gateway
└── frontend  node:20-alpine + Vite dev server
      port: 127.0.0.1:8081 → 8081
      env:  VITE_API_BASE_URL=http://127.0.0.1:8001
      ⚠ 沒有掛 source volume：改完前端必須 `docker compose up -d --build frontend` 才會生效
```

- **安全紅線**：兩個 port 都只綁 `127.0.0.1`，無身分驗證。`/ws/terminal` 是後端 container 的 **root shell**，唯一防線就是 loopback-only，**絕對不能改成 0.0.0.0 或對外暴露**。
- **`--workers 1` 是硬需求**：`JOB_REGISTRY`（取消路由）與 WS 訂閱清單都是 process 內記憶體狀態；多 worker 會讓即時 log / 取消失效。
- 要打 **Docker 宿主機**上的目標（例如本機測試站），URL 必須用 `http://host.docker.internal:<port>`；容器內的 `127.0.0.1` 是容器自己。
- Backend image 內建 CLI：`sqlmap`、`dirsearch`、`gitleaks`、`wpscan`、`whatweb`、`git-dumper`(pip)、`ruby-full`；另 pip 裝了 `requests rich chardet requests-tor`（給 `tools/` 腳本用，不是 app 依賴）。Kali 是 PEP 668 externally-managed，pip 一律 `--break-system-packages`。
- `Backend/requirements.txt`：fastapi 0.115.6 / uvicorn[standard] 0.34.0 / sqlmodel 0.0.22 / httpx 0.28.1 / aiolimiter 1.2.1 / python-multipart 0.0.20。

## 2. 全域工作流程

```
建 Workspace → 匯入 Asset（貼上多行 / 上傳 .txt/.csv → normalize + 去重 + 逐列稽核）
  → 工具頁勾選 Asset（AssetPicker）+ 填參數 → POST 建 Job（status=pending）
    → launch_job() 用 asyncio.create_task 背景跑，HTTP 立刻回傳 job 物件
    → 執行中：ctx.log() 寫 job_logs 表 + WS 推播；progress_* 定期更新
    → 終態：completed / failed / cancelled / interrupted
  → 前端 JobPage（/jobs/:id）用 WS 看即時 log；ended 後依 job.type 渲染對應 ResultsPanel
    （panel 各自打 GET /jobs/<tool>/{id}/results 拿結構化結果）
```

一個 Workspace = 一次任務/一個目標範圍；Asset = 正規化後的 URL；Job 掛在 Workspace 下。

## 3. Backend（`Backend/app/`，FastAPI + SQLModel/SQLite）

### 3.1 檔案樹與職責

```
app/
├── main.py                  # FastAPI app；lifespan: init_db() → load_all_handlers() → reconcile_interrupted_jobs()
│                            # CORS（CORS_ALLOW_ORIGINS env）；include 9 個 router；GET /health
├── db.py                    # DATABASE_PATH env（預設 ./data/app.db）；DATA_DIR = 其 dirname（git-dump 寫這裡）
│                            # engine: check_same_thread=False + PRAGMA WAL + busy_timeout=5000
│                            # init_db()：import 所有 models 後 create_all（新 model 要加進這裡的 import 清單!）
│                            # get_session()：contextmanager 產 Session
├── models/                  # SQLModel table，一工具一檔（欄位見 §3.4）
├── schemas/                 # pydantic request/response（欄位見 §3.5）
├── routers/                 # HTTP + WS 端點（見 §3.5）
├── services/
│   ├── job_engine.py         # Job 生命週期引擎（見 §3.2）
│   ├── job_handlers/         # 一工具一檔；@register_job_handler("<type>") 註冊進 JOB_HANDLERS dict
│   │   ├── __init__.py        # load_all_handlers() 用 pkgutil.iter_modules 自動掃描，新檔丟進來即註冊
│   │   ├── liveness.py        # 唯一非 subprocess 的 handler（httpx）
│   │   ├── dirsearch.py / git_dump.py / whatweb.py   # CLI subprocess 型
│   ├── subprocess_job.py     # run_subprocess() / run_per_target()（見 §3.2）
│   ├── proc_utils.py         # terminate_process_group()：對整個 pgid SIGTERM→(2s)→SIGKILL；
│   │                         # 用 os.kill(pid,0) 探活（不可 waitpid，會跟 asyncio 的 reaping 打架）
│   ├── workspace_utils.py    # create_scoped_job()：先驗證 asset_ids 屬於該 workspace 才建 job
│   ├── url_normalize.py      # normalize_url()（規則見 §3.3）
│   ├── importer.py           # run_import()：逐列 normalize + 分類 + 寫 ImportBatch/ImportRow 稽核
│   └── tools_registry.py     # 掃描 tools/ 目錄（見 §5）
└── ws/job_broadcast.py      # dict[job_id → list[asyncio.Queue(maxsize=200)]]；滿了丟最舊訊息（best-effort，
                             # DB 才是 source of truth）；純記憶體，process 重啟即清空
```

⚠ **`__pycache__` 裡有 `sqlmap` / `wp2shell` 的 .pyc 是歷史殘留**（曾短暫做成 job type，後來改走 `tools/`），source 已不存在，別被誤導。判斷功能是否存在以 `.py` source 為準。

### 3.2 核心引擎合約（改工具時最常碰到）

**`job_engine.py`**
- `JobStatus`：plain class 字串常數（非 Enum）：`pending → running → completed/failed/cancelled/interrupted`。
- `create_job(workspace_id, type, params: dict, target_asset_ids: list|None) -> job_id`：寫 DB（pending），`params_json` / `target_asset_ids_json` 是 JSON 字串；有 asset 時 `progress_total=len(assets)`。
- `launch_job(job_id)`：`asyncio.create_task(run_job(...))`，**不回傳、不 await**。
- `run_job`：建 `JobContext` 註冊進 `JOB_REGISTRY` → 設 running（記 started_at）→ 查 `JOB_HANDLERS[job.type]` 並 `await handler(job, ctx)` → 例外 → failed（記 error_message）；`ctx.cancel_event` 被設 → cancelled；否則 completed。finally 一定廣播 `{"type":"end"}` 並從 registry 移除。
- `cancel_job(job_id) -> bool`：只 set `cancel_event`；job 不在 registry（沒在跑）回 False → router 轉 409。
- `JobContext`：`job_id`、`cancel_event: asyncio.Event`、`await log(message, level="info")`（寫 job_logs + 推 WS）、`await update_progress(done=, total=, success=, fail=)`（寫 jobs 表 + 推 WS；都只給要改的欄位）。
- `reconcile_interrupted_jobs()`：啟動時把殘留 `running` 的 job 標 `interrupted`（registry 是記憶體狀態，重啟後這些 job 永遠不會再動）。

**`subprocess_job.py`**
- `await run_subprocess(cmd: list[str], ctx, label, timeout: float|None=None) -> returncode`：合併 stderr 進 stdout；**手切 `\r`/`\n`**（dirsearch 只用 `\r` 刷進度列，readline 會爆 64KB limit 炸掉整個 job——實際踩過）；每行 log 前綴 `[label]`；`start_new_session=True` 拿獨立 pgid，cancel 時 `terminate_process_group` 整組殺；給了 `timeout` 則單次呼叫超時也用同一套 kill 流程收掉（每次呼叫各自計時，不是整個 job 的總時限）。dirsearch 用它做「單一目標逾時換下一個」（見 §3.8）。
- `await run_per_target(ctx, assets, target_concurrency, handle_target)`：`handle_target(asset) -> bool`（成功與否）的併發迴圈 + done/success/fail 進度統計；**結果入庫是 handle_target 自己的責任**。dirsearch / git-dump / whatweb 都用它。liveness 不用（需要 per-asset rate limiter，自己手刻）。

**DB 存取模式（全專案一致，必須遵守）**
- SQLModel 是同步的：async handler 裡所有 DB 操作一律 `await asyncio.to_thread(...)`。
- 物件要帶出 session scope 前 `session.expunge(...)` / `expunge_all()`。
- `commit()` 會 expire 物件屬性：commit 後還要用的值**先存進區域變數**。

### 3.3 URL 正規化與匯入

`normalize_url(raw) -> NormalizeResult(normalized_url, scheme, host, port, path, error)`：
strip → 拒絕空白/控制字元 → 無 scheme 補 `http://` → 只允許 http/https → host 小寫化 + 驗證（`ipaddress` 或 hostname regex，支援 IPv6 `[::1]`）→ 預設 port（80/443）省略 → path 預設 `/`，query 保留。

`importer.run_import(session, workspace_id, raw_lines, source, filename)`：逐列分類 `valid / duplicate_in_batch / duplicate_existing / invalid`（`ImportOutcome` 字串常數），每列寫一筆 `ImportRow`，batch 寫一筆 `ImportBatch`（含 4 個計數欄位）；回傳 `ImportSummary`（含 errors 列表，只有 invalid 列）。`(workspace_id, normalized_url)` 有 UniqueConstraint。CSV 只取每列第一欄。

### 3.4 資料模型（tables）

| table | 重要欄位 |
|---|---|
| `workspaces` | id, name, description?, created_at |
| `assets` | id, workspace_id(FK), raw_url, normalized_url, scheme, host, port?, path, first_seen_batch_id?, created_at, **last_alive?, last_checked_at?, last_liveness_job_id?**（liveness 快取，清冊直接顯示用）；UniqueConstraint(workspace_id, normalized_url) |
| `import_batches` | id, workspace_id, source('paste'/'file:txt'/'file:csv'), filename?, created_at, total/valid/duplicate/invalid_count |
| `import_rows` | id, batch_id, row_index, raw_value, normalized_url?, outcome, error_message?, asset_id? |
| `jobs` | id, workspace_id, type(index), status(index), params_json, target_asset_ids_json?, progress_total/done/success/fail, created_at, started_at?, finished_at?, error_message? |
| `job_logs` | id, job_id(index), ts, level('info'/'warn'/'error'), message |
| `liveness_results` | job_id, asset_id, reachable, status_code?, page_title?, tls_error?, error_message?, checked_at, attempt_count；UniqueConstraint(job_id, asset_id) |
| `dirsearch_results` | job_id, asset_id, url, path, status_code, content_length?, content_type?, redirect?, found_at |
| `git_dump_results` | job_id, asset_id, exposed, dump_path?, file_count?, dump_size_bytes?, error_message?, checked_at |
| `whatweb_results` | job_id, asset_id, http_status?, plugins_json（JSON 字串）, error_message?, checked_at |

刪除 workspace（`routers/workspaces.py::_delete`）：有 pending/running job → 409；否則手動級聯刪 4 張 results 表 + job_logs + jobs + assets + import_rows/batches，並 `shutil.rmtree(DATA_DIR/git_dumps/<job_id>)`（best-effort）。**新增 results 表時要記得加進這個級聯清單。**

### 3.5 API 端點總表

| 方法 & 路徑 | 說明 |
|---|---|
| GET `/health` | {"status":"ok"} |
| POST `/workspaces` · GET `/workspaces` · GET `/workspaces/{id}` · DELETE `/workspaces/{id}` | CRUD；list/get 附 asset_count/job_count；delete 有 active job 回 409 |
| POST `/workspaces/{id}/assets/import/paste` | body `{text}`，逐行匯入 → ImportSummary |
| POST `/workspaces/{id}/assets/import/file` | multipart `file`；.csv 走 csv parser，其他當逐行文字 |
| GET `/workspaces/{id}/assets?alive=true|false` | 清冊（alive 篩的是 last_alive 快取） |
| GET `/workspaces/{id}/assets/export?alive=` | text/plain，一行一個 normalized_url |
| POST `/workspaces/{id}/jobs/liveness` | `{asset_ids*, concurrency=10, timeout=10, retries=0, rps=5}`；asset_ids 空 → 400 |
| POST `/workspaces/{id}/jobs/dirsearch` | `{asset_ids*, target_concurrency=2, threads=25, exclude_status="403,500", per_target_timeout=180}` |
| POST `/workspaces/{id}/jobs/git-dump` | `{asset_ids*, target_concurrency=2}` |
| POST `/workspaces/{id}/jobs/whatweb` | `{asset_ids*, target_concurrency=5, aggression=1}` |
| GET `/workspaces/{id}/jobs?type=` | 列表，新→舊 |
| GET `/jobs/{id}` | 單筆（JobResponse：id, workspace_id, type, status, progress_*, created/started/finished_at, error_message） |
| POST `/jobs/{id}/cancel` | 沒在跑 → 409 |
| GET `/jobs/{id}/results?alive_only=` | **liveness 專用**（歷史原因放在 jobs.py） |
| GET `/jobs/dirsearch/{job_id}/results?status=200,301` | 逗號分隔狀態碼篩選 |
| GET `/jobs/git-dump/{job_id}/results` | |
| GET `/jobs/whatweb/{job_id}/results` | plugins 是已解析的 dict |
| GET `/tools` · POST `/tools/refresh` | 攻擊工具清單 / 清 availability 快取（見 §5） |
| WS `/ws/jobs/{job_id}` | 見 §3.6 |
| WS `/ws/terminal` | 見 §3.7 |

建 job 的 router 共通模式：驗 asset_ids 非空 → `asyncio.to_thread(create_scoped_job, ...)` → `job_engine.launch_job(job_id)` → 回傳 job。results router 共通模式：查 job 存在且 type 相符（否則 404/400）→ join assets 表帶出 `target_url`。

### 3.6 WS `/ws/jobs/{job_id}` 協議

連上後：先**訂閱再讀 DB 快照**（避免漏掉 race 中的 end）→ 重播 DB 裡所有 log（`{"type":"log","ts","level","message"}`）→ 送一次 progress 快照（`{"type":"progress","done","total","success","fail"}`）→ 若已是終態：送 `{"type":"end"}` 並關閉；否則持續轉發即時訊息直到 end。job 不存在 → `{"type":"error"}` + close code 4404。

### 3.7 WS `/ws/terminal`（container root shell）

- 與 job 系統完全無關。`pty.fork()` + `execvp /bin/bash`；同時連線上限 5，滿了 close code 4429。
- 下行（client→server）：`{"type":"data","payload":<utf8 明文>}`（直接寫進 pty）、`{"type":"resize","rows","cols"}`。
- 上行：`{"type":"data","payload":<base64>}`。
- 斷線清理：關 fd + 對 pgid SIGHUP→SIGTERM→SIGKILL 逐步升級 + waitpid reap（互動 bash 可能無視 SIGTERM，實際踩過）。

### 3.8 四個 job handler 的行為細節

| type | 執行方式 | 解析與入庫 | 副作用 |
|---|---|---|---|
| `liveness` | httpx.AsyncClient（follow_redirects, verify=True），自刻 semaphore + `AsyncLimiter(rps, 1)` | GET 每個 asset；HTML 才抓 `<title>`（前 64KB regex）；錯誤分類：timeout→error_message="timeout"、SSL→tls_error、其他→error_message（**tls_error 與 error_message 互斥**）；retries 用完才算 unreachable | 同時更新 asset 的 last_alive 快取 |
| `dirsearch` | `dirsearch -u <url> --format json -o <tmp> -x <exclude> -t <threads> --no-color`；每個目標透過 `run_subprocess(..., timeout=per_target_timeout)` 跑，預設 180 秒（3 分鐘），逾時就 kill 掉該目標的行程並直接算這個目標失敗、換下一個，不影響其他目標或整個 job | 解析 tmp JSON 的 `results[]`；**report 檔不存在 = 沒找到東西，不是錯誤**（dirsearch 校準後無結果就不產檔）；逾時被砍可能留下不完整/壞掉的 JSON，解析失敗時比照「無結果」處理，不會讓整個 job 炸掉 | 無 |
| `git-dump` | 先 httpx GET `<url>/.git/HEAD`，200 且內容 `ref:` 開頭才算暴露；暴露才跑 `git-dumper <url>/.git/ <dump_path>` | 成功後 os.walk 算 file_count/size | dump 存到 `DATA_DIR/git_dumps/<job_id>/<asset_id>/` |
| `whatweb` | `whatweb --color=never --aggression <n> --log-json=<tmp> <url>` | 取 JSON `data[0]` 的 `http_status` 與 `plugins`；returncode≠0 → error_message="whatweb exited with code N"（**目標掛了也是 returncode 0 + plugins 空**，前端要處理空 plugins） | 無 |

三者（dirsearch/git-dump/whatweb）的共通點：tempfile 命名 `f"<tool>_{job.id}_{asset.id}_"`；mkstemp 後先 `os.remove` 讓工具自己建檔；每 asset 完成時 log 一行摘要。

## 4. 前端（`Frontend/src/`，React 19 + Vite + react-router 7）

### 4.1 檔案樹與職責

```
src/
├── main.jsx                 # StrictMode + createRoot，載入 index.css
├── apiConfig.js             # API_BASE_URL = VITE_API_BASE_URL || http://127.0.0.1:8001；WS_BASE_URL = http→ws
├── index.css                # 唯一設計系統（暗色主題，~860 行，class 詞彙見 §4.4）
├── App.jsx                  # topbar（工作區 / Terminal）+ 路由表（見 §4.2）
├── layouts/WorkspaceLayout.jsx  # 左側 sidebar：RECON_NAV 五個連結（順序: assets/liveness/whatweb/dirsearch/git-dump）
│                                # + 底部每 4 秒 poll /workspaces/{id}/jobs 顯示執行中(pending/running)與最近完成 4 筆
├── hooks/useJobSocket.js    # 接 /ws/jobs/{id} → 回 {logs[], progress{done,total,success,fail}, ended}
│                            # jobId 變動時重置狀態並重連；unmount 時關 WS
├── utils/format.js          # fmtTime / fmtDuration / fmtBytes / copyText（含 execCommand fallback）
├── pages/
│   ├── WorkspaceListPage.jsx   # 建/刪 workspace（刪除有 confirm；409 時顯示後端 detail）
│   ├── AssetsPage.jsx          # 貼上/上傳匯入 + ImportSummary（kv 統計 + 錯誤明細表）+ 清冊（alive 篩選/匯出/重新整理）
│   ├── LivenessPage.jsx        # ┐ 四個工具頁同一模板（照 DirsearchPage 抄）：
│   ├── DirsearchPage.jsx       # ┤ .page-header → .cols.cols-2（左「選擇目標」AssetPicker /
│   ├── GitDumpPage.jsx         # ┤ 右「掃描設定」表單）→「歷史紀錄」card（5 秒自動刷新 JobHistoryList）
│   ├── WhatwebPage.jsx         # ┘ 送出 POST 後 navigate(`/jobs/${job.id}`)
│   ├── JobPage.jsx             # 工具無關共用頁（見 §4.3）
│   └── TerminalPage.jsx        # 左：攻擊工具 checklist（GET /tools）；右：xterm.js 接 /ws/terminal（見 §5）
└── components/
    ├── AssetPicker.jsx         # props {workspaceId, selected:Set, onSelectedChange}；預設篩「存活」，
    │                           # 關鍵字過濾、全選（目前顯示）、顯示 last_alive/last_checked_at
    ├── JobHistoryList.jsx      # jobs table：#id 連結、StatusBadge、進度條、成功/失敗、建立時間
    ├── JobProgress.jsx         # 進度條 + done/total · pct · 成功/失敗
    ├── LiveLogView.jsx         # level chips（all/info/warn/error）+ 關鍵字過濾 + 自動捲動開關
    ├── StatusBadge.jsx         # .badge badge-<status>，中文 label
    ├── LivenessResultsPanel.jsx    # 「只顯示存活」checkbox（打 ?alive_only=）+ 匯出 JSON 連結 + table
    ├── DirsearchResultsPanel.jsx   # 最複雜的 panel：INTERESTING_RULES 有序 regex（high=★紅/med=☆黃，
    │                               # 先命中先贏）、狀態碼分佈 chips 篩選、目標下拉、搜尋、排序、
    │                               # 複製全部 URL、匯出 CSV；依 target 分組成 <details class="group">
    ├── GitDumpResultsPanel.jsx     # 單純 table（暴露與否/dump 路徑/檔案數/大小/錯誤）
    └── WhatwebResultsPanel.jsx     # 每 asset 一個 <details class="group">（summary=mono URL + HTTP status
                                    # + count-pill「N plugins」）；plugin table 的偵測內容是單行 inline
                                    # 「key: v1, v2 · key2: v3」（key 粗體、word-break: break-all）；
                                    # plugins 空 → 「未偵測到指紋。」；detail 空 → muted 「-」
```

**Results 頁面的折疊慣例（2026-08 起）**：`<details class="group">` **一律不給 `open`**——多目標的 job 一打開全部展開會很難讀，預設收起，有興趣再展開。

### 4.2 路由表（App.jsx）

```
/                              → WorkspaceListPage      ┐
/terminal                      → TerminalPage            ├ PlainLayout（無 sidebar）
/jobs/:jobId                   → JobPage                ┘
/workspaces/:workspaceId       → WorkspaceLayout（sidebar）
    ├─ assets / liveness / whatweb / dirsearch / git-dump → 對應 <Tool>Page
```

### 4.3 JobPage 資料流

`useParams` 拿 jobId → `useJobSocket(jobId)` 拿 {logs, progress, ended}；另外 fetch `/jobs/{id}` 拿 type/status/時間；`ended` 變 true 時重抓一次 job。
畫面：page-header（回工具頁連結、標題、StatusBadge、非 ended 顯示「取消 Job」按鈕 POST /jobs/{id}/cancel 帶 confirm）→ kv（建立/開始/結束/耗時）→ error alert →「執行日誌」card（JobProgress + LiveLogView）→ **ended 才出現**「掃描結果」card（渲染 `RESULTS_PANELS[job.type]`，panel 自己不包外層標題）。

**`TOOL_ROUTES` 與 `RESULTS_PANELS` 兩個 map 都在 JobPage.jsx 裡，加工具要同步加。**

### 4.4 設計系統（index.css）class 詞彙

版面：`.topbar` `.topbar-brand` `.topbar-link` / `.shell` `.sidebar` `.side-*`（side-ws, side-scroll, side-section, side-link, side-foot, side-job）/ `.main` `.page` `.page-header` `.page-title` `.page-desc` `.spacer`。
元件：`.card` `.card-pad` `.card-title` `.card-body`、`.cols` `.cols-2`、`.toolbar`、`.divider`、`.empty`、`.alert` `.alert-danger` `.alert-info`、`.kv`。
表單：`.field` `.field-label` `.form-row` `.form-check` `.form-actions`、`.btn` `.btn-primary` `.btn-danger` `.btn-ghost` `.btn-sm`。
表格：`.table-wrap` `.table-scroll` `.table`（`.cell-main` 主欄、`.num` 數字、`tr.row-hot`/`tr.row-warm` 高亮列）。
狀態：`.badge` + `.badge-pending/running/completed/failed/cancelled/interrupted`、`.tag` + `.tag-2xx/3xx/4xx/5xx/other`、`.pulse`（.pending）。
其他：`.chip`(.active, 內含 `.n` 計數)、`.count-pill`、`.log-view` `.log-line` `.log-info/warn/error` `.log-ts`、`details.group`（> summary + `.group-body`，箭頭自動旋轉）、`pre.pre`。
文字：`.muted` `.small` `.mono` `.nowrap` `.text-ok` `.text-warn` `.text-err` `.text-info`。
慣例：**禁止** `border="1"` 與大段 inline style；時間/大小/複製用 `utils/format.js`；lint 用 `npm run lint`（oxlint），build 用 `npm run build`。

## 5. `tools/` 攻擊工具目錄（不走 job 系統）

**定位**：需要互動、或高侵入性的工具，不包成 job；由 TerminalPage 左側渲染成 checklist，組好指令字串**插入終端機提示符**（不自動執行），使用者自己按 Enter。compose 把 repo 的 `./tools` 掛到容器 `/opt/tools`。

**格式**（`services/tools_registry.py`）：
- 資料夾含 `tool.json`，或頂層單支 `.py`/`.sh`（可配同名 sidecar `.json`）。`.開頭` 的 entry 會被跳過。
- `tool.json` 欄位：`name`（預設資料夾名）、`description`（zh-TW）、`dangerous`（UI 顯示「高風險」tag）、`command`（**必填**，插在終端的基底指令，容器內路徑如 `python3 /opt/tools/foo/foo.py`）、`check`（argv 陣列，exit 0 = available；3 秒 timeout、60 秒快取；沒給就視為可用）、`args`（`{flag, label, placeholder, required, type}` 陣列；`type:"value"`（預設）渲染文字框、`"flag"` 渲染 checkbox）。
- `GET /tools` 回傳正規化後的 manifest 列表（**移除 check、加上 available**）；`POST /tools/refresh` 清快取重掃。
- TerminalPage 組指令規則：`command` + 依序接 args（value 型有填值才接 `flag '值'`（單引號跳脫）；flag 型勾選才接 flag）+ `__extra__` 自由欄位原樣附加。

**現有三個工具**：

| 目錄 | 說明 |
|---|---|
| `tools/sqlmap/` | 只有 tool.json（包 image 內建的 `sqlmap --batch`）；args 含 -u/-r/-p/--risk/--level/--dbs/--tables/--os-shell |
| `tools/wp2shell/` | tool.json + `wp2shell.py`（~600 行純 stdlib，獨立可跑）：WordPress REST batch SQLi 利用鏈（時序盲測 → 建 admin → 上傳外掛 → 執行單一指令後外掛自毀）。CLI：`-url/--url`（必填）、`--test`/`--bash`（互斥必填）、`-c/--command`、`--insecure`（跳過 SSL 驗證）、`-o/--output`（**增量**寫 JSON 結果檔，被 kill 也留部分結果；欄位：url/mode/vulnerable/username/password/command/command_output/error） |
| `tools/php-cgi-Injector/` | CVE-2024-4577 / CVE-2024-8926 PHP-CGI 參數注入（第三方工具，含自己的 .git）：`exploit.py` 互動式、WAF bypass 模組（bypass_modules/）、Tor 模式；依賴 requests/rich/chardet/requests-tor（已裝在 backend image） |

## 6. 擴充食譜

### 6.1 新增一個「批量偵查型」job type

1. `models/<tool>.py`：results table（FK 到 jobs.id / assets.id）→ **加進 `db.py::init_db()` 的 import 清單**，並加進 `routers/workspaces.py::_delete` 的級聯刪除。
2. `schemas/<tool>_schemas.py`：`<Tool>JobRequest`（asset_ids + 參數含預設值）、`<Tool>ResultResponse`。
3. `routers/<tool>.py`：照 dirsearch.py 抄（POST 建 job + GET results），**在 `main.py` include_router**。
4. `services/job_handlers/<tool>.py`：`@register_job_handler("<tool>")`，簽名 `async def run(job, ctx)`；CLI 型用 `run_per_target` + `run_subprocess`，自己 parse 自己入庫。不用手動註冊（pkgutil 自動掃）。
5. CLI 工具本身加進 `Backend/Dockerfile` 的 apt/pip。
6. 前端三處手動接線：`App.jsx` 加 route、`WorkspaceLayout.jsx` 的 `RECON_NAV` 加連結、`JobPage.jsx` 的 `TOOL_ROUTES` + `RESULTS_PANELS` 加對應；再新增 `pages/<Tool>Page.jsx`（照 DirsearchPage 抄）與 `components/<Tool>ResultsPanel.jsx`。

### 6.2 新增一個「攻擊/互動型」工具

在 `tools/` 放資料夾 + `tool.json`（或頂層單支腳本）即可，前後端都不用改；`POST /tools/refresh` 或等 60 秒快取過期。需要額外 pip 套件就加進 `Backend/Dockerfile` 那行 tools 用的 pip install。

## 7. 已知地雷（踩過的，不要再踩）

1. **uvicorn 必須 `--workers 1`**（JOB_REGISTRY / WS 訂閱是 process 內狀態）。
2. **port 只能綁 127.0.0.1**（/ws/terminal = 無認證 root shell）。
3. subprocess 輸出**不可用 readline**：要手切 `\r`/`\n`（64KB StreamReader limit）。
4. 殺 subprocess 要殺**整個 process group**且 SIGTERM→SIGKILL 升級；探活用 `os.kill(pid, 0)` 不要 waitpid（會跟 asyncio reaping 打架）。
5. SQLModel 同步 ORM：async 裡一律 `asyncio.to_thread`；跨 session 用物件前 `expunge`；`commit()` 會 expire 屬性，先存區域變數。
6. dirsearch 無結果 = report 檔不存在，不是錯誤；whatweb 目標離線 = returncode 0 + 空 plugins。
7. 前端 container 沒掛 source volume：改完前端要 `docker compose up -d --build frontend`（compose 會因 depends_on 順便重啟 backend，DB 在 volume 不受影響）。
8. WS 廣播是 best-effort（queue 200 滿丟最舊）；任何「絕對不能丟」的東西都要先落 DB——log/progress 已經是這樣設計的，新功能比照。
9. 打宿主機目標用 `host.docker.internal`，不是 `127.0.0.1`。
10. 新增 results table 要同步三處：`init_db()` import、workspace 刪除級聯、（前端）RESULTS_PANELS。
