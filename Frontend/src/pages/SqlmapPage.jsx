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
      <h2>SQLMap 注入測試</h2>

      <div style={{ marginBottom: '0.5rem' }}>
        <label>
          <input type="radio" checked={mode === 'get'} onChange={() => switchMode('get')} /> GET URL
        </label>{' '}
        <label>
          <input type="radio" checked={mode === 'post'} onChange={() => switchMode('post')} /> POST 原始請求
        </label>
      </div>

      {mode === 'get' ? (
        <input
          type="text"
          placeholder={GET_PLACEHOLDER}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          style={{ width: '100%', fontFamily: 'monospace' }}
        />
      ) : (
        <textarea
          placeholder={POST_PLACEHOLDER}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={10}
          style={{ width: '100%', fontFamily: 'monospace' }}
        />
      )}

      <div style={{ marginTop: '0.5rem' }}>
        <button onClick={parseTarget} disabled={!raw.trim()}>
          解析參數
        </button>
        {parseError && <span style={{ color: '#e53935', marginLeft: '0.5rem' }}>{parseError}</span>}
      </div>

      {parsed && (
        <div style={{ marginTop: '1rem' }}>
          <h3>選擇要注入的參數</h3>
          <p>目標: {parsed.target}</p>
          {parsed.params.length === 0 ? (
            <p>未在此請求中找到任何參數。</p>
          ) : (
            parsed.params.map((p) => (
              <label key={p} style={{ marginRight: '1rem' }}>
                <input type="checkbox" checked={selectedParams.has(p)} onChange={() => toggleParam(p)} /> {p}
              </label>
            ))
          )}

          <div style={{ marginTop: '1rem' }}>
            <h3>設定</h3>
            <label>
              Risk (1-3){' '}
              <input
                type="number"
                min={1}
                max={3}
                value={config.risk}
                onChange={(e) => setConfig({ ...config, risk: Number(e.target.value) })}
              />
            </label>{' '}
            <label>
              Level (1-5){' '}
              <input
                type="number"
                min={1}
                max={5}
                value={config.level}
                onChange={(e) => setConfig({ ...config, level: Number(e.target.value) })}
              />
            </label>{' '}
            {mode === 'post' && (
              <label>
                <input
                  type="checkbox"
                  checked={config.https}
                  onChange={(e) => setConfig({ ...config, https: e.target.checked })}
                />{' '}
                使用 HTTPS
              </label>
            )}
          </div>

          <div style={{ marginTop: '0.5rem' }}>
            <button onClick={start} disabled={selectedParams.size === 0}>
              對選取的 {selectedParams.size} 個參數開始 SQLMap 掃描
            </button>
          </div>
        </div>
      )}

      <h3 style={{ marginTop: '1.5rem' }}>歷史紀錄</h3>
      <button onClick={loadJobs}>重新整理</button>
      <JobHistoryList jobs={jobs} />
    </div>
  )
}
