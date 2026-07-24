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
    <div style={{ marginTop: '1rem' }}>
      <h3>結果</h3>
      {results.map((r) => (
        <details key={r.asset_id} open style={{ marginBottom: '0.75rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
            {r.target_url} {r.http_status ? `(HTTP ${r.http_status})` : ''}
          </summary>
          {r.error_message && <p style={{ color: 'red' }}>{r.error_message}</p>}
          <table border="1" cellPadding="4" style={{ width: '100%', marginTop: '0.25rem' }}>
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
        </details>
      ))}
      {results.length === 0 && <p>沒有結果。</p>}
    </div>
  )
}
