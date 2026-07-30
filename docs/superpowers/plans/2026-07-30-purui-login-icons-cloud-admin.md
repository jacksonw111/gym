# Purui Login, Icons, and Cloud Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-triggered WeChat member registration, replace major text markers with line icons, and make the existing admin app deployable at `/admin/` in the current CloudBase test environment without changing business code for production.

**Architecture:** `bootstrap` becomes guest-safe and read-only until the current WeChat identity explicitly submits avatar, nickname, and phone authorization. A dedicated mini-program login page uploads the avatar, passes the phone CloudID to `gym-api`, and returns to the initiating page. The React admin remains a static Vite app in CloudBase Hosting and calls the same protected `gym-api` after anonymous CloudBase web authentication.

**Tech Stack:** Native WeChat Mini Program, TypeScript, Vant Weapp icons, CloudBase database/functions/storage/hosting, `wx-server-sdk` 4.0.2, React 19, Vite 8, Vitest.

**Execution constraint:** Work directly on the current `main` branch, do not create a worktree, and do not use Playwright or browser automation.

---

## File map

### New files

- `cloudfunctions/gym-api/src/phone.ts` — parse and resolve trusted WeChat phone open data.
- `cloudfunctions/gym-api/src/phone.test.ts` — phone open-data parsing tests.
- `miniprogram/models/auth.ts` — pure login-return and registration readiness rules.
- `miniprogram/models/navigation.ts` — reusable member and coach tab definitions with icon names.
- `miniprogram/pages/member-login/member-login.ts` — explicit avatar, nickname, and phone authorization flow.
- `miniprogram/pages/member-login/member-login.wxml` — login page structure.
- `miniprogram/pages/member-login/member-login.less` — login page styling.
- `miniprogram/pages/member-login/member-login.json` — page components.
- `admin/src/components/admin-icon.tsx` — reusable local line icons for admin navigation.
- `.env.local` — ignored local test-environment selection for this workspace.

### Main modified files

- `cloudfunctions/gym-api/src/index.ts` — guest bootstrap, explicit member registration, protected actions, phone resolver wiring.
- `cloudfunctions/gym-api/src/store.ts` — retain real avatar and phone data in the canonical user model.
- `cloudfunctions/gym-api/src/router.test.ts` — guest and idempotent registration coverage.
- `cloudfunctions/gym-api/package.json` and `package-lock.json` — add `wx-server-sdk` and keep it external in the bundle.
- `miniprogram/shared/contracts.ts` — authenticated/guest response contracts.
- `miniprogram/services/api.ts` — discriminated session/home types and `registerMember`.
- `miniprogram/services/cloud-api.ts` — guest-safe bootstrap and registration adapter.
- `miniprogram/services/development-api.ts` — interface-compatible explicit registration behavior.
- `tests/mini/cloud-api.test.ts` and `tests/mini/models.test.ts` — cloud adapter and login-rule coverage.
- `miniprogram/app.json` — register the login page and Vant icon.
- `miniprogram/pages/member-home/*` — guest-safe public home.
- `miniprogram/pages/member-profile/*` — guest state and explicit login button.
- `miniprogram/pages/package-checkout/*` — intercept purchase and preserve selection.
- `miniprogram/components/app-tab-bar/*` — line icons plus labels.
- `admin/src/api/production.ts` and `production.test.ts` — anonymous CloudBase web authentication before calls.
- `admin/src/app.tsx` and `admin/src/styles.css` — line-icon admin navigation.
- `admin/vite.config.ts` — `/admin/` production base path.
- `cloudfunctions/build.test.ts` — hosting config and bundle compatibility assertions.
- `miniprogram/config/env.ts` and `miniprogram/app.ts` — enable explicit test payment only in non-release builds.
- `.env.example`, `README.md`, and `cloudbaserc.json` — environment and deployment instructions.

## Task 1: Make bootstrap guest-safe and read-only

**Files:**

- Modify: `cloudfunctions/gym-api/src/router.test.ts`
- Modify: `cloudfunctions/gym-api/src/index.ts`

- [ ] **Step 1: Replace the default-member test with a failing guest test**

Add a router test that proves an unknown WeChat identity receives public data without creating a user:

```ts
it('bootstrap keeps an unknown WeChat identity as a guest without writing a user', async () => {
  const store = new MemoryStore(createDevelopmentSeed())
  const router = createRouter(store, {
    developmentPaymentsEnabled: false,
    production: true,
  })

  const response = await router({
    action: 'bootstrap',
    requestId: 'bootstrap-guest',
    payload: {},
    identity: { openId: 'guest-openid' },
  })

  expect(response).toMatchObject({
    ok: true,
    data: {
      authenticated: false,
      profile: null,
      roles: [],
      packages: [{ id: 'product-1' }],
      coaches: [{ id: 'coach-1' }],
      memberships: [],
      lessons: [],
      appeals: [],
    },
  })
  expect(store.users.some((user) => user.openId === 'guest-openid')).toBe(false)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk npm run test -- cloudfunctions/gym-api/src/router.test.ts --reporter=dot
```

