// @vitest-environment happy-dom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { developmentApi, resetDevelopmentData } from './api/development'
import { App } from './app'
import './test/setup'

const login = async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.type(screen.getByLabelText('管理员账号'), 'admin')
  await user.type(screen.getByLabelText('密码'), 'Purui2026!')
  await user.click(screen.getByRole('button', { name: '登录后台' }))
  await screen.findByRole('navigation', { name: '后台导航' })
  return user
}

beforeEach(() => {
  resetDevelopmentData()
})

describe('管理员登录', () => {
  it('未登录时只显示登录门禁', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '把训练馆握在手里' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '后台导航' })).not.toBeInTheDocument()
  })

  it('有效账号登录后打开完整导航', async () => {
    await login()

    expect(screen.getByRole('button', { name: '概览' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '教练' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '申诉' })).toBeInTheDocument()
    expect(screen.queryByText('02')).not.toBeInTheDocument()
  })

  it('无效账号显示明确错误', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('管理员账号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: '登录后台' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('账号或密码不正确')
  })

  it('登录提交时显示基础 loading 和明确文案', async () => {
    let finishLogin: (() => void) | undefined
    const api = {
      ...developmentApi,
      login: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishLogin = resolve
          }),
      ),
    }
    const user = userEvent.setup()
    render(<App api={api} />)

    await user.type(screen.getByLabelText('管理员账号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'Purui2026!')
    await user.click(screen.getByRole('button', { name: '登录后台' }))

    const button = screen.getByRole('button', { name: '登录中…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('.button-spinner')).toBeInTheDocument()

    finishLogin?.()
  })
})

