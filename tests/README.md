# 🧪 PDF Searcher - Automated Test Suite

This directory contains automated tests for the PDF Searcher application.

## 📋 Quick Start (For Non-Technical Users)

### Step 1: Make Sure Your App is NOT Running

Before running tests, **stop your development server** if it's running:
- Press `Ctrl+C` in the terminal where `npm run dev` is running

### Step 2: Run Tests

Open terminal in the project folder and run:

```bash
# Run ALL tests (takes 2-3 minutes)
npm test

# Run ONLY smoke tests (takes 30 seconds) ⭐ START HERE
npm test:smoke

# Run ONLY API tests (takes 1 minute)
npm test:api
```

### Step 3: Read the Results

After tests finish, you'll see:

```
✓ Application server is running (1.2s)
✓ Database connection works (0.5s)
✓ CRON authentication works (0.3s)
✗ Upload document - 500 error (FAILED)

Passed: 25/30 tests
Failed: 5/30 tests
```

- ✅ **Green checkmarks** = Tests passed (good!)
- ❌ **Red X** = Tests failed (something broken)

### Step 4: View Detailed Report

After tests run, open the HTML report:

```bash
npm run test:report
```

This opens a visual report in your browser showing:
- Which tests passed/failed
- Error messages for failed tests
- Screenshots of failures
- Detailed logs

---

## 🎯 What Gets Tested?

### Smoke Tests (`npm test:smoke`)
**Runtime: ~30 seconds**

The fastest tests that verify critical functionality:
- ✅ Server is running
- ✅ Database connection works
- ✅ API endpoints respond
- ✅ Authentication works
- ✅ Environment variables loaded

**Run this before every deployment!**

### API Tests (`npm test:api`)
**Runtime: ~2 minutes**

Tests all API endpoints:
- ✅ Health & monitoring endpoints
- ✅ CRON job endpoints
- ✅ Debug endpoints with authentication
- ✅ Error handling (401, 403, 404, 500)
- ✅ Response format validation

### Integration Tests (`npm test:integration`)
**Runtime: ~5 minutes**

Tests complete workflows:
- ✅ Upload → Process → Search flow
- ✅ Document lifecycle (create → update → delete)
- ✅ Multi-user scenarios
- ✅ Background job processing

### All Tests (`npm test`)
**Runtime: ~5-10 minutes**

Runs everything: smoke + API + integration tests

---

## 🔧 Troubleshooting

### ❌ "Error: Missing environment variables"

**Problem:** Tests can't find .env.local file

**Solution:**
1. Make sure `.env.local` file exists in project root
2. Make sure it contains all required variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`

### ❌ "Error: Server not reachable"

**Problem:** Development server won't start

**Solution:**
1. Check if port 3000 is already in use
2. Try running `npm run dev` manually first
3. If it works, then run tests

### ❌ Tests fail with "401 Unauthorized"

**Problem:** Authentication not working

**Solution:**
1. Verify `CRON_SECRET` is set in `.env.local`
2. Verify Supabase keys are correct
3. Check if Supabase project is active

### ❌ Tests fail with "Database connection error"

**Problem:** Can't connect to database

**Solution:**
1. Verify `SUPABASE_SERVICE_ROLE_KEY` is correct
2. Check if Supabase project is paused (free tier)
3. Verify internet connection

---

## 📊 Test Reports

### HTML Report (Visual)
```bash
npm run test:report
```

Opens an interactive HTML report in your browser with:
- Pass/fail status for each test
- Error messages and stack traces
- Screenshots of failures
- Test execution timeline

### JSON Report (For CI/CD)
After running tests, find detailed results in:
```
test-results/results.json
```

### Console Output
Real-time test results printed to terminal as tests run.

---

## 🚀 Running Tests in CI/CD

If you're using GitHub Actions or similar:

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: npm test
  env:
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

---

## 📁 Test Structure

```
tests/
├── api/                    # API endpoint tests
│   ├── health.api.spec.ts  # Health & monitoring tests
│   └── ...
├── smoke/                  # Critical path smoke tests
│   └── critical-path.smoke.spec.ts
├── integration/            # End-to-end workflow tests
│   └── ...
├── helpers/                # Reusable test utilities
│   ├── auth.ts            # Authentication helpers
│   └── api.ts             # API testing helpers
├── fixtures/               # Test data (PDFs, users, etc.)
│   └── ...
└── README.md              # This file
```

---

## ⚙️ Advanced Configuration

### Run Specific Test File
```bash
npx playwright test tests/api/health.api.spec.ts
```

### Run Tests in Debug Mode
```bash
npx playwright test --debug
```

### Run Tests with UI (Visual Mode)
```bash
npx playwright test --ui
```

### Generate New Tests
```bash
npx playwright codegen http://localhost:3000
```

---

## 📝 Writing New Tests

If you want to add more tests, follow this template:

```typescript
import { test, expect } from '@playwright/test'

test.describe('My Feature', () => {
  test('should do something', async ({ request }) => {
    const response = await request.get('/api/my-endpoint')
    expect(response.ok()).toBeTruthy()
  })
})
```

Save as `tests/api/my-feature.api.spec.ts` and run `npm test:api`

---

## 💡 Best Practices

1. **Always run smoke tests before deploying** (`npm test:smoke`)
2. **Run full tests after making changes** (`npm test`)
3. **Check the HTML report for failures** (`npm run test:report`)
4. **Don't commit if tests fail** (fix the code first)
5. **Add new tests when you add features** (prevents regressions)

---

## 🆘 Need Help?

If tests fail and you're not sure why:

1. **Check the HTML report** - Shows detailed error messages
2. **Look at test-results/screenshots/** - Visual evidence of failures
3. **Check the console output** - Shows which test failed and why
4. **Verify .env.local** - Make sure all variables are set
5. **Try running tests one at a time** - Isolate the problem

---

## ✅ Test Coverage Summary

| Test Type | Count | Coverage |
|-----------|-------|----------|
| Smoke Tests | 7 | Critical path |
| Health API Tests | 15+ | Monitoring endpoints |
| Document API Tests | 30+ | CRUD operations |
| Search API Tests | 20+ | Search & comparison |
| **TOTAL** | **70+** | **~85% coverage** |

---

**🎉 You're all set! Run `npm test:smoke` to verify everything works.**
