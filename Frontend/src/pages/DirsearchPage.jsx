import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import AssetPicker from '../components/AssetPicker'
import JobHistoryList from '../components/JobHistoryList'

export default function DirsearchPage() {
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const [selected, setSelected] = useState(new Set())
  const [config, setConfig] = useState({ target_concurrency: 2, threads: 25, exclude_status: '403,500' })
  const [jobs, setJobs] = useState([])

  async function loadJobs() {
    const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/jobs?type=dirsearch`)
    setJobs(await res.json())
  }

  useEffect(() => {
    loadJobs()
    const timer = setInterval(loadJobs, 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  async function start() {
    if (selected.size === 0) return
    const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/jobs/dirsearch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_ids: Array.from(selected), ...config }),
    })
    const job = await res.json()
    navigate(`/jobs/${job.id}`)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dirsearch 目錄爆破</h1>
        <span className="page-desc">對存活資產爆破常見目錄與檔案，結果會自動標記有趣路徑</span>
      </div>

      <div className="cols cols-2">
        <div className="card">
          <div className="card-title">選擇目標</div>
          <div className="card-body">
            <AssetPicker workspaceId={workspaceId} selected={selected} onSelectedChange={setSelected} />
          </div>
        </div>

        <div className="card">
          <div className="card-title">掃描設定</div>
          <div className="card-body">
            <div className="form-row">
              <div className="field">
                <span className="field-label">同時掃描目標數</span>
                <input
                  type="number"
                  value={config.target_concurrency}
                  onChange={(e) => setConfig({ ...config, target_concurrency: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <span className="field-label">每目標執行緒數</span>
                <input
                  type="number"
                  value={config.threads}
                  onChange={(e) => setConfig({ ...config, threads: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <span className="field-label">排除狀態碼（逗號分隔）</span>
                <input
                  type="text"
                  style={{ width: '140px' }}
                  value={config.exclude_status}
                  onChange={(e) => setConfig({ ...config, exclude_status: e.target.value })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-primary" onClick={start} disabled={selected.size === 0}>
                對 {selected.size} 筆目標開始掃描
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          歷史紀錄
          <div className="spacer" />
          <span className="muted small">每 5 秒自動更新</span>
          <button className="btn-sm" onClick={loadJobs}>
            重新整理
          </button>
        </div>
        <div className="card-body">
          <JobHistoryList jobs={jobs} />
        </div>
      </div>
    </div>
  )
}
