import { useEffect, useState } from 'react'
import { WS_BASE_URL } from '../apiConfig'

export function useJobSocket(jobId) {
  const [logs, setLogs] = useState([])
  const [progress, setProgress] = useState({ done: 0, total: 0, success: 0, fail: 0 })
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    if (jobId == null) return undefined

    setLogs([])
    setProgress({ done: 0, total: 0, success: 0, fail: 0 })
    setEnded(false)

    const ws = new WebSocket(`${WS_BASE_URL}/ws/jobs/${jobId}`)

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.type === 'log') {
        setLogs((prev) => [...prev, message])
      } else if (message.type === 'progress') {
        setProgress(message)
      } else if (message.type === 'end') {
        setEnded(true)
      }
    }

    return () => {
      ws.close()
    }
  }, [jobId])

  return { logs, progress, ended }
}
