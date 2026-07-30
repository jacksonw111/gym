import { type FormEvent, useCallback, useEffect, useState } from 'react'
import type { AdminApi, AdminData } from './api'
import { adminApi } from './api'
import { AdminIcon, type AdminIconName } from './components/admin-icon'
import { AppealsPage } from './pages/appeals'
import { BookingsPage } from './pages/bookings'
import { CoachesPage } from './pages/coaches'
import { DashboardPage } from './pages/dashboard'
import { MembersPage } from './pages/members'
import { ProductsPage } from './pages/products'

type Page = 'dashboard' | 'coaches' | 'members' | 'products' | 'bookings' | 'appeals'

const pages: Array<{ id: Page; label: string; icon: AdminIconName }> = [
  { id: 'dashboard', label: '概览', icon: 'dashboard' },
  { id: 'coaches', label: '教练', icon: 'coaches' },
  { id: 'members', label: '会员', icon: 'members' },
  { id: 'products', label: '课包', icon: 'products' },
  { id: 'bookings', label: '预约', icon: 'bookings' },
  { id: 'appeals', label: '申诉', icon: 'appeals' },
]

function LoginGate({ api, onLogin }: { api: AdminApi; onLogin: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.login(username, password)
      onLogin()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登录失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-layout">
      <section className="login-brand" aria-label="普瑞健身介绍">
        <div>
          <p className="eyebrow light">PURUI STRENGTH CLUB · OPERATIONS</p>
          <p className="brand-monogram" aria-hidden="true">
            PR
          </p>
        </div>
        <div>
          <p className="login-index">NO. 01 / TRAIN HARD, RUN CLEAR.</p>
          <h1>把训练馆握在手里</h1>
          <p className="login-lead">
            今日课程、会员课时与异常处理集中在一处。少一点来回确认，多一点训练现场。
          </p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <p className="eyebrow">管理员入口</p>
          <h2>开始今日运营</h2>
          <p className="muted">使用分配给你的管理员账号登录。</p>
          <form onSubmit={submit} className="stack-form">
            <label>
              管理员账号
              <input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label>
              密码
              <input
                autoComplete="current-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && (
              <p className="form-message error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button wide" type="submit" disabled={submitting}>
              {submitting ? '正在验证…' : '登录后台'}
            </button>
          </form>
          {import.meta.env.DEV && (
            <p className="dev-hint">
              开发账号 <strong>admin</strong> · 密码 <strong>Purui2026!</strong>
            </p>
          )}
        </div>
      </section>
    </main>
  )
}

function AdminShell({
  api,
  data,
  page,
  onNavigate,
  onRefresh,
  onLogout,
}: {
  api: AdminApi
  data: AdminData
  page: Page
  onNavigate: (page: Page) => void
  onRefresh: () => Promise<void>
  onLogout: () => void
}) {
  const activePage = pages.find((item) => item.id === page)
  const pendingAppeals = data.appeals.filter((appeal) => appeal.status === 'pending').length
  const pageContent = {
    dashboard: <DashboardPage data={data} navigate={onNavigate} />,
    coaches: <CoachesPage api={api} data={data} refresh={onRefresh} />,
    members: <MembersPage api={api} data={data} refresh={onRefresh} />,
    products: <ProductsPage api={api} data={data} refresh={onRefresh} />,
    bookings: <BookingsPage data={data} />,
    appeals: <AppealsPage api={api} data={data} refresh={onRefresh} />,
  }[page]

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-mark">PR</span>
          <div>
            <strong>普瑞健身</strong>
            <span>运营后台</span>
          </div>
        </div>
        <nav aria-label="后台导航">
          {pages.map((item) => (
            <button
              className={item.id === page ? 'nav-item active' : 'nav-item'}
              key={item.id}
              type="button"
              aria-label={item.label}
              aria-current={item.id === page ? 'page' : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <AdminIcon name={item.icon} />
              {item.label}
              {item.id === 'appeals' && pendingAppeals > 0 && (
                <b title={`${pendingAppeals} 条待处理`}>{pendingAppeals}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span>今日营业</span>
          <strong>07:00—22:30</strong>
          <button type="button" className="text-button inverse" onClick={onLogout}>
            退出登录
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">PURUI / OPERATIONS</p>
            <strong>{activePage?.label}</strong>
          </div>
          <div className="operator">
            <span className="live-dot" />
            运营在线
            <span className="operator-name">管理员</span>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {pageContent}
        </main>
      </div>
    </div>
  )
}

export function App({ api = adminApi }: { api?: AdminApi }) {
  const [authenticated, setAuthenticated] = useState(api.getSession())
  const [data, setData] = useState<AdminData | null>(null)
  const [page, setPage] = useState<Page>('dashboard')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setError('')
    try {
      setData(await api.loadData())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '数据加载失败')
    }
  }, [api])

  useEffect(() => {
    if (authenticated) void refresh()
  }, [authenticated, refresh])

  const logout = async () => {
    await api.logout()
    setData(null)
    setPage('dashboard')
    setAuthenticated(false)
  }

  if (!authenticated) {
    return <LoginGate api={api} onLogin={() => setAuthenticated(true)} />
  }

  if (error) {
    return (
      <main className="center-state">
        <p className="eyebrow">数据连接中断</p>
        <h1>后台暂时没有拿到数据</h1>
        <p role="alert">{error}</p>
        <button type="button" className="primary-button" onClick={() => void refresh()}>
          重新加载
        </button>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="center-state" aria-busy="true">
        <span className="loading-mark">PR</span>
        <p>正在整理今日运营数据…</p>
      </main>
    )
  }

  return (
    <AdminShell
      api={api}
      data={data}
      page={page}
      onNavigate={setPage}
      onRefresh={refresh}
      onLogout={() => void logout()}
    />
  )
}
