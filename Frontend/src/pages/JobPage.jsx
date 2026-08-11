import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import { useJobSocket } from '../hooks/useJobSocket'
import JobProgress from '../components/JobProgress'
import LiveLogView from '../components/LiveLogView'
import StatusBadge from '../components/StatusBadge'
import LivenessResultsPanel from '../components/LivenessResultsPanel'
import DirsearchResultsPanel from '../components/DirsearchResultsPanel'
import GitDumpResultsPanel from '../components/GitDumpResultsPanel'
import WhatwebResultsPanel from '../components/WhatwebResultsPanel'
import { fmtDuration, fmtTime } from '../utils/format'

const TOOL_ROUTES = {
  liveness: { path: 'liveness', label: 'Liveness' },
  dirsearch: { path: 'dirsearch', label: 'Dirsearch' },
  'git-dump': { path: 'git-dump', label: 'Git-dump' },
  whatweb: { path: 'whatweb', label: 'WhatWeb' },
}

const RESULTS_PANELS = {
  liveness: LivenessResultsPanel,
  dirsearch: DirsearchResultsPanel,
  'git-dump': GitDumpResultsPanel,
  whatweb: WhatwebResultsPanel,
}

export default function JobPage() {
  const { jobId } = useParams()
  const { logs, progress, ended } = useJobSocket(jobId)
  const [job, setJob] = useState(null)

  async function loadJob() {
    const res = await fetch(`${API_BASE_URL}/jobs/${jobId}`)
    if (res.ok) setJob(await res.json())
  }

  useEffect(() => {
    loadJob()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  useEffect(() => {
    if (ended) loadJob()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended])

  async function cancelJob() {
    if (!window.confirm('確定要取消這個 job 嗎？')) return
    await fetch(`${API_BASE_URL}/jobs/${jobId}/cancel`, { method: 'POST' })
  }

  const tool = job ? TOOL_ROUTES[job.type] : null
  const ResultsPanel = job ? RESULTS_PANELS[job.type] : null
  const duration = job ? fmtDuration(job.started_at, job.finished_at) : null

  return (
    <div className="page" style={{ maxWidth: 'none' }}>
      <div className="page-header">
        {job && tool && (
          <Link to={`/workspaces/${job.workspace_id}/${tool.path}`} className="muted small">
            ← 回 {tool.label}
          </Link>
        )}
        <h1 className="page-title">
          {job ? job.type : 'Job'} <span className="mono muted">#{jobId}</span>
        </h1>
        {job && <StatusBadge status={job.status} />}
        <div className="spacer" />
        {!ended && (
          <button className="btn-danger btn-sm" onClick={cancelJob}>
            取消 Job
          </button>
        )}
      </div>

      {job && (
        <div className="kv" style={{ marginBottom: '14px' }}>
          <span>
            建立 <b>{fmtTime(job.created_at)}</b>
          </span>
          {job.started_at && (
            <span>
              開始 <b>{fmtTime(job.started_at)}</b>
            </span>
          )}
          {job.finished_at && (
            <span>
              結束 <b>{fmtTime(job.finished_at)}</b>
            </span>
          )}
          {duration && (
            <span>
              耗時 <b>{duration}</b>
            </span>
          )}
        </div>
      )}

      {job?.error_message && <div className="alert alert-danger">{job.error_message}</div>}

      <div className="card">
        <div className="card-title">執行日誌</div>
        <div className="card-body">
          <JobProgress progress={progress} />
          <div style={{ height: '10px' }} />
          <LiveLogView logs={logs} />
        </div>
      </div>

      {ended && ResultsPanel && (
        <div className="card">
          <div className="card-title">掃描結果</div>
          <div className="card-body">
            <ResultsPanel jobId={jobId} />
          </div>
        </div>
      )}
    </div>
  )
}
