export default function JobProgress({ progress }) {
  const { done, total, success, fail } = progress
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="toolbar" style={{ gap: '10px' }}>
      <div
        style={{
          flex: 1,
          minWidth: '120px',
          background: 'var(--bg-elevated)',
          height: '6px',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            background: fail > 0 ? 'var(--warn)' : 'var(--ok)',
            height: '100%',
            transition: 'width 0.3s',
          }}
        />
      </div>
      <span className="mono muted nowrap">
        {done}/{total} · {pct}% · <span className="text-ok">{success} 成功</span> ·{' '}
        <span className={fail > 0 ? 'text-err' : ''}>{fail} 失敗</span>
      </span>
    </div>
  )
}
