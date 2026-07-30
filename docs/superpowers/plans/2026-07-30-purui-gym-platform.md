# Purui Gym Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Purui Gym WeChat mini program, coach workspace, CloudBase backend, and browser-based admin system described in the approved design.

**Architecture:** Keep the existing native WeChat mini program and add role-based member and coach pages. Put authoritative booking, package, lesson, and appeal rules in one CloudBase function whose handlers are split by responsibility and tested without a live cloud account. Add a React 19 and Vite 8 admin app; both clients use explicit production and development API adapters so local verification works now while production builds require real CloudBase configuration.

**Tech Stack:** WeChat native mini program, Skyline, glass-easel, TypeScript, Less, Vant Weapp, CloudBase JavaScript SDK 3.6.7, CloudBase Node SDK 3.18.3, React 19.2.8, Vite 8.1.5, Vitest 4.1.10, Playwright browser verification.

---

## File map

### Shared contracts

- `miniprogram/shared/contracts.ts`: data structures and API request/response types shared by the mini program, admin build, and cloud-function build.
- `miniprogram/shared/time.ts`: one-hour slot generation and time-boundary helpers.
- `tests/shared/time.test.ts`: fixed-hour, cancellation cutoff, and appeal-window tests.

### Cloud backend

- `cloudfunctions/gym-api/package.json`: CloudBase function dependencies and build scripts.
- `cloudfunctions/gym-api/src/index.ts`: CloudBase entry point and action router.
- `cloudfunctions/gym-api/src/auth.ts`: member, coach, and admin permission checks.
- `cloudfunctions/gym-api/src/store.ts`: database operations and transaction boundary.
- `cloudfunctions/gym-api/src/lessons.ts`: schedule, booking, cancellation, completion, and feedback rules.
- `cloudfunctions/gym-api/src/packages.ts`: package catalogue, purchase issuance, and lesson-balance adjustments.
- `cloudfunctions/gym-api/src/appeals.ts`: appeal creation and administrator decisions.
- `cloudfunctions/gym-api/src/payment.ts`: development payment and production WeChat payment boundary.
- `cloudfunctions/gym-api/src/seed.ts`: deterministic development records.
- `cloudfunctions/gym-api/tests/*.test.ts`: authoritative business-rule tests.
- `cloudfunctions/auto-complete-lessons/src/index.ts`: scheduled completion of lessons more than 24 hours past end time.
- `cloudbaserc.json`: CloudBase function and static-hosting deployment declaration.
- `database.rules.json`: deny direct writes to business collections.
- `database.indexes.json`: booking, schedule, order, and appeal indexes.

### Mini program

- `miniprogram/app.ts`, `miniprogram/app.json`, `miniprogram/app.less`: cloud initialization, role state, pages, and global brand styles.
- `miniprogram/config/env.ts`: development/production environment selection.
- `miniprogram/services/api.ts`: typed mini-program API facade.
- `miniprogram/services/cloud-api.ts`: production cloud-function caller.
- `miniprogram/services/development-api.ts`: development-only local data adapter.
- `miniprogram/services/development-store.ts`: deterministic `wx` storage state used for local acceptance testing.
- `miniprogram/components/app-tab-bar/*`: role-aware member/coach navigation.
- `miniprogram/pages/member-home/*`: package catalogue, balances, and next lesson.
- `miniprogram/pages/package-checkout/*`: package and coach selection with test/real payment boundary.
- `miniprogram/pages/coach-detail/*`: dated one-hour schedule and booking confirmation.
- `miniprogram/pages/member-lessons/*`: upcoming/history lists.
- `miniprogram/pages/lesson-detail/*`: cancel, complete, optional feedback, and appeal.
- `miniprogram/pages/member-profile/*`: account details and role switching.
- `miniprogram/pages/coach-dashboard/*`: today timeline and lesson actions.
- `miniprogram/pages/coach-schedule/*`: daily bulk and individual slot controls.
- `miniprogram/pages/coach-profile/*`: coach profile and role switching.

### Admin

