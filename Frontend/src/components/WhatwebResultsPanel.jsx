import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../apiConfig'

export default function WhatwebResultsPanel({ jobId }) {
  const [results, setResults] = useState([])

  useEffect(() => {
    fetch(`${API_BASE_URL}/jobs/whatweb/${jobId}/results`)
      .then((res) => res.json())
      .then(setResults)
  }, [jobId])

  return (
    <div>
      {results.map((r) => (
        <details key={r.asset_id} className="group" open>
          <summary>
            {r.target_url} {r.http_status ? `(HTTP ${r.http_status})` : ''}
          </summary>
          <div className="group-body">
            {r.error_message && <div className="alert alert-danger">{r.error_message}</div>}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Plugin</th>
                    <th>偵測內容</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(r.plugins).map(([name, detail]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>
                        {Object.entries(detail).map(([key, value]) => (
                          <div key={key}>
                            <strong>{key}:</strong> {Array.isArray(value) ? value.join(', ') : JSON.stringify(value)}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      ))}
      {results.length === 0 && <div className="empty">沒有結果。</div>}
    </div>
  )
}
