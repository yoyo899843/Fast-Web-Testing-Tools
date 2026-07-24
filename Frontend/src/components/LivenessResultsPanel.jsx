import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../apiConfig'

export default function LivenessResultsPanel({ jobId }) {
  const [results, setResults] = useState([])
  const [aliveOnly, setAliveOnly] = useState(false)

  async function loadResults() {
    const query = aliveOnly ? '?alive_only=true' : ''
    const res = await fetch(`${API_BASE_URL}/jobs/${jobId}/results${query}`)
    setResults(await res.json())
  }

  useEffect(() => {
    loadResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aliveOnly])

  return (
    <div style={{ marginTop: '1rem' }}>
      <h3>結果</h3>
      <label>
        <input type="checkbox" checked={aliveOnly} onChange={(e) => setAliveOnly(e.target.checked)} /> 只顯示存活
      </label>{' '}
      <a href={`${API_BASE_URL}/jobs/${jobId}/results?alive_only=true`} target="_blank" rel="noreferrer">
        匯出(JSON)
      </a>
      <table border="1" cellPadding="4" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>URL</th>
            <th>存活</th>
            <th>狀態碼</th>
            <th>標題</th>
            <th>TLS 錯誤</th>
            <th>錯誤訊息</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.asset_id}>
              <td>{r.url}</td>
              <td>{r.reachable ? '是' : '否'}</td>
              <td>{r.status_code ?? '-'}</td>
              <td>{r.page_title ?? '-'}</td>
              <td>{r.tls_error ?? '-'}</td>
              <td>{r.error_message ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
