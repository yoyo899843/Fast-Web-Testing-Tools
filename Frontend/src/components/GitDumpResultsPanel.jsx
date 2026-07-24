import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../apiConfig'

export default function GitDumpResultsPanel({ jobId }) {
  const [results, setResults] = useState([])

  useEffect(() => {
    fetch(`${API_BASE_URL}/jobs/git-dump/${jobId}/results`)
      .then((res) => res.json())
      .then(setResults)
  }, [jobId])

  return (
    <div style={{ marginTop: '1rem' }}>
      <h3>結果</h3>
      <table border="1" cellPadding="4" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>目標</th>
            <th>是否暴露 .git</th>
            <th>Dump 路徑</th>
            <th>檔案數</th>
            <th>大小(bytes)</th>
            <th>錯誤</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.asset_id}>
              <td>{r.target_url}</td>
              <td style={{ color: r.exposed ? '#e53935' : '#4caf50', fontWeight: 'bold' }}>
                {r.exposed ? '暴露' : '未暴露'}
              </td>
              <td>{r.dump_path ?? '-'}</td>
              <td>{r.file_count ?? '-'}</td>
              <td>{r.dump_size_bytes ?? '-'}</td>
              <td>{r.error_message ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
