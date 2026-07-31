# EMAS Serverless Complete Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every Tencent CloudBase runtime path with EMAS Serverless while preserving the mini program, admin UI, and gym business rules.

**Architecture:** Keep the existing page-facing `GymApi` contract and domain rules. Add an EMAS mini-program adapter, move shared business code out of the Tencent cloud-function tree, run it behind EMAS SDK and HTTP entrypoints, and persist with EMAS SDK 3.1.5 transactions. Build uploadable EMAS function ZIP files and an EMAS-hosted admin bundle from environment-specific configuration.

**Tech Stack:** TypeScript, WeChat Mini Program, `@alicloud/mpserverless-sdk` 3.1.5, EMAS cloud functions, EMAS Mongo-style database, React 19, Vite, Vitest, esbuild.

---

### Task 1: EMAS environment and SDK bootstrap

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `miniprogram/app.ts`
- Replace: `miniprogram/config/env.ts`
- Create: `miniprogram/config/emas.local.example.ts`
- Modify: `.gitignore`
- Test: `tests/mini/models.test.ts`

- [ ] **Step 1: Write the failing EMAS environment tests**

Replace CloudBase-specific assertions with:

```ts
expect(resolveEnvironment({
  mode: 'development',
  emas: {
    appId: 'wx-test',
    spaceId: 'space-test',
    clientSecret: 'secret-test',
    endpoint: 'https://api.next.bspapp.com',
  },
  useLocalData: false,
  testPaymentEnabled: true,
})).toMatchObject({
  emas: { spaceId: 'space-test' },
  useLocalData: false,
})

expect(() => resolveEnvironment({
  mode: 'production',
  emas: { appId: '', spaceId: '', clientSecret: '', endpoint: '' },
  useLocalData: false,
  testPaymentEnabled: false,
})).toThrow('生产环境必须配置 EMAS')
```

- [ ] **Step 2: Run the focused test and verify the CloudBase environment shape fails**

Run: `rtk npm run test -- tests/mini/models.test.ts --reporter=dot`

Expected: FAIL because `EnvironmentInput` still contains `cloudEnvId` and CloudBase initialization.

- [ ] **Step 3: Install and configure the EMAS SDK**

Run: `rtk npm install @alicloud/mpserverless-sdk@3.1.5`

Define:

```ts
export interface EmasClientConfig {
  appId: string
  spaceId: string
  clientSecret: string
  endpoint: string
}

export interface EnvironmentInput {
  mode: ApplicationMode
  emas: EmasClientConfig
  useLocalData: boolean
  testPaymentEnabled: boolean
}
```

Add `miniprogram/config/emas.local.ts` to `.gitignore`. Commit only an example with empty values. The actual ignored file contains the supplied Space ID and endpoint; use the rotated Client Secret before final live verification.

Initialize the SDK once:

```ts
const emas = new MPServerless(wx, environment.emas)
await emas.init()
registerApi(new EmasApi(emas, environment.testPaymentEnabled))
```

- [ ] **Step 4: Run focused tests and type checking**

Run: `rtk npm run test -- tests/mini/models.test.ts --reporter=dot`

Expected: PASS.

Run: `rtk npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add package.json package-lock.json .gitignore miniprogram/app.ts miniprogram/config tests/mini/models.test.ts
rtk git commit -m "feat: initialize mini program with EMAS"
```

### Task 2: Mini-program EMAS API and storage adapter

**Files:**
- Create: `miniprogram/services/emas-api.ts`
- Delete: `miniprogram/services/cloud-api.ts`
- Rename: `tests/mini/cloud-api.test.ts` to `tests/mini/emas-api.test.ts`
- Modify: `miniprogram/pages/member-login/member-login.ts`
- Modify: `miniprogram/services/api.ts`

- [ ] **Step 1: Write failing adapter tests**

Use a fake SDK exposing `function.invoke` and `file.uploadFile`. Assert:

