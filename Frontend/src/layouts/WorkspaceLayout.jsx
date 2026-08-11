import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'

const RECON_NAV = [
  { to: 'assets', glyph: '◎', label: '資產清冊' },
  { to: 'liveness', glyph: '♥', label: 'Liveness 存活' },
  { to: 'whatweb', glyph: '⚑', label: 'WhatWeb 指紋' },
  { to: 'dirsearch', glyph: '☰', label: 'Dirsearch 爆破' },
  { to: 'git-dump', glyph: '⤓', label: 'Git-dump 還原' },
]

const VERIFY_NAV = [
  { to: 'sqlmap', glyph: '⨁', label: 'SQLMap 注入' },
  { to: 'wp2shell', glyph: '⌘', label: 'wp2shell' },
]

const ACTIVE_STATUSES = new Set(['pending', 'running'])

export default function WorkspaceLayout() {
  const { workspaceId } = useParams()
  const [workspace, setWorkspace] = useState(null)
  const [activeJobs, setActiveJobs] = useState([])
  const [recentJobs, setRecentJobs] = useState([])

  useEffect(() => {
    fetch(`${API_BASE_URL}/workspaces/${workspaceId}`)
      .then((res) => res.json())
      .then(setWorkspace)
  }, [workspaceId])

  useEffect(() => {
    let stopped = false
    async function loadJobs() {
      try {
        const res = await fetch(`${API_BASE_URL}/workspaces/${workspaceId}/jobs`)
        if (!res.ok) return
        const all = await res.json()
        if (stopped) return
        setActiveJobs(all.filter((j) => ACTIVE_STATUSES.has(j.status)))
        setRecentJobs(all.filter((j) => !ACTIVE_STATUSES.has(j.status)).slice(0, 4))
      } catch {
        // ignore transient errors; next poll retries
      }
    }
    loadJobs()
    const timer = setInterval(loadJobs, 4000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [workspaceId])

  const base = `/workspaces/${workspaceId}`

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="side-ws">
          <div className="side-ws-label">工作區</div>
          <div className="side-ws-name">{workspace ? workspace.name : `#${workspaceId}`}</div>
        </div>
        <div className="side-scroll">
          <div className="side-section">檢測流程</div>
          <nav className="side-nav">
            {RECON_NAV.map((item) => (
              <NavLink key={item.to} to={`${base}/${item.to}`} className="side-link">
                <span className="glyph">{item.glyph}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="side-section">利用驗證</div>
          <nav className="side-nav">
            {VERIFY_NAV.map((item) => (
              <NavLink key={item.to} to={`${base}/${item.to}`} className="side-link">
                <span className="glyph">{item.glyph}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="side-foot">
          <div className="side-section" style={{ marginTop: 0 }}>
            執行中{activeJobs.length > 0 ? ` (${activeJobs.length})` : ''}
          </div>
          {activeJobs.length === 0 && <div className="muted small" style={{ padding: '0 8px 6px' }}>無執行中工作</div>}
          {activeJobs.map((j) => (
            <Link key={j.id} to={`/jobs/${j.id}`} className="side-job">
              <span className={`pulse${j.status === 'pending' ? ' pending' : ''}`} />
              <span>{j.type}</span>
              <span className="mono">
                #{j.id} {j.progress_done}/{j.progress_total}
              </span>
            </Link>
          ))}
          {recentJobs.length > 0 && <div className="side-section">最近完成</div>}
          {recentJobs.map((j) => (
            <Link key={j.id} to={`/jobs/${j.id}`} className="side-job">
              <span
                className="pulse"
                style={{
                  animation: 'none',
                  background:
                    j.status === 'completed' ? 'var(--ok)' : j.status === 'failed' ? 'var(--err)' : 'var(--warn)',
                }}
              />
              <span>{j.type}</span>
              <span className="mono">#{j.id}</span>
            </Link>
          ))}
        </div>
      </aside>
      <main className="main">
        <div className="page">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
