import { useMemo, useState } from 'react'
import type { AdminApi, AdminData, Appeal } from '../api'
import { ButtonLoading } from '../components/loading'

const appealCode = (appeal: Appeal) =>
  appeal.id === 'appeal-240730' ? 'A-240730' : appeal.id.replace('appeal-', 'A-')

const statusLabel = (status: Appeal['status']) =>
  status === 'pending' ? '待处理' : status === 'approved' ? '已通过' : '已驳回'

export function AppealsPage({
  api,
  data,
  refresh,
}: {
  api: AdminApi
  data: AdminData
  refresh: () => Promise<void>
}) {
  const appeals = useMemo(
    () =>
      [...data.appeals].sort((a, b) => {
        if (a.status === b.status) return b.createdAt.localeCompare(a.createdAt)
        return a.status === 'pending' ? -1 : 1
      }),
    [data.appeals],
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [decisionNote, setDecisionNote] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const selected = appeals.find((appeal) => appeal.id === selectedId)
  const membership = selected
    ? data.members
        .flatMap((member) => member.packages)
        .find((item) => item.id === selected.packageId)
    : undefined

  const decide = async (decision: 'approve' | 'reject') => {
    if (!selected) return
    setError('')
    if (!decisionNote.trim()) {
      setError('请填写处理说明')
      return
    }
    setBusy(decision)
    try {
      await api.decideAppeal(selected.id, decision, decisionNote.trim())
      await refresh()
      setDecisionNote('')
      setMessage(decision === 'approve' ? '申诉已通过，1 节课已退回会员余额' : '申诉已驳回')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">APPEAL REVIEW</p>
          <h1>申诉处理</h1>
          <p>待处理记录优先展示。决定与说明一经提交即只读，通过会自动退回 1 节课。</p>
        </div>
        <span className="pending-total">
          <strong>{appeals.filter((appeal) => appeal.status === 'pending').length}</strong>
          条待处理
        </span>
      </header>
      {message && (
        <p className="feedback success" role="status">
          {message}
        </p>
      )}
      <div className="appeals-layout">
        <section className="appeal-queue" aria-label="申诉列表">
          {appeals.map((appeal) => (
            <article
              key={appeal.id}
              className={`${appeal.status} ${appeal.id === selectedId ? 'selected' : ''}`}
            >
              <div>
                <span className={`status ${appeal.status}`}>{statusLabel(appeal.status)}</span>
                <time>{appeal.createdAt}</time>
              </div>
              <h2>{appeal.memberName} · 扣课申诉</h2>
              <p>
                {appeal.coachName} / {appeal.courseAt}
              </p>
              <button
                type="button"
                className="text-button"
                aria-label={`查看申诉 ${appealCode(appeal)}`}
                onClick={() => {
                  setSelectedId(appeal.id)
                  setError('')
                  setMessage('')
                }}
              >
                查看 {appealCode(appeal)} →
              </button>
            </article>
          ))}
        </section>
        <aside className="appeal-detail">
          {selected ? (
            <>
              <div className="appeal-detail-head">
                <div>
                  <p className="eyebrow">{appealCode(selected)} / REVIEW</p>
                  <h2>{selected.memberName}的申诉</h2>
                </div>
                <span className={`status ${selected.status}`}>
                  申诉状态：{statusLabel(selected.status)}
                </span>
              </div>
              <dl className="fact-list appeal-facts">
                <div>
                  <dt>课程与双方</dt>
                  <dd>
                    {selected.courseAt}
                    <br />
                    会员 {selected.memberName} / 教练 {selected.coachName}
                  </dd>
                </div>
                <div>
                  <dt>课时影响</dt>
                  <dd>
                    已扣 1 节 · <strong>当前可用 {membership?.available ?? 0} 节</strong>
                  </dd>
                </div>
                <div>
                  <dt>完成 / 取消来源</dt>
                  <dd>{selected.source}</dd>
                </div>
              </dl>
              <section className="statement">
                <span>申诉原因</span>
                <strong>{selected.reason}</strong>
                <p>{selected.note}</p>
              </section>
              <h3>完整课时变化</h3>
              {selected.balanceChanges.length > 0 ? (
                <ol className="event-list ledger">
                  {selected.balanceChanges.map((change) => (
                    <li key={change.id}>
                      <time>{change.at}</time>
                      <strong>
                        {change.operation} · {change.description}
                      </strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty-state">暂无课时变化记录。</p>
              )}
              {selected.status === 'pending' ? (
                <div className="decision-area">
                  <label>
                    处理说明
                    <textarea
                      rows={4}
                      placeholder="写明核实依据与处理结论"
                      value={decisionNote}
                      onChange={(event) => setDecisionNote(event.target.value)}
                    />
                  </label>
                  {error && (
                    <p className="form-message error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="button-row">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void decide('reject')}
                      disabled={busy !== null}
                      aria-busy={busy === 'reject'}
                    >
                      {busy === 'reject' ? <ButtonLoading label="驳回中…" /> : '驳回申诉'}
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void decide('approve')}
                      disabled={busy !== null}
                      aria-busy={busy === 'approve'}
                    >
                      {busy === 'approve' ? <ButtonLoading label="处理中…" /> : '通过并退回 1 节'}
                    </button>
                  </div>
                </div>
              ) : (
                <section className="readonly-decision">
                  <p className="eyebrow">FINAL DECISION</p>
                  <strong>处理后记录只读</strong>
                  <p>{selected.decisionNote}</p>
                  <span>{selected.handledAt}</span>
                </section>
              )}
            </>
          ) : (
            <div className="empty-detail">
              <span className="signal">!</span>
              <h2>选择一条申诉开始核实</h2>
              <p>右侧会同时呈现课程双方、课时影响与会员陈述。</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
