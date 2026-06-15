# ImplicitEx Deploy Safety Checklist

**Purpose:** Operator procedure for every Firebase deployment. No step may be skipped.
The checklist has two modes: closed-gate deploy (normal) and open-gate deploy (Gate 4 only).

---

## Current verified state (2026-06-14)

```
Branch:    gate3-production-frontend-qa (25 commits ahead of origin/main)
Suite:     232/232 static · 27/27 observability · 59/59 contract tests
Gate:      transfersEnabled: false (all three flags — IX_CONFIG + chain 137 + chain 80002)
Firebase:  implicitex-236f2 (current project)
Hosting:   app-web/frontend/public
CLI:       firebase 15.6.0
```

---

## Pre-deploy verification (required every time)

### 1. Branch and commit

```bash
cd ~/DevEnv/implicitex
git status --short           # must be clean — no uncommitted changes
git branch --show-current    # confirm intended branch
git log --oneline -5         # confirm intended HEAD commit
```

**Stop if:** working tree is dirty, or HEAD is not the intended commit.

### 2. Transfer gate state

```bash
grep -n "transfersEnabled" app-web/frontend/public/config/chains.js
```

**Expected for closed-gate deploy (normal):**
```
transfersEnabled: false   ← IX_CONFIG (line ~9)
transfersEnabled: false   ← chain 137 (line ~27)
transfersEnabled: false   ← chain 80002 (line ~41)
```

**Stop if:** any flag is `true` unless this is an intentional Gate 4 open-gate deploy.

### 3. Full suite

```bash
cd app-web
npm run check:static
npm run test:observability
npm test
```

**Expected:**
```
Static public check passed (N/N local references checked)
27/27 observability tests pass
59/59 contract tests pass
```

**Stop if:** any test fails. Fix and re-run before deploying.

### 4. Firebase project confirmation

```bash
firebase projects:list
```

**Expected:**
```
ImplicitEx  implicitex-236f2 (current)
```

**Stop if:** current project is not `implicitex-236f2`.

To switch if needed:
```bash
firebase use implicitex-236f2
```

### 5. Hosting root confirmation

```bash
python3 -c "import json; d=json.load(open('firebase.json')); print(d['hosting']['public'])"
```

**Expected:** `app-web/frontend/public`

**Stop if:** output is anything else.

---

## Deployment

### Closed-gate deploy (all transfersEnabled: false)

```bash
cd ~/DevEnv/implicitex
firebase deploy --only hosting
```

Firebase will upload from `app-web/frontend/public` to `implicitex-236f2`.

**Confirm output includes:**
```
✔  Deploy complete!
Hosting URL: https://implicitex-236f2.web.app
            or
            https://implicitex.app  (if custom domain wired)
```

### Open-gate deploy (Gate 4 only — controlled live smoke)

Do not run this mode without explicit written intent in evidence.

Procedure:
1. Complete all pre-deploy verification above.
2. Confirm branch and commit in evidence doc before touching chains.js.
3. Flip `transfersEnabled` on `IX_CONFIG` and chain 137 only. Chain 80002 stays `false`.
4. Re-run static check: `npm run check:static`
5. Deploy: `firebase deploy --only hosting`
6. Smoke test (see post-deploy verification below).
7. Immediately flip `transfersEnabled` back to `false` on both flags.
8. Re-run static check.
9. Deploy closed-gate config: `firebase deploy --only hosting`
10. Verify public app shows gate closed (transfer button disabled, preview-only state).

---

## Post-deploy verification (required every time)

### Public routes smoke

Open each URL and confirm it loads without error:

```
https://implicitex.app/           ← homepage, logo, nav, How It Works
https://implicitex.app/about.html
https://implicitex.app/faq.html
https://implicitex.app/terms.html
https://implicitex.app/privacy.html
https://implicitex.app/legal.html
https://implicitex.app/jurisdictions.html
https://implicitex.app/news.html
https://implicitex.app/404.html   ← or navigate to a non-existent route
```

### Wallet and gate state

1. Open `https://implicitex.app/` in browser.
2. Connect MetaMask on Polygon.
3. **Closed-gate deploy:** confirm transfer panel shows standby / preview-only mode.
   Button should NOT be armed. Status should reflect TRANSFERS_DISABLED.
4. **Open-gate deploy:** confirm transfer is executable and execute small smoke transfer.
5. Verify network badge shows Polygon (correct network).

### Config freshness check

Open browser DevTools → Network → reload page → find `config/chains.js` request.
Confirm response is not serving a cached old version (check `transfersEnabled` value in
the response body matches what was deployed).

If stale cache is served:
- Confirm `firebase.json` has `Cache-Control: no-cache, must-revalidate` on `**/*.js`
- Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
- If still stale, check Firebase CDN cache purge options

### Console check

Open browser console on the deployed app. Confirm:
- No JS errors on page load
- No 404s for assets (CSS, JS, images, fonts)
- No CSP violations in console

---

## Post-deploy rollback procedure

If deployed app shows an error, wrong gate state, stale assets, or broken routes:

### Option A: Redeploy from known-good local state

```bash
cd ~/DevEnv/implicitex
git status --short           # confirm clean
git log --oneline -3         # confirm last good commit is HEAD
firebase deploy --only hosting
```

### Option B: Firebase console rollback

1. Open Firebase console → Hosting → Release history
2. Identify last known-good release
3. Click "Rollback to this release"

### After any rollback

Verify the rolled-back app is in correct closed-gate state before leaving.

---

## Gate discipline summary

```
Never deploy with transfersEnabled: true unless explicitly opening Gate 4.
Never leave transfersEnabled: true after a Gate 4 smoke — close immediately.
Always run the full suite before any deploy.
Always verify config/chains.js on the live site after deploy (cache check).
Never skip the post-deploy route smoke.
```

---

## Record

| Date | Branch | Commit | Gate | Operator | Notes |
|------|--------|--------|------|----------|-------|
| 2026-06-15 | gate3-production-frontend-qa | bcfa8bb | closed | Antoine Dennison | Firebase smoke PASS. Routes, mobile FAQ, dropdown color, gate state, config/chains.js freshness all verified. Console clean of app errors — only browser/MetaMask extension warnings observed. Polygon gas station returned HTTP 200. |
| 2026-06-15 | gate3-production-frontend-qa | 34d746c | closed | Antoine Dennison | Post-Gate 3 session. Five fixes deployed: dead RPC endpoint (polygon-rpc.com → publicnode.com, 95d9c91), CSP connect-src gap (b48a680), armed-button in TRANSFERS_DISABLED (b48a680), ack checkbox not hiding (34d746c), network column additions — RPC latency + confirmation time (793f0dd). Suite 232/232 · 27/27 · 59/59. RPC latency 253 ms, confirmation ~2.7 sec, button inert, checkbox hidden, CSP clean. Gate closed, transfersEnabled false confirmed. |
| 2026-06-15 | gate3-production-frontend-qa | 898a547 | closed | Antoine Dennison | Pre-Gate-4 blocker fix: nav shows WALLET CONNECTED with no wallet authorized. applyCurrentNetworkPresentation() fell through to applyConnectedPresentation() in DISCONNECTED state on every focus/visibilitychange event. Added early return guard for DISCONNECTED. Suite 232/232 · 31/31 · 59/59. Nav smoke PASS: hard refresh + tab-away + focus-away all show Connect Wallet. Gate closed, transfersEnabled false confirmed. |
