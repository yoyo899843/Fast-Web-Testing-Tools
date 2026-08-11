import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../apiConfig'
import { fmtTime } from '../utils/format'

export default function AssetPicker({ workspaceId, selected, onSelectedChange }) {
  const [assets, setAssets] = useState([])
  const [filter, setFilter] = useState('alive')
  const [query, setQuery] = useState('')

  async function loadAssets() {
    const q = filter === 'all' ? '' : `?alive=${filter === 'alive'}`
    const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/assets${q}`)
    setAssets(await res.json())
  }

  useEffect(() => {
    loadAssets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, filter])

  const visible = query.trim()
    ? assets.filter((a) => a.normalized_url.toLowerCase().includes(query.trim().toLowerCase()))
    : assets

  function toggle(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectedChange(next)
  }

  function toggleAllVisible() {
    const allVisibleSelected = visible.length > 0 && visible.every((a) => selected.has(a.id))
    const next = new Set(selected)
    if (allVisibleSelected) {
      visible.forEach((a) => next.delete(a.id))
    } else {
      visible.forEach((a) => next.add(a.id))
    }
    onSelectedChange(next)
  }

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: '8px' }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="alive">存活</option>
          <option value="all">全部</option>
          <option value="dead">不存活/未檢測</option>
        </select>
        <input
          type="text"
          placeholder="過濾 URL…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '220px' }}
        />
        <button className="btn-sm" onClick={loadAssets}>
          重新整理
        </button>
        <div className="spacer" />
        <span className="muted small">
          已選 <b className="text-info">{selected.size}</b> / {assets.length} 筆
        </span>
      </div>
      <div className="table-wrap table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '30px' }}>
                <input
                  type="checkbox"
                  checked={visible.length > 0 && visible.every((a) => selected.has(a.id))}
                  onChange={toggleAllVisible}
                  disabled={visible.length === 0}
                  title="全選（目前顯示）"
                />
              </th>
              <th>URL</th>
              <th style={{ width: '90px' }}>存活</th>
              <th style={{ width: '160px' }}>最後檢測時間</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.id} onClick={() => toggle(a.id)} style={{ cursor: 'pointer' }}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
                </td>
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
            {visible.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty">沒有符合條件的資產。</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