- `admin/index.html`, `admin/vite.config.ts`, `admin/tsconfig.json`: Vite application entry and build configuration.
- `admin/src/main.tsx`, `admin/src/app.tsx`: React root, authentication gate, and page routing.
- `admin/src/styles.css`: Purui Gym desktop visual system and responsive behavior.
- `admin/src/api/contracts.ts`: admin-specific request types derived from shared contracts.
- `admin/src/api/index.ts`: API adapter selection.
- `admin/src/api/cloudbase.ts`: CloudBase Web SDK caller.
- `admin/src/api/development.ts`: deterministic local development backend.
- `admin/src/components/admin-shell.tsx`: side navigation and main workspace.
- `admin/src/components/status-pill.tsx`: accessible text-and-color status treatment.
- `admin/src/pages/login-page.tsx`: administrator sign-in.
- `admin/src/pages/dashboard-page.tsx`: today, appeal, exception, and sales summary.
- `admin/src/pages/coaches-page.tsx`: coach create, edit, enable, disable, and detail.
- `admin/src/pages/members-page.tsx`: member packages, lesson history, and manual balance changes.
- `admin/src/pages/packages-page.tsx`: package create, edit, publish, and unpublish.
- `admin/src/pages/bookings-page.tsx`: searchable booking history.
- `admin/src/pages/appeals-page.tsx`: appeal decision workflow.
- `admin/src/**/*.test.tsx`: admin interaction tests.

### Verification and documentation

- `scripts/verify-production-config.mjs`: fail a production build when CloudBase or payment configuration is missing or development payment is enabled.
- `README.md`: local development, cloud setup, deployment, test accounts, and remaining account prerequisites.

## Task 1: Establish test and build foundations

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `miniprogram/shared/contracts.ts`
- Create: `miniprogram/shared/time.ts`
- Create: `tests/shared/time.test.ts`

- [ ] **Step 1: Write failing fixed-slot and deadline tests**

```ts
import { describe, expect, it } from 'vitest'
import { canMemberCancel, canSubmitAppeal, createDefaultSlots } from '../../miniprogram/shared/time'

describe('lesson time rules', () => {
  it('creates eleven one-hour slots from 10:00 through 21:00', () => {
    expect(createDefaultSlots('2026-08-01')).toHaveLength(11)
    expect(createDefaultSlots('2026-08-01').at(0)?.label).toBe('10:00–11:00')
    expect(createDefaultSlots('2026-08-01').at(-1)?.label).toBe('20:00–21:00')
  })

  it('allows member cancellation at exactly two hours but not one minute later', () => {
    const startsAt = new Date('2026-08-01T10:00:00+08:00')
    expect(canMemberCancel(startsAt, new Date('2026-08-01T08:00:00+08:00'))).toBe(true)
    expect(canMemberCancel(startsAt, new Date('2026-08-01T08:01:00+08:00'))).toBe(false)
  })

  it('accepts an appeal through the seventh day only', () => {
    const consumedAt = new Date('2026-08-01T10:00:00+08:00')
    expect(canSubmitAppeal(consumedAt, new Date('2026-08-08T10:00:00+08:00'))).toBe(true)
    expect(canSubmitAppeal(consumedAt, new Date('2026-08-08T10:00:01+08:00'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails because the time module does not exist**

Run: `rtk npx vitest run tests/shared/time.test.ts`

Expected: FAIL with an import error for `miniprogram/shared/time`.

- [ ] **Step 3: Add the shared contracts and minimal time implementation**

```ts
export interface LessonSlot {
  startsAt: string
  endsAt: string
  label: string
}

export const createDefaultSlots = (date: string): LessonSlot[] =>
  Array.from({ length: 11 }, (_, index) => {
    const hour = index + 10
    return {
      startsAt: `${date}T${String(hour).padStart(2, '0')}:00:00+08:00`,
      endsAt: `${date}T${String(hour + 1).padStart(2, '0')}:00:00+08:00`,
      label: `${String(hour).padStart(2, '0')}:00–${String(hour + 1).padStart(2, '0')}:00`,
    }
  })

