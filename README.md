# 普瑞健身

普瑞健身会员预约、教练排班与运营管理系统，包含微信小程序会员端、教练端、网页运营后台和 CloudBase 云端服务。

## 已实现的业务

- 新用户首次打开小程序后，按真实微信身份自动建立会员档案。
- 未购课用户查看课包与可选教练；支付成功后，课包与所选教练绑定。
- 会员查看教练课程表和已占用时段，按固定一小时预约。
- 会员可在开课两小时前自行取消并退回课时；不足两小时需联系教练处理。
- 教练默认可开放 10:00—21:00 的整点时段，也可自主关闭或重新开放时段。关闭开放时间不会影响已有预约。
- 教练可取消预约，并决定是否退回一节课。
- 课程结束后会员确认完成，可选择评分和填写反馈；反馈可留空。
- 会员可查看历史课程并发起申诉，管理员决定是否退回课时。
- 运营后台支持登录、教练、会员、课包、预约和申诉管理。

## 数据模式

项目现在默认连接真实 CloudBase 数据，不再默认使用模拟会员。

- 小程序：`miniprogram/config/env.ts` 中 `USE_LOCAL_DEVELOPMENT_DATA` 默认为 `false`。开发版和正式版都会调用云函数。
- 运营后台：开发和构建时必须设置 `VITE_CLOUDBASE_ENV_ID`。只有显式设置 `VITE_ADMIN_DEVELOPMENT=true` 才会使用本地演示数据。
- 自动化测试仍使用隔离的测试数据，不会写入正式环境。

## 本地准备

需要 Node.js 20.19 或更高版本、npm、微信开发者工具，以及一个已开通数据库和云函数的 CloudBase 环境。

```bash
npm install
cp .env.example .env.local
```

把 `.env.local` 中两个环境编号填写为同一个 CloudBase 环境。部署前还需要填写定时任务口令和微信支付服务地址、口令。

在当前终端载入配置后，可以检查生产配置：

```bash
set -a
source .env.local
set +a
npm run verify:production-config
```

## 初始化管理员

首次部署后，在 CloudBase 数据库的 `admins` 集合新增一条记录：

```json
{
  "id": "admin-1",
  "username": "admin",
  "passwordHash": "这里填写密码摘要"
}
```

生成密码摘要：

```bash
node scripts/hash-admin-password.mjs "你的管理员密码"
```

不要把真实密码或生成结果提交到代码仓库。

## 创建真实会员和教练

1. 用户先打开一次小程序，系统会使用他的微信身份自动建立会员档案。
2. 管理员登录运营后台，在“教练管理”中新增教练。
3. 从“关联小程序用户”中选择该会员并保存。系统会给这个真实用户增加教练身份。
4. 用户重新进入小程序后，即可切换到教练端设置开放时段。

## 运行与检查

```bash
# 全部代码、类型与样式检查
npm run check

# 全部自动化测试
npm run test

# 构建三个云函数
npm run cloud:build

# 构建运营后台
VITE_CLOUDBASE_ENV_ID=你的环境编号 npm run admin:build
```

按本项目的完整交付检查：

```bash
VITE_CLOUDBASE_ENV_ID=你的环境编号 npm run verify
```

## 微信开发者工具

1. 导入项目根目录。
2. 确认 `project.config.json` 中的 AppID 是普瑞健身实际使用的小程序 AppID。
3. 确认小程序已关联目标 CloudBase 环境。
4. 选择“工具 → 构建 npm”，完成后编译。

`miniprogram/miniprogram_npm/` 是生成目录，不提交到 Git。

## 云端部署

`cloudbaserc.json` 已声明数据库集合、索引、三个云函数、运营后台静态站点和每小时自动结课任务。部署前先载入 `.env.local`，运行生产配置检查和完整交付检查，再使用 CloudBase 工具按该配置部署。

三个云函数分别负责：

- `gym-api`：登录、会员、课包、预约、排班、反馈、申诉和后台管理。
- `auto-complete-lessons`：定时完成超过结束时间的课程。
- `wechat-payment-notify`：接收经过支付服务验签的支付结果，并发放课包。

真实微信支付仍需已认证的小程序、商户号，以及可用的下单和回调验签服务。未配置这些信息时，不应开放正式购买入口。

## 目录

```text
admin/                                运营后台
cloudfunctions/gym-api/               主要云端业务
cloudfunctions/auto-complete-lessons/ 自动结课
cloudfunctions/wechat-payment-notify/ 支付回调
miniprogram/                          会员端与教练端小程序
tests/                                小程序与共享规则测试
docs/                                 需求设计与实施计划
```
