import { type FormEvent, useMemo, useState } from 'react'
import type { AdminApi, AdminData, Coach, CoachInput } from '../api'

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
  const [message, setMessage] = useState('')
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

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!editing?.name || !editing.phone || !editing.specialty) return
    await api.saveCoach(editing)
    await refresh()
    setEditing(null)
    setMessage('教练资料已保存')
  }

  const toggle = async (coach: Coach) => {
    if (coach.status === 'active') {
      setConfirming(coach)
      return
    }
    await api.setCoachStatus(coach.id, 'active')
    await refresh()
    setMessage(`${coach.name}已启用`)
  }

  const deactivate = async () => {
    if (!confirming) return
    await api.setCoachStatus(confirming.id, 'inactive')
    await refresh()
    setMessage(`${confirming.name}已停用，历史课程已保留`)
    setConfirming(null)
  }

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">COACH ROSTER</p>
          <h1>教练管理</h1>
          <p>维护教练资料、在岗状态与近期排班。停用不会清除历史课程。</p>
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
      {confirming && (
        <section className="inline-confirm" aria-label="停用确认">
          <div>
            <strong>确认停用{confirming.name}？</strong>
            <p>该教练将不能接受新预约，已有排班与课程历史会继续保留。</p>
          </div>
          <div>
            <button type="button" className="secondary-button" onClick={() => setConfirming(null)}>
              返回
            </button>
            <button type="button" className="danger-button" onClick={() => void deactivate()}>
              确认停用
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
            <button type="button" className="secondary-button" onClick={() => setEditing(null)}>
              取消
            </button>
            <button type="submit" className="primary-button">
              保存
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
                      {coach.status === 'active' ? '在岗' : '已停用'}
                    </span>
                  </td>
                  <td>
                    <div className="button-row compact">
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setEditing({ ...coach })}
                      >
                        编辑
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => void toggle(coach)}
                      >
                        {coach.status === 'active' ? '停用' : '启用'}
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
                  {selected.status === 'active' ? '在岗' : '已停用'}
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
                  <dd>教练账号 · {selected.userId}</dd>
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
