import { useMemo, useState } from 'react'
import type { AdminApi, AdminData, BalanceChange, Member, MembershipPackage } from '../api'

const money = (value: number) =>
  new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(value)

const changeDescription = (change: BalanceChange) =>
  [
    change.availableDelta
      ? `可用 ${change.availableDelta > 0 ? '+' : ''}${change.availableDelta}`
      : '',
    change.lockedDelta ? `锁定 ${change.lockedDelta > 0 ? '+' : ''}${change.lockedDelta}` : '',
    change.usedDelta ? `已用 ${change.usedDelta > 0 ? '+' : ''}${change.usedDelta}` : '',
    change.totalDelta ? `总课时 ${change.totalDelta > 0 ? '+' : ''}${change.totalDelta}` : '',
  ]
    .filter(Boolean)
    .join(' / ')

export function MembersPage({
  api,
  data,
  refresh,
}: {
  api: AdminApi
  data: AdminData
  refresh: () => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adjustments, setAdjustments] = useState<Record<string, { delta: string; reason: string }>>(
    {},
  )
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const selected = data.members.find((member) => member.id === selectedId)
  const filtered = useMemo(
    () =>
      data.members.filter((member) =>
        `${member.name}${member.phone}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [data.members, search],
  )

  const adjust = async (member: Member, membership: MembershipPackage) => {
    const adjustment = adjustments[membership.id] ?? { delta: '', reason: '' }
    setErrors((current) => ({ ...current, [membership.id]: '' }))
    setMessage('')
    const value = Number(adjustment.delta)
    if (!Number.isInteger(value) || value === 0) {
      setErrors((current) => ({ ...current, [membership.id]: '课时必须是非 0 整数' }))
      return
    }
    if (!adjustment.reason.trim()) {
      setErrors((current) => ({ ...current, [membership.id]: '请填写调整原因' }))
      return
    }
    try {
      await api.adjustPackage(membership.id, value, adjustment.reason.trim())
      await refresh()
      setAdjustments((current) => ({
        ...current,
        [membership.id]: { delta: '', reason: '' },
      }))
      setMessage(`已为${member.name}${value > 0 ? '增加' : '减少'} ${Math.abs(value)} 节课`)
    } catch (caught) {
      setErrors((current) => ({
        ...current,
        [membership.id]: caught instanceof Error ? caught.message : '调整失败',
      }))
    }
  }

  if (selected) {
    const appealRecords = data.appeals.filter((appeal) => selected.appealIds.includes(appeal.id))
    return (
      <section>
        <header className="page-heading">
          <div>
            <button className="back-link" type="button" onClick={() => setSelectedId(null)}>
              ← 返回会员列表
            </button>
            <p className="eyebrow">MEMBER PROFILE</p>
            <h1>{selected.name}</h1>
            <p>
              {selected.phone} · 加入于 {selected.joinedAt}
            </p>
          </div>
          <span className="member-code">
            ID / {selected.id.replace('member-', '').toUpperCase()}
          </span>
        </header>
        {message && (
          <p className="feedback success" role="status">
            {message}
          </p>
        )}
        <section className="section-block package-balance">
          <div className="section-title">
            <div>
              <p className="eyebrow">LESSON BALANCE</p>
              <h2>课包与教练绑定</h2>
            </div>
          </div>
          {selected.packages.map((membership) => {
            const adjustment = adjustments[membership.id] ?? { delta: '', reason: '' }
            const error = errors[membership.id]

            return (
              <div className="balance-layout" key={membership.id}>
                <div className="balance-summary">
                  <strong>{membership.productName}</strong>
                  <span>
                    绑定教练 {membership.coachName} · 购于 {membership.purchasedAt}
                  </span>
                  <div className="balance-counts">
                    <div className="available">
                      <strong>{membership.available}</strong>
                      <span>available / 可用</span>
                    </div>
                    <div className="locked">
                      <strong>{membership.locked}</strong>
                      <span>locked / 锁定</span>
                    </div>
                    <div className="used">
                      <strong>{membership.used}</strong>
                      <span>used / 已用</span>
                    </div>
                  </div>
                </div>
                <div className="adjust-form">
                  <p className="eyebrow">MANUAL ADJUSTMENT</p>
                  <h3>人工增减课时</h3>
                  <label>
                    调整课时
                    <input
                      inputMode="numeric"
                      placeholder="如 2 或 -1"
                      value={adjustment.delta}
                      onChange={(event) =>
                        setAdjustments((current) => ({
                          ...current,
                          [membership.id]: { ...adjustment, delta: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <label>
                    调整原因
                    <textarea
                      rows={3}
                      placeholder="说明线下补课、误扣修正等原因"
                      value={adjustment.reason}
                      onChange={(event) =>
                        setAdjustments((current) => ({
                          ...current,
                          [membership.id]: { ...adjustment, reason: event.target.value },
                        }))
                      }
                    />
                  </label>
                  {error && (
                    <p className="form-message error" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void adjust(selected, membership)}
                  >
                    确认调整
                  </button>
                </div>
                {membership.changes.length > 0 && (
                  <div className="balance-change-list">
                    <h3>余额变更记录</h3>
                    {membership.changes.map((change) => (
                      <article key={change.id}>
                        <div>
                          <strong>{change.note}</strong>
                          <time>{change.createdAt}</time>
                        </div>
                        <p>{changeDescription(change)}</p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </section>
        <div className="profile-grid">
          <section className="section-block">
            <div className="section-title">
              <h2>课程历史</h2>
            </div>
            <div className="compact-list">
              {selected.courseHistory.map((course) => (
                <article key={`${course.date}-${course.course}`}>
                  <time>{course.date}</time>
                  <div>
                    <strong>{course.course}</strong>
                    <span>{course.coach}</span>
                  </div>
                  <span>{course.status}</span>
                </article>
              ))}
            </div>
          </section>
          <section className="section-block">
            <div className="section-title">
              <h2>订单与商品快照</h2>
            </div>
            <div className="compact-list">
              {selected.orders.map((order) => (
                <article key={order.id}>
                  <time>{order.paidAt}</time>
                  <div>
                    <strong>{order.id}</strong>
                    <span>{order.productSnapshot}</span>
                  </div>
                  <span>{money(order.amount)}</span>
                </article>
              ))}
            </div>
          </section>
          <section className="section-block">
            <div className="section-title">
              <h2>反馈</h2>
            </div>
            {selected.feedback.length === 0 && <p className="empty-state">暂无课程反馈。</p>}
            {selected.feedback.map((feedback) => (
              <blockquote key={feedback.course}>
                <strong>{'★'.repeat(feedback.rating)}</strong>
                <p>{feedback.comment}</p>
                <cite>{feedback.course}</cite>
              </blockquote>
            ))}
          </section>
          <section className="section-block">
            <div className="section-title">
              <h2>申诉记录</h2>
            </div>
            {appealRecords.length === 0 && <p className="empty-state">暂无申诉记录。</p>}
            {appealRecords.map((appeal) => (
              <div className="appeal-summary" key={appeal.id}>
                <span className={`status ${appeal.status}`}>
                  {appeal.status === 'pending'
                    ? '待处理'
                    : appeal.status === 'approved'
                      ? '已通过'
                      : '已驳回'}
                </span>
                <strong>{appeal.reason}</strong>
                <span>{appeal.createdAt}</span>
              </div>
            ))}
          </section>
        </div>
      </section>
    )
  }

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">MEMBER DIRECTORY</p>
          <h1>会员管理</h1>
          <p>查看会员课包、课程轨迹与售后记录，人工调课会立即刷新余额。</p>
        </div>
      </header>
      <div className="filter-bar">
        <label className="search-field">
          <span>搜索</span>
          <input
            type="search"
            placeholder="搜索会员姓名或手机号"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span>共 {filtered.length} 位会员</span>
      </div>
      <section className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>会员</th>
              <th>绑定教练</th>
              <th>课包</th>
              <th>可用 / 锁定 / 已用</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((member) => {
              const membership = member.packages[0]
              return (
                <tr key={member.id}>
                  <td>
                    <strong>{member.name}</strong>
                    <small>{member.phone}</small>
                  </td>
                  <td>{membership?.coachName ?? '—'}</td>
                  <td>{membership?.productName ?? '暂无课包'}</td>
                  <td className="numeric balance-inline">
                    <b>{membership?.available ?? 0}</b> / {membership?.locked ?? 0} /{' '}
                    {membership?.used ?? 0}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-button"
                      aria-label={`查看${member.name}`}
                      onClick={() => setSelectedId(member.id)}
                    >
                      查看详情 →
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="empty-state">没有符合搜索条件的会员。</p>}
      </section>
    </section>
  )
}
