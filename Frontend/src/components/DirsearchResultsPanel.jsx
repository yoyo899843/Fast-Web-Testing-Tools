import { useEffect, useMemo, useState } from 'react'
import { API_BASE_URL } from '../apiConfig'
import { copyText, fmtBytes } from '../utils/format'

// 有趣路徑規則：有序，先命中先贏。level: high=紅 / med=黃
const INTERESTING_RULES = [
  { level: 'high', label: '版本控制洩漏', re: /\/\.(git|svn|hg)(\/|$)/i },
  { level: 'high', label: '機敏檔案', re: /\/\.env|\/\.aws|\/\.ssh|id_rsa|\.pem$|\.key$|\.pfx$/i },
  { level: 'high', label: '設定檔', re: /wp-config|config\.php|configuration|\.ini$|\.conf$|\.ya?ml$/i },
  { level: 'high', label: '備份/資料庫', re: /backup|\.bak|\.old|\.sql|\.dump|\.tar|\.t?gz|\.zip|\.rar/i },
  { level: 'high', label: '管理/診斷介面', re: /phpmyadmin|adminer|server-status|server-info|actuator|phpinfo|elmah|trace\.axd/i },
  { level: 'high', label: 'Webshell 跡象', re: /webshell|\/shell|\/cmd|\/eval|\/console/i },
  { level: 'med', label: 'API 文件', re: /swagger|api-docs|openapi|graphql|\/api(\/|$)/i },
  { level: 'med', label: '管理介面', re: /admin|manager|dashboard|\/panel|wp-admin/i },
  { level: 'med', label: '登入頁', re: /login|signin|\/auth|sso/i },
  { level: 'med', label: '上傳功能', re: /upload|fileupload/i },
  { level: 'med', label: '偵錯資訊', re: /debug|trace|\.log$|error_log/i },
  { level: 'med', label: '測試/暫存', re: /\/test|\/dev|staging|demo|\/old|\/tmp|\/temp|cgi-bin/i },
  { level: 'med', label: 'DevOps 服務', re: /jenkins|gitlab|jira|confluence|kibana|grafana/i },
]

function matchRule(path) {
  for (const rule of INTERESTING_RULES) {
    if (rule.re.test(path)) return rule
  }
  return null
}

function statusTagClass(code) {
  if (code >= 200 && code < 300) return 'tag tag-2xx'
  if (code >= 300 && code < 400) return 'tag tag-3xx'
  if (code >= 400 && code < 500) return 'tag tag-4xx'
  if (code >= 500) return 'tag tag-5xx'
  return 'tag tag-other'
}

function toCsv(rows) {
  const header = ['target', 'path', 'status', 'content_length', 'content_type', 'redirect', 'url']
  const lines = [header.join(',')]
  for (const r of rows) {
    lines.push(
      [r.target_url, r.path, r.status_code, r.content_length ?? '', r.content_type ?? '', r.redirect ?? '', r.url]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    )
  }
  return lines.join('\n')
}

