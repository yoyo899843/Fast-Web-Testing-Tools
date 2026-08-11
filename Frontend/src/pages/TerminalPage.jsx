import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { API_BASE_URL, WS_BASE_URL } from '../apiConfig'

export default function TerminalPage() {
  const containerRef = useRef(null)
  const wsRef = useRef(null)
  const hintTimerRef = useRef(null)
  const [wsReady, setWsReady] = useState(false)
  const [tools, setTools] = useState([])
  const [argValues, setArgValues] = useState({})
  const [hintFor, setHintFor] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE_URL}/tools`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setTools)
      .catch(() => {})
  }, [])

  useEffect(() => {
    const term = new Terminal({ convertEol: true, cursorBlink: true })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    const ws = new WebSocket(`${WS_BASE_URL}/ws/terminal`)
    wsRef.current = ws

    function sendResize() {
      fitAddon.fit()
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    }

    ws.onopen = () => {
      setWsReady(true)
      sendResize()
    }
    ws.onclose = () => setWsReady(false)
    ws.onerror = () => setWsReady(false)

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.type === 'data') {
        const binary = atob(message.payload)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
        term.write(bytes)
      }
    }

    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', payload: data }))
      }
    })

    window.addEventListener('resize', sendResize)

    return () => {
      window.removeEventListener('resize', sendResize)
      dataDisposable.dispose()
      ws.close()
      term.dispose()
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    }
  }, [])

  async function refreshTools() {
    try {
      const res = await fetch(`${API_BASE_URL}/tools/refresh`, { method: 'POST' })
      if (res.ok) setTools(await res.json())
    } catch {
      // ignore transient errors
    }
  }

  function setArg(key, value) {
    setArgValues((prev) => ({ ...prev, [key]: value }))
  }

  function buildCommand(t) {
    let cmd = t.command
    for (const arg of t.args || []) {
      const key = `${t.name}:${arg.flag}`
      if (arg.type === 'flag') {
        if (argValues[key]) cmd += ` ${arg.flag}`
      } else {
        const value = argValues[key] || ''
        if (value.trim() !== '') cmd += ` ${arg.flag} '${value.replace(/'/g, `'\\''`)}'`
      }
    }
    const extra = (argValues[`${t.name}:__extra__`] || '').trim()
    if (extra) cmd += ` ${extra}`
    return cmd
  }

  function insertCommand(t) {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'data', payload: buildCommand(t) }))
    setHintFor(t.name)
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    hintTimerRef.current = setTimeout(() => setHintFor(null), 3000)
  }

  return (
    <div style={{ display: 'flex', gap: '16px', height: '100%', padding: '14px 20px' }}>
      <div style={{ width: '300px', flex: '0 0 300px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div className="toolbar" style={{ marginBottom: '12px' }}>
          <span className="page-title" style={{ fontSize: '15px' }}>
            攻擊工具
          </span>
          <div className="spacer" />
          <button className="btn-sm" onClick={refreshTools}>
            重新掃描
          </button>
        </div>
        {tools.length === 0 && <div className="empty">找不到工具（tools/ 目錄為空）</div>}
        {tools.map((t) => (
          <details key={t.name} className="group">
            <summary>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: t.available ? 'var(--ok)' : 'var(--muted)',
                  flexShrink: 0,
                }}
              />
              {t.name}
              {t.dangerous && <span className="tag tag-5xx">高風險</span>}
            </summary>
            <div className="group-body">
              <div className="muted small">{t.description}</div>
              <div className="mono muted small">{t.source}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                {(t.args || []).map((arg) => {
                  const key = `${t.name}:${arg.flag}`
                  if (arg.type === 'flag') {
                    return (
                      <label key={arg.flag} className="form-check">
                        <input
                          type="checkbox"
                          checked={!!argValues[key]}
                          onChange={(e) => setArg(key, e.target.checked)}
                        />
                        {arg.label}
                      </label>
                    )
                  }
                  return (
                    <div key={arg.flag} className="field">
                      <label className="field-label">
                        {arg.label}
                        {arg.required ? ' *' : ''}
                      </label>
                      <input
                        type="text"
                        placeholder={arg.placeholder}
                        value={argValues[key] || ''}
                        onChange={(e) => setArg(key, e.target.value)}
                      />
                    </div>
                  )
                })}
                <div className="field">
                  <label className="field-label">額外參數（原樣附加）</label>
                  <input
                    type="text"
                    value={argValues[`${t.name}:__extra__`] || ''}
                    onChange={(e) => setArg(`${t.name}:__extra__`, e.target.value)}
                  />
                </div>
              </div>
              <div style={{ marginTop: '10px' }}>
                <button
                  className="btn-primary btn-sm"
                  disabled={!t.available || !wsReady}
                  onClick={() => insertCommand(t)}
                >
                  插入指令
                </button>
              </div>
              {hintFor === t.name && (
                <div className="muted small" style={{ marginTop: '6px' }}>
                  已插入指令，到終端機按 Enter 執行
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="page-header" style={{ marginBottom: '10px' }}>
          <h1 className="page-title">Container Shell</h1>
          <span className="page-desc">
            這是後端 app container 內部的互動 shell,已安裝 dirsearch/gitleaks/sqlmap/wpscan/git-dumper。
          </span>
        </div>
        <div
          ref={containerRef}
          style={{
            flex: 1,
            minHeight: 0,
            background: '#000',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '4px',
          }}
        />
      </div>
    </div>
  )
}