export const canMemberCancel = (startsAt: Date, now: Date): boolean =>
  startsAt.getTime() - now.getTime() >= 2 * 60 * 60 * 1000

export const canSubmitAppeal = (consumedAt: Date, now: Date): boolean =>
  now.getTime() - consumedAt.getTime() <= 7 * 24 * 60 * 60 * 1000
```

Define in `contracts.ts`: `UserRole`, `Coach`, `PackageProduct`, `MembershipPackage`, `Lesson`, `LessonStatus`, `Appeal`, `ApiRequest`, and `ApiResponse` with explicit string unions matching the approved design.

- [ ] **Step 4: Add Vitest and workspace scripts**

Add `test`, `test:watch`, `admin:dev`, `admin:build`, `cloud:test`, and `verify` scripts. Configure Vitest to include `tests/**/*.test.ts`, `cloudfunctions/**/*.test.ts`, and `admin/src/**/*.test.tsx`.

- [ ] **Step 5: Run foundation checks**

Run: `rtk npm run test -- tests/shared/time.test.ts && rtk npm run typecheck`

Expected: all three time tests pass and TypeScript reports no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts miniprogram/shared tests/shared
git commit -m "test: establish gym domain foundations"
```

## Task 2: Implement authoritative package and lesson rules

**Files:**
- Create: `cloudfunctions/gym-api/package.json`
- Create: `cloudfunctions/gym-api/src/store.ts`
- Create: `cloudfunctions/gym-api/src/packages.ts`
- Create: `cloudfunctions/gym-api/src/lessons.ts`
- Create: `cloudfunctions/gym-api/tests/packages.test.ts`
- Create: `cloudfunctions/gym-api/tests/lessons.test.ts`

- [ ] **Step 1: Write failing membership issuance and booking tests**

```ts
it('issues a package bound to the selected coach exactly once', async () => {
  const first = await packages.issuePaidOrder(store, paidOrder)
  const second = await packages.issuePaidOrder(store, paidOrder)
  expect(first.id).toBe(second.id)
  expect(store.memberships).toHaveLength(1)
})

it('locks one lesson when booking and rejects the occupied coach slot', async () => {
  const lesson = await lessons.book(store, request, now)
  expect(lesson.status).toBe('booked')
  expect(store.memberships[0].lockedLessons).toBe(1)
  await expect(lessons.book(store, competingRequest, now)).rejects.toThrow('SLOT_OCCUPIED')
})
```

- [ ] **Step 2: Run the focused tests and verify missing-module failures**

Run: `rtk npx vitest run cloudfunctions/gym-api/tests/packages.test.ts cloudfunctions/gym-api/tests/lessons.test.ts`

Expected: FAIL because `packages` and `lessons` do not exist.

- [ ] **Step 3: Implement the in-memory test store and package issuance**

The store exposes `transaction(callback)`, unique lookup by order ID, membership balance mutation, lesson lookup, and append-only lesson-balance entries. `issuePaidOrder` returns the existing membership for a repeated paid-order callback and otherwise records the product snapshot and selected coach.

- [ ] **Step 4: Implement booking and slot collision**

`book` must check coach active status, open schedule, matching coach, `availableLessons > 0`, and absence of a non-terminal lesson for the coach/start time. In one transaction it creates the lesson, decrements available lessons, increments locked lessons, and appends a `lock` balance entry.

- [ ] **Step 5: Add cancellation, completion, and idempotency tests**

Cover member cancellation at the two-hour boundary, blocked late member cancellation, coach cancellation with both consume choices, member/coach completion, repeated completion, and automatic completion.

- [ ] **Step 6: Implement the minimal state transitions**

Use terminal statuses `member_cancelled`, `coach_cancelled_released`, `coach_cancelled_consumed`, and `completed`. Every transition records `requestId`; a repeated request ID returns the first result. A terminal lesson rejects a different transition.

- [ ] **Step 7: Run cloud rule tests**

Run: `rtk npx vitest run cloudfunctions/gym-api/tests/packages.test.ts cloudfunctions/gym-api/tests/lessons.test.ts`

