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
    <div className="table-wrap">
      <table className="table">
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
              <td className="cell-main">{r.target_url}</td>
              <td>
                {r.exposed ? (
                  <span className="text-err" style={{ fontWeight: 600 }}>
                    暴露
                  </span>
                ) : (
                  <span className="text-ok">未暴露</span>
                )}
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
