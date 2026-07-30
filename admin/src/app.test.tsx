// @vitest-environment happy-dom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDevelopmentData } from './api/development'
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
  })

  it('无效账号显示明确错误', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('管理员账号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: '登录后台' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('账号或密码不正确')
  })
})

describe('后台管理流程', () => {
  it('点击导航可切换到会员页面', async () => {
    const user = await login()

    await user.click(screen.getByRole('button', { name: '会员' }))

    expect(screen.getByRole('heading', { name: '会员管理' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索会员姓名或手机号')).toBeInTheDocument()
  })

  it('确认后停用教练且保留教练记录', async () => {
    const user = await login()
    await user.click(screen.getByRole('button', { name: '教练' }))

    const coachRow = screen.getByRole('row', { name: /林骁/ })
    await user.click(within(coachRow).getByRole('button', { name: '停用' }))
    expect(screen.getByText('确认停用林骁？')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认停用' }))

    expect(await within(coachRow).findByText('已停用')).toBeInTheDocument()
    expect(within(coachRow).getByRole('button', { name: '启用' })).toBeInTheDocument()
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
})