Expected: all package, booking, cancellation, and completion tests pass.

- [ ] **Step 8: Commit**

```bash
git add cloudfunctions/gym-api miniprogram/shared/contracts.ts
git commit -m "feat: add package and lesson domain rules"
```

## Task 3: Implement appeals, permissions, and payment boundaries

**Files:**
- Create: `cloudfunctions/gym-api/src/appeals.ts`
- Create: `cloudfunctions/gym-api/src/auth.ts`
- Create: `cloudfunctions/gym-api/src/payment.ts`
- Create: `cloudfunctions/gym-api/tests/appeals.test.ts`
- Create: `cloudfunctions/gym-api/tests/auth.test.ts`
- Create: `cloudfunctions/gym-api/tests/payment.test.ts`

- [ ] **Step 1: Write failing appeal tests**

Test that only consumed lessons are appealable, the seven-day boundary is inclusive, only one appeal is allowed, approval returns exactly one lesson, and repeated approval does not return another lesson.

- [ ] **Step 2: Run the appeal tests and confirm failure**

Run: `rtk npx vitest run cloudfunctions/gym-api/tests/appeals.test.ts`

Expected: FAIL because the appeal service does not exist.

- [ ] **Step 3: Implement appeal creation and decision**

`createAppeal` validates lesson ownership, consumed balance entry, time window, non-empty reason, and uniqueness. `decideAppeal` requires an administrator, a non-empty decision note, and pending status; approval adds one available lesson and one `appeal_refund` entry in the same transaction.

- [ ] **Step 4: Write permission and payment tests**

```ts
expect(() => requireMember(memberActor, memberId)).not.toThrow()
expect(() => requireMember(otherMemberActor, memberId)).toThrow('FORBIDDEN')
expect(() => requireCoach(coachActor, lesson.coachId)).not.toThrow()
expect(() => requireAdmin(memberActor)).toThrow('FORBIDDEN')
expect(() => createDevelopmentPayment({ production: true })).toThrow('DEV_PAYMENT_DISABLED')
```

- [ ] **Step 5: Implement permission helpers and payment adapters**

Production order creation returns the data needed by `wx.requestPayment`; only a verified server callback can issue a package. Development payment requires a server-side development flag and rejects any production runtime.

- [ ] **Step 6: Run the focused cloud test suite**

Run: `rtk npx vitest run cloudfunctions/gym-api/tests`

Expected: all domain, appeal, permission, and payment tests pass.

- [ ] **Step 7: Commit**

```bash
git add cloudfunctions/gym-api/src cloudfunctions/gym-api/tests
git commit -m "feat: secure appeals and payment boundaries"
```

## Task 4: Add CloudBase entry points, database configuration, and timer

**Files:**
- Create: `cloudfunctions/gym-api/src/index.ts`
- Create: `cloudfunctions/gym-api/src/seed.ts`
- Create: `cloudfunctions/gym-api/tests/router.test.ts`
- Create: `cloudfunctions/auto-complete-lessons/package.json`
- Create: `cloudfunctions/auto-complete-lessons/src/index.ts`
- Create: `cloudbaserc.json`
- Create: `database.rules.json`
- Create: `database.indexes.json`

- [ ] **Step 1: Write failing router tests**

Cover `bootstrap`, `listPackages`, `listCoaches`, `bookLesson`, `cancelLesson`, `completeLesson`, `saveFeedback`, `createAppeal`, admin CRUD actions, and an unknown-action rejection.

- [ ] **Step 2: Run router tests and verify failure**

Run: `rtk npx vitest run cloudfunctions/gym-api/tests/router.test.ts`

Expected: FAIL because the function router does not exist.

- [ ] **Step 3: Implement one typed action router**

```ts
export const route = async (event: ApiRequest, context: RequestContext): Promise<ApiResponse> => {
  switch (event.action) {
    case 'bootstrap':
      return { ok: true, data: await bootstrap(context) }
    case 'bookLesson':
      return { ok: true, data: await bookLesson(context, event.payload) }
    default:
      return { ok: false, error: { code: 'UNKNOWN_ACTION', message: '不支持的操作' } }
  }
}
```

