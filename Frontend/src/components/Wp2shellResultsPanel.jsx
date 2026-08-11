import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../apiConfig'

export default function Wp2shellResultsPanel({ jobId }) {
  const [data, setData] = useState(null)

  async function loadResults() {
    const res = await fetch(`${API_BASE_URL}/jobs/wp2shell/${jobId}/results`)
    if (res.ok) setData(await res.json())
  }

  useEffect(() => {
    loadResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  if (!data) return <div className="empty">載入中…</div>

  const result = data.result

  return (
    <div>
      <div className="kv" style={{ marginBottom: '12px' }}>
        <span>
          目標 <b className="mono">{data.target}</b>
        </span>
        <span>
          模式 <b>{data.mode}</b>
        </span>
      </div>
      {!result && <div className="empty">沒有結構化結果，請參考上方 log。</div>}
      {result && (
        <div>
          {result.vulnerable ? (
            <div className="alert alert-danger" style={{ fontWeight: 600 }}>
              目標受此弱點影響（vulnerable）
            </div>
          ) : (
            <div className="alert alert-info">目標未受此弱點影響</div>
          )}
          {result.error && (
            <p className="text-err small" style={{ margin: '8px 0' }}>
              失敗原因: {result.error}
            </p>
          )}
          {result.username && (
            <div className="kv" style={{ margin: '8px 0' }}>
              <span>
                建立的管理者帳號 — 帳號 <code>{result.username}</code> 密碼 <code>{result.password}</code>
              </span>
            </div>
          )}
          {result.command && (
            <div style={{ marginTop: '8px' }}>
              <p className="small">
                執行指令: <code>{result.command}</code>
              </p>
              <pre className="pre">{result.command_output || '(無輸出)'}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
