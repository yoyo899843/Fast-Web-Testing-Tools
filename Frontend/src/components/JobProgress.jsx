export default function JobProgress({ progress }) {
  const { done, total, success, fail } = progress
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ background: '#333', height: '1rem', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, background: '#4caf50', height: '100%' }} />
      </div>
      <p>
        {done}/{total} done - {success} success, {fail} fail
      </p>
    </div>
  )
}
