import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import JobHistoryList from '../components/JobHistoryList'

export default function Wp2shellPage() {
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState('test')
  const [command, setCommand] = useState('')
  const [insecure, setInsecure] = useState(false)
  const [error, setError] = useState('')
  const [jobs, setJobs] = useState([])

  async function loadJobs() {
    const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/jobs?type=wp2shell`)
    setJobs(await res.json())
  }

  useEffect(() => {
    loadJobs()
    const timer = setInterval(loadJobs, 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  async function start() {
    setError('')
    if (mode === 'bash') {
      const confirmed = window.confirm(
        'bash 模式屬於侵入性操作：會在目標 WordPress 建立管理者帳號、上傳外掛並執行指令。\n\n請確認你已獲得授權，確定繼續？'
      )
      if (!confirmed) return
    }
    const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/jobs/wp2shell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, mode, command: mode === 'bash' ? command : null, insecure }),
    })
    if (!res.ok) {
      setError((await res.json()).detail || '建立工作失敗')
      return
    }
    const job = await res.json()
    navigate(`/jobs/${job.id}`)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">wp2shell WordPress 利用工具</h1>
        <span className="page-desc">WordPress REST API batch SQLi 利用鏈（檢測 / 完整利用）</span>
      </div>

      <div className="alert alert-danger">
        高風險利用工具，僅對你擁有或已獲授權測試的站點使用。
      </div>

      <div className="card">
        <div className="card-title">目標與模式</div>
        <div className="card-body">
          <div className="field" style={{ marginBottom: '10px' }}>
            <span className="field-label">WordPress 站點 URL</span>
            <input
              type="text"
              placeholder="https://wordpress.example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mono"
              style={{ width: '100%' }}
            />
            <span className="muted small">
              目標若架在本機（Docker 宿主機）上，請用 http://host.docker.internal:port 代替 127.0.0.1
            </span>
          </div>

          <div className="toolbar" style={{ marginBottom: mode === 'bash' ? '10px' : 0 }}>
            <label className="form-check">
              <input type="radio" checked={mode === 'test'} onChange={() => setMode('test')} /> 僅檢測是否受影響
            </label>
            <label className="form-check">
              <input type="radio" checked={mode === 'bash'} onChange={() => setMode('bash')} /> 完整利用並執行指令
            </label>
            <label className="form-check">
              <input type="checkbox" checked={insecure} onChange={(e) => setInsecure(e.target.checked)} />
              跳過 SSL 憑證驗證（自簽憑證）
            </label>
          </div>

          {mode === 'bash' && (
            <>
              <div className="alert alert-danger" style={{ marginTop: '10px' }}>
                警告：將在目標建立管理者帳號、上傳外掛（執行後自動停用並刪除）並執行下列指令。
              </div>
              <div className="field">
                <span className="field-label">要執行的指令</span>
                <input
                  type="text"
                  placeholder="id"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="mono"
                  style={{ width: '100%' }}
                />
              </div>
            </>
          )}

          <div className="form-actions">
            <button
              className={mode === 'bash' ? 'btn-danger' : 'btn-primary'}
              onClick={start}
              disabled={!url.trim() || (mode === 'bash' && !command.trim())}
            >
              {mode === 'bash' ? '開始利用' : '開始檢測'}
            </button>
            {error && <span className="text-err small">{error}</span>}
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
