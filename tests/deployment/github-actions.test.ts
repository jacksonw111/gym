import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflowPath = join(process.cwd(), '.github/workflows/deploy-cloudbase.yml')

describe('GitHub Actions CloudBase 自动部署', () => {
  it('main 推送通过检查后更新三个云函数和后台静态站点', () => {
    const workflow = readFileSync(workflowPath, 'utf8')

    expect(workflow).toContain('branches: [main]')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('npm run verify')
    expect(workflow).toContain('secrets.TCB_SECRET_ID')
    expect(workflow).toContain('secrets.TCB_SECRET_KEY')
    expect(workflow).toContain('secrets.TCB_ENV_ID')
    expect(workflow).toContain('tcb fn code update gym-api')
    expect(workflow).toContain('tcb fn code update auto-complete-lessons')
    expect(workflow).toContain('tcb fn code update wechat-payment-notify')
    expect(workflow).toContain('tcb hosting deploy admin/dist admin')
    expect(workflow).not.toContain('EMAS')
    expect(workflow).not.toContain('framework deploy')
  })
})
