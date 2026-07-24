import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { WS_BASE_URL } from '../apiConfig'

export default function TerminalPage() {
  const containerRef = useRef(null)

  useEffect(() => {
    const term = new Terminal({ convertEol: true, cursorBlink: true })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    const ws = new WebSocket(`${WS_BASE_URL}/ws/terminal`)

    function sendResize() {
      fitAddon.fit()
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    }

    ws.onopen = sendResize

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
    }
  }, [])

  return (
    <div>
      <h2>Container Shell</h2>
      <p style={{ fontSize: '0.85rem', color: '#888' }}>
        這是後端 app container 內部的互動 shell,已安裝 dirsearch/gitleaks/sqlmap/wpscan/git-dumper。
      </p>
      <div ref={containerRef} style={{ height: '500px', background: '#000' }} />
    </div>
  )
}
