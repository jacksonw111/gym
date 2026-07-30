# 拼饭小程序基础工程实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有微信原生小程序中接入 Vant Weapp，并建立适用于 Skyline、glass-easel、TypeScript、Less 和 WXML 的可执行工程规范。

**Architecture:** 保留微信原生小程序与当前 Skyline/glass-easel 配置。Vant 通过 npm 按页面引入；Biome 处理 TypeScript/JSON，Stylelint 处理 Less，Prettier 处理 WXML/Less，TypeScript 编译器负责严格类型检查。首页只承担基础组件和交互兼容性验收，不承载正式业务。

**Tech Stack:** 微信原生小程序、Skyline、glass-easel、TypeScript 7、Less、Vant Weapp 1.11.7、Biome 2、Stylelint 17、Prettier 3。

---

## 文件结构

本计划涉及的文件及职责如下：

- `package.json`：锁定运行依赖、开发依赖和统一检查命令。
- `package-lock.json`：保证依赖可重复安装。
- `.gitignore`：排除本地配置、依赖和微信 npm 构建产物。
- `biome.json`：TypeScript 和 JSON 的格式化与代码检查规则。
- `.prettierrc.json`：WXML 和 Less 的格式化规则。
- `stylelint.config.mjs`：Less 的样式检查规则。
- `tsconfig.json`：微信类型、Vant 类型路径和严格类型检查配置。
- `project.config.json`：保留 Skyline/glass-easel 与微信开发者工具配置。
- `miniprogram/app.json`：仅声明真实页面、渲染器与按需加载配置。
- `miniprogram/app.ts`：最小应用入口。
- `miniprogram/app.less`：全局基础样式与主题变量。
- `miniprogram/pages/index/index.*`：Vant 与 Skyline 的验收首页。
- `miniprogram/components/navigation-bar/*`：保留并规范化现有自定义导航栏。
- `typings/index.d.ts`：项目自己的应用类型；微信 API 类型改由 npm 包提供。
- `README.md`：安装、检查、构建和开发者工具使用说明。
- `docs/development.md`：目录边界、编码规范和 Vant 使用约定。

微信模板的 `pages/logs/*`、`utils/util.ts` 和本地复制的 `typings/types/*` 将被删除。

### Task 1: 安装依赖并建立质量工具链

**Files:**

- Modify: `package.json`
- Create: `package-lock.json`
- Create: `.gitignore`
- Create: `biome.json`
- Create: `.prettierrc.json`
- Create: `stylelint.config.mjs`

- [ ] **Step 1: 运行缺失的质量检查，确认当前基线失败**

Run:

```bash
npm run check
```

Expected: FAIL，提示 `Missing script: "check"`。

- [ ] **Step 2: 写入依赖和统一命令**

将 `package.json` 改为：

```json
{
  "name": "group-meal",
  "version": "1.0.0",
  "private": true,
  "description": "拼饭微信小程序",
  "scripts": {
    "format": "biome format --write . && prettier --write \"miniprogram/**/*.{wxml,less}\"",
    "lint": "biome lint . && stylelint \"miniprogram/**/*.less\"",
    "typecheck": "tsc --noEmit",
    "check": "biome check . && prettier --check \"miniprogram/**/*.{wxml,less}\" && stylelint \"miniprogram/**/*.less\" && tsc --noEmit"
  },
  "dependencies": {
    "@vant/weapp": "1.11.7"
  },
  "devDependencies": {
    "@biomejs/biome": "2.5.6",
    "miniprogram-api-typings": "5.2.2",
    "prettier": "3.9.6",
    "prettier-plugin-mp": "2.5.0",
    "stylelint": "17.14.1",
    "stylelint-config-standard-less": "4.1.0",
    "typescript": "7.0.2"
  }
}
```

- [ ] **Step 3: 写入忽略规则**

创建 `.gitignore`：

```gitignore
node_modules/
miniprogram_npm/
project.private.config.json
.DS_Store
```

- [ ] **Step 4: 配置 Biome**

