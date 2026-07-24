import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../apiConfig'

export default function SqlmapResultsPanel({ jobId }) {
  const [data, setData] = useState(null)

  async function loadResults() {
    const res = await fetch(`${API_BASE_URL}/jobs/sqlmap/${jobId}/results`)
    if (res.ok) setData(await res.json())
  }

  useEffect(() => {
    loadResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  if (!data) return null

  const grouped = data.findings.reduce((acc, f) => {
    if (!acc[f.parameter]) acc[f.parameter] = []
    acc[f.parameter].push(f)
    return acc
  }, {})

  return (
    <div style={{ marginTop: '1rem' }}>
      <h3>SQLMap 結果</h3>
      <p>目標: {data.target}</p>
      {data.findings.length === 0 && <p>沒有找到可注入的參數。</p>}
      {Object.entries(grouped).map(([param, rows]) => (
        <details key={param} open style={{ marginBottom: '0.75rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#e53935' }}>
            參數「{param}」({rows[0].place}) - {rows.length} 種注入手法
          </summary>
          <table border="1" cellPadding="4" style={{ width: '100%', marginTop: '0.25rem' }}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.type}</td>
                  <td>{r.title}</td>
                  <td style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{r.payload}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  )
}
