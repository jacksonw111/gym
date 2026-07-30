import { useMemo, useState } from 'react'
import type { AdminData, Booking, LessonStatus } from '../api'

const statusLabels: Record<LessonStatus, string> = {
  booked: '待上课',
  member_cancelled: '会员取消',
  coach_cancelled_released: '教练取消（已退课）',
  coach_cancelled_consumed: '教练取消（已扣课）',
  completed: '已完成',
}

export function BookingsPage({ data }: { data: AdminData }) {
  const [date, setDate] = useState('')
  const [coach, setCoach] = useState('')
  const [member, setMember] = useState('')
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<Booking | null>(null)
  const filtered = useMemo(
    () =>
      data.bookings.filter(
        (booking) =>
          (!date || booking.date === date) &&
          (!coach || booking.coachId === coach) &&
          (!member || booking.memberId === member) &&
          (!status || booking.status === status),
      ),
    [coach, data.bookings, date, member, status],
  )
  const linkedAppeals = selected
    ? data.appeals.filter((appeal) => appeal.lessonId === selected.id)
    : []

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">BOOKING LEDGER</p>
          <h1>预约记录</h1>
          <p>从预约到完成、取消与课时变化，保留每一次状态与来源。</p>
        </div>
      </header>
      <div className="filter-bar multi-filter">
        <label>
          课程日期
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          教练
          <select value={coach} onChange={(event) => setCoach(event.target.value)}>
            <option value="">全部教练</option>
            {data.coaches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          会员
          <select value={member} onChange={(event) => setMember(event.target.value)}>
            <option value="">全部会员</option>
            {data.members.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          预约状态
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span>{filtered.length} 条记录</span>
      </div>
      <div className="master-detail">
        <section className="table-wrap master">
          <table>
            <thead>
              <tr>
                <th>日期 / 时间</th>
                <th>会员</th>
                <th>教练</th>
                <th>课包</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((booking) => (
                <tr key={booking.id}>
                  <td>
                    <strong>{booking.date}</strong>
                    <small>{booking.time}</small>
                  </td>
                  <td>{booking.memberName}</td>
                  <td>{booking.coachName}</td>
                  <td>{booking.packageName}</td>
                  <td>
                    <span className={`status ${booking.status}`}>
                      {statusLabels[booking.status]}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setSelected(booking)}
                    >
                      详情 →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="empty-state">当前筛选条件下没有预约，试试放宽条件。</p>
          )}
        </section>
        <aside className="detail-panel booking-detail">
          {selected ? (
            <>
              <p className="eyebrow">BOOKING DETAIL</p>
              <div className="detail-title">
                <h2>{selected.memberName}</h2>
                <span className={`status ${selected.status}`}>{statusLabels[selected.status]}</span>
              </div>
              <dl className="fact-list">
                <div>
                  <dt>课程时间</dt>
                  <dd>
                    {selected.date} {selected.time}
                  </dd>
                </div>
                <div>
                  <dt>教练 / 会员</dt>
                  <dd>
                    {selected.coachName} / {selected.memberName}
                  </dd>
                </div>
                <div>
                  <dt>课包</dt>
                  <dd>{selected.packageName}</dd>
                </div>
                <div>
                  <dt>完成 / 取消来源</dt>
                  <dd>{selected.source}</dd>
                </div>
              </dl>
              <h3>状态变化</h3>
              <ol className="event-list">
                {selected.timeline.map((event) => (
                  <li key={`${event.at}-${event.label}`}>
                    <time>{event.at}</time>
                    <strong>{event.label}</strong>
                    <span>{event.source}</span>
                  </li>
                ))}
              </ol>
              <h3>课时流水</h3>
              <ol className="event-list ledger">
                {selected.ledger.map((entry) => (
                  <li key={`${entry.at}-${entry.operation}`}>
                    <time>{entry.at}</time>
                    <strong>{entry.operation}</strong>
                    <span>{entry.description}</span>
                  </li>
                ))}
              </ol>
              <h3>课程反馈</h3>
              {selected.feedback ? (
                <div className="statement">
                  <strong>
                    {'★'.repeat(selected.feedback.rating ?? 0)} {selected.feedback.comment}
                  </strong>
                  <span>{selected.feedback.submittedAt}</span>
                </div>
              ) : (
                <p className="empty-state">暂无课程反馈。</p>
              )}
              <h3>关联申诉</h3>
              {linkedAppeals.length > 0 ? (
                <div className="schedule-list">
                  {linkedAppeals.map((appeal) => (
                    <article key={appeal.id}>
                      <strong>
                        {appeal.id.replace('appeal-', 'A-')} ·{' '}
                        {appeal.status === 'pending'
                          ? '待处理'
                          : appeal.status === 'approved'
                            ? '已通过'
                            : '已驳回'}
                      </strong>
                      <span>{appeal.reason}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="empty-state">该课程没有关联申诉。</p>
              )}
            </>
          ) : (
            <p className="empty-state">选择一条预约查看状态变化与课时流水。</p>
          )}
        </aside>
      </div>
    </section>
  )
}