describe('后台管理流程', () => {
  it('点击导航可切换到会员页面', async () => {
    const user = await login()

    await user.click(screen.getByRole('button', { name: '会员' }))

    expect(screen.getByRole('status', { name: '正在前往会员' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '会员管理' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索会员姓名或手机号')).toBeInTheDocument()
  })

  it('确认后离职教练：先转移有效课包并下架课包商品', async () => {
    const user = await login()
    await user.click(screen.getByRole('button', { name: '教练' }))

    const coachRow = screen.getByRole('row', { name: /林骁/ })
    await user.click(within(coachRow).getByRole('button', { name: '离职' }))
    expect(screen.getByText('确认林骁离职？')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('接收教练'), 'coach-zhoulan')
    await user.click(screen.getByRole('button', { name: '确认离职' }))

    expect(await within(coachRow).findByText('已离职')).toBeInTheDocument()
    expect(within(coachRow).getByRole('button', { name: '恢复在岗' })).toBeInTheDocument()
  })

  it('新增教练无需绑定小程序账号', async () => {
    const user = await login()
    await user.click(screen.getByRole('button', { name: '教练' }))
    await user.click(screen.getByRole('button', { name: '＋ 新增教练' }))

    expect(screen.queryByLabelText('关联小程序账号（可选）')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('姓名'), '陈教练')
    await user.type(screen.getByLabelText('手机号'), '18610682231')
    await user.type(screen.getByLabelText('专长'), '体能训练')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('row', { name: /陈教练/ })).toBeInTheDocument()
    expect(screen.getByText('未绑定小程序账号')).toBeInTheDocument()
  })

  it('保存教练时显示基础 loading 和明确文案', async () => {
    let finishSave: ((value: { id: string }) => void) | undefined
    const api = {
      ...developmentApi,
      getSession: () => true,
      saveCoach: vi.fn(
        () =>
          new Promise<{ id: string }>((resolve) => {
            finishSave = resolve
          }),
      ),
    }
    const user = userEvent.setup()
    render(<App api={api} />)
    await screen.findByRole('navigation', { name: '后台导航' })
    await user.click(screen.getByRole('button', { name: '教练' }))
    await user.click(screen.getByRole('button', { name: '＋ 新增教练' }))
    await user.type(screen.getByLabelText('姓名'), '陈教练')
    await user.type(screen.getByLabelText('手机号'), '18610682231')
    await user.type(screen.getByLabelText('专长'), '体能训练')
    await user.click(screen.getByRole('button', { name: '保存' }))

    const button = screen.getByRole('button', { name: '保存中…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('.button-spinner')).toBeInTheDocument()

    finishSave?.({ id: 'coach-new' })
  })

  it('人工调课要求非零整数且原因必填', async () => {
    const user = await login()
    await user.click(screen.getByRole('button', { name: '会员' }))
    await user.click(screen.getByRole('button', { name: '查看陈澄' }))

    await user.type(screen.getByLabelText('调整课时'), '1.5')
    await user.click(screen.getByRole('button', { name: '确认调整' }))
    expect(screen.getByRole('alert')).toHaveTextContent('课时必须是非 0 整数')

    await user.clear(screen.getByLabelText('调整课时'))
    await user.type(screen.getByLabelText('调整课时'), '2')
    await user.click(screen.getByRole('button', { name: '确认调整' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请填写调整原因')
  })

  it('课包下架后记录仍然保留', async () => {
    const user = await login()
    await user.click(screen.getByRole('button', { name: '课包' }))

    const productRow = screen.getByRole('row', { name: /12 节私教进阶包/ })
    await user.click(within(productRow).getByRole('button', { name: '下架' }))

    expect(await within(productRow).findByText('已下架')).toBeInTheDocument()
    expect(within(productRow).getByRole('button', { name: '上架' })).toBeInTheDocument()
  })

  it('预约记录按状态筛选', async () => {
    const user = await login()
    await user.click(screen.getByRole('button', { name: '预约' }))

    await user.selectOptions(screen.getByLabelText('预约状态'), 'completed')

    expect(screen.getByRole('row', { name: /陈澄.*已完成/ })).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /沈舟.*待上课/ })).not.toBeInTheDocument()
  })

  it('处理申诉前必须填写处理说明', async () => {
    const user = await login()
    await user.click(screen.getByRole('button', { name: '申诉' }))
    await user.click(screen.getByRole('button', { name: '查看申诉 A-240730' }))
    await user.click(screen.getByRole('button', { name: '驳回申诉' }))

    expect(screen.getByRole('alert')).toHaveTextContent('请填写处理说明')
    expect(screen.getByText('待处理')).toBeInTheDocument()
  })

  it('通过申诉后进入只读状态并退回一节课', async () => {
    const user = await login()
    await user.click(screen.getByRole('button', { name: '申诉' }))
    await user.click(screen.getByRole('button', { name: '查看申诉 A-240730' }))

    expect(screen.getByText('当前可用 6 节')).toBeInTheDocument()
    await user.type(screen.getByLabelText('处理说明'), '核实为教练临时取消，退回课时')
    await user.click(screen.getByRole('button', { name: '通过并退回 1 节' }))

    expect(await screen.findByText('已通过')).toBeInTheDocument()
    expect(screen.getByText('当前可用 7 节')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '驳回申诉' })).not.toBeInTheDocument()
    expect(screen.getByText('处理后记录只读')).toBeInTheDocument()
  })

  it('多课包会员只调整点击的第二份课包', async () => {
    const data = await developmentApi.loadData()
    const member = data.members[0]
    member?.packages.push({
      id: 'package-chen-trial',
      productName: '4 节体验课包',
      coachId: 'coach-zhoulan',
      coachName: '周岚',
      available: 4,
      locked: 0,
      used: 0,
      total: 4,
      purchasedAt: '2026-07-28',
      changes: [],
    })
    localStorage.setItem('purui-admin-data', JSON.stringify(data))
    const user = await login()
    await user.click(screen.getByRole('button', { name: '会员' }))
    await user.click(screen.getByRole('button', { name: '查看陈澄' }))

    const deltas = screen.getAllByLabelText('调整课时')
    const reasons = screen.getAllByLabelText('调整原因')
    const buttons = screen.getAllByRole('button', { name: '确认调整' })
    const secondDelta = deltas[1]
    const secondReason = reasons[1]
    const secondButton = buttons[1]
    if (!secondDelta || !secondReason || !secondButton) throw new Error('第二份课包表单缺失')
    await user.type(secondDelta, '2')
    await user.type(secondReason, '第二份课包线下补课')
    await user.click(secondButton)

    const after = await developmentApi.loadData()
    expect(after.members[0]?.packages[0]).toMatchObject({ available: 6, total: 12 })
    expect(after.members[0]?.packages[1]).toMatchObject({ available: 6, total: 6 })
  })

  it('会员详情显示人工调课原因和课时变化', async () => {
    const user = await login()
    await user.click(screen.getByRole('button', { name: '会员' }))
    await user.click(screen.getByRole('button', { name: '查看陈澄' }))

    await user.type(screen.getByLabelText('调整课时'), '2')
    await user.type(screen.getByLabelText('调整原因'), '补偿停课')
    await user.click(screen.getByRole('button', { name: '确认调整' }))

    expect(await screen.findByText('补偿停课')).toBeInTheDocument()
    expect(screen.getByText('可用 +2 / 总课时 +2')).toBeInTheDocument()
  })

  it('教练详情显示账号身份和历史课程', async () => {
    const user = await login()
    await user.click(screen.getByRole('button', { name: '教练' }))

    expect(screen.getByText('教练账号 · coach-user-linxiao')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '历史课程' })).toBeInTheDocument()
    expect(screen.getByText('2026-07-26 · 陈澄 · 教练取消（已扣课）')).toBeInTheDocument()
  })

  it('预约详情显示课程反馈和关联申诉', async () => {
    const user = await login()
    await user.click(screen.getByRole('button', { name: '预约' }))

    const completed = screen.getByRole('row', { name: /陈澄.*已完成/ })
    await user.click(within(completed).getByRole('button', { name: '详情 →' }))
    expect(screen.getByRole('heading', { name: '课程反馈' })).toBeInTheDocument()
    expect(screen.getByText('★★★★★ 动作纠正很细致。')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('预约状态'), 'coach_cancelled_consumed')
    const appealed = screen.getByRole('row', { name: /陈澄.*教练取消/ })
    await user.click(within(appealed).getByRole('button', { name: '详情 →' }))
    expect(screen.getByRole('heading', { name: '关联申诉' })).toBeInTheDocument()
    expect(screen.getByText('A-240730 · 待处理')).toBeInTheDocument()
  })

  it('申诉详情显示取消来源和完整课时变化', async () => {
    const user = await login()
    await user.click(screen.getByRole('button', { name: '申诉' }))
    await user.click(screen.getByRole('button', { name: '查看申诉 A-240730' }))

    expect(screen.getByText('教练取消 · 已扣课')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '完整课时变化' })).toBeInTheDocument()
    expect(screen.getByText('锁定课时 · 可用 -1 / 锁定 +1')).toBeInTheDocument()
    expect(screen.getByText('核销课时 · 锁定 -1 / 已用 +1')).toBeInTheDocument()
  })
})
