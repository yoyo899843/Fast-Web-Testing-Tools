import { useEffect, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'

export default function WorkspaceLayout() {
  const { workspaceId } = useParams()
  const [workspace, setWorkspace] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE_URL}/workspaces/${workspaceId}`)
      .then((res) => res.json())
      .then(setWorkspace)
  }, [workspaceId])

  return (
    <div>
      <nav style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #444' }}>
        <Link to="/">← 切換工作區</Link>
        {' | '}
        <strong>{workspace ? workspace.name : `工作區 #${workspaceId}`}</strong>
        {' | '}
        <Link to={`/workspaces/${workspaceId}/assets`}>匯入/資產清冊</Link>
        {' | '}
        <Link to={`/workspaces/${workspaceId}/liveness`}>Liveness</Link>
        {' | '}
        <Link to={`/workspaces/${workspaceId}/dirsearch`}>Dirsearch</Link>
        {' | '}
        <Link to={`/workspaces/${workspaceId}/git-dump`}>Git-dump</Link>
        {' | '}
        <Link to={`/workspaces/${workspaceId}/whatweb`}>WhatWeb</Link>
        {' | '}
        <Link to={`/workspaces/${workspaceId}/sqlmap`}>SQLMap</Link>
      </nav>
      <div style={{ padding: '1rem' }}>
        <Outlet />
      </div>
    </div>
  )
}