Expected: FAIL because `bootstrap` still calls `ensureCurrentUser` and creates `新会员`.

- [ ] **Step 3: Implement the minimal guest bootstrap**

Remove `ensureCurrentUser`. In the `bootstrap` branch, look up the current user without writing:

```ts
const openId = request.identity?.openId
const currentUser = openId
  ? store.users.find((candidate) => candidate.openId === openId)
  : undefined

if (!currentUser) {
  return {
    ok: true,
    data: {
      authenticated: false,
      actor: null,
      profile: null,
      roles: [],
      activeRole: null,
      packages: store.products.filter((item) => item.status === 'published'),
      coaches: store.coaches.filter((item) => item.status === 'active'),
      memberships: [],
      lessons: [],
      appeals: [],
      orders: [],
      coach: { schedule: [], lessons: [] },
    },
  }
}
```

Add `authenticated: true` to the existing member/coach bootstrap result. Keep `getCurrentUser` as the guard for purchases, bookings, feedback, appeals, and coach actions.

- [ ] **Step 4: Run router tests and verify GREEN**

Run:

```bash
rtk npm run test -- cloudfunctions/gym-api/src/router.test.ts --reporter=dot
```

Expected: all router tests pass after authenticated fixtures are updated with `authenticated: true`.

- [ ] **Step 5: Commit**

```bash
rtk git add cloudfunctions/gym-api/src/index.ts cloudfunctions/gym-api/src/router.test.ts
rtk git commit -m "feat: keep new visitors as guests"
```

## Task 2: Register a member only from trusted WeChat authorization

**Files:**

- Create: `cloudfunctions/gym-api/src/phone.ts`
- Create: `cloudfunctions/gym-api/src/phone.test.ts`
- Modify: `cloudfunctions/gym-api/src/index.ts`
- Modify: `cloudfunctions/gym-api/src/router.test.ts`
- Modify: `cloudfunctions/gym-api/package.json`
- Modify: `cloudfunctions/gym-api/package-lock.json`

- [ ] **Step 1: Write failing phone parser tests**

Create `phone.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { phoneNumberFromOpenData } from './phone'

describe('WeChat phone open data', () => {
  it('reads a verified phone number from the first open-data item', () => {
    expect(
      phoneNumberFromOpenData({
        list: [{ data: { phoneNumber: '13800000000', purePhoneNumber: '13800000000' } }],
      }),
    ).toBe('13800000000')
  })

  it('rejects missing or malformed phone open data', () => {
    expect(() => phoneNumberFromOpenData({ list: [] })).toThrow('手机号授权结果无效')
  })
})
```

- [ ] **Step 2: Write a failing idempotent registration router test**

Add a router test with an injected resolver:

```ts
it('registerMember creates one real member and reuses it on repeated authorization', async () => {
  const store = new MemoryStore(createDevelopmentSeed())
  const resolvePhoneNumber = vi.fn(async () => '13800000000')
  const router = createRouter(store, {
    developmentPaymentsEnabled: false,
    production: true,
    resolvePhoneNumber,
  })
  const request = {
    action: 'registerMember',
    requestId: 'register-1',
    payload: {
      name: '陈澄',
      avatarUrl: 'cloud://test-env/avatar/member.jpg',
      phoneCloudId: 'phone-cloud-id',
    },
    identity: { openId: 'registered-openid' },
  }

  const first = await router(request)
  const second = await router({ ...request, requestId: 'register-2' })

  expect(first).toMatchObject({
    ok: true,
    data: {
      name: '陈澄',
      avatarUrl: 'cloud://test-env/avatar/member.jpg',
      phone: '13800000000',
      roles: ['member'],
    },
  })
  expect(second).toMatchObject({ ok: true, data: { id: expect.any(String) } })
  expect(store.users.filter((user) => user.openId === 'registered-openid')).toHaveLength(1)
  expect(resolvePhoneNumber).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
rtk npm run test -- cloudfunctions/gym-api/src/phone.test.ts cloudfunctions/gym-api/src/router.test.ts --reporter=dot
```

Expected: FAIL because `phone.ts`, `registerMember`, and `resolvePhoneNumber` do not exist.

- [ ] **Step 4: Implement the phone parser**

Create:

```ts
interface PhoneOpenData {
  list?: Array<{
    data?: {
      phoneNumber?: string
      purePhoneNumber?: string
    }
  }>
}

export const phoneNumberFromOpenData = (result: PhoneOpenData): string => {
  const phone = result.list?.[0]?.data?.purePhoneNumber ?? result.list?.[0]?.data?.phoneNumber
  if (!phone || !/^1\d{10}$/.test(phone)) {
    throw new Error('手机号授权结果无效，请重新授权')
  }
  return phone
}
```

