import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../apiConfig'

function statusColor(code) {
  if (code >= 200 && code < 300) return '#4caf50'
  if (code >= 300 && code < 400) return '#42a5f5'
  if (code === 401 || code === 403) return '#ffb300'
  if (code >= 500) return '#e53935'
  return '#999'
}

function toCsv(rows) {
  const header = ['target', 'path', 'status', 'content_length', 'content_type', 'redirect', 'url']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [r.target_url, r.path, r.status_code, r.content_length ?? '', r.content_type ?? '', r.redirect ?? '', r.url]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    )
  }
  return lines.join('\n')
}

export default function DirsearchResultsPanel({ jobId }) {
  const [results, setResults] = useState([])
  const [statusFilter, setStatusFilter] = useState('')

  async function loadResults() {
    const query = statusFilter ? `?status=${statusFilter}` : ''
    const res = await fetch(`${API_BASE_URL}/jobs/dirsearch/${jobId}/results${query}`)
    setResults(await res.json())
  }

  useEffect(() => {
    loadResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const grouped = results.reduce((acc, r) => {
    if (!acc[r.target_url]) acc[r.target_url] = []
    acc[r.target_url].push(r)
    return acc
  }, {})

  function downloadCsv() {
    const blob = new Blob([toCsv(results)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dirsearch_job_${jobId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <h3>結果(依目標分組)</h3>
      <div style={{ marginBottom: '0.5rem' }}>
        狀態碼篩選(逗號分隔,留空=全部):{' '}
        <input
          type="text"
          placeholder="200,301,403"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: '150px' }}
        />{' '}
        <button onClick={loadResults}>套用</button>{' '}
        <button onClick={downloadCsv} disabled={results.length === 0}>
          匯出 CSV
        </button>
      </div>
      {Object.entries(grouped).map(([target, rows]) => (
        <details key={target} open style={{ marginBottom: '0.75rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
            {target} - {rows.length} 個路徑
          </summary>
          <table border="1" cellPadding="4" style={{ width: '100%', marginTop: '0.25rem' }}>
            <thead>
              <tr>
                <th>路徑</th>
                <th>狀態碼</th>
                <th>大小</th>
                <th>類型</th>
                <th>重導向</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <a href={r.url} target="_blank" rel="noreferrer">
                      {r.path}
                    </a>
                  </td>
                  <td style={{ color: statusColor(r.status_code), fontWeight: 'bold' }}>{r.status_code}</td>
                  <td>{r.content_length ?? '-'}</td>
                  <td>{r.content_type ?? '-'}</td>
                  <td>{r.redirect || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
      {results.length === 0 && <p>沒有找到結果。</p>}
    </div>
  )
}
