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
      <h2>Liveness 存活檢測</h2>
      <AssetPicker workspaceId={workspaceId} selected={selected} onSelectedChange={setSelected} />
      <div style={{ marginTop: '1rem' }}>
        <h3>設定</h3>
        <label>
          併發數{' '}
          <input
            type="number"
            value={config.concurrency}
            onChange={(e) => setConfig({ ...config, concurrency: Number(e.target.value) })}
          />
        </label>{' '}
        <label>
          逾時(秒){' '}
          <input
            type="number"
            value={config.timeout}
            onChange={(e) => setConfig({ ...config, timeout: Number(e.target.value) })}
          />
        </label>{' '}
        <label>
          重試次數{' '}
          <input
            type="number"
            value={config.retries}
            onChange={(e) => setConfig({ ...config, retries: Number(e.target.value) })}
          />
        </label>{' '}
        <label>
          每秒請求上限{' '}
          <input
            type="number"
            value={config.rps}
            onChange={(e) => setConfig({ ...config, rps: Number(e.target.value) })}
          />
        </label>
        <div>
          <button onClick={start} disabled={selected.size === 0}>
            對選取的 {selected.size} 筆開始存活檢測
          </button>
        </div>
      </div>
      <h3 style={{ marginTop: '1.5rem' }}>歷史紀錄</h3>
      <button onClick={loadJobs}>重新整理</button>
      <JobHistoryList jobs={jobs} />
    </div>
  )
}