The CloudBase entry extracts the WeChat identity server-side. Admin actions additionally validate the administrator session token.

- [ ] **Step 4: Add deterministic development seed data**

Seed one member, two coaches, three package products, memberships, open schedules, upcoming lessons, one completed lesson, and one pending appeal. The seed action must refuse production execution.

- [ ] **Step 5: Add timer and deployment declarations**

The scheduled function queries booked lessons with `endsAt <= now - 24h`, then calls the same idempotent completion rule. Database rules deny direct client writes; indexes cover coach/start time, member/status, appeal/status, and order/payment ID.

- [ ] **Step 6: Run all cloud tests**

Run: `rtk npm run cloud:test`

Expected: all tests pass with no live CloudBase environment.

- [ ] **Step 7: Commit**

```bash
git add cloudfunctions cloudbaserc.json database.rules.json database.indexes.json
git commit -m "feat: expose CloudBase gym API"
```

## Task 5: Rebrand and establish the mini-program application shell

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `miniprogram/app.ts`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/app.less`
- Modify: `miniprogram/styles/tokens.less`
- Create: `miniprogram/config/env.ts`
- Create: `miniprogram/services/api.ts`
- Create: `miniprogram/services/cloud-api.ts`
- Create: `miniprogram/services/development-api.ts`
- Create: `miniprogram/services/development-store.ts`
- Create: `miniprogram/components/app-tab-bar/*`

- [ ] **Step 1: Write API adapter selection tests**

Test that development builds select the local adapter and production builds reject missing CloudBase environment IDs or enabled development payment.

- [ ] **Step 2: Run tests and confirm failure**

Run: `rtk npx vitest run tests/mini/config.test.ts`

Expected: FAIL because environment selection does not exist.

- [ ] **Step 3: Implement explicit environment selection**

```ts
export const environment = {
  mode: 'development' as 'development' | 'production',
  cloudbaseEnvId: '',
  developmentPayment: true,
}

export const assertSafeProductionConfig = () => {
  if (environment.mode === 'production' && (!environment.cloudbaseEnvId || environment.developmentPayment)) {
    throw new Error('UNSAFE_PRODUCTION_CONFIG')
  }
}
```

- [ ] **Step 4: Implement typed production and development API adapters**

The cloud adapter uses `wx.cloud.callFunction({ name: 'gym-api', data: request })`. The development adapter reads and writes deterministic state through `wx.getStorageSync` and `wx.setStorageSync`, implementing the same visible flows without claiming to test CloudBase itself.

- [ ] **Step 5: Replace the old brand and register all member/coach pages**

Update application title, tokens, page list, and global background. Remove all user-facing “拼饭” text. Create a role-aware tab bar with text labels and accessible selected states.

- [ ] **Step 6: Run static checks**

Run: `rtk npm run check`

Expected: formatting, style, and TypeScript checks pass.

- [ ] **Step 7: Commit**

```bash
git add README.md package.json miniprogram
git commit -m "feat: establish Purui mini program shell"
```

## Task 6: Build member purchase and booking flows

**Files:**
- Create: `miniprogram/pages/member-home/*`
- Create: `miniprogram/pages/package-checkout/*`
- Create: `miniprogram/pages/coach-detail/*`
- Modify: `miniprogram/app.json`

- [ ] **Step 1: Add page-model tests**

Test package price formatting, aggregate available balance, next-lesson selection, slot labels, other-member privacy, and selection of only memberships bound to the viewed coach.

- [ ] **Step 2: Run page-model tests and confirm failure**

Run: `rtk npx vitest run tests/mini/member-pages.test.ts`

Expected: FAIL because member page models do not exist.

- [ ] **Step 3: Implement the member home**

Render the Purui Gym masthead, package catalogue for a user without purchases, balance and next lesson for an existing member, bound-coach list, and retryable loading/error states.

- [ ] **Step 4: Implement checkout**

Require one package and one active coach. In development show “测试支付” with an obvious development label; in production call the payment order action and then `wx.requestPayment`. Re-query the order after payment rather than issuing a client-side package.

- [ ] **Step 5: Implement coach schedule and booking**

Show a horizontal date selector and vertical 10:00–21:00 timeline. Render `可预约`, `已预约`, `我的预约`, and `未开放` with text plus color. Confirmation shows coach, date, time, and eligible membership before submission.

- [ ] **Step 6: Run checks and page-model tests**

Run: `rtk npx vitest run tests/mini/member-pages.test.ts && rtk npm run check`

Expected: all tests and checks pass.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/member-home miniprogram/pages/package-checkout miniprogram/pages/coach-detail miniprogram/app.json tests/mini
git commit -m "feat: add member purchase and booking"
```

## Task 7: Build member lessons, feedback, and appeals

**Files:**
- Create: `miniprogram/pages/member-lessons/*`
- Create: `miniprogram/pages/lesson-detail/*`
- Create: `miniprogram/pages/member-profile/*`

- [ ] **Step 1: Add failing action-availability tests**

Test that member cancel appears only at or before the two-hour cutoff, completion appears only after lesson end, feedback is optional, appeal appears only for consumed lessons within seven days, and role switching appears only for dual-role users.

- [ ] **Step 2: Run the tests and verify failure**

Run: `rtk npx vitest run tests/mini/member-lessons.test.ts`

Expected: FAIL because lesson view models do not exist.

- [ ] **Step 3: Implement upcoming and history lists**

Group upcoming lessons by date and history by month. Show status, coach, time, balance result, feedback, and appeal outcome without repeating headings.

- [ ] **Step 4: Implement lesson actions**

Member cancellation asks for confirmation and refreshes balance. Completion offers optional star and text controls with a visible “跳过并确认完成” path. Appeal requires a reason and displays the administrator decision after processing.

- [ ] **Step 5: Implement profile and role switch**

Show member identity, package summaries, and a coach-mode switch only when the account has both roles.

- [ ] **Step 6: Run tests and static checks**

Run: `rtk npx vitest run tests/mini/member-lessons.test.ts && rtk npm run check`

Expected: tests and checks pass.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/member-lessons miniprogram/pages/lesson-detail miniprogram/pages/member-profile tests/mini
git commit -m "feat: add member lesson history and appeals"
```

## Task 8: Build coach dashboard and scheduling

**Files:**
- Create: `miniprogram/pages/coach-dashboard/*`
- Create: `miniprogram/pages/coach-schedule/*`
- Create: `miniprogram/pages/coach-profile/*`

- [ ] **Step 1: Add failing coach view-model tests**

Test chronological today ordering, next-lesson emphasis, eleven default-open slots, bulk close excluding booked slots, individual booked-slot lock, and late cancellation consume/release choices.

- [ ] **Step 2: Run tests and verify failure**

Run: `rtk npx vitest run tests/mini/coach-pages.test.ts`

Expected: FAIL because coach page models do not exist.

- [ ] **Step 3: Implement coach dashboard**

Use the day timeline as the dominant layout. Show member name and contact only for that coach’s lessons. Allow completion after lesson end and coach cancellation with explicit “消耗 1 节” or “不消耗” choice.

- [ ] **Step 4: Implement schedule editing**

Generate all eleven slots as open by default. Allow date selection, bulk open/close, and individual switches. A booked slot renders member/status text and a disabled switch; its lesson must be handled before the slot can close.

- [ ] **Step 5: Implement coach profile and role switch**

Show coach details and a member-mode switch only for dual-role accounts.

- [ ] **Step 6: Run tests and checks**

Run: `rtk npx vitest run tests/mini/coach-pages.test.ts && rtk npm run check`

Expected: tests and checks pass.

- [ ] **Step 7: Commit**

```bash
git add miniprogram/pages/coach-dashboard miniprogram/pages/coach-schedule miniprogram/pages/coach-profile tests/mini
git commit -m "feat: add coach workspace and schedule"
```

## Task 9: Establish the React admin shell and authentication

**Files:**
- Create: `admin/index.html`
- Create: `admin/vite.config.ts`
- Create: `admin/tsconfig.json`
- Create: `admin/src/main.tsx`
- Create: `admin/src/app.tsx`
- Create: `admin/src/styles.css`
- Create: `admin/src/api/contracts.ts`
- Create: `admin/src/api/index.ts`
- Create: `admin/src/api/cloudbase.ts`
- Create: `admin/src/api/development.ts`
- Create: `admin/src/components/admin-shell.tsx`
- Create: `admin/src/components/status-pill.tsx`
- Create: `admin/src/pages/login-page.tsx`
- Create: `admin/src/app.test.tsx`

- [ ] **Step 1: Write a failing authentication-shell test**

```tsx
it('shows login first and opens the dashboard after valid development credentials', async () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: '后台登录' })).toBeVisible()
  await user.type(screen.getByLabelText('账号'), 'admin')
  await user.type(screen.getByLabelText('密码'), 'Purui2026!')
  await user.click(screen.getByRole('button', { name: '登录' }))
  expect(await screen.findByRole('navigation', { name: '后台导航' })).toBeVisible()
})
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `rtk npx vitest run admin/src/app.test.tsx`

Expected: FAIL because the admin application does not exist.

- [ ] **Step 3: Add Vite, React, test dependencies, and entry**

Use React 19 `createRoot`, Vite’s React TypeScript plugin, and a `happy-dom` Vitest environment. Add `admin:dev` and `admin:build` scripts at the repository root.

- [ ] **Step 4: Implement the auth gate and API selection**

Cloud mode initializes `@cloudbase/js-sdk` with `VITE_CLOUDBASE_ENV_ID` and calls `gym-api`. Development mode uses a deterministic local adapter and the documented local account. Production refuses to build with development mode enabled.

- [ ] **Step 5: Implement the visual shell**

Create the warm-white, charcoal, strength-red, and signal-yellow style system. Add fixed side navigation, responsive tablet behavior, visible focus states, status text, and loading/error feedback.

- [ ] **Step 6: Run the test and production build**

Run: `rtk npx vitest run admin/src/app.test.tsx && rtk npm run admin:build`

Expected: authentication test passes and Vite creates `admin/dist`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json admin
git commit -m "feat: add Purui admin shell"
```

## Task 10: Build admin dashboard and management pages

**Files:**
- Create: `admin/src/pages/dashboard-page.tsx`
- Create: `admin/src/pages/coaches-page.tsx`
- Create: `admin/src/pages/members-page.tsx`
- Create: `admin/src/pages/packages-page.tsx`
- Create: `admin/src/pages/management-pages.test.tsx`

- [ ] **Step 1: Write failing management interaction tests**

Test dashboard summaries, coach add/edit/disable, member package/history display, manual balance adjustment requiring a reason, package add/edit/unpublish, and preservation of sold-package snapshots.

- [ ] **Step 2: Run tests and confirm failure**

Run: `rtk npx vitest run admin/src/pages/management-pages.test.tsx`

Expected: FAIL because management pages do not exist.

- [ ] **Step 3: Implement dashboard and coach management**

Show today lessons, pending appeals, booking exceptions, and recent sales. Use a table plus a focused edit side panel for coach create/edit/disable and schedule/history inspection.

- [ ] **Step 4: Implement member management**

Show profile, purchased packages, bound coaches, available/locked/used balances, lesson history, feedback, and appeals. Balance adjustment requires a signed non-zero integer and a non-empty reason.

- [ ] **Step 5: Implement package management**

Create/edit name, price in fen, lesson count, and publication state. Disable destructive deletion; unpublishing keeps historical entitlements unchanged.

- [ ] **Step 6: Run tests and build**

Run: `rtk npx vitest run admin/src/pages/management-pages.test.tsx && rtk npm run admin:build`

Expected: interaction tests pass and the build succeeds.

- [ ] **Step 7: Commit**

```bash
git add admin/src/pages admin/src/api
git commit -m "feat: add gym management pages"
```

## Task 11: Build booking and appeal administration

**Files:**
- Create: `admin/src/pages/bookings-page.tsx`
- Create: `admin/src/pages/appeals-page.tsx`
- Create: `admin/src/pages/operations-pages.test.tsx`

- [ ] **Step 1: Write failing operations tests**

Test booking filtering by date/coach/member/status, full balance history display, appeal detail, mandatory decision note, reject flow, approve-and-return-one flow, and disabled repeated decision controls.

- [ ] **Step 2: Run tests and confirm failure**

Run: `rtk npx vitest run admin/src/pages/operations-pages.test.tsx`

Expected: FAIL because operations pages do not exist.

- [ ] **Step 3: Implement booking records**

Render filter controls and a readable table. The detail panel shows lesson status history, completion/cancellation source, membership, and every balance movement.

- [ ] **Step 4: Implement appeal processing**

Render pending appeals first. Require a decision note before enabling reject or approve. Refresh the appeal and member balance after success; processed appeals remain visible and read-only.

- [ ] **Step 5: Run tests and full admin build**

Run: `rtk npx vitest run admin/src/pages/operations-pages.test.tsx && rtk npm run admin:build`

Expected: operations tests pass and the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages
git commit -m "feat: add booking and appeal operations"
```

## Task 12: Add production safeguards and deployment documentation

**Files:**
- Create: `scripts/verify-production-config.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Create: `.env.example`

- [ ] **Step 1: Write a failing production-config test**

Test missing CloudBase environment ID, enabled development payment, missing payment merchant ID, and a valid production configuration.

- [ ] **Step 2: Run the test and confirm failure**

Run: `rtk npx vitest run tests/config/production.test.ts`

Expected: FAIL because the production verifier does not exist.

- [ ] **Step 3: Implement the verifier**

The verifier reads only named Purui configuration variables, returns actionable messages, and exits non-zero when a production build lacks CloudBase or payment configuration or enables development payment.

- [ ] **Step 4: Document local and cloud setup**

README must list:

- `npm install`, `npm test`, `npm run check`, `npm run admin:dev`, and WeChat Developer Tools steps.
- Development member, coach, dual-role, and admin test accounts.
- CloudBase environment creation, database/index deployment, function deployment, static-hosting deployment, and timer setup.
- Mini-program AppID, verified subject, bound WeChat merchant account, and production environment variables required for final launch.
- Clear statement that development payment is not real payment.

- [ ] **Step 5: Run the complete automated verification**

Run: `rtk npm run verify`

Expected: shared tests, cloud tests, admin tests, mini-program checks, and admin production build all pass.

- [ ] **Step 6: Commit**

```bash
git add scripts package.json README.md .env.example tests/config
git commit -m "docs: add safe deployment workflow"
```

## Task 13: Perform visual and end-to-end acceptance

**Files:**
- Modify only files that fail acceptance.

- [ ] **Step 1: Start the admin development server**

Run: `rtk npm run admin:dev -- --host 127.0.0.1`

Expected: Vite reports a local URL without errors.

- [ ] **Step 2: Verify the admin in a real browser**

Using Playwright, sign in and click through dashboard, coaches, members, packages, bookings, and appeals. Confirm create/edit/disable, manual balance adjustment, package unpublish, appeal reject, and appeal approve behaviors. Inspect desktop and tablet widths and check the browser console.

- [ ] **Step 3: Verify the mini program**

Open the project in WeChat Developer Tools when controllable. Exercise member purchase, booking, two-hour cancellation, completion without feedback, history, appeal, coach schedule, booked-slot lock, late cancellation choices, and role switching. Check Skyline rendering and the console.

- [ ] **Step 4: Re-run the complete verification after acceptance fixes**

Run: `rtk npm run verify && rtk git diff --check`

Expected: all checks pass and no whitespace errors remain.

- [ ] **Step 5: Confirm repository state**

Run: `rtk git status --short`

Expected: only intentional implementation changes are present.

- [ ] **Step 6: Commit acceptance fixes**

```bash
git add admin miniprogram cloudfunctions tests scripts README.md package.json package-lock.json
git commit -m "fix: complete Purui platform acceptance"
```