- [ ] **Step 5: Add the explicit registration action**

Define the router environment as:

```ts
export interface GymEnvironment extends PaymentEnvironment {
  resolvePhoneNumber?: (cloudId: string) => Promise<string>
}
```

Implement `registerMember` before protected member actions:

```ts
case 'registerMember': {
  const openId = request.identity?.openId
  if (!openId) throw new ApiError('UNAUTHORIZED', '无法获取微信用户身份')
  const name = requiredString(payload, 'name').trim()
  const avatarUrl = requiredString(payload, 'avatarUrl')
  const phoneCloudId = requiredString(payload, 'phoneCloudId')
  if (name.length < 1 || name.length > 32) {
    throw new ApiError('INVALID_REQUEST', '昵称长度应为 1—32 个字符')
  }
  if (!avatarUrl.startsWith('cloud://')) {
    throw new ApiError('INVALID_REQUEST', '头像必须来自当前云存储')
  }
  if (!environment.resolvePhoneNumber) {
    throw new ApiError('SERVICE_UNAVAILABLE', '手机号授权服务未配置')
  }
  const phone = await environment.resolvePhoneNumber(phoneCloudId)
  const user = await store.transaction(() => {
    const existing = store.users.find((item) => item.openId === openId)
    if (existing) {
      existing.name = name
      existing.avatarUrl = avatarUrl
      existing.phone = phone
      if (!existing.roles.includes('member')) existing.roles.push('member')
      return existing
    }
    const created: User = {
      id: store.nextId('user'),
      openId,
      name,
      avatarUrl,
      phone,
      roles: ['member'],
    }
    store.users.push(created)
    return created
  })
  return { ok: true, data: user }
}
```

- [ ] **Step 6: Wire `wx-server-sdk` into the cloud entry**

Install:

```bash
rtk npm install wx-server-sdk@4.0.2 --prefix cloudfunctions/gym-api
```

Update the gym build script to include `--external:wx-server-sdk`. Initialize the SDK once with `DYNAMIC_CURRENT_ENV`:

```ts
import wxCloud from 'wx-server-sdk'
import { phoneNumberFromOpenData } from './phone'

wxCloud.init({ env: wxCloud.DYNAMIC_CURRENT_ENV })

const resolvePhoneNumber = async (cloudId: string): Promise<string> => {
  const result = await wxCloud.getOpenData({ list: [cloudId] })
  return phoneNumberFromOpenData(result)
}
```

Pass `resolvePhoneNumber` into the `GymEnvironment` used by `createCloudHandler`.

- [ ] **Step 7: Run focused tests and build**

Run:

```bash
rtk npm run test -- cloudfunctions/gym-api/src/phone.test.ts cloudfunctions/gym-api/src/router.test.ts --reporter=dot
rtk npm run build --prefix cloudfunctions/gym-api
rtk rg -n "wx-server-sdk|getOpenData" cloudfunctions/gym-api/dist/index.js
```

Expected: tests pass; build succeeds; the bundle references external `wx-server-sdk` and contains the `getOpenData` call.

- [ ] **Step 8: Commit**

```bash
rtk git add cloudfunctions/gym-api
rtk git commit -m "feat: register members from WeChat authorization"
```

## Task 3: Add guest-aware mini-program API contracts

**Files:**

- Modify: `miniprogram/shared/contracts.ts`
- Modify: `miniprogram/services/api.ts`
- Modify: `miniprogram/services/cloud-api.ts`
- Modify: `miniprogram/services/development-api.ts`
- Modify: `tests/mini/cloud-api.test.ts`

- [ ] **Step 1: Write failing CloudApi guest tests**

Add:

```ts
it('returns a guest session without manufacturing a user', async () => {
  installWechat(async () =>
    ok(
      bootstrap({
        authenticated: false,
        actor: null,
        profile: null,
        roles: [],
        activeRole: null,
        memberships: [],
        lessons: [],
      }),
    ),
  )

  const api = new CloudApi()
  await expect(api.getSession()).resolves.toEqual({ authenticated: false })
  await expect(api.getMemberHome()).resolves.toMatchObject({
    authenticated: false,
    user: undefined,
  })
})

it('sends only cloud-authorized registration fields', async () => {
  const { cloudCall } = installWechat(async ({ data }) => {
    if (data.action === 'registerMember') return ok(user)
    return ok(bootstrap())
  })
  const api = new CloudApi()

  await api.registerMember({
    name: '陈澄',
    avatarUrl: 'cloud://test/avatar.jpg',
    phoneCloudId: 'phone-cloud-id',
    requestId: 'register-1',
  })

  expect(cloudCall).toHaveBeenCalledWith({
    name: 'gym-api',
    data: expect.objectContaining({
      action: 'registerMember',
      payload: {
        name: '陈澄',
        avatarUrl: 'cloud://test/avatar.jpg',
        phoneCloudId: 'phone-cloud-id',
      },
    }),
  })
})
```

