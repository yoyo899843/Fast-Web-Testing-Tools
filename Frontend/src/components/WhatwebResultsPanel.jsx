import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../apiConfig'

function fmtValue(value) {
  if (Array.isArray(value)) return value.join(', ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function WhatwebResultsPanel({ jobId }) {
  const [results, setResults] = useState([])

  useEffect(() => {
    fetch(`${API_BASE_URL}/jobs/whatweb/${jobId}/results`)
      .then((res) => res.json())
      .then(setResults)
  }, [jobId])

  return (
    <div>
      {results.map((r) => {
        const plugins = Object.entries(r.plugins)
        return (
          <details key={r.asset_id} className="group">
            <summary>
              <span className="mono" style={{ fontSize: '12.5px' }}>
                {r.target_url}
              </span>
              {r.http_status ? <span className="muted small">HTTP {r.http_status}</span> : null}
              <span className="count-pill">{plugins.length} plugins</span>
            </summary>
            <div className="group-body">
              {r.error_message && <div className="alert alert-danger">{r.error_message}</div>}
              {plugins.length === 0 ? (
                <div className="muted small">未偵測到指紋。</div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: '220px' }}>Plugin</th>
                        <th>偵測內容</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plugins.map(([name, detail]) => {
                        const entries = Object.entries(detail)
                        return (
                          <tr key={name}>
                            <td className="cell-main">{name}</td>
                            <td className="small" style={{ wordBreak: 'break-all' }}>
                              {entries.length === 0 ? (
                                <span className="muted">-</span>
                              ) : (
                                entries.map(([key, value], i) => (
                                  <span key={key}>
                                    {i > 0 && ' · '}
                                    <strong>{key}:</strong> {fmtValue(value)}
                                  </span>
                                ))
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </details>
        )
      })}
      {results.length === 0 && <div className="empty">沒有結果。</div>}
    </div>
  )
}
