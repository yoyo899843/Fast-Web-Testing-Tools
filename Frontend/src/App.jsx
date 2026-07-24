import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import WorkspaceListPage from './pages/WorkspaceListPage'
import WorkspaceLayout from './layouts/WorkspaceLayout'
import AssetsPage from './pages/AssetsPage'
import LivenessPage from './pages/LivenessPage'
import DirsearchPage from './pages/DirsearchPage'
import GitDumpPage from './pages/GitDumpPage'
import WhatwebPage from './pages/WhatwebPage'
import JobPage from './pages/JobPage'
import TerminalPage from './pages/TerminalPage'

export default function App() {
  return (
    <BrowserRouter>
      <header style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #666' }}>
        <Link to="/">首頁</Link> | <Link to="/terminal">Terminal</Link>
      </header>
      <Routes>
        <Route path="/" element={<WorkspaceListPage />} />
        <Route path="/terminal" element={<TerminalPage />} />
        <Route path="/jobs/:jobId" element={<JobPage />} />
        <Route path="/workspaces/:workspaceId" element={<WorkspaceLayout />}>
          <Route path="assets" element={<AssetsPage />} />
          <Route path="liveness" element={<LivenessPage />} />
          <Route path="dirsearch" element={<DirsearchPage />} />
          <Route path="git-dump" element={<GitDumpPage />} />
          <Route path="whatweb" element={<WhatwebPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