- [ ] **Step 2: Run CloudApi tests and verify RED**

Run:

```bash
rtk npm run test -- tests/mini/cloud-api.test.ts --reporter=dot
```

Expected: FAIL because sessions require a user and `registerMember` is absent.

- [ ] **Step 3: Define discriminated guest/authenticated views**

Use:

```ts
export type SessionView =
  | { authenticated: false }
  | { authenticated: true; user: User; role: UserRole }

export interface MemberHomeView {
  authenticated: boolean
  user?: User
  products: PackageProduct[]
  coaches: Coach[]
  memberships: MembershipPackage[]
  lessons: Lesson[]
}

export interface RegisterMemberInput {
  name: string
  avatarUrl: string
  phoneCloudId: string
  requestId: string
}
```

Add `registerMember(input): Promise<SessionView>` to `GymApi`.

- [ ] **Step 4: Make CloudApi bootstrap nullable and add registration**

Change `BootstrapData` to carry `authenticated`, nullable `profile`, empty roles, and nullable `activeRole`. `getSession` must return `{ authenticated: false }` for guests. Authenticated-only helper methods call a small `requireProfile(data)` function that throws `请先登录`.

Implement:

```ts
async registerMember(input: RegisterMemberInput): Promise<SessionView> {
  await this.call('registerMember', {
    name: input.name,
    avatarUrl: input.avatarUrl,
    phoneCloudId: input.phoneCloudId,
  }, input.requestId)
  const data = await this.bootstrap(input.requestId)
  const profile = this.requireProfile(data)
  return { authenticated: true, user: profile, role: data.activeRole ?? 'member' }
}
```

Update `DevelopmentApi` to implement the same explicit method even though real app mode does not use mock data.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
rtk npm run test -- tests/mini/cloud-api.test.ts --reporter=dot
rtk npm run typecheck
```

Expected: CloudApi tests and TypeScript checks pass.

- [ ] **Step 6: Commit**

```bash
rtk git add miniprogram/shared/contracts.ts miniprogram/services tests/mini/cloud-api.test.ts
rtk git commit -m "feat: expose guest-aware mini sessions"
```

## Task 4: Build the user-triggered login page and purchase/profile gates

**Files:**

- Create: `miniprogram/models/auth.ts`
- Create: `miniprogram/pages/member-login/member-login.ts`
- Create: `miniprogram/pages/member-login/member-login.wxml`
- Create: `miniprogram/pages/member-login/member-login.less`
- Create: `miniprogram/pages/member-login/member-login.json`
- Modify: `tests/mini/models.test.ts`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/member-home/member-home.ts`
- Modify: `miniprogram/pages/member-home/member-home.wxml`
- Modify: `miniprogram/pages/member-profile/member-profile.ts`
- Modify: `miniprogram/pages/member-profile/member-profile.wxml`
- Modify: `miniprogram/pages/member-profile/member-profile.less`
- Modify: `miniprogram/pages/package-checkout/package-checkout.ts`
- Modify: `miniprogram/pages/package-checkout/package-checkout.wxml`

- [ ] **Step 1: Write failing pure login-flow tests**

Add:

```ts
import { loginPageUrl, registrationReady } from '../../miniprogram/models/auth'

it('only enables phone authorization after avatar and nickname are ready', () => {
  expect(registrationReady('', '陈澄')).toBe(false)
  expect(registrationReady('/tmp/avatar.jpg', '')).toBe(false)
  expect(registrationReady('/tmp/avatar.jpg', ' 陈澄 ')).toBe(true)
})

it('builds explicit return destinations for profile and checkout', () => {
  expect(loginPageUrl('profile')).toBe('/pages/member-login/member-login?returnTo=profile')
  expect(loginPageUrl('checkout')).toBe('/pages/member-login/member-login?returnTo=checkout')
})
```

- [ ] **Step 2: Run model tests and verify RED**

Run:

```bash
rtk npm run test -- tests/mini/models.test.ts --reporter=dot
```

Expected: FAIL because `models/auth.ts` does not exist.

- [ ] **Step 3: Implement the pure rules**

Create:

```ts
export type LoginReturn = 'profile' | 'checkout'

export const registrationReady = (avatarPath: string, nickname: string): boolean =>
  Boolean(avatarPath && nickname.trim())

export const loginPageUrl = (returnTo: LoginReturn): string =>
  `/pages/member-login/member-login?returnTo=${returnTo}`
```

- [ ] **Step 4: Implement the dedicated login page**

Register `pages/member-login/member-login` in `app.json`. The page data includes:

