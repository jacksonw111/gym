# 普瑞健身

普瑞健身包含微信小程序会员端、教练端、网页运营后台和 EMAS Serverless 服务。

## 已实现的业务

- 新用户可以先浏览课包和教练。只有点击购买，或在“我的”中点击登录后，才会选择头像、填写昵称并授权或手动填写手机号。
- 未购课用户查看课包与可选教练；购买成功后，课包与所选教练绑定。
- 会员查看教练课程表和已占用时段，按固定一小时预约。
- 会员可在开课两小时前自行取消并退回课时；不足两小时需联系教练处理。
- 教练默认可开放 10:00—21:00 的整点时段，也可自主关闭或重新开放时段。关闭开放时间不会影响已有预约。
- 教练可取消预约，并决定是否退回一节课。
- 课程结束后会员确认完成，可选择评分和填写反馈；反馈可留空。
- 会员可查看历史课程并发起申诉，管理员决定是否退回课时。
- 运营后台支持登录、教练、会员、课包、预约和申诉管理。

## 系统组成

```text
miniprogram/                         微信小程序会员端和教练端
admin/                               网页运营后台
server/gym/                          共用业务规则
emas/functions/                      EMAS 云函数入口
emas/database.json                   数据集合和索引清单
emas/storage-rules.json              文件存储权限清单
artifacts/emas/functions/            构建后可上传的云函数 ZIP
```

小程序和网页后台默认都连接真实 EMAS 服务。模拟数据只有在明确打开本地开发开关时才会使用，自动化测试使用隔离数据。

## 本地准备

需要 Node.js 20.19 或更高版本、npm、微信开发者工具，以及已开通云函数、云数据库、云存储和前端托管的 EMAS Serverless 服务空间。

```bash
npm install
cp miniprogram/config/emas.local.example.js miniprogram/config/emas.local.js
cp emas/secrets.example.json emas/secrets.local.json
cp emas/seed.example.json emas/seed.local.json
cp .env.example .env.local
```

填写以下本地文件：

- `miniprogram/config/emas.local.js`：小程序 AppID、Space ID、Client Secret 和 API Endpoint。
- `emas/secrets.local.json`：微信 AppID、微信 AppSecret、网页后台正式来源地址，以及正式支付服务地址和口令。测试空间可将 `production` 设为 `false`、`developmentPaymentsEnabled` 设为 `true`。
- `emas/seed.local.json`：一次性初始化口令、管理员密码摘要、初始课包和可选的教练资料。
- `admin/.env.local`：由自动部署脚本保存 `gym-admin-api` 的 HTTP 地址，一般不需要手动创建。

这些文件均被 Git 忽略，不会提交真实凭据。生成管理员密码摘要：

```bash
node scripts/hash-admin-password.mjs "你的管理员密码"
```

## 创建 EMAS 数据

`emas/database.json` 是需要在 EMAS 控制台创建的数据清单。创建其中 13 个集合：

```text
users
coaches
products
memberships
orders
schedules
lessons
appeals
ledger
admins
admin_sessions
booking_locks
operations
```

为每个集合建立清单内列出的索引，特别要保证以下索引唯一：

- `users.emasUserId`
- `booking_locks.slotKey`
- `operations.requestId`
- `admin_sessions.token`
- `orders.requestId`
- `schedules` 的 `coachId + startsAt`

数据库不向小程序和网页直接开放读写，所有数据都经过云函数。云存储按 `emas/storage-rules.json` 配置：已登录用户可上传 `/avatars/`，头像可公开读取，其他路径默认拒绝。

## 构建和部署

配置好阿里云 AccessKey 后，直接部署指定函数：

```bash
npm run emas:deploy -- gym-admin-api
```

脚本会自动构建、上传、部署、配置 HTTP 触发器和跨域来源，并把后台接口地址保存到 `admin/.env.local`。部署 `gym-admin-api` 时还会重新构建网页并发布到 EMAS 静态网站托管，终端最后会显示可直接打开的后台网址。以后更新后台仍运行同一条命令，不需要重复手动上传或填写地址。

只需要生成本地部署包、或准备在控制台手动上传时，运行：

```bash
npm run emas:build
```

构建结果：

```text
artifacts/emas/functions/gym-api.zip
artifacts/emas/functions/gym-admin-api.zip
artifacts/emas/functions/auto-complete-lessons.zip
artifacts/emas/functions/wechat-payment-notify.zip
artifacts/emas/functions/seed.zip
admin/dist/
```

手动部署时，在 EMAS 控制台按同名函数上传对应 ZIP：

1. `gym-api`：供小程序调用。
2. `gym-admin-api`：创建 HTTP 触发器，只允许 `POST` 和 `OPTIONS`。
3. `auto-complete-lessons`：创建每小时执行一次的定时触发器。
4. `wechat-payment-notify`：正式支付时创建 HTTP 触发器；未配置支付验签服务时不要开放购买。
5. `seed`：仅用于首次初始化。

后台接口的 HTTP 路径固定为 `/http/gym-admin-api`，后续重复部署不会改变地址。

### GitHub 自动发布

推送代码到 GitHub 的 `main` 分支后，`.github/workflows/deploy-emas.yml` 会先运行代码检查和全部测试，再自动发布 `gym-api`、`gym-admin-api`、后台网页和 `auto-complete-lessons`。也可以在 GitHub Actions 页面手动运行。

在 GitHub 仓库的 Settings → Secrets and variables → Actions 中配置：

- `ALIBABA_CLOUD_ACCESS_KEY_ID`
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
- `EMAS_MINIPROGRAM_CONFIG`：`miniprogram/config/emas.local.js` 对应对象的 JSON 内容
- `EMAS_SERVER_SECRETS`：`emas/secrets.local.json` 的 JSON 内容
- `WECHAT_APP_SECRET`：微信小程序 AppSecret

本地执行 `git commit` 不会触发 GitHub Actions，提交还需要通过 `git push` 推送到 `main`。一次性初始化函数和支付回调不会自动发布。

部署 `seed` 后，在控制台测试中传入：

```json
{
  "seedToken": "emas/seed.local.json 中的一次性初始化口令"
}
```

确认管理员和课包已写入后，删除或停用 `seed` 函数。自动部署会把 `admin/dist/` 发布为静态网站的首页。

`emas/secrets.local.json` 中的 `adminAllowedOrigin` 必须与浏览器实际打开后台时的来源完全一致，例如 `https://example.com`，不要带 `/admin/` 路径。

## 微信开发者工具

1. 导入项目根目录。
2. 确认 `project.config.json` 中的 AppID 是普瑞健身实际使用的小程序 AppID。
3. 选择“工具 → 构建 npm”，然后重新编译。
4. 使用真机测试头像、昵称和手机号授权；开发者工具不一定能返回真实手机号，因此界面同时支持手动填写。

`miniprogram/miniprogram_npm/` 是生成目录，不提交到 Git。

## 检查

```bash
# 代码、类型和样式检查
npm run check

# 全部自动化测试
npm test

# 生成 EMAS 云函数包和网页后台
npm run emas:build
```

真实微信支付仍需要已认证的小程序、微信商户号，以及可用的下单和回调验签服务。未配置这些信息时，服务端会拒绝正式支付请求。

从测试空间迁移到正式空间只需替换三个被忽略的本地配置文件、重新构建并上传，不需要修改业务代码。