```ts
await api.getMemberHome()
expect(invoke).toHaveBeenCalledWith('gym-api', expect.objectContaining({
  action: 'bootstrap',
}))

await api.uploadAvatar('/tmp/avatar.jpg')
expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({
  filePath: '/tmp/avatar.jpg',
  cloudPath: expect.stringMatching(/^\/avatars\//),
}))
```

Assert that an EMAS response shaped as `{ success: true, result: { ok: false, error } }` becomes a user-facing `Error`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `rtk npm run test -- tests/mini/emas-api.test.ts --reporter=dot`

Expected: FAIL because `EmasApi` does not exist.

- [ ] **Step 3: Implement `EmasApi`**

Reuse the existing `CloudApi` view-model mapping, but replace:

```ts
wx.cloud.callFunction({ name: 'gym-api', data })
```

with:

```ts
await this.emas.function.invoke('gym-api', data)
```

Add `uploadAvatar(filePath)` to `GymApi` so the login page no longer calls `wx.cloud.uploadFile` directly. Convert EMAS `fileUrl` to the stored avatar URL.

Change native phone input from `cloudID` to current WeChat `code`:

```ts
interface PhoneNumberEvent {
  detail: { code?: string }
}
```

Send `phoneCode` in `RegisterMemberInput`.

- [ ] **Step 4: Run adapter and login tests**

Run: `rtk npm run test -- tests/mini/emas-api.test.ts tests/mini/login-template.test.ts --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add miniprogram/services miniprogram/pages/member-login miniprogram/services/api.ts tests/mini
rtk git commit -m "feat: call gym services through EMAS"
```

### Task 3: Move the domain out of Tencent cloud functions

**Files:**
- Create: `server/gym/`
- Move: `cloudfunctions/gym-api/src/*.ts` to `server/gym/`
- Modify: imports in moved tests
- Modify: `tsconfig.tests.json`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Add a migration guard test**

Create `tests/config/no-tencent-runtime.test.ts`:

```ts
it('keeps shared gym domain outside Tencent cloud function folders', () => {
  expect(existsSync(join(workspace, 'server/gym/index.ts'))).toBe(true)
  expect(existsSync(join(workspace, 'cloudfunctions/gym-api/src/index.ts'))).toBe(false)
})
```

- [ ] **Step 2: Run the guard and verify it fails**

Run: `rtk npm run test -- tests/config/no-tencent-runtime.test.ts --reporter=dot`

Expected: FAIL because the domain is still under `cloudfunctions`.

- [ ] **Step 3: Move the domain with no behavior changes**

Move router, booking, lifecycle, package, appeal, payment, auth, phone, seed, store, and their tests into `server/gym`. Remove `wx-server-sdk` and CloudBase imports from the shared router entry. Keep the pure exports:

```ts
export {
  createRouter,
  createCloudHandler,
  createInternalSchedulerHandler,
  type ApiRequest,
  type ApiResponse,
}
```

Rename stored identity field from `openId` to `emasUserId` in domain and shared contracts.

- [ ] **Step 4: Run domain tests**

Run: `rtk npm run test -- server/gym tests/shared --reporter=dot`

Expected: PASS with the same business behavior.

- [ ] **Step 5: Commit**

```bash
rtk git add server tests/config tsconfig.tests.json vitest.config.ts miniprogram/shared
rtk git commit -m "refactor: separate gym domain from cloud provider"
```

### Task 4: EMAS transactional store, booking locks, and request idempotency

**Files:**
- Create: `server/gym/store-emas.ts`
- Create: `server/gym/store.emas.test.ts`
- Modify: `server/gym/store.ts`
- Modify: `server/gym/lessons.ts`
- Modify: `server/gym/packages.ts`
- Modify: `server/gym/appeals.ts`
- Modify: `server/gym/index.ts`

- [ ] **Step 1: Write failing transaction and concurrency tests**

Cover:

