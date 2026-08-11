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

  if (!data) return <div className="empty">載入中…</div>

  const grouped = data.findings.reduce((acc, f) => {
    if (!acc[f.parameter]) acc[f.parameter] = []
    acc[f.parameter].push(f)
    return acc
  }, {})

  return (
    <div>
      <div className="kv" style={{ marginBottom: '12px' }}>
        <span>
          目標 <b className="mono">{data.target}</b>
        </span>
        <span>
          可注入參數{' '}
          <b className={data.findings.length > 0 ? 'text-err' : ''}>{Object.keys(grouped).length}</b>
        </span>
        <span>
          注入手法 <b>{data.findings.length}</b>
        </span>
      </div>
      {data.findings.length === 0 && <div className="empty">沒有找到可注入的參數。</div>}
      {Object.entries(grouped).map(([param, rows]) => (
        <details key={param} className="group" open>
          <summary>
            <span className="text-err">
              參數「{param}」<span className="muted">({rows[0].place})</span>
            </span>
            <span className="count-pill">{rows.length} 種注入手法</span>
          </summary>
          <div className="group-body" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '180px' }}>Type</th>
                  <th style={{ width: '280px' }}>Title</th>
                  <th>Payload</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="small">{r.type}</td>
                    <td className="small">{r.title}</td>
                    <td className="mono small" style={{ wordBreak: 'break-all' }}>
                      {r.payload}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  )
}