```ts
{
  avatarPath: '',
  nickname: '',
  returnTo: 'profile' as LoginReturn,
  ready: false,
  submitting: false,
  error: '',
}
```

Use `chooseAvatar` to set the temporary path, `type="nickname"` to update the nickname, and one disabled-until-ready `open-type="getPhoneNumber"` button. In its callback:

```ts
const phoneCloudId = event.detail.cloudID
if (!phoneCloudId) throw new Error('未获得手机号授权，请重试')
const extension = this.data.avatarPath.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '.jpg'
const uploaded = await wx.cloud.uploadFile({
  cloudPath: `avatars/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`,
  filePath: this.data.avatarPath,
})
await getApi().registerMember({
  name: this.data.nickname.trim(),
  avatarUrl: uploaded.fileID,
  phoneCloudId,
  requestId: createRequestId('register'),
})
wx.showToast({ title: '登录成功', icon: 'success' })
setTimeout(() => wx.navigateBack(), 500)
```

The page copy states that the data is used for member recognition, booking contact, and coaching service.

- [ ] **Step 5: Implement guest home and profile states**

Home continues showing public products and coaches. For guests:

- greeting becomes `欢迎来到普瑞健身`.
- balance, next lesson, and memberships are hidden.
- purchase buttons remain visible.

Profile calls `getSession` first. For a guest it renders a single guest state with `微信登录` bound to:

```ts
wx.navigateTo({ url: loginPageUrl('profile') })
```

Authenticated profile renders the real avatar with `<image>`, nickname, phone, balances, and role switch.

- [ ] **Step 6: Gate purchase without losing selection**

At the start of `submit`, call `getSession`. If it returns a guest:

```ts
wx.navigateTo({ url: loginPageUrl('checkout') })
return
```

Because login is pushed on top of the checkout page, the checkout page instance and selected IDs remain in memory. When the user returns, the same button can continue purchase.

- [ ] **Step 7: Run focused tests and checks**

Run:

```bash
rtk npm run test -- tests/mini/models.test.ts tests/mini/cloud-api.test.ts --reporter=dot
rtk npm run check
```

Expected: tests and all mini-program formatting/type checks pass.

- [ ] **Step 8: Commit**

```bash
rtk git add miniprogram tests/mini
rtk git commit -m "feat: add user-triggered member login"
```

## Task 5: Replace major markers with line icons

**Files:**

- Modify: `miniprogram/app.json`
- Modify: `miniprogram/components/app-tab-bar/app-tab-bar.ts`
- Modify: `miniprogram/components/app-tab-bar/app-tab-bar.wxml`
- Modify: `miniprogram/components/app-tab-bar/app-tab-bar.less`
- Create: `miniprogram/models/navigation.ts`
- Modify: relevant `miniprogram/pages/**/*.wxml`
- Modify: `tests/mini/models.test.ts`
- Create: `admin/src/components/admin-icon.tsx`
- Modify: `admin/src/app.tsx`
- Modify: `admin/src/app.test.tsx`
- Modify: `admin/src/styles.css`

- [ ] **Step 1: Write failing navigation-icon tests**

Move the mini tab configuration into `models/navigation.ts`, export it, and assert each item has a non-empty icon and label:

```ts
expect(Object.values(tabs).flat().every((tab) => tab.icon && tab.label)).toBe(true)
expect(Object.values(tabs).flat().some((tab) => 'mark' in tab)).toBe(false)
```

In `admin/src/app.test.tsx`, assert navigation names remain accessible and numeric markers are gone:

```ts
expect(screen.getByRole('button', { name: '教练' })).toBeInTheDocument()
expect(screen.queryByText('02')).not.toBeInTheDocument()
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
rtk npm run test -- tests/mini/models.test.ts admin/src/app.test.tsx --reporter=dot
```

Expected: FAIL because tabs still use `mark` and admin still renders numbers.

- [ ] **Step 3: Add Vant mini-program icons**

Register globally:

```json
"usingComponents": {
  "van-icon": "@vant/weapp/icon/index"
}
```

Use icon names:

```ts
member: [
  { key: 'home', label: '首页', icon: 'wap-home-o', url: '/pages/member-home/member-home' },
  { key: 'lessons', label: '课程', icon: 'todo-list-o', url: '/pages/member-lessons/member-lessons' },
  { key: 'profile', label: '我的', icon: 'user-o', url: '/pages/member-profile/member-profile' },
]
```

Use `calendar-o`, `clock-o`, and `user-o` for coach tabs. Import `tabs` into the tab-bar component and render:

```xml
<van-icon
  class="tab-bar__icon"
  name="{{item.icon}}"
  size="42rpx"
  aria-hidden="true"
/>
<text class="tab-bar__label">{{item.label}}</text>
```

