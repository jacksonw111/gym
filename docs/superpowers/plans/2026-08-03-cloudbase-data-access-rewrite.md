# CloudBase Data Access Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full-database hydration with request-scoped CloudBase queries and targeted writes, remove duplicate page requests without caching, and make legacy packages publishable.

**Architecture:** Keep the existing domain model and in-memory router for deterministic business-rule tests, but replace `CloudBaseStore` with a request-scoped implementation. Before routing, the cloud handler resolves identity and prepares only the records required by the current action; transactions repeat only that scope and persist only declared writable collections. The admin loads one page-specific snapshot per navigation, and each mini-program page uses one page-oriented cloud request.

**Tech Stack:** TypeScript, CloudBase Node SDK, React 19, WeChat native mini-program, Vitest, Vite

---

### Task 1: Request-scoped CloudBase query primitives

**Files:**
- Create: `cloudfunctions/gym-api/src/store-scope.ts`
- Replace: `cloudfunctions/gym-api/src/store-cloudbase.ts`
- Modify: `cloudfunctions/gym-api/src/store.cloud.test.ts`

- [ ] **Step 1: Write failing tests for filtered loads and query counts**

Extend the fake database with `where()` support and a query log. Add tests that express the new public API:

```ts
const store = new CloudBaseStore(database)
await store.prepare({
  action: 'listPackages',
  requestId: 'list-packages',
  payload: {},
})

expect(store.products.map((item) => item.id)).toEqual(['published-product'])
expect(database.queriedCollections()).toEqual(['products'])
```

Add separate tests for `listCoaches`, unauthenticated session lookup, and product status mutation. Assert that `system_locks` is never queried.

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run: `rtk vitest run cloudfunctions/gym-api/src/store.cloud.test.ts`

Expected: FAIL because `CloudBaseStore.prepare` and filtered `where()` queries do not exist.

- [ ] **Step 3: Define request scopes and filtered collection reads**

Create these contracts in `store-scope.ts`:

```ts
export type AdminPage = 'dashboard' | 'coaches' | 'members' | 'products' | 'bookings' | 'appeals'

export interface StoreRequest {
  action: string
  requestId: string
  payload: Record<string, unknown>
  identity?: { openId: string }
  authToken?: string
}

export interface CollectionQuery {
  collection: keyof StoreCollections
  where?: Record<string, unknown>
  writable?: boolean
}
```

Replace `load()` with `prepare(request)`. Implement `loadWhere()` using CloudBase `where`, `limit`, and `skip`, normalize `_id` to `id`, and merge results from multiple precise queries without duplicates.

- [ ] **Step 4: Implement request scope selection**

Map every current action to only the records it needs. Resolve dependent IDs in stages: identity user first, then coach/member/package/lesson relations. Admin actions first load the matching session and admin, then the selected page or mutation records. Mark only collections that the action may change as writable.

Required scope examples:

```ts
listPackages -> products where status == 'published'
listCoaches -> coaches where status == 'active'
adminCrud/packages/setStatus -> product by id
bookLesson -> user by openId, coach by id, membership by id,
              schedule by coachId+startsAt, lessons by requestId or coachId+startsAt
```

- [ ] **Step 5: Run the focused tests**

Run: `rtk vitest run cloudfunctions/gym-api/src/store.cloud.test.ts`

Expected: PASS, with query-count assertions proving unrelated collections are not read.

### Task 2: Targeted transactions without the global lock

**Files:**
- Modify: `cloudfunctions/gym-api/src/store-cloudbase.ts`
- Modify: `cloudfunctions/gym-api/src/store.cloud.test.ts`
- Modify: `cloudfunctions/gym-api/src/store-scope.ts`

- [ ] **Step 1: Write failing transaction tests**

Add tests proving that a package status change reads and writes only `products`, and a booking reads/writes only users, coaches, memberships, schedules, lessons, and ledger. Assert no read or write touches orders, appeals, admins, or `system_locks`.

Add a concurrent booking test backed by a deterministic slot lock and assert exactly one request succeeds.

- [ ] **Step 2: Run the tests and verify they fail for the old full-store transaction**

Run: `rtk vitest run cloudfunctions/gym-api/src/store.cloud.test.ts`

Expected: FAIL because the existing transaction reloads all collections and writes the global lock.

- [ ] **Step 3: Implement scoped transaction reload and persistence**

Inside `transaction(work)`, reload the prepared scope through the CloudBase transaction object, snapshot only writable arrays, run `work`, and write only changed/new/removed records from those arrays. Remove `CLOUD_COLLECTIONS.systemLocks` and the `system_locks/domain` read/write completely.

