# GitHub Actions EMAS Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the three core EMAS services automatically after code is pushed to `main`.

**Architecture:** One GitHub Actions job checks the project, creates ignored runtime configuration files from repository secrets, and calls the existing EMAS deployment command. Deployments run sequentially and concurrent workflow runs queue instead of cancelling an in-progress release.

**Tech Stack:** GitHub Actions, Node.js 20, npm, Vitest, Alibaba EMAS OpenAPI

---

### Task 1: Specify the workflow contract

**Files:**
- Modify: `tests/config/emas-deployment.test.ts`

- [ ] **Step 1: Write the failing workflow test**

Add a test that reads `.github/workflows/deploy-emas.yml` and checks the trigger, secrets, checks, deployment scope, and concurrency:

```ts
it('deploys the core EMAS services from GitHub Actions', () => {
  const workflow = readFileSync(
    join(workspace, '.github/workflows/deploy-emas.yml'),
    'utf8',
  )

  expect(workflow).toContain('branches: [main]')
  expect(workflow).toContain('workflow_dispatch:')
  expect(workflow).toContain('cancel-in-progress: false')
  expect(workflow).toContain('secrets.ALIBABA_CLOUD_ACCESS_KEY_ID')
  expect(workflow).toContain('secrets.ALIBABA_CLOUD_ACCESS_KEY_SECRET')
  expect(workflow).toContain('secrets.EMAS_MINIPROGRAM_CONFIG')
  expect(workflow).toContain('secrets.EMAS_SERVER_SECRETS')
  expect(workflow).toContain('npm run check')
  expect(workflow).toContain('npm test')
  expect(workflow).toContain(
    'npm run emas:deploy -- gym-api gym-admin-api auto-complete-lessons',
  )
  expect(workflow).not.toContain(
    'npm run emas:deploy -- gym-api gym-admin-api auto-complete-lessons wechat-payment-notify',
  )
  expect(workflow).not.toContain('npm run emas:deploy -- seed')
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
rtk npm exec -- vitest run tests/config/emas-deployment.test.ts
```

Expected: FAIL because `.github/workflows/deploy-emas.yml` does not exist.

### Task 2: Add the deployment workflow

**Files:**
- Create: `.github/workflows/deploy-emas.yml`
- Modify: `README.md`
- Test: `tests/config/emas-deployment.test.ts`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/deploy-emas.yml` with this behavior:

```yaml
name: Deploy EMAS

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: deploy-emas-${{ github.ref }}
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Check out repository
        uses: actions/checkout@v6

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 20.19.0
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Check code
        run: npm run check

      - name: Run tests
        run: npm test

      - name: Prepare EMAS configuration
        env:
          EMAS_MINIPROGRAM_CONFIG: ${{ secrets.EMAS_MINIPROGRAM_CONFIG }}
          EMAS_SERVER_SECRETS: ${{ secrets.EMAS_SERVER_SECRETS }}
        run: |
          node -e "const fs=require('node:fs'); const mini=JSON.parse(process.env.EMAS_MINIPROGRAM_CONFIG); const server=JSON.parse(process.env.EMAS_SERVER_SECRETS); fs.writeFileSync('miniprogram/config/emas.local.js', 'module.exports = ' + JSON.stringify(mini, null, 2) + '\\n'); fs.writeFileSync('emas/secrets.local.json', JSON.stringify(server, null, 2) + '\\n')"

      - name: Deploy core EMAS services
        env:
          ALIBABA_CLOUD_ACCESS_KEY_ID: ${{ secrets.ALIBABA_CLOUD_ACCESS_KEY_ID }}
          ALIBABA_CLOUD_ACCESS_KEY_SECRET: ${{ secrets.ALIBABA_CLOUD_ACCESS_KEY_SECRET }}
        run: npm run emas:deploy -- gym-api gym-admin-api auto-complete-lessons
```

- [ ] **Step 2: Document repository secrets and trigger behavior**

Update `README.md` to state that pushing `main` runs the workflow and list the four required secret names. Explain that a local commit alone does not trigger GitHub Actions; the commit must be pushed.

- [ ] **Step 3: Run the focused test**

Run:

```bash
rtk npm exec -- vitest run tests/config/emas-deployment.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run repository verification**

Run:

```bash
rtk npm run check
rtk npm test
```

Expected: code checks pass and all 149 or more tests pass.

- [ ] **Step 5: Commit the workflow**

Stage `.github/workflows/deploy-emas.yml`, `README.md`, `tests/config/emas-deployment.test.ts`, and this plan. Commit with:

```bash
git commit -m "ci: deploy core services to EMAS"
```

### Task 3: Configure and verify GitHub

**Files:**
- No tracked file changes

- [ ] **Step 1: Confirm GitHub CLI authentication**

Run:

```bash
rtk gh auth status
```

Expected: authenticated access to `jacksonw111/gym`.

- [ ] **Step 2: Validate local secret sources without printing values**

Check that the two Alibaba Cloud environment variables exist and that the local mini-program and server JSON configurations contain all fields required by the selected functions. Print only missing field names.

Expected: no missing fields.

- [ ] **Step 3: Create the four repository secrets**

Use `gh secret set` with values read from the current process and ignored local configuration files. Do not place secret values in command arguments or terminal output.

- [ ] **Step 4: Confirm secret names**

Run:

```bash
rtk gh secret list --repo jacksonw111/gym
```

Expected: the four required names appear. GitHub never returns their values.

- [ ] **Step 5: Push `main`**

Run:

```bash
rtk git push origin main
```

Expected: the workflow commit is pushed and a `Deploy EMAS` run starts.

- [ ] **Step 6: Verify the workflow and cloud deployment**

Wait for the new workflow run to finish. Confirm it succeeded, then check that the three EMAS functions have current deployments and that the admin website and API return successful HTTP responses.
