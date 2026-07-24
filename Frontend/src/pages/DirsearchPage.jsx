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
      <h2>Dirsearch 目錄爆破</h2>
      <AssetPicker workspaceId={workspaceId} selected={selected} onSelectedChange={setSelected} />
      <div style={{ marginTop: '1rem' }}>
        <h3>設定</h3>
        <label>
          同時掃描目標數{' '}
          <input
            type="number"
            value={config.target_concurrency}
            onChange={(e) => setConfig({ ...config, target_concurrency: Number(e.target.value) })}
          />
        </label>{' '}
        <label>
          每個目標的執行緒數{' '}
          <input
            type="number"
            value={config.threads}
            onChange={(e) => setConfig({ ...config, threads: Number(e.target.value) })}
          />
        </label>{' '}
        <label>
          排除狀態碼{' '}
          <input
            type="text"
            value={config.exclude_status}
            onChange={(e) => setConfig({ ...config, exclude_status: e.target.value })}
          />
        </label>
        <div>
          <button onClick={start} disabled={selected.size === 0}>
            對選取的 {selected.size} 筆開始 Dirsearch 掃描
          </button>
        </div>
      </div>
      <h3 style={{ marginTop: '1.5rem' }}>歷史紀錄</h3>
      <button onClick={loadJobs}>重新整理</button>
      <JobHistoryList jobs={jobs} />
    </div>
  )
}
