import { useEffect, useMemo, useRef, useState } from 'react'

const LEVELS = ['all', 'info', 'warn', 'error']

export default function LiveLogView({ logs, height = 380 }) {
  const containerRef = useRef(null)
  const [level, setLevel] = useState('all')
  const [follow, setFollow] = useState(true)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return logs.filter((log) => {
      if (level !== 'all' && log.level !== level) return false
      if (q && !log.message.toLowerCase().includes(q)) return false
      return true
    })
  }, [logs, level, query])

  useEffect(() => {
    if (follow && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [filtered, follow])

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: '8px' }}>
        {LEVELS.map((lv) => (
          <button
            key={lv}
            className={`chip${level === lv ? ' active' : ''}`}
            onClick={() => setLevel(lv)}
          >
            {lv === 'all' ? '全部' : lv}
          </button>
        ))}
        <input
          type="text"
          placeholder="過濾 log 關鍵字…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '200px' }}
        />
        <div className="spacer" />
        <label className="form-check">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
          自動捲動
        </label>
        <span className="muted small">{filtered.length} 行</span>
      </div>
      <div ref={containerRef} className="log-view" style={{ height: `${height}px` }}>
        {filtered.map((log, i) => (
          <div key={i} className={`log-line log-${log.level}`}>
            <span className="log-ts">[{log.ts}]</span>
            {log.message}
          </div>
        ))}
        {filtered.length === 0 && <div className="muted">（沒有符合條件的 log）</div>}
      </div>
    </div>
  )
}