For high-value actions use the same pattern with `cart-o`, `clock-o`, `phone-o`, `comment-o`, and `warning-o`. Keep the existing text inside every critical button.

- [ ] **Step 4: Add local admin SVG icons**

Create an `AdminIcon` component accepting:

```ts
type AdminIconName = 'dashboard' | 'coaches' | 'members' | 'products' | 'bookings' | 'appeals'
```

Render one 20×20 `svg` with `stroke="currentColor"`, `fill="none"`, `strokeWidth="1.8"`, and a small path set selected by name. Replace `marker` with `icon` in the admin page configuration and render the component inside each sidebar button.

- [ ] **Step 5: Run focused and accessibility tests**

Run:

```bash
rtk npm run test -- tests/mini/models.test.ts admin/src/app.test.tsx --reporter=dot
rtk npm run check
```

Expected: tests pass; visible labels and accessible navigation names remain.

- [ ] **Step 6: Commit**

```bash
rtk git add miniprogram admin/src
rtk git commit -m "feat: add line icons to gym navigation"
```

## Task 6: Make the admin app work from CloudBase Hosting

**Files:**

- Modify: `admin/src/api/production.test.ts`
- Modify: `admin/src/api/production.ts`
- Modify: `admin/vite.config.ts`
- Modify: `cloudfunctions/build.test.ts`
- Modify: `.env.example`
- Create locally: `.env.local`

- [ ] **Step 1: Write a failing anonymous-authentication test**

Expand the CloudBase SDK mock:

```ts
const { callFunction, getLoginState, signIn } = vi.hoisted(() => ({
  callFunction: vi.fn(),
  getLoginState: vi.fn(async () => null),
  signIn: vi.fn(async () => ({ isAnonymousAuth: true })),
}))

vi.mock('@cloudbase/js-sdk', () => ({
  default: {
    init: () => ({
      auth: () => ({
        getLoginState,
        anonymousAuthProvider: () => ({ signIn }),
      }),
      callFunction,
    }),
  },
}))
```

Assert `signIn` occurs before the first function call and only once across parallel `loadData` calls.

- [ ] **Step 2: Add a failing hosting configuration assertion**

In `cloudfunctions/build.test.ts`, assert:

```ts
expect(cloudbase.framework.plugins.admin.inputs).toMatchObject({
  outputPath: 'admin/dist',
  cloudPath: '/admin',
})
```

Also read `admin/vite.config.ts` and assert it contains a production `/admin/` base.

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
rtk npm run test -- admin/src/api/production.test.ts cloudfunctions/build.test.ts --reporter=dot
```

Expected: production API test fails because it calls the function before web authentication; base-path assertion fails.

- [ ] **Step 4: Authenticate the web SDK once**

Inside `createProductionApi`:

```ts
const auth = app.auth({ persistence: 'local' })
const cloudReady = (async () => {
  const state = await auth.getLoginState()
  if (!state) await auth.anonymousAuthProvider().signIn()
})()

