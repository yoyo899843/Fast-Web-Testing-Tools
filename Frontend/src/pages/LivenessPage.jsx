import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import AssetPicker from '../components/AssetPicker'
import JobHistoryList from '../components/JobHistoryList'

export default function LivenessPage() {
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const [selected, setSelected] = useState(new Set())
  const [config, setConfig] = useState({ concurrency: 10, timeout: 10, retries: 1, rps: 5 })
  const [jobs, setJobs] = useState([])

  async function loadJobs() {
    const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/jobs?type=liveness`)
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
    const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/jobs/liveness`, {
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
        <h1 className="page-title">Liveness 存活檢測</h1>
        <span className="page-desc">對資產批次發送 HTTP 請求，更新存活狀態與最後檢測時間</span>
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
                <span className="field-label">併發數</span>
                <input
                  type="number"
                  value={config.concurrency}
                  onChange={(e) => setConfig({ ...config, concurrency: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <span className="field-label">逾時(秒)</span>
                <input
                  type="number"
                  value={config.timeout}
                  onChange={(e) => setConfig({ ...config, timeout: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <span className="field-label">重試次數</span>
                <input
                  type="number"
                  value={config.retries}
                  onChange={(e) => setConfig({ ...config, retries: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <span className="field-label">每秒請求上限</span>
                <input
                  type="number"
                  value={config.rps}
                  onChange={(e) => setConfig({ ...config, rps: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn-primary" onClick={start} disabled={selected.size === 0}>
                對 {selected.size} 筆目標開始檢測
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