```ts
await Promise.allSettled([
  bookLesson(storeA, bookingInput),
  bookLesson(storeB, { ...bookingInput, requestId: 'request-2' }),
])

expect(store.lessons.filter(item => item.status === 'booked')).toHaveLength(1)
expect(store.packages[0]?.lockedLessons).toBe(1)
```

Also call the same `requestId` twice and expect the same result with one ledger entry.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `rtk npm run test -- server/gym/store.emas.test.ts server/gym/lessons.booking.test.ts --reporter=dot`

Expected: FAIL because no EMAS store, booking lock, or operations collection exists.

- [ ] **Step 3: Implement EMAS SDK 3.1.5 transactions**

Define the minimum SDK boundary:

```ts
interface EmasDatabase {
  collection(name: string): EmasQuery
  startTransaction(): Promise<EmasTransaction>
}

interface EmasTransaction {
  collection(name: string): EmasQuery
  commit(): Promise<unknown>
  rollback(): Promise<unknown>
}
```

`EmasStore.transaction` must:

1. call `startTransaction()`;
2. load records through the transaction;
3. apply the domain work;
4. persist inserts, updates, and deletes through the transaction;
5. commit on success;
6. rollback and reload on failure.

Add `bookingLocks` and `operations` to the store. Use `slotKey = coachId + ':' + startsAt`. Remove the lock only when a booked lesson is cancelled.

- [ ] **Step 4: Run all server tests**

Run: `rtk npm run test -- server/gym --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add server/gym
rtk git commit -m "feat: persist gym operations with EMAS transactions"
```

### Task 5: EMAS user identity and WeChat phone exchange

**Files:**
- Create: `server/gym/emas-context.ts`
- Create: `server/gym/wechat-phone.ts`
- Create: `server/gym/wechat-phone.test.ts`
- Modify: `server/gym/index.ts`
- Create: `emas/secrets.example.json`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing identity and phone tests**

Assert that `ctx.mpserverless.user.getInfo()` returns a stable `userId` mapped to `identity.emasUserId`.

Assert that a `phoneCode` causes two HTTP calls:

```ts
expect(request).toHaveBeenNthCalledWith(
  1,
  expect.stringContaining('/cgi-bin/token'),
  expect.anything(),
)
expect(request).toHaveBeenNthCalledWith(
  2,
  expect.stringContaining('/wxa/business/getuserphonenumber'),
  expect.objectContaining({ method: 'POST' }),
)
```

Reject missing or invalid phone responses.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `rtk npm run test -- server/gym/wechat-phone.test.ts --reporter=dot`

Expected: FAIL because the EMAS identity and phone resolver do not exist.

- [ ] **Step 3: Implement identity and phone resolution**

Read identity with:

```ts
const info = await ctx.mpserverless.user.getInfo()
return { emasUserId: String(info.userId) }
```

Read WeChat AppID and AppSecret from an ignored server build secret file. Exchange the one-time phone code using `ctx.httpclient`, cache the WeChat access token within the warm function instance, and return the verified phone number.

Do not log codes, access tokens, app secrets, or phone numbers.

- [ ] **Step 4: Run focused and router tests**

Run: `rtk npm run test -- server/gym/wechat-phone.test.ts server/gym/router.test.ts --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add server/gym/emas-context.ts server/gym/wechat-phone.ts server/gym/wechat-phone.test.ts emas/secrets.example.json .gitignore
rtk git commit -m "feat: authenticate EMAS members and verified phones"
```

### Task 6: EMAS cloud-function entrypoints

**Files:**
- Create: `emas/functions/gym-api/src/index.ts`
- Create: `emas/functions/gym-admin-api/src/index.ts`
- Create: `emas/functions/auto-complete-lessons/src/index.ts`
- Create: `emas/functions/wechat-payment-notify/src/index.ts`
- Create: `emas/functions/entrypoints.test.ts`
- Create: `emas/functions/*/package.json`
- Modify: `package.json`

- [ ] **Step 1: Write failing entrypoint tests**

Test that:

- `gym-api` reads `ctx.args`;
- `gym-admin-api` accepts only `POST`, handles `OPTIONS`, validates allowed origin, parses JSON, and returns `mpserverlessComposedResponse`;
- timed function calls auto-completion without a Tencent token relay;
- payment callback rejects missing verification.

- [ ] **Step 2: Run the entrypoint tests and verify they fail**

Run: `rtk npm run test -- emas/functions/entrypoints.test.ts --reporter=dot`

Expected: FAIL because EMAS entrypoints do not exist.

- [ ] **Step 3: Implement the entrypoints**

Mini-program entry:

```ts
module.exports = async (ctx: EmasContext) => {
  const store = new EmasStore(ctx.mpserverless.db)
  return createEmasHandler(store, environment(ctx), () => getEmasIdentity(ctx))(ctx.args)
}
```

Admin HTTP entry returns:

```ts
{
  mpserverlessComposedResponse: true,
  isBase64Encoded: false,
  statusCode: 200,
  headers: {
    'content-type': 'application/json',
    'access-control-allow-origin': allowedOrigin,
  },
  body: JSON.stringify(result),
}
```

- [ ] **Step 4: Run entrypoint and server tests**

Run: `rtk npm run test -- emas/functions server/gym --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add emas/functions package.json package-lock.json
rtk git commit -m "feat: add EMAS gym function entrypoints"
```

### Task 7: HTTP-backed admin and EMAS static hosting build

**Files:**
- Replace: `admin/src/api/production.ts`
- Replace: `admin/src/api/production.test.ts`
- Modify: `admin/src/api/environment.ts`
- Modify: `admin/src/api/environment.test.ts`
- Modify: `admin/src/api/index.ts`
- Modify: `admin/vite.config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing HTTP adapter tests**

Mock `fetch` and assert:

```ts
expect(fetch).toHaveBeenCalledWith('https://admin-api.example/gym-admin', {
  method: 'POST',
  headers: expect.objectContaining({ 'content-type': 'application/json' }),
  body: expect.stringContaining('"action":"adminCrud"'),
})
```

Assert that the session token is sent in the request body and a 401 clears it.

- [ ] **Step 2: Run admin tests and verify they fail**

Run: `rtk npm run admin:test -- admin/src/api/production.test.ts --reporter=dot`

Expected: FAIL because the adapter still initializes CloudBase.

- [ ] **Step 3: Implement the HTTP adapter**

Replace `VITE_CLOUDBASE_ENV_ID` with `VITE_EMAS_ADMIN_API_URL`. Keep the current normalization and `AdminApi` methods.

Remove `@cloudbase/js-sdk` from dependencies.

- [ ] **Step 4: Run admin tests and build**

Run: `rtk npm run admin:test -- --reporter=dot`

Expected: PASS.

Run: `rtk npm run admin:build`

Expected: PASS and output under `admin/dist`.

- [ ] **Step 5: Commit**

```bash
rtk git add admin .env.example package.json package-lock.json
rtk git commit -m "feat: connect admin to EMAS HTTP API"
```

### Task 8: EMAS database manifest, seed, and upload packages

**Files:**
- Create: `emas/database.json`
- Create: `emas/storage-rules.json`
- Create: `emas/functions/seed/src/index.ts`
- Create: `scripts/build-emas.mjs`
- Create: `tests/config/emas-deployment.test.ts`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Write failing deployment tests**

Assert exact collection names, unique indexes, denied client rules, function directories, admin build path, and absence of credentials in tracked files.

- [ ] **Step 2: Run deployment tests and verify they fail**

Run: `rtk npm run test -- tests/config/emas-deployment.test.ts --reporter=dot`

Expected: FAIL because EMAS manifests and build script do not exist.

- [ ] **Step 3: Add manifests and idempotent seed**

Declare all collections from the design. Deny client reads and writes. Add unique indexes for EMAS user ID, booking slot key, request ID, ledger operation key, and admin token hash.

Seed fixed IDs for the first admin, products, and coaches. Read the initial password hash and coach records from ignored deployment input rather than tracked source.

- [ ] **Step 4: Build EMAS upload artifacts**

`scripts/build-emas.mjs` must:

1. bundle each function to an `index.js`;
2. include required runtime dependencies;
3. copy ignored server secrets into the function package;
4. create one correctly named ZIP per EMAS function;
5. build the admin app;
6. print artifact paths without printing secrets.

Run: `rtk npm run emas:build`

Expected: ZIP files under `artifacts/emas/functions` and admin files under `admin/dist`.

- [ ] **Step 5: Run deployment tests**

Run: `rtk npm run test -- tests/config/emas-deployment.test.ts --reporter=dot`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add emas scripts/build-emas.mjs tests/config package.json README.md
rtk git commit -m "build: package application for EMAS deployment"
```