For booking, use the deterministic schedule document as the conflict record: read it inside the transaction and update its `occupiedLessonId` when booking succeeds. Cancellation clears the same field. Existing booked lessons remain a secondary conflict check during migration.

- [ ] **Step 4: Preserve rollback behavior**

On transaction failure restore the pre-transaction scoped arrays from the local snapshot. Do not call a full reload. Re-throw the original error.

- [ ] **Step 5: Run transaction and domain suites**

Run: `rtk vitest run cloudfunctions/gym-api/src/store.cloud.test.ts cloudfunctions/gym-api/src/lessons.booking.test.ts cloudfunctions/gym-api/src/lessons.lifecycle.test.ts`

Expected: PASS.

### Task 3: Cloud handler preparation and legacy package status

**Files:**
- Modify: `cloudfunctions/gym-api/src/index.ts`
- Modify: `cloudfunctions/gym-api/src/router.test.ts`
- Modify: `cloudfunctions/gym-api/src/store-cloudbase.ts`

- [ ] **Step 1: Write the legacy package regression test**

Add a router/store integration test with a product document that has no `status`, then call:

```ts
{
  action: 'adminCrud',
  payload: {
    resource: 'packages',
    operation: 'setStatus',
    data: { id: 'legacy-package', status: 'published' },
  },
}
```

Assert success and a stored `published` status.

- [ ] **Step 2: Run the regression test and verify the exact failure**

Run: `rtk vitest run cloudfunctions/gym-api/src/router.test.ts cloudfunctions/gym-api/src/store.cloud.test.ts`

Expected: FAIL with `该资源不支持状态变更`.

- [ ] **Step 3: Make status normalization and update safe**

Normalize a missing or invalid product status to `unpublished` when reading CloudBase. Remove the requirement that a package already contain a `status` property before `setStatus`; validate the requested status and set it directly.

- [ ] **Step 4: Prepare after identity resolution**

Change `createCloudHandler` to resolve the server identity first, build the trusted request, then call `store.prepare(request)` before routing. The client-provided identity must remain ignored.

For `__internalAutoCompleteLessons`, prepare only overdue booked lessons and their memberships. Update the payment notification entry point to prepare only the verified order, duplicate payment match, membership, and ledger records.

- [ ] **Step 5: Run router, authentication, and payment tests**

Run: `rtk vitest run cloudfunctions/gym-api/src/router.test.ts cloudfunctions/gym-api/src/auth-payment.test.ts cloudfunctions/gym-api/src/store.cloud.test.ts`

Expected: PASS.

### Task 4: Page-specific admin requests

**Files:**
- Modify: `cloudfunctions/gym-api/src/index.ts`
- Modify: `cloudfunctions/gym-api/src/router.test.ts`
- Modify: `admin/src/api/types.ts`
- Modify: `admin/src/api/production.ts`
- Modify: `admin/src/api/production.test.ts`
- Modify: `admin/src/api/development.ts`
- Modify: `admin/src/app.tsx`
- Modify: `admin/src/app.test.tsx`

- [ ] **Step 1: Write failing API tests for one request per page**

Change the desired API to:

```ts
loadData(page: AdminPage): Promise<AdminData>
```

Assert that `loadData('products')` sends exactly one `adminPage` request with `{ page: 'products' }`, rather than the previous three requests. Add app tests proving initial login loads `dashboard`, and navigating to `products` makes one fresh products request.

- [ ] **Step 2: Run admin tests and verify the expected failures**

Run: `rtk vitest run admin/src/api/production.test.ts admin/src/app.test.tsx`

Expected: FAIL because the API has no page parameter and still performs three requests.

- [ ] **Step 3: Add the `adminPage` backend action**

Require a valid admin session, validate the page name, and return the existing raw dashboard-shaped object populated from the page-specific prepared scope. Define these collection scopes:

```text
dashboard: today's lessons, pending appeals, related users/coaches/packages, two recent paid orders
coaches: coaches, member users, active memberships, related lessons/schedules/products
members: member users, memberships, related lessons/orders/ledger/appeals
products: products, coaches, paid orders needed for sold count
bookings: lessons, related users/coaches/memberships/ledger/appeals
appeals: appeals, related lessons/users/coaches/memberships/ledger
```

- [ ] **Step 4: Load only the active admin page**

Update the production and development APIs to accept a page. In `App`, call `api.loadData(page)` on initial entry, navigation, and explicit refresh. Clear the old page data while the existing page transition loading animation is visible. A write operation refreshes only the active page.

- [ ] **Step 5: Run admin tests, typecheck, and build**

Run: `rtk vitest run admin/src && rtk tsc --noEmit -p admin/tsconfig.json && rtk npm run admin:build`

Expected: PASS and one network request per page load.

### Task 5: One request per mini-program page

