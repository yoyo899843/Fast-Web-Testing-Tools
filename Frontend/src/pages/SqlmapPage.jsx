import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import JobHistoryList from '../components/JobHistoryList'

const GET_PLACEHOLDER = 'https://example.com/product?id=1&cat=2'
const POST_PLACEHOLDER = `POST /login HTTP/1.1
Host: example.com
Content-Type: application/x-www-form-urlencoded

username=admin&password=1234`

export default function SqlmapPage() {
  const { workspaceId } = useParams()
  const navigate = useNavigate()
  const [mode, setMode] = useState('get')
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState(null)
  const [selectedParams, setSelectedParams] = useState(new Set())
  const [config, setConfig] = useState({ risk: 1, level: 1, https: false })
  const [parseError, setParseError] = useState('')
  const [jobs, setJobs] = useState([])

  async function loadJobs() {
    const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/jobs?type=sqlmap`)
    setJobs(await res.json())
  }

  useEffect(() => {
    loadJobs()
    const timer = setInterval(loadJobs, 5000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  function switchMode(newMode) {
    setMode(newMode)
    setRaw('')
    setParsed(null)
    setSelectedParams(new Set())
    setParseError('')
  }

  async function parseTarget() {
    setParseError('')
    setParsed(null)
    setSelectedParams(new Set())
    if (!raw.trim()) return
    const res = await fetch(`${API_BASE_URL}/sqlmap/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, raw }),
    })
    if (!res.ok) {
      setParseError((await res.json()).detail || '解析失敗')
      return
    }
    const data = await res.json()
    setParsed(data)
    setSelectedParams(new Set(data.params))
  }

  function toggleParam(p) {
    const next = new Set(selectedParams)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    setSelectedParams(next)
  }

  async function start() {
    if (selectedParams.size === 0) return
    const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/jobs/sqlmap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, raw, params: Array.from(selectedParams), ...config }),
    })
    if (!res.ok) {
      setParseError((await res.json()).detail || '建立工作失敗')
      return
    }
    const job = await res.json()
    navigate(`/jobs/${job.id}`)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">SQLMap 注入測試</h1>
        <span className="page-desc">貼上 GET URL 或 POST 原始請求，解析參數後對指定參數跑 sqlmap</span>
      </div>

      <div className="card">
        <div className="card-title">目標請求</div>
        <div className="card-body">
          <div className="toolbar" style={{ marginBottom: '10px' }}>
            <label className="form-check">
              <input type="radio" checked={mode === 'get'} onChange={() => switchMode('get')} /> GET URL
            </label>
            <label className="form-check">
              <input type="radio" checked={mode === 'post'} onChange={() => switchMode('post')} /> POST 原始請求
            </label>
          </div>

          {mode === 'get' ? (
            <input
              type="text"
              placeholder={GET_PLACEHOLDER}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="mono"
              style={{ width: '100%' }}
            />
          ) : (
            <textarea
              placeholder={POST_PLACEHOLDER}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={10}
              className="mono"
              style={{ width: '100%' }}
            />
          )}

          <div className="form-actions">
            <button className="btn-primary" onClick={parseTarget} disabled={!raw.trim()}>
              解析參數
            </button>
            {parseError && <span className="text-err small">{parseError}</span>}
          </div>
        </div>
      </div>

      {parsed && (
        <div className="cols cols-2">
          <div className="card">
            <div className="card-title">選擇要注入的參數</div>
            <div className="card-body">
              <p className="small" style={{ marginBottom: '10px' }}>
                目標: <span className="mono">{parsed.target}</span>
              </p>
              {parsed.params.length === 0 ? (
                <div className="empty">未在此請求中找到任何參數。</div>
              ) : (
                <div className="toolbar">
                  {parsed.params.map((p) => (
                    <label key={p} className="form-check">
                      <input type="checkbox" checked={selectedParams.has(p)} onChange={() => toggleParam(p)} />
                      <span className="mono">{p}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-title">掃描設定</div>
            <div className="card-body">
              <div className="form-row">
                <div className="field">
                  <span className="field-label">Risk (1-3)</span>
                  <input
                    type="number"
                    min={1}
                    max={3}
                    value={config.risk}
                    onChange={(e) => setConfig({ ...config, risk: Number(e.target.value) })}
                  />
                </div>
                <div className="field">
                  <span className="field-label">Level (1-5)</span>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={config.level}
                    onChange={(e) => setConfig({ ...config, level: Number(e.target.value) })}
                  />
                </div>
                {mode === 'post' && (
                  <label className="form-check" style={{ paddingBottom: '8px' }}>
                    <input
                      type="checkbox"
                      checked={config.https}
                      onChange={(e) => setConfig({ ...config, https: e.target.checked })}
                    />
                    使用 HTTPS
                  </label>
                )}
              </div>
              <div className="form-actions">
                <button className="btn-primary" onClick={start} disabled={selectedParams.size === 0}>
                  對選取的 {selectedParams.size} 個參數開始掃描
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
