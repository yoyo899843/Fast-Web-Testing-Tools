import { useEffect, useRef } from 'react'

const LEVEL_COLORS = { error: '#f66', warn: '#fc6', info: '#0f0' }

export default function LiveLogView({ logs }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div
      ref={containerRef}
      style={{
        background: '#111',
        color: '#0f0',
        fontFamily: 'monospace',
        fontSize: '0.85rem',
        padding: '0.5rem',
        height: '300px',
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
      }}
    >
      {logs.map((log, i) => (
        <div key={i} style={{ color: LEVEL_COLORS[log.level] || '#0f0' }}>
          [{log.ts}] {log.message}
        </div>
      ))}
    </div>
  )
}