const call = async <T>(action: string, payload: Record<string, unknown> = {}): Promise<T> => {
  await cloudReady
  const authToken = sessionStorage.getItem(SESSION_KEY)
  const response = await app.callFunction({
    name: 'gym-api',
    data: {
      action,
      requestId: crypto.randomUUID(),
      payload,
      ...(authToken ? { authToken } : {}),
    },
  })
  const result = response.result as CloudResponse<T>
  if (!result.ok) throw new Error(result.error?.message ?? '后台请求失败')
  return result.data as T
}
```

Anonymous CloudBase authentication only grants the web SDK a callable identity. `adminLogin` and the custom admin token remain mandatory.

- [ ] **Step 5: Configure the `/admin/` Vite base**

Return:

```ts
base: mode === 'production' ? '/admin/' : '/',
```

Keep `admin/dist` as the output directory.

- [ ] **Step 6: Create the local test environment file**

Create ignored `.env.local`:

```dotenv
CLOUDBASE_ENV_ID=cloud1-d1gmh1lu77f6e8c06
VITE_CLOUDBASE_ENV_ID=cloud1-d1gmh1lu77f6e8c06
VITE_ADMIN_DEVELOPMENT=false
DEVELOPMENT_PAYMENTS_ENABLED=true
INTERNAL_SCHEDULER_TOKEN=purui-test-scheduler-20260730
WECHAT_PAYMENT_CREATE_URL=
WECHAT_PAYMENT_VERIFY_URL=
WECHAT_PAYMENT_API_TOKEN=
```

Update `.env.example` with comments explaining that test and production builds use the same keys with different values.

- [ ] **Step 7: Run tests and a production admin build**

Run:

```bash
rtk npm run test -- admin/src/api/production.test.ts cloudfunctions/build.test.ts --reporter=dot
rtk npm run admin:build
rtk test -f admin/dist/index.html
rtk rg -n "/admin/assets/" admin/dist/index.html
```

Expected: tests pass, build succeeds, and generated asset URLs begin with `/admin/assets/`.

- [ ] **Step 8: Commit tracked files**

```bash
rtk git add admin cloudfunctions/build.test.ts .env.example
rtk git commit -m "feat: prepare admin for CloudBase hosting"
```

Do not add `.env.local` because it is machine-specific deployment configuration.

## Task 7: Exercise purchases in the real test environment without real charges

**Files:**

- Modify: `cloudfunctions/gym-api/src/index.ts`
- Modify: `cloudfunctions/gym-api/src/router.test.ts`
- Modify: `miniprogram/config/env.ts`
- Modify: `miniprogram/app.ts`
- Modify: `miniprogram/services/cloud-api.ts`
- Modify: `tests/mini/cloud-api.test.ts`
- Modify: `tests/mini/models.test.ts`
- Modify: `cloudbaserc.json`
- Modify: `.env.example`
- Modify locally: `.env.local`

- [ ] **Step 1: Write failing cloud test-payment tests**

Add a router test proving that a non-production environment can create a pending order without external payment parameters and then explicitly settle it:

```ts
it('returns a test-payment order and settles it only when development payment is enabled', async () => {
  const store = new MemoryStore(createDevelopmentSeed())
  const router = createRouter(store, {
    developmentPaymentsEnabled: true,
    production: false,
  })

  const purchase = await router({
    action: 'purchase',
    requestId: 'test-cloud-purchase',
    payload: { productId: 'product-1', coachId: 'coach-1' },
    identity: { openId: 'dev-member-openid' },
  })
  expect(purchase).toMatchObject({
    ok: true,
    data: { order: { status: 'pending' }, testPayment: true },
  })

  const orderId =
    purchase.ok && purchase.data && typeof purchase.data === 'object' && 'order' in purchase.data
      ? (purchase.data.order as { id: string }).id
      : ''
  const paid = await router({
    action: 'createDevPayment',
    requestId: 'settle-test-cloud-purchase',
    payload: { orderId },
    identity: { openId: 'dev-member-openid' },
  })
  expect(paid).toMatchObject({ ok: true, data: { memberId: 'member-1' } })
})
```

Add a CloudApi test that creates `new CloudApi(true)`, receives `{ order, testPayment: true }`, calls `createDevPayment`, and never calls `wx.requestPayment`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
rtk npm run test -- cloudfunctions/gym-api/src/router.test.ts tests/mini/cloud-api.test.ts --reporter=dot
```

Expected: FAIL because a purchase without external payment parameters throws and CloudApi has no real-cloud test-payment mode.

- [ ] **Step 3: Return an explicit test-payment purchase shape**

In the backend `purchase` action:

```ts
if (!environment.createPaymentParameters) {
  if (!environment.production && environment.developmentPaymentsEnabled) {
    return { ok: true, data: { order, testPayment: true } }
  }
  throw new Error('微信支付服务尚未配置')
}
```

Keep `createDevPayment` protected by both `production === false` and `developmentPaymentsEnabled === true`.

- [ ] **Step 4: Settle test payment through CloudApi**

Add `testPayment?: true` and optional `payment` to `PurchaseResponse`. Accept a constructor flag:

```ts
export class CloudApi implements GymApi {
  constructor(private readonly testPaymentEnabled = false) {}
}
```

When the server returns `testPayment: true`, require the constructor flag, call:

```ts
await this.call('createDevPayment', { orderId: purchase.order.id }, input.requestId)
return this.queryPurchase({ orderId: purchase.order.id, requestId: input.requestId })
```

Otherwise continue through real `wx.requestPayment`.

- [ ] **Step 5: Separate real-cloud test payment from mock data**

In `env.ts` use:

```ts
const ENABLE_TEST_PAYMENT_IN_NON_RELEASE_BUILDS = true
```

Set `testPaymentEnabled` from the build mode, not from `USE_LOCAL_DEVELOPMENT_DATA`. `resolveEnvironment` already rejects test payment in production. Pass it from `app.ts`:

```ts
registerApi(new CloudApi(environment.testPaymentEnabled))
```

Change CloudBase function configuration to:

```json
"DEVELOPMENT_PAYMENTS_ENABLED": "{{env.DEVELOPMENT_PAYMENTS_ENABLED}}"
```

Set `DEVELOPMENT_PAYMENTS_ENABLED=true` in the ignored `.env.local`, document `false` for production in `.env.example`, and keep the function runtime’s `NODE_ENV` as production.

- [ ] **Step 6: Run focused tests and builds**

Run:

```bash
rtk npm run test -- cloudfunctions/gym-api/src/router.test.ts tests/mini/cloud-api.test.ts tests/mini/models.test.ts --reporter=dot
rtk npm run build --prefix cloudfunctions/gym-api
rtk npm run typecheck
```

