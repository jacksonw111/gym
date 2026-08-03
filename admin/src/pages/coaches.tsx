import { type FormEvent, useMemo, useState } from 'react'
import type { AdminApi, AdminData, Coach, CoachInput } from '../api'
import { ButtonLoading } from '../components/loading'

const blankCoach: CoachInput = { name: '', phone: '', specialty: '' }

export function CoachesPage({
  api,
  data,
  refresh,
}: {
  api: AdminApi
  data: AdminData
  refresh: () => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(data.coaches[0]?.id ?? '')
  const [editing, setEditing] = useState<CoachInput | null>(null)
  const [confirming, setConfirming] = useState<Coach | null>(null)
  const [transferCoachId, setTransferCoachId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const selected = data.coaches.find((coach) => coach.id === selectedId)
  const filtered = useMemo(
    () =>
      data.coaches.filter((coach) =>
        `${coach.name}${coach.phone}${coach.specialty}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [data.coaches, search],
  )

  const isExpired = (membership: { expiresAt?: string }): boolean =>
    Boolean(membership.expiresAt && new Date(membership.expiresAt).getTime() < Date.now())

  const transferableCount = (coachId: string): number =>
    data.members.reduce(
      (count, member) =>
        count +
        member.packages.filter(
          (membership) =>
            membership.coachId === coachId &&
            membership.available + membership.locked > 0 &&
            !isExpired(membership),
        ).length,
      0,
    )

  const otherActiveCoaches = data.coaches.filter(
    (coach) => coach.status === 'active' && coach.id !== confirming?.id,
  )

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!editing?.name || !editing.phone || !editing.specialty) return
    setBusy('save')
    try {
      const saved = await api.saveCoach(editing)
      await refresh()
      setSelectedId(saved.id)
      setEditing(null)
      setMessage('教练资料已保存')
    } finally {
      setBusy('')
    }
  }

  const requestLeave = (coach: Coach) => {
    setTransferCoachId('')
    setError('')
    setConfirming(coach)
  }

  const reactivate = async (coach: Coach) => {
    setBusy(`status-${coach.id}`)
    setError('')
    try {
      await api.setCoachStatus(coach.id, 'active')
      await refresh()
      setMessage(`${coach.name}已恢复在岗`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '恢复在岗失败')
    } finally {
      setBusy('')
    }
  }

  const leave = async () => {
    if (!confirming) return
    const transferable = transferableCount(confirming.id)
    if (transferable > 0 && !transferCoachId) return
    setBusy('deactivate')
    setError('')
    try {
      const result = await api.leaveCoach(
        confirming.id,
        transferable > 0 ? transferCoachId : undefined,
      )
      await refresh()
      setMessage(
        result.transferredMemberships > 0
          ? `${confirming.name}已离职：${result.transferredMemberships} 份有效课包及 ${result.transferredLessons} 个待上课预约已转移给 ${result.transferCoachName}，${result.unpublishedProducts} 个课包已下架。已购会员可继续预约训练。`
          : `${confirming.name}已离职，${result.unpublishedProducts} 个课包已下架，历史课程已保留。`,
      )
      setConfirming(null)
      setTransferCoachId('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '离职处理失败')
    } finally {
      setBusy('')
    }
  }

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">COACH ROSTER</p>
          <h1>教练管理</h1>
          <p>
            维护教练资料与在岗状态。离职前先转移其有效会员课包并下架课包，已购会员的预约不受影响。
          </p>
        </div>
        <button className="primary-button" type="button" onClick={() => setEditing(blankCoach)}>
          ＋ 新增教练
        </button>
      </header>
      {message && (
        <p className="feedback success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      {confirming && (
        <section className="inline-confirm" aria-label="离职确认">
          <div>
            <strong>确认{confirming.name}离职？</strong>
            {transferableCount(confirming.id) > 0 ? (
              <>
                <p>
                  该教练仍有 {transferableCount(confirming.id)}{' '}
                  份有效会员课包。离职时这些课包及其待上课预约将转移给接收教练，随后下架其课包商品；已购会员仍可继续预约训练。
                </p>
                <label>
                  接收教练
                  <select
                    value={transferCoachId}
                    onChange={(event) => setTransferCoachId(event.target.value)}
                  >
                    <option value="">请选择接收教练</option>
                    {otherActiveCoaches.map((coach) => (
                      <option key={coach.id} value={coach.id}>
                        {coach.name} · {coach.specialty}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <p>该教练没有待转移的有效课包，离职后将下架其课包商品并停止接收新预约。</p>
            )}
          </div>
          <div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setConfirming(null)}
              disabled={Boolean(busy)}
            >
              返回
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => void leave()}
              disabled={Boolean(busy) || (transferableCount(confirming.id) > 0 && !transferCoachId)}
              aria-busy={busy === 'deactivate'}
            >
              {busy === 'deactivate' ? <ButtonLoading label="离职处理中…" /> : '确认离职'}
            </button>
          </div>
        </section>
      )}
      {editing && (
        <form className="editor-strip" onSubmit={save}>
          <div>
            <p className="eyebrow">{editing.id ? 'EDIT COACH' : 'NEW COACH'}</p>
            <h2>{editing.id ? '编辑教练' : '新增教练'}</h2>
          </div>
          {editing.id && (
            <label>
              关联小程序账号（可选）
              <select
                value={editing.userId ?? ''}
                onChange={(event) => setEditing({ ...editing, userId: event.target.value })}
              >
                <option value="">暂不绑定</option>
                {data.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {member.phone || member.id}
                  </option>
                ))}
                {editing.userId && !data.members.some((member) => member.id === editing.userId) && (
                  <option value={editing.userId}>{editing.userId}</option>
                )}
              </select>
            </label>
          )}
          <label>
            姓名
            <input
              value={editing.name}
              onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              required
            />
          </label>
          <label>
            手机号
            <input
              value={editing.phone}
              onChange={(event) => setEditing({ ...editing, phone: event.target.value })}
              required
            />
          </label>
          <label>
            专长
            <input
              value={editing.specialty}
              onChange={(event) => setEditing({ ...editing, specialty: event.target.value })}
              required
            />
          </label>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setEditing(null)}
              disabled={Boolean(busy)}
            >
              取消
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={Boolean(busy)}
              aria-busy={busy === 'save'}
            >
              {busy === 'save' ? <ButtonLoading label="保存中…" /> : '保存'}
            </button>
          </div>
        </form>
      )}
      <div className="filter-bar">
        <label className="search-field">
          <span>搜索</span>
          <input
            type="search"
            placeholder="搜索教练姓名、手机号或专长"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span>共 {filtered.length} 位教练</span>
      </div>
      <div className="master-detail">
        <section className="table-wrap master">
          <table>
            <thead>
              <tr>
                <th>教练</th>
                <th>专长</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((coach) => (
                <tr key={coach.id} className={selectedId === coach.id ? 'selected-row' : undefined}>
                  <td>
                    <button
                      className="row-link"
                      type="button"
                      onClick={() => setSelectedId(coach.id)}
                    >
                      <strong>{coach.name}</strong>
                      <span>{coach.phone}</span>
                    </button>
                  </td>
                  <td>{coach.specialty}</td>
                  <td>
                    <span className={`status ${coach.status}`}>
                      {coach.status === 'active' ? '在岗' : '已离职'}
                    </span>
                  </td>
                  <td>
                    <div className="button-row compact">
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setEditing({ ...coach })}
                        disabled={Boolean(busy)}
                      >
                        编辑
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() =>
                          coach.status === 'active' ? requestLeave(coach) : void reactivate(coach)
                        }
                        disabled={Boolean(busy)}
                        aria-busy={busy === `status-${coach.id}`}
                      >
                        {busy === `status-${coach.id}` ? (
                          <ButtonLoading label="恢复中…" />
                        ) : coach.status === 'active' ? (
                          '离职'
                        ) : (
                          '恢复在岗'
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="empty-state">没有符合搜索条件的教练。</p>}
        </section>
        <aside className="detail-panel">
          {selected ? (
            <>
              <p className="eyebrow">COACH DETAIL</p>
              <div className="detail-title">
                <h2>{selected.name}</h2>
                <span className={`status ${selected.status}`}>
                  {selected.status === 'active' ? '在岗' : '已离职'}
                </span>
              </div>
              <dl className="fact-list">
                <div>
                  <dt>训练方向</dt>
                  <dd>{selected.specialty}</dd>
                </div>
                <div>
                  <dt>联系电话</dt>
                  <dd>{selected.phone}</dd>
                </div>
                <div>
                  <dt>账号身份</dt>
                  <dd>{selected.userId ? `教练账号 · ${selected.userId}` : '未绑定小程序账号'}</dd>
                </div>
                <div>
                  <dt>近期排班</dt>
                  <dd>{selected.schedule.length} 节</dd>
                </div>
              </dl>
              <h3>近期排班</h3>
              <div className="schedule-list">
                {selected.schedule.length === 0 && (
                  <p className="empty-state">近期没有安排课程。</p>
                )}
                {selected.schedule.map((slot) => (
                  <article key={`${slot.date}-${slot.time}`}>
                    <time>
                      {slot.date}
                      <strong>{slot.time}</strong>
                    </time>
                    <span>
                      {slot.member} · {slot.course}
                    </span>
                  </article>
                ))}
              </div>
              <h3>历史课程</h3>
              <div className="schedule-list">
                {selected.history.length === 0 && <p className="empty-state">暂无历史课程记录。</p>}
                {selected.history.map((course) => (
                  <article key={`${course.date}-${course.member}-${course.status}`}>
                    <span>
                      {course.date} · {course.member} · {course.status}
                    </span>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p className="empty-state">选择一位教练查看详情。</p>
          )}
        </aside>
      </div>
    </section>
  )
}
