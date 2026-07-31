# GitHub Actions 自动发布 EMAS 设计

## 目标

代码推送到 GitHub 的 `main` 分支后，自动检查并发布普瑞健身的核心 EMAS 服务。工作流也支持在 GitHub Actions 页面手动运行。

## 发布范围

每次发布以下内容：

- `gym-api`
- `gym-admin-api`，包括后台网页
- `auto-complete-lessons`

不自动发布：

- `seed`，因为它只用于一次性初始化数据
- `wechat-payment-notify`，因为当前支付服务尚未配置完成

## 工作流

工作流按以下顺序执行：

1. 检出代码并安装 Node.js 20 和项目依赖。
2. 运行代码检查和全部自动化测试。
3. 从 GitHub Secrets 生成被 Git 忽略的 EMAS 本地配置文件。
4. 调用现有部署脚本，顺序发布三个核心服务。

任何检查、测试或发布步骤失败时，工作流立即失败，不继续发布后续内容。

## 密钥

GitHub 仓库保存四个 Actions Secrets：

- `ALIBABA_CLOUD_ACCESS_KEY_ID`
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
- `EMAS_MINIPROGRAM_CONFIG`
- `EMAS_SERVER_SECRETS`

后两个 Secret 保存完整 JSON。工作流只在运行期间将它们写入被 Git 忽略的配置文件，不打印内容，也不上传为构建产物。

## 并发与权限

工作流只有读取仓库内容的权限。同一分支上的发布任务排队执行，不取消正在进行的发布，避免云端只完成部分更新。

## 验证

实现完成后验证：

- 工作流配置测试通过。
- 项目代码检查和全部测试通过。
- GitHub Secrets 已存在，但不读取或输出它们的值。
- 推送工作流后，GitHub Actions 发布任务成功。
- EMAS 上三个函数的最新部署存在，后台网页和后台接口可访问。