Expected: real test environment uses explicit test settlement, release mode rejects it, and no mock member data is enabled.

- [ ] **Step 7: Commit**

```bash
rtk git add cloudfunctions/gym-api/src miniprogram cloudbaserc.json .env.example tests/mini
rtk git commit -m "feat: support real cloud test purchases"
```

## Task 8: Verify environment portability and update operating instructions

**Files:**

- Modify: `README.md`
- Modify: `scripts/verify-production-config.mjs`
- Modify: `tests/mini/models.test.ts`

- [ ] **Step 1: Add a failing environment portability test**

Extend the environment tests to prove development/trial uses the configured test environment, mock data remains off, and production refuses test payment or local data.

```ts
expect(getCloudInitializationOptions(environment)).toEqual({
  traceUser: true,
  env: 'cloud1-d1gmh1lu77f6e8c06',
})
expect(environment.useLocalData).toBe(false)
```

Extend `verify-production-config.mjs` checks so production requires:

- `CLOUDBASE_ENV_ID`
- `VITE_CLOUDBASE_ENV_ID`
- matching CloudBase environment IDs
- payment and scheduler secrets
- test payment disabled

- [ ] **Step 2: Run focused checks and verify RED where new guards are absent**

Run:

```bash
rtk npm run test -- tests/mini/models.test.ts --reporter=dot
rtk node scripts/verify-production-config.mjs
```

Expected: model test passes only after configuration remains explicit; config script fails clearly while required production secrets are blank.

- [ ] **Step 3: Document exact local and cloud workflows**

Update README with:

```bash
# Local admin against the test environment
npm run admin:dev

# Build all cloud functions and the hosted admin
npm run cloud:build
npm run admin:build

# Deploy using the environment values loaded from .env.local
set -a
source .env.local
set +a
npx @cloudbase/cli@3.7.0 framework deploy
```

Document:

- enable anonymous web authentication for the hosted admin origin;
- create the first admin record and password hash;
- deploy `gym-api` after adding `wx-server-sdk`;
- rebuild npm and compile the mini program;
- access the hosted admin at the CloudBase default domain plus `/admin/`;
- verify WeChat phone-number experience quota before real-device testing;
- production migration changes environment values and secrets only.

- [ ] **Step 4: Run the complete verification suite**

Run:

```bash
rtk npm run check
rtk npm run test -- --reporter=dot
rtk npm run cloud:build
rtk npm run admin:build
rtk proxy git diff --check
```

Expected: all checks, tests, three function builds, and admin production build pass.

- [ ] **Step 5: Commit**

```bash
rtk git add README.md scripts/verify-production-config.mjs tests/mini/models.test.ts
rtk git commit -m "docs: add test and production deployment workflow"
```

## Task 9: Deploy and perform non-browser smoke checks

**Files:**

- Deployment artifact: `cloudfunctions/gym-api/dist/index.js`
- Deployment artifact: `admin/dist/**`

- [ ] **Step 1: Confirm the worktree and deployment targets**

Run:

```bash
rtk git status --short
rtk git branch --show-current
rtk rg -n "cloud1-d1gmh1lu77f6e8c06|/admin" miniprogram/config/env.ts .env.local cloudbaserc.json
```

Expected: branch is `main`, tracked worktree is clean, and test environment plus admin path are explicit.

- [ ] **Step 2: Build exact deployable artifacts**

Run:

```bash
rtk npm run cloud:build
rtk npm run admin:build
rtk rg -n "structuredClone" cloudfunctions/gym-api/dist/index.js || true
rtk rg -n "/admin/assets/" admin/dist/index.html
```

Expected: no `structuredClone` appears; the admin uses `/admin/` assets.

- [ ] **Step 3: Deploy the cloud function and website**

Load `.env.local`, authenticate CloudBase CLI if already authorized, and run:

```bash
set -a
source .env.local
set +a
npx @cloudbase/cli@3.7.0 framework deploy
```

If CLI authentication is absent, stop without changing cloud state and ask the user to run `npx @cloudbase/cli@3.7.0 login`. Do not create or purchase resources automatically.

- [ ] **Step 4: Perform CLI and log smoke checks**

Use CloudBase CLI to verify that:

- `gym-api` exists in `cloud1-d1gmh1lu77f6e8c06`;
- static hosting contains `/admin/index.html`;
- a guest `bootstrap` returns `authenticated: false`;
- the guest bootstrap does not add a `users` record;
- no `INTERNAL_ERROR`, `TransactionBusy`, or `structuredClone` error appears in the latest invocation log.

Do not use Playwright or open a browser automatically.

- [ ] **Step 5: Final repository check**

Run:

```bash
rtk npm run check
rtk npm run test -- --reporter=dot
rtk git status --short
rtk git log -10 --oneline
```

Expected: checks pass and no unintended tracked changes remain.
