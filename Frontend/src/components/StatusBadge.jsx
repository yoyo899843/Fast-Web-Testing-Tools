const LABELS = {
  pending: '等待中',
  running: '執行中',
  completed: '完成',
  failed: '失敗',
  cancelled: '已取消',
  interrupted: '已中斷',
}

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{LABELS[status] ?? status}</span>
}