**Files:**
- Modify: `cloudfunctions/gym-api/src/index.ts`
- Modify: `cloudfunctions/gym-api/src/router.test.ts`
- Modify: `miniprogram/services/cloud-api.ts`
- Modify: `miniprogram/services/api.ts`
- Modify: `miniprogram/pages/member-home/member-home.ts`
- Modify: `miniprogram/pages/member-lessons/member-lessons.ts`
- Modify: `miniprogram/pages/coach-detail/coach-detail.ts`
- Modify: `miniprogram/pages/coach-dashboard/coach-dashboard.ts`
- Modify: `miniprogram/pages/coach-schedule/coach-schedule.ts`
- Modify: `miniprogram/pages/coach-profile/coach-profile.ts`
- Modify: `miniprogram/pages/member-profile/member-profile.ts`

- [ ] **Step 1: Write failing cloud API call-count tests**

Add page-view tests showing that member home, member lessons, coach detail, coach dashboard, coach schedule, and profile each make one cloud function call. Ensure no method calls `bootstrap()` twice or calls `getSession()` separately from its page query.

- [ ] **Step 2: Run the mini-program service tests and verify failures**

Run: `rtk vitest run miniprogram`

Expected: FAIL for the current duplicate bootstrap behavior.

- [ ] **Step 3: Add page-oriented backend actions**

Add read actions that return the complete view required by each page:

```text
getMemberHome, getMemberLessons, getMemberCoachSchedule,
getCoachDashboard, getOwnCoachSchedule, getProfile, getLessonDetail
```

Each action uses its own request scope and server-side identity. Keep `bootstrap` only for backward-compatible session/login flow during the same deployment.

- [ ] **Step 4: Replace composed client reads with single calls**

Update `cloud-api.ts` so each `GymApi` read method maps to one page-oriented action. Update pages to consume the identity included in those view responses rather than separately calling `getSession`. Do not store responses in a timer-based or persistent cache.

- [ ] **Step 5: Run mini-program tests and typecheck**

Run: `rtk vitest run miniprogram && rtk tsc --noEmit`

Expected: PASS and the call-count tests report one call per page read.

### Task 6: Indexes and legacy data migration

**Files:**
- Create: `scripts/migrate-cloudbase-performance.mjs`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Write a dry-run migration test**

Add a script test using an injected command runner. Given products with missing, invalid, and valid statuses, assert the dry run reports only the missing/invalid records and never changes valid statuses.

- [ ] **Step 2: Run the test and verify failure**

Run: `rtk vitest run scripts`

Expected: FAIL because the migration script does not exist.

- [ ] **Step 3: Implement idempotent status and index migration**

The script must target an explicit environment ID, set missing/invalid product statuses to `unpublished`, and create only indexes used by the final query scopes. Re-running the script must make no further data changes and must treat existing indexes as success.

- [ ] **Step 4: Run dry-run, then apply to the configured test environment**

Run: `rtk npm run cloud:migrate -- --env cloud1-d1gmh1lu77f6e8c06 --dry-run`

Inspect the exact four legacy package IDs, then run without `--dry-run`. Query the four records afterward and verify all have a valid status.

- [ ] **Step 5: Document the production migration command**

Document that production deployment uses the same script with a different explicit environment ID; no source changes are required.

### Task 7: Remove obsolete full-load paths and verify the whole system

**Files:**
- Modify: `cloudfunctions/gym-api/src/store-cloudbase.ts`
- Modify: `cloudfunctions/wechat-payment-notify/src/index.ts`
- Modify: `cloudfunctions/gym-api/src/index.ts`
- Modify: relevant tests

- [ ] **Step 1: Add a source guard test**

Assert production CloudBase paths contain no public `load()` method, no `system_locks` reference, and no loop that loads every `CLOUD_COLLECTIONS` entry for each request.

- [ ] **Step 2: Run the guard and verify old code fails it before deletion**

Run: `rtk vitest run cloudfunctions/build.test.ts`

Expected: FAIL until obsolete paths are removed.

- [ ] **Step 3: Delete obsolete code**

Remove full-store loading, global lock persistence, old admin three-request loading, and duplicate mini-program bootstrap composition. Keep the in-memory store only for development fixtures and domain tests.

- [ ] **Step 4: Run complete verification**

Run: `rtk npm run verify`

Expected: formatting, lint, type checks, all tests, all cloud function builds, and admin production build pass with zero failures.

- [ ] **Step 5: Inspect the final diff and deploy**

Run: `rtk git diff --check` and `rtk git status --short`.

Commit to `main`, push, wait for the existing GitHub Action deployment, and inspect the workflow result. Use CloudBase read-only queries to confirm the migrated package statuses and deployed endpoint responses. Do not use Playwright or `playwright-cli`.
