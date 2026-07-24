import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'

export default function WorkspaceListPage() {
  const [workspaces, setWorkspaces] = useState([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

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

  return (
    <div>
      <h2>工作區</h2>
      <p style={{ color: '#888', fontSize: '0.85rem' }}>一個工作區 = 一批 URL 清單,底下可以對這批 URL 跑各種檢測工具。</p>
      <div style={{ margin: '1rem 0' }}>
        <input placeholder="工作區名稱" value={name} onChange={(e) => setName(e.target.value)} />{' '}
        <input
          placeholder="描述(選填)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />{' '}
        <button onClick={create} disabled={!name.trim()}>
          建立工作區
        </button>
      </div>
      <table border="1" cellPadding="4" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>名稱</th>
            <th>描述</th>
            <th>資產數</th>
            <th>Job 數</th>
            <th>建立時間</th>
          </tr>
        </thead>
        <tbody>
          {workspaces.map((ws) => (
            <tr key={ws.id}>
              <td>
                <Link to={`/workspaces/${ws.id}/assets`}>{ws.name}</Link>
              </td>
              <td>{ws.description ?? '-'}</td>
              <td>{ws.asset_count}</td>
              <td>{ws.job_count}</td>
              <td>{ws.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
