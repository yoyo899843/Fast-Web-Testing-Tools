import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge'
import { fmtTime } from '../utils/format'

export default function JobHistoryList({ jobs }) {
  if (jobs.length === 0) {
    return <div className="empty">還沒有執行紀錄。</div>
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Job</th>
            <th>狀態</th>
            <th>進度</th>
            <th>成功/失敗</th>
            <th>建立時間</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const pct = job.progress_total > 0 ? Math.round((job.progress_done / job.progress_total) * 100) : 0
            return (
              <tr key={job.id}>
                <td>
                  <Link to={`/jobs/${job.id}`} className="mono">
                    #{job.id}
                  </Link>
                </td>
                <td>
                  <StatusBadge status={job.status} />
                </td>
                <td>
                  <div className="toolbar" style={{ gap: '8px', flexWrap: 'nowrap' }}>
                    <div
                      style={{
                        width: '72px',
                        background: 'var(--bg-elevated)',
                        height: '5px',
                        borderRadius: '3px',
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ width: `${pct}%`, background: 'var(--ok)', height: '100%' }} />
                    </div>
                    <span className="mono muted small">
                      {job.progress_done}/{job.progress_total}
                    </span>
                  </div>
                </td>
                <td className="mono small">
                  <span className="text-ok">{job.progress_success}</span>
                  {' / '}
                  <span className={job.progress_fail > 0 ? 'text-err' : 'muted'}>{job.progress_fail}</span>
                </td>
                <td className="muted small nowrap">{fmtTime(job.created_at)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
