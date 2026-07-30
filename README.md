# 拼饭小程序

基于微信原生小程序开发，使用 Skyline 渲染引擎、glass-easel 组件框架、TypeScript、Less 和 Vant Weapp。

## 技术栈

- 微信原生小程序
- Skyline
- glass-easel
- TypeScript 7
- Less
- Vant Weapp 1.11.7
- Biome、Stylelint 和 Prettier

## 环境要求

- Node.js 20.19 或更高版本
- npm
- 微信开发者工具

## 开始开发

安装依赖：

```bash
npm install
```

运行项目检查：

```bash
npm run check
```

然后在微信开发者工具中：

1. 导入当前项目根目录。
2. 选择“工具 → 构建 npm”。
3. 构建完成后点击“编译”。

npm 构建结果会生成在 `miniprogram/miniprogram_npm/`，该目录是生成产物，不提交到 Git。

## 常用命令

```bash
# 格式化 TypeScript、JSON、WXML 和 Less
npm run format

# 检查 TypeScript、JSON 和 Less
npm run lint

# 执行 TypeScript 严格类型检查
npm run typecheck

# 执行提交前的全部检查
npm run check
```

## 项目结构

```text
group-meal/
├── docs/                         设计说明和实施计划
├── miniprogram/
│   ├── components/               项目级可复用组件
│   ├── pages/                    小程序页面
│   ├── styles/                   全局主题变量
│   ├── app.json                  页面和运行架构配置
│   ├── app.less                  全局样式入口
│   └── app.ts                    应用入口
├── typings/                      项目自己的 TypeScript 类型
├── biome.json                    TypeScript 和 JSON 规范
├── stylelint.config.mjs          Less 样式规范
├── project.config.json           微信开发者工具项目配置
├── package.json                  依赖和项目命令
└── tsconfig.json                 TypeScript 配置
```

## 使用 Vant 组件

Vant 组件按页面或业务组件引入，不进行全局批量注册。

例如在页面 JSON 中声明按钮：

```json
{
  "usingComponents": {
    "van-button": "@vant/weapp/button/index"
  }
}
```

然后在 WXML 中使用：

```xml
<van-button type="primary">确认</van-button>
```

新增或升级 npm 依赖后，需要重新执行“工具 → 构建 npm”。

全局主题变量维护在 `miniprogram/styles/tokens.less`。不要直接修改 `node_modules/` 或 `miniprogram_npm/` 中的 Vant 文件。

## 开发约定

- TypeScript 保持严格模式，不使用无约束的 `any`。
- WXML 循环必须设置稳定的 `wx:key`。
- 文件和目录使用小写短横线命名。
- 页面负责页面编排；只有重复且具有明确业务含义的内容才提取为组件。
- Vant 组件必须在 Skyline 模式下验证。
- 提交代码前运行 `npm run check`。

## npm 构建问题

如果微信开发者工具提示找不到 npm 包：

1. 确认打开的是当前项目根目录，而不是 `miniprogram/` 子目录。
2. 选择“项目 → 重新打开此项目”，让开发者工具重新读取 `project.config.json`。
3. 再次选择“工具 → 构建 npm”。

项目已经在 `project.config.json` 中配置了根目录 `package.json` 与 `miniprogram/` 的构建映射。
