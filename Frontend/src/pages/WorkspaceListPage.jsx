import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import { fmtTime } from '../utils/format'

export default function WorkspaceListPage() {
  const [workspaces, setWorkspaces] = useState([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState(null)

  async function load() {
    const res = await fetch(`${API_BASE_URL}/workspaces`)
    setWorkspaces(await res.json())
  }

  useEffect(() => {
    load()
  }, [])

  async function create() {
    if (!name.trim()) return
    await fetch(`${API_BASE_URL}/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description.trim() || null }),
    })
    setName('')
    setDescription('')
    await load()
  }

  async function remove(ws) {
    if (!window.confirm(`確定要刪除工作區「${ws.name}」嗎?底下的資產、匯入紀錄、所有工具的執行結果都會一併刪除,無法復原。`)) {
      return
    }
    setError(null)
    const res = await fetch(`${API_BASE_URL}/workspaces/${ws.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.detail || `刪除失敗 (HTTP ${res.status})`)
      return
    }
    await load()
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">工作區</h1>
        <span className="page-desc">一個工作區 = 一批 URL 清單,底下可以對這批 URL 跑各種檢測工具。</span>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="form-row">
            <input placeholder="工作區名稱" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              placeholder="描述(選填)"
              style={{ flex: 1 }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <button className="btn-primary" onClick={create} disabled={!name.trim()}>
              建立工作區
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {workspaces.length === 0 ? (
        <div className="empty">還沒有任何工作區,在上面填名稱建立第一個工作區吧。</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>名稱</th>
                <th>描述</th>
                <th>資產數</th>
                <th>Job 數</th>
                <th>建立時間</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((ws) => (
                <tr key={ws.id}>
                  <td>
                    <Link to={`/workspaces/${ws.id}/assets`} className="cell-main">
                      {ws.name}
                    </Link>
                  </td>
                  <td>{ws.description ?? '-'}</td>
                  <td className="num">{ws.asset_count}</td>
                  <td className="num">{ws.job_count}</td>
                  <td className="muted small nowrap">{fmtTime(ws.created_at)}</td>
                  <td>
                    <button className="btn-danger btn-sm" onClick={() => remove(ws)}>
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
