import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import { fmtTime } from '../utils/format'

export default function AssetsPage() {
  const { workspaceId } = useParams()
  const [text, setText] = useState('')
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [assets, setAssets] = useState([])
  const [filter, setFilter] = useState('all')

  async function loadAssets() {
    const query = filter === 'all' ? '' : `?alive=${filter === 'alive'}`
    const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/assets${query}`)
    setAssets(await res.json())
  }

  useEffect(() => {
    loadAssets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, filter])

  async function submitPaste() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/assets/import/paste`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error(`import failed: ${res.status}`)
      setSummary(await res.json())
      setText('')
      await loadAssets()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/assets/import/file`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) throw new Error(`import failed: ${res.status}`)
      setSummary(await res.json())
      await loadAssets()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  const exportQuery = filter === 'all' ? '' : `?alive=${filter === 'alive'}`

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">資產管理</h1>
        <span className="page-desc">匯入 URL 清單，並檢視存活狀態</span>
      </div>

      <div className="card">
        <div className="card-title">URL 匯入</div>
        <div className="card-body">
          <textarea
            rows={8}
            style={{ width: '100%' }}
            placeholder="每行一個 URL"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="form-actions">
            <button className="btn-primary" onClick={submitPaste} disabled={busy || !text.trim()}>
              匯入貼上內容
            </button>
            <label className="form-check">
              或上傳檔案(.txt/.csv):
              <input type="file" accept=".txt,.csv" onChange={submitFile} disabled={busy} />
            </label>
          </div>
          {error && <div className="alert alert-danger">{error}</div>}
          {summary && (
            <div>
              <div className="kv">
                <span>
                  總筆數 <b>{summary.total_rows}</b>
                </span>
                <span>
                  有效 <b>{summary.valid_count}</b>
                </span>
                <span>
                  重複 <b>{summary.duplicate_count}</b>
                </span>
                <span>
                  無效 <b>{summary.invalid_count}</b>
                </span>
              </div>
              {summary.errors.length > 0 && (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>原始值</th>
                        <th>錯誤原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.errors.map((err) => (
                        <tr key={err.row_index}>
                          <td>{err.row_index}</td>
                          <td>{err.raw_value}</td>
                          <td>{err.error_message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          資產清冊
          <div className="spacer" />
          <span className="muted small">篩選:</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">全部</option>
            <option value="alive">存活</option>
            <option value="dead">不存活/未檢測</option>
          </select>
          <a
            className="btn-sm"
            href={`${API_BASE_URL}/workspaces/${workspaceId}/assets/export${exportQuery}`}
            target="_blank"
            rel="noreferrer"
          >
            匯出
          </a>
          <button className="btn-sm" onClick={loadAssets}>
            重新整理
          </button>
        </div>
        <div className="card-body">
          <div className="table-wrap table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>存活</th>
                  <th>最後檢測時間</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td className="cell-main">{a.normalized_url}</td>
                    <td>
                      {a.last_alive === null ? (
                        <span className="muted small">未檢測</span>
                      ) : a.last_alive ? (
                        <span className="text-ok small">存活</span>
                      ) : (
                        <span className="text-err small">不存活</span>
                      )}
                    </td>
                    <td className="muted small nowrap">{fmtTime(a.last_checked_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ marginTop: '8px' }}>
            要對這些資產跑檢測工具，請從左側選單切到 Liveness / Dirsearch / Git-dump / WhatWeb 頁面。
          </p>
        </div>
      </div>
    </div>
  )
}
