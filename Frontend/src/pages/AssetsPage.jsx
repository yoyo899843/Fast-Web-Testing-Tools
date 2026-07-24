import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'

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
      <h2>URL 匯入</h2>
      <textarea
        rows={8}
        style={{ width: '100%' }}
        placeholder="每行一個 URL"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div style={{ margin: '0.5rem 0' }}>
        <button onClick={submitPaste} disabled={busy || !text.trim()}>
          匯入貼上內容
        </button>{' '}
        <label>
          或上傳檔案(.txt/.csv):{' '}
          <input type="file" accept=".txt,.csv" onChange={submitFile} disabled={busy} />
        </label>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {summary && (
        <div>
          <p>
            總筆數 {summary.total_rows} - 有效 {summary.valid_count} - 重複 {summary.duplicate_count} - 無效{' '}
            {summary.invalid_count}
          </p>
          {summary.errors.length > 0 && (
            <table border="1" cellPadding="4">
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
          )}
        </div>
      )}

      <hr style={{ margin: '1.5rem 0' }} />

      <h2>資產清冊</h2>
      <div>
        篩選:{' '}
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">全部</option>
          <option value="alive">存活</option>
          <option value="dead">不存活/未檢測</option>
        </select>{' '}
        <a href={`${API_BASE_URL}/workspaces/${workspaceId}/assets/export${exportQuery}`} target="_blank" rel="noreferrer">
          匯出
        </a>{' '}
        <button onClick={loadAssets}>重新整理</button>
      </div>
      <table border="1" cellPadding="4" style={{ marginTop: '0.5rem', width: '100%' }}>
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
              <td>{a.normalized_url}</td>
              <td>{a.last_alive === null ? '未檢測' : a.last_alive ? '存活' : '不存活'}</td>
              <td>{a.last_checked_at ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: '#888', fontSize: '0.85rem' }}>
        要對這些資產跑檢測工具,請到上方導覽列切到 Liveness / Dirsearch / Git-dump / WhatWeb 頁面。
      </p>
    </div>
  )
}
