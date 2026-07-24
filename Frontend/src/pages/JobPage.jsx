import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import { useJobSocket } from '../hooks/useJobSocket'
import JobProgress from '../components/JobProgress'
import LiveLogView from '../components/LiveLogView'
import LivenessResultsPanel from '../components/LivenessResultsPanel'
import DirsearchResultsPanel from '../components/DirsearchResultsPanel'
import GitDumpResultsPanel from '../components/GitDumpResultsPanel'
import WhatwebResultsPanel from '../components/WhatwebResultsPanel'

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
    await fetch(`${API_BASE_URL}/jobs/${jobId}/cancel`, { method: 'POST' })
  }

  return (
    <div>
      <h2>{job ? `${job.type} Job #${jobId}` : `Job #${jobId}`}</h2>
      <JobProgress progress={progress} />
      {!ended && <button onClick={cancelJob}>取消 Job</button>}
      <LiveLogView logs={logs} />
      {ended && job?.type === 'liveness' && <LivenessResultsPanel jobId={jobId} />}
      {ended && job?.type === 'dirsearch' && <DirsearchResultsPanel jobId={jobId} />}
      {ended && job?.type === 'git-dump' && <GitDumpResultsPanel jobId={jobId} />}
      {ended && job?.type === 'whatweb' && <WhatwebResultsPanel jobId={jobId} />}
    </div>
  )
}
