import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import AssetPicker from '../components/AssetPicker'
import JobHistoryList from '../components/JobHistoryList'

export default function GitDumpPage() {
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const [selected, setSelected] = useState(new Set())
  const [config, setConfig] = useState({ target_concurrency: 2 })
  const [jobs, setJobs] = useState([])

  async function loadJobs() {
    const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/jobs?type=git-dump`)
    setJobs(await res.json())
  }

  useEffect(() => {
    loadJobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  async function start() {
    if (selected.size === 0) return
    const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/jobs/git-dump`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_ids: Array.from(selected), ...config }),
    })
    const job = await res.json()
    navigate(`/jobs/${job.id}`)
  }

  return (
    <div>
      <h2>Git-dump(偵測暴露的 .git 並下載還原)</h2>
      <AssetPicker workspaceId={workspaceId} selected={selected} onSelectedChange={setSelected} />
      <div style={{ marginTop: '1rem' }}>
        <h3>設定</h3>
        <label>
          同時檢測目標數{' '}
          <input
            type="number"
            value={config.target_concurrency}
            onChange={(e) => setConfig({ ...config, target_concurrency: Number(e.target.value) })}
          />
        </label>
        <div>
          <button onClick={start} disabled={selected.size === 0}>
            對選取的 {selected.size} 筆開始 Git-dump
          </button>
        </div>
      </div>
      <h3 style={{ marginTop: '1.5rem' }}>歷史紀錄</h3>
      <button onClick={loadJobs}>重新整理</button>
      <JobHistoryList jobs={jobs} />
    </div>
  )
}