创建 `biome.json`：

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.6/schema.json",
  "files": {
    "includes": [
      "miniprogram/**/*.ts",
      "typings/**/*.d.ts",
      "*.json",
      "!node_modules",
      "!miniprogram_npm"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineEnding": "lf",
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded",
      "trailingCommas": "all"
    }
  }
}
```

- [ ] **Step 5: 配置 WXML 和 Less 格式化**

创建 `.prettierrc.json`：

```json
{
  "plugins": ["prettier-plugin-mp"],
  "printWidth": 100,
  "singleQuote": true,
  "semi": false,
  "overrides": [
    {
      "files": "*.wxml",
      "options": {
        "parser": "wxml"
      }
    },
    {
      "files": "*.less",
      "options": {
        "parser": "less"
      }
    }
  ]
}
```

- [ ] **Step 6: 配置 Less 检查**

创建 `stylelint.config.mjs`：

```js
export default {
  extends: ['stylelint-config-standard-less'],
  ignoreFiles: ['node_modules/**', 'miniprogram_npm/**'],
  rules: {
    'custom-property-pattern': null,
    'selector-class-pattern': null,
    'unit-no-unknown': [true, { ignoreUnits: ['rpx'] }],
  },
}
```

- [ ] **Step 7: 安装依赖并验证配置可读取**

Run:

```bash
npm install
npx biome check package.json biome.json
npx prettier --find-config-path miniprogram/app.less
npx stylelint --print-config miniprogram/app.less > /dev/null
npx tsc --version
```

Expected: 依赖安装成功；Biome 检查通过；Prettier 找到 `.prettierrc.json`；Stylelint 配置可读取；TypeScript 输出 `Version 7.0.2`。

- [ ] **Step 8: 提交工具链**

```bash
git add .gitignore .prettierrc.json biome.json package.json package-lock.json stylelint.config.mjs
git commit -m "chore: add project quality tooling"
```

### Task 2: 清理微信模板并建立最小应用入口

**Files:**

- Modify: `tsconfig.json`
- Modify: `project.config.json`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/app.ts`
- Modify: `miniprogram/app.less`
- Modify: `typings/index.d.ts`
- Delete: `typings/types/**`
- Delete: `miniprogram/pages/logs/**`
- Delete: `miniprogram/utils/util.ts`

- [ ] **Step 1: 执行完整检查并确认模板代码尚未满足新规范**

Run:

```bash
npm run check
```

Expected: FAIL，错误来自尚未格式化的模板文件、显式 `any`、重复/旧微信类型或 Less 规则。

- [ ] **Step 2: 更新 TypeScript 配置**

