import { Link } from 'react-router-dom'

export default function JobHistoryList({ jobs }) {
  if (jobs.length === 0) {
    return <p>還沒有執行紀錄。</p>
  }

  return (
    <table border="1" cellPadding="4" style={{ width: '100%', marginTop: '0.5rem' }}>
      <thead>
        <tr>
          <th>Job ID</th>
          <th>狀態</th>
          <th>進度</th>
          <th>成功/失敗</th>
          <th>建立時間</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr key={job.id}>
            <td>
              <Link to={`/jobs/${job.id}`}>#{job.id}</Link>
            </td>
            <td>{job.status}</td>
            <td>
              {job.progress_done}/{job.progress_total}
            </td>
            <td>
              {job.progress_success}/{job.progress_fail}
            </td>
            <td>{job.created_at}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