### Task 9: Remove Tencent runtime and perform complete verification

**Files:**
- Delete: `cloudfunctions/`
- Delete: `cloudbaserc.json`
- Delete: `database.rules.json`
- Delete: `database.indexes.json`
- Modify: `project.config.json`
- Modify: `README.md`
- Modify: `scripts/verify-production-config.mjs`
- Modify: tests referring to CloudBase

- [ ] **Step 1: Extend the no-Tencent guard**

Fail if tracked runtime files contain:

```ts
['wx.cloud', '@cloudbase/', 'wx-server-sdk', 'cloudfunctionRoot', 'CLOUDBASE_ENV_ID']
```

Allow historical design documents to retain explanatory references.

- [ ] **Step 2: Run the guard and verify it fails**

Run: `rtk npm run test -- tests/config/no-tencent-runtime.test.ts --reporter=dot`

Expected: FAIL while Tencent runtime paths remain.

- [ ] **Step 3: Delete Tencent runtime files and update configuration**

Remove the cloud-function root from `project.config.json`, remove CloudBase dependencies, scripts, deployment files, and current README instructions. Keep only EMAS deployment and test/production configuration.

- [ ] **Step 4: Run complete local verification**

Run: `rtk npm run check`

Expected: PASS.

Run: `rtk npm test -- --reporter=dot`

Expected: all tests PASS.

Run: `rtk npm run emas:build`

Expected: all function ZIP files and admin bundle created.

Run: `rtk git diff --check`

Expected: no output.

- [ ] **Step 5: Commit**

```bash
rtk git add -A
rtk git commit -m "feat: replace Tencent cloud runtime with EMAS"
```

### Task 10: EMAS test-space deployment and acceptance

**Files:**
- Generated: `artifacts/emas/functions/*.zip`
- Generated: `admin/dist/**`
- Reference: `README.md`

- [ ] **Step 1: Rotate and install deployment secrets**

Regenerate the exposed EMAS Client Secret. Update ignored mini-program and server secret files. Add the WeChat AppSecret only to the ignored server secret file.

- [ ] **Step 2: Create EMAS data resources**

In the selected service space, create the manifest collections, indexes, and deny rules. Upload and run the seed function once.

- [ ] **Step 3: Deploy functions**

Upload the ZIP matching each function name, enable:

- SDK invocation for `gym-api`;
- HTTP path for `gym-admin-api`;
- hourly cron for `auto-complete-lessons`;
- payment HTTP path only when real payment is configured.

- [ ] **Step 4: Deploy admin and configure domains**

Upload `admin/dist` to EMAS static hosting. Set the admin HTTP allowed origin. Add EMAS request, upload, and download endpoints to the WeChat legal-domain settings.

- [ ] **Step 5: Execute acceptance checks**

Verify guest browsing, profile login, manual and verified phone paths, purchase, concurrent booking exclusion, member cancellation, coach cancellation, schedule closure, completion, feedback, appeal, one-time refund, coach pages, and admin management.

- [ ] **Step 6: Confirm Tencent has no traffic**

Inspect the mini-program network log and tracked source scan. Confirm all requests go to EMAS endpoints and no Tencent function is invoked.

