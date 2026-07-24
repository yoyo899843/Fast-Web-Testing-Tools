import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../apiConfig'

export default function AssetPicker({ workspaceId, selected, onSelectedChange }) {
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

  function toggle(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectedChange(next)
  }

  function toggleAll() {
    if (selected.size === assets.length) {
      onSelectedChange(new Set())
    } else {
      onSelectedChange(new Set(assets.map((a) => a.id)))
    }
  }

  return (
    <div>
      <div>
        篩選:{' '}
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">全部</option>
          <option value="alive">存活</option>
          <option value="dead">不存活/未檢測</option>
        </select>{' '}
        <button onClick={loadAssets}>重新整理</button>{' '}
        <button onClick={toggleAll} disabled={assets.length === 0}>
          {selected.size === assets.length && assets.length > 0 ? '取消全選' : '全選'}
        </button>
      </div>
      <table border="1" cellPadding="4" style={{ marginTop: '0.5rem', width: '100%' }}>
        <thead>
          <tr>
            <th></th>
            <th>URL</th>
            <th>存活</th>
            <th>最後檢測時間</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <tr key={a.id}>
              <td>
                <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
              </td>
              <td>{a.normalized_url}</td>
              <td>{a.last_alive === null ? '未檢測' : a.last_alive ? '存活' : '不存活'}</td>
              <td>{a.last_checked_at ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {selected.size} / {assets.length} 已選取
      </p>
    </div>
  )
}
