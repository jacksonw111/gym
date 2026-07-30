import type { AdminData } from '../api'

const money = (value: number) =>
  new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(value)

export function DashboardPage({
  data,
  navigate,
}: {
  data: AdminData
  navigate: (page: 'bookings' | 'appeals') => void
}) {
  const todayBookings = data.bookings.filter((booking) => booking.date === '2026-07-30')
  const pendingAppeals = data.appeals.filter((appeal) => appeal.status === 'pending')
  const anomalies = data.bookings.filter((booking) =>
    ['coach_cancelled_consumed', 'coach_cancelled_released'].includes(booking.status),
  )
  const totalSales = data.sales.reduce((sum, sale) => sum + sale.amount, 0)

  return (
    <section>
      <header className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">THURSDAY · 30 JUL</p>
          <h1>
            今天，场馆有 <em>{todayBookings.length}</em> 节课
          </h1>
          <p>
            需要优先看的是 {pendingAppeals.length} 条申诉与 {anomalies.length} 条异常记录。
          </p>
        </div>
        <time className="date-stamp" dateTime="2026-07-30">
          <strong>30</strong>
          <span>JUL / 2026</span>
        </time>
      </header>

      <div className="metric-strip">
        <button type="button" onClick={() => navigate('bookings')}>
          <span>今日课程</span>
          <strong>{todayBookings.length}</strong>
          <small>{todayBookings.filter((item) => item.status === 'booked').length} 节待上课</small>
        </button>
        <button type="button" className="urgent" onClick={() => navigate('appeals')}>
          <span>待处理申诉</span>
          <strong>{pendingAppeals.length}</strong>
          <small>建议今日闭店前处理</small>
        </button>
        <button type="button" onClick={() => navigate('bookings')}>
          <span>异常预约</span>
          <strong>{anomalies.length}</strong>
          <small>涉及扣课需复核</small>
        </button>
        <div>
          <span>近期销售</span>
          <strong>{money(totalSales)}</strong>
          <small>最近 2 笔支付</small>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="section-block">
          <div className="section-title">
            <div>
              <p className="eyebrow">TODAY’S FLOOR</p>
              <h2>今日课程</h2>
            </div>
            <button type="button" className="text-button" onClick={() => navigate('bookings')}>
              查看全部 →
            </button>
          </div>
          <div className="timeline-list">
            {todayBookings.map((booking) => (
              <article key={booking.id}>
                <time>{booking.time.split('–')[0]}</time>
                <div>
                  <strong>{booking.memberName}</strong>
                  <span>
                    {booking.packageName} · {booking.coachName}
                  </span>
                </div>
                <span className={`status ${booking.status}`}>
                  {booking.status === 'completed' ? '已完成' : '待上课'}
                </span>
              </article>
            ))}
          </div>
        </section>
        <section className="section-block alert-block">
          <div className="section-title">
            <div>
              <p className="eyebrow">NEEDS ATTENTION</p>
              <h2>需要你处理</h2>
            </div>
          </div>
          {pendingAppeals.length === 0 && <p className="empty-state">今日没有待处理申诉。</p>}
          {pendingAppeals.map((appeal) => (
            <article className="attention-item" key={appeal.id}>
              <span className="signal">!</span>
              <div>
                <strong>{appeal.memberName}的扣课申诉</strong>
                <p>
                  {appeal.coachName} · {appeal.courseAt}
                </p>
                <button type="button" className="text-button" onClick={() => navigate('appeals')}>
                  去核实
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>

      <section className="section-block sales-block">
        <div className="section-title">
          <div>
            <p className="eyebrow">RECENT SALES</p>
            <h2>近期销售</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>支付时间</th>
                <th>会员</th>
                <th>商品快照</th>
                <th>实收</th>
              </tr>
            </thead>
            <tbody>
              {data.sales.map((sale) => (
                <tr key={sale.id}>
                  <td>{sale.paidAt}</td>
                  <td>{sale.memberName}</td>
                  <td>{sale.productName}</td>
                  <td className="numeric">{money(sale.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
