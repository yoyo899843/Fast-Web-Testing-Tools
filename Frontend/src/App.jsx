import { BrowserRouter, Routes, Route, Link, NavLink, Outlet } from 'react-router-dom'
import WorkspaceListPage from './pages/WorkspaceListPage'
import WorkspaceLayout from './layouts/WorkspaceLayout'
import AssetsPage from './pages/AssetsPage'
import LivenessPage from './pages/LivenessPage'
import DirsearchPage from './pages/DirsearchPage'
import GitDumpPage from './pages/GitDumpPage'
import WhatwebPage from './pages/WhatwebPage'
import SqlmapPage from './pages/SqlmapPage'
import Wp2shellPage from './pages/Wp2shellPage'
import JobPage from './pages/JobPage'
import TerminalPage from './pages/TerminalPage'

function PlainLayout() {
  return (
    <main className="main">
      <Outlet />
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <header className="topbar">
        <Link to="/" className="topbar-brand">
          <span className="dot" />
          Fast Web Testing Tools
        </Link>
        <nav className="topbar-nav">
          <NavLink to="/" end className="topbar-link">
            工作區
          </NavLink>
          <NavLink to="/terminal" className="topbar-link">
            Terminal
          </NavLink>
        </nav>
      </header>
      <Routes>
        <Route element={<PlainLayout />}>
          <Route path="/" element={<WorkspaceListPage />} />
          <Route path="/terminal" element={<TerminalPage />} />
          <Route path="/jobs/:jobId" element={<JobPage />} />
        </Route>
        <Route path="/workspaces/:workspaceId" element={<WorkspaceLayout />}>
          <Route path="assets" element={<AssetsPage />} />
          <Route path="liveness" element={<LivenessPage />} />
          <Route path="dirsearch" element={<DirsearchPage />} />
          <Route path="git-dump" element={<GitDumpPage />} />
          <Route path="whatweb" element={<WhatwebPage />} />
          <Route path="sqlmap" element={<SqlmapPage />} />
          <Route path="wp2shell" element={<Wp2shellPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