将 `tsconfig.json` 改为：

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "noImplicitReturns": true,
    "strictNullChecks": true,
    "strictPropertyInitialization": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "alwaysStrict": true,
    "module": "CommonJS",
    "moduleResolution": "Node",
    "target": "ES2020",
    "lib": ["ES2020"],
    "baseUrl": ".",
    "types": ["miniprogram-api-typings"],
    "paths": {
      "@vant/weapp/*": ["node_modules/@vant/weapp/dist/*"]
    },
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "noEmit": true
  },
  "include": ["miniprogram/**/*.ts", "typings/**/*.d.ts"],
  "exclude": ["node_modules", "miniprogram_npm"]
}
```

- [ ] **Step 3: 保留最新渲染架构并移除 Vant 明确不兼容的全局样式开关**

将 `miniprogram/app.json` 改为：

```json
{
  "pages": ["pages/index/index"],
  "window": {
    "navigationBarTextStyle": "black",
    "navigationStyle": "custom"
  },
  "rendererOptions": {
    "skyline": {
      "defaultDisplayBlock": true,
      "disableABTest": true,
      "sdkVersionBegin": "3.0.0",
      "sdkVersionEnd": "15.255.255"
    }
  },
  "componentFramework": "glass-easel",
  "sitemapLocation": "sitemap.json",
  "lazyCodeLoading": "requiredComponents"
}
```

保留 `project.config.json` 的 TypeScript、Less、Skyline 和 glass-easel 相关配置。不要把 `project.private.config.json` 提交到仓库。

- [ ] **Step 4: 建立最小应用入口和项目类型**

将 `miniprogram/app.ts` 改为：

```ts
App<IAppOption>({
  globalData: {},
})
```

将 `typings/index.d.ts` 改为：

```ts
interface IAppOption {
  globalData: Record<string, never>
}
```

- [ ] **Step 5: 建立全局页面基础样式**

将 `miniprogram/app.less` 改为：

```less
page {
  min-height: 100%;
  color: #1f2329;
  background: #f7f8fa;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

view,
text,
scroll-view {
  box-sizing: border-box;
}
```

- [ ] **Step 6: 删除模板演示与旧类型副本**

删除：

```text
miniprogram/pages/logs/
miniprogram/utils/util.ts
typings/types/
```

- [ ] **Step 7: 自动格式化并修复现有导航栏样式**

Run:

```bash
npm run format
npx stylelint "miniprogram/**/*.less" --fix
npm run check
```

Expected: `npm run check` PASS，无格式、Less 或 TypeScript 错误。

- [ ] **Step 8: 提交最小应用结构**

```bash
git add project.config.json tsconfig.json miniprogram typings
git commit -m "chore: establish minimal mini program shell"
```

### Task 3: 接入 Vant 并实现 Skyline 验收首页

**Files:**

- Modify: `miniprogram/app.less`
- Create: `miniprogram/styles/tokens.less`
- Modify: `miniprogram/pages/index/index.json`
- Modify: `miniprogram/pages/index/index.ts`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.less`

- [ ] **Step 1: 确认 Vant 尚未接入**

Run:

```bash
rg "@vant/weapp|van-button|van-popup" miniprogram/pages/index
```

Expected: FAIL 或无输出。

- [ ] **Step 2: 按页面声明代表性 Vant 组件**

将 `miniprogram/pages/index/index.json` 改为：

```json
{
  "usingComponents": {
    "navigation-bar": "/components/navigation-bar/navigation-bar",
    "van-button": "@vant/weapp/button/index",
    "van-cell": "@vant/weapp/cell/index",
    "van-cell-group": "@vant/weapp/cell-group/index",
    "van-icon": "@vant/weapp/icon/index",
    "van-popup": "@vant/weapp/popup/index",
    "van-tag": "@vant/weapp/tag/index"
  }
}
```

- [ ] **Step 3: 实现最小页面状态和弹层交互**

将 `miniprogram/pages/index/index.ts` 改为：

```ts
Page({
  data: {
    showPopup: false,
  },

  openPopup() {
    this.setData({ showPopup: true })
  },

  closePopup() {
    this.setData({ showPopup: false })
  },
})
```

- [ ] **Step 4: 实现验收首页结构**

将 `miniprogram/pages/index/index.wxml` 改为：

```xml
<navigation-bar title="拼饭" back="{{false}}" color="#1f2329" background="#ffffff" />

<scroll-view class="page" scroll-y type="list">
  <view class="hero">
    <view class="hero__icon">
      <van-icon name="friends-o" size="52" color="#ee5a24" />
    </view>
    <view class="hero__title">基础工程已就绪</view>
    <view class="hero__description">Skyline、glass-easel 与 Vant Weapp 已完成接入</view>
    <van-tag color="#fff1eb" text-color="#ee5a24" round>Vant Weapp 1.11.7</van-tag>
  </view>

  <van-cell-group inset title="运行环境">
    <van-cell title="渲染引擎" value="Skyline" icon="desktop-o" />
    <van-cell title="组件框架" value="glass-easel" icon="cluster-o" />
    <van-cell title="开发语言" value="TypeScript + Less" icon="notes-o" />
  </van-cell-group>

  <view class="actions">
    <van-button type="primary" block round bind:click="openPopup">验证交互组件</van-button>
  </view>
</scroll-view>

<van-popup
  show="{{showPopup}}"
  round
  position="bottom"
  safe-area-inset-bottom
  bind:close="closePopup"
>
  <view class="popup">
    <van-icon name="checked" size="44" color="#07c160" />
    <view class="popup__title">交互正常</view>
    <view class="popup__description">Vant 弹层能够在 Skyline 下打开和关闭</view>
    <van-button block round bind:click="closePopup">关闭</van-button>
  </view>
</van-popup>
```

- [ ] **Step 5: 添加项目主题和首页样式**

创建 `miniprogram/styles/tokens.less`：

```less
page {
  --color-primary: #ee5a24;
  --color-success: #07c160;
  --color-text: #1f2329;
  --color-text-secondary: #646a73;
  --color-background: #f7f8fa;
  --radius-card: 24rpx;
  --button-primary-background-color: var(--color-primary);
  --button-primary-border-color: var(--color-primary);
  --cell-group-inset-border-radius: var(--radius-card);
}
```

在 `miniprogram/app.less` 首行引入主题：

```less
@import './styles/tokens.less';
```

将 `miniprogram/pages/index/index.less` 改为：

```less
page {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.page {
  flex: 1;
  min-height: 0;
  padding-bottom: calc(48rpx + env(safe-area-inset-bottom));
}

.hero {
  padding: 72rpx 40rpx 56rpx;
  text-align: center;
}

.hero__icon {
  width: 112rpx;
  height: 112rpx;
  margin: 0 auto 28rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff1eb;
  border-radius: 32rpx;
}

.hero__title {
  margin-bottom: 12rpx;
  color: var(--color-text);
  font-size: 40rpx;
  font-weight: 600;
}

.hero__description {
  margin-bottom: 24rpx;
  color: var(--color-text-secondary);
  font-size: 28rpx;
  line-height: 1.6;
}

.actions {
  padding: 40rpx 32rpx 0;
}

.popup {
  padding: 56rpx 40rpx calc(40rpx + env(safe-area-inset-bottom));
  text-align: center;
}

.popup__title {
  margin-top: 20rpx;
  color: var(--color-text);
  font-size: 36rpx;
  font-weight: 600;
}

.popup__description {
  margin: 12rpx 0 40rpx;
  color: var(--color-text-secondary);
  font-size: 28rpx;
  line-height: 1.6;
}
```

- [ ] **Step 6: 格式化并运行完整检查**

Run:

```bash
npm run format
npm run check
```

Expected: PASS。

- [ ] **Step 7: 提交 Vant 验收首页**

```bash
git add miniprogram/app.less miniprogram/styles miniprogram/pages/index
git commit -m "feat: add Vant foundation page"
```

### Task 4: 构建微信 npm 产物并验证 Skyline 交互

**Files:**

- Generated and ignored: `miniprogram/miniprogram_npm/**`

- [ ] **Step 1: 确认构建产物尚不存在**

Run:

```bash
test ! -d miniprogram/miniprogram_npm
```

Expected: PASS。

- [ ] **Step 2: 使用微信开发者工具构建 npm**

Run:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli build-npm \
  --project /Users/Zhuanz/WeChatProjects/group-meal \
  --lang zh
```

Expected: 构建成功，生成 `miniprogram/miniprogram_npm/@vant/weapp/`。

- [ ] **Step 3: 验证代表性组件产物完整**

Run:

```bash
test -f miniprogram/miniprogram_npm/@vant/weapp/button/index.js
test -f miniprogram/miniprogram_npm/@vant/weapp/cell/index.js
test -f miniprogram/miniprogram_npm/@vant/weapp/icon/index.js
test -f miniprogram/miniprogram_npm/@vant/weapp/popup/index.js
```

Expected: 所有命令 PASS。

- [ ] **Step 4: 打开项目并检查首页**

Run:

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli open \
  --project /Users/Zhuanz/WeChatProjects/group-meal \
  --lang zh
```

在模拟器中确认：

1. 页面显示“基础工程已就绪”。
2. 三个环境单元格均正常显示。
3. 点击“验证交互组件”后底部弹层打开。
4. 点击“关闭”后弹层关闭。
5. 页面滚动、自定义导航栏和底部安全区域正常。
6. 控制台没有运行错误。

- [ ] **Step 5: 重新运行自动检查**

Run:

```bash
npm run check
git status --short
```

Expected: `npm run check` PASS；`miniprogram_npm` 和 `project.private.config.json` 不出现在 Git 状态中。

### Task 5: 写入开发说明并完成最终验证

**Files:**

- Create: `README.md`
- Create: `docs/development.md`

- [ ] **Step 1: 写入项目使用说明**

创建 `README.md`，包含以下可直接执行的内容：

````markdown
# 拼饭小程序

基于微信原生小程序、Skyline、glass-easel、TypeScript、Less 和 Vant Weapp。

## 开始开发

```bash
npm install
npm run check
```

随后在微信开发者工具中导入项目，并执行“工具 → 构建 npm”。

macOS 也可以使用：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli build-npm --project "$(pwd)"
```

## 常用命令

- `npm run format`：格式化 TypeScript、JSON、WXML 和 Less。
- `npm run lint`：检查 TypeScript、JSON 和 Less。
- `npm run typecheck`：执行 TypeScript 严格类型检查。
- `npm run check`：执行提交前的全部检查。

更详细的目录和编码约定见 `docs/development.md`。
````

- [ ] **Step 2: 写入开发约定**

创建 `docs/development.md`，明确：

```markdown
# 开发约定

## 目录

- `pages/`：页面及页面私有逻辑。
- `components/`：具有独立业务语义的可复用组件。
- `styles/`：跨页面共享的设计变量和公共样式。
- `utils/`：不依赖界面的通用函数。
- `typings/`：项目自己的 TypeScript 声明。

## Vant

- 组件在页面或业务组件的 JSON 中按需声明。
- 不修改 `node_modules` 或 `miniprogram_npm` 中的 Vant 文件。
- 全局主题通过 `app.less` 中的 CSS 变量维护。
- 新引入的 Vant 组件必须在 Skyline 模式下验证。

## 代码

- 不使用无约束的 `any`。
- WXML 循环必须提供稳定的 `wx:key`。
- 文件和目录使用小写短横线命名。
- 页面只做编排；重复且有明确业务含义时再提取组件。
- 提交前运行 `npm run check`。
```

- [ ] **Step 3: 格式化文档以外的工程文件并运行全部检查**

Run:

```bash
npm run format
npm run check
git diff --check
```

Expected: 全部 PASS。

- [ ] **Step 4: 核对设计范围**

Run:

```bash
rg -n "Skyline|glass-easel|Vant|Biome|Stylelint|Prettier" README.md docs/development.md
rg -n "pages/logs|utils/util" miniprogram 2>/dev/null
```

Expected: 第一条命令找到相关约定；第二条命令无输出。

- [ ] **Step 5: 提交说明**

```bash
git add README.md docs/development.md
git commit -m "docs: add mini program development guide"
```

- [ ] **Step 6: 最终状态确认**

Run:

```bash
npm run check
git status --short
git log --oneline -5
```

Expected: 检查通过；工作区仅保留被 `.gitignore` 排除的本地/生成文件；最近提交包含工具链、最小应用、Vant 首页和开发说明。