export default function DirsearchResultsPanel({ jobId }) {
  const [allResults, setAllResults] = useState(null)
  const [statusFilter, setStatusFilter] = useState(new Set())
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState('')
  const [interestingOnly, setInterestingOnly] = useState(false)
  const [sort, setSort] = useState({ key: 'default', dir: 1 })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE_URL}/jobs/dirsearch/${jobId}/results`)
      .then((res) => res.json())
      .then(setAllResults)
  }, [jobId])

  const annotated = useMemo(() => (allResults ?? []).map((r) => ({ ...r, _rule: matchRule(r.path) })), [allResults])

  const targets = useMemo(() => [...new Set(annotated.map((r) => r.target_url))].sort(), [annotated])

  const statusCounts = useMemo(() => {
    const m = new Map()
    for (const r of annotated) m.set(r.status_code, (m.get(r.status_code) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [annotated])

  const interestingCount = useMemo(() => annotated.filter((r) => r._rule).length, [annotated])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return annotated.filter((r) => {
      if (statusFilter.size > 0 && !statusFilter.has(r.status_code)) return false
      if (target && r.target_url !== target) return false
      if (interestingOnly && !r._rule) return false
      if (q && !r.path.toLowerCase().includes(q) && !r.url.toLowerCase().includes(q)) return false
      return true
    })
  }, [annotated, statusFilter, target, interestingOnly, query])

  const grouped = useMemo(() => {
    const sorted = [...filtered]
    if (sort.key !== 'default') {
      const keyFn = {
        status: (r) => r.status_code,
        size: (r) => r.content_length ?? -1,
        path: (r) => r.path,
      }[sort.key]
      sorted.sort((a, b) => {
        const va = keyFn(a)
        const vb = keyFn(b)
        return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir
      })
    }
    const m = new Map()
    for (const r of sorted) {
      if (!m.has(r.target_url)) m.set(r.target_url, [])
      m.get(r.target_url).push(r)
    }
    return m
  }, [filtered, sort])

  function toggleStatus(code) {
    const next = new Set(statusFilter)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    setStatusFilter(next)
  }

  function toggleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: key === 'path' ? 1 : -1 }))
  }

  function sortMark(key) {
    if (sort.key !== key) return ''
    return sort.dir === 1 ? ' ▲' : ' ▼'
  }

  async function copyUrls() {
    const ok = await copyText(filtered.map((r) => r.url).join('\n'))
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function downloadCsv() {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dirsearch_job_${jobId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (allResults === null) return <div className="empty">載入中…</div>
  if (allResults.length === 0) return <div className="empty">沒有找到結果。</div>

  return (
    <div>
      {/* 摘要條：狀態碼分佈 chips（點擊切換篩選） */}
      <div className="toolbar" style={{ marginBottom: '8px' }}>
        <button className={`chip${statusFilter.size === 0 ? ' active' : ''}`} onClick={() => setStatusFilter(new Set())}>
          全部 <span className="n">{annotated.length}</span>
        </button>
        {statusCounts.map(([code, n]) => (
          <button key={code} className={`chip${statusFilter.has(code) ? ' active' : ''}`} onClick={() => toggleStatus(code)}>
            <span className={statusTagClass(code)}>{code}</span>
            <span className="n">{n}</span>
          </button>
        ))}
        <button
          className={`chip${interestingOnly ? ' active' : ''}`}
          onClick={() => setInterestingOnly(!interestingOnly)}
          title="只顯示命中規則的路徑"
        >
          ★ 有趣路徑 <span className="n">{interestingCount}</span>
        </button>
      </div>

      {/* 工具列 */}
      <div className="toolbar" style={{ marginBottom: '12px' }}>
        <input
          type="text"
          placeholder="搜尋路徑 / URL…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '200px' }}
        />
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">全部目標 ({targets.length})</option>
          {targets.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="muted small">
          顯示 {filtered.length} / {annotated.length} 筆
        </span>
        <div className="spacer" />
        <button className="btn-sm" onClick={copyUrls} disabled={filtered.length === 0}>
          {copied ? `已複製 ${filtered.length} 筆` : '複製全部 URL'}
        </button>
        <button className="btn-sm" onClick={downloadCsv} disabled={filtered.length === 0}>
          匯出 CSV
        </button>
      </div>

      {/* 依目標分組 */}
      {[...grouped.entries()].map(([targetUrl, rows]) => {
        const hot = rows.filter((r) => r._rule?.level === 'high').length
        const warm = rows.filter((r) => r._rule?.level === 'med').length
        return (
          <details key={targetUrl} className="group" open>
            <summary>
              <span className="mono" style={{ fontSize: '12.5px' }}>
                {targetUrl}
              </span>
              <span className="count-pill">{rows.length} 路徑</span>
              {hot > 0 && (
                <span className="tag tag-5xx" title="高風險路徑">
                  ★ {hot}
                </span>
              )}
              {warm > 0 && (
                <span className="tag tag-4xx" title="值得留意">
                  ☆ {warm}
                </span>
              )}
            </summary>
            <div className="group-body" style={{ padding: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '110px' }}>標記</th>
                    <th className="sortable" onClick={() => toggleSort('path')}>
                      路徑{sortMark('path')}
                    </th>
                    <th className="sortable" style={{ width: '70px' }} onClick={() => toggleSort('status')}>
                      狀態{sortMark('status')}
                    </th>
                    <th className="sortable" style={{ width: '80px' }} onClick={() => toggleSort('size')}>
                      大小{sortMark('size')}
                    </th>
                    <th style={{ width: '130px' }}>類型</th>
                    <th style={{ width: '180px' }}>重導向</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={r._rule?.level === 'high' ? 'row-hot' : r._rule?.level === 'med' ? 'row-warm' : ''}>
                      <td>
                        {r._rule && (
                          <span className={r._rule.level === 'high' ? 'tag tag-5xx' : 'tag tag-4xx'} title={r._rule.label}>
                            {r._rule.level === 'high' ? '★' : '☆'} {r._rule.label}
                          </span>
                        )}
                      </td>
                      <td className="cell-main">
                        <a href={r.url} target="_blank" rel="noreferrer">
                          {r.path}
                        </a>
                      </td>
                      <td>
                        <span className={statusTagClass(r.status_code)}>{r.status_code}</span>
                      </td>
                      <td className="num">{r.content_length != null ? fmtBytes(r.content_length) : '-'}</td>
                      <td className="muted small" title={r.content_type ?? ''}>
                        {r.content_type ? r.content_type.split(';')[0] : '-'}
                      </td>
                      <td className="muted small" title={r.redirect ?? ''} style={{ wordBreak: 'break-all' }}>
                        {r.redirect || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )
      })}
      {filtered.length === 0 && <div className="empty">篩選後沒有符合的結果。</div>}
    </div>
  )
}
