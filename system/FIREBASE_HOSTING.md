# ImplicitEx Firebase Hosting Notes

Last updated: 2026-05-27

Purpose: keep the Firebase Hosting setup details for ImplicitEx in one internal
reference file. Do not store private keys, service-account credentials, wallet
secrets, or Firebase tokens here.

## Firebase Account

- Firebase CLI login observed as: `auditwalk@gmail.com`
- Firebase CLI warning observed: local CLI reported update available from
  `15.6.0` to `15.17.0`
- The `punycode` deprecation warning appeared during CLI commands. This was a
  Node/Firebase CLI runtime warning, not a project configuration error.

## Firebase Project

- Project display name: `ImplicitEx`
- Project ID: `implicitex-236f2`
- Project number: `495470657602`
- Resource location ID: `[Not specified]`
- Firebase console:
  `https://console.firebase.google.com/project/implicitex-236f2/overview`
- Hosting URL:
  `https://implicitex-236f2.web.app`

Other Firebase projects visible under the same account at setup time:

| Display name | Project ID | Project number |
| --- | --- | --- |
| AdenMediaGroup | `adenmediagroup-362ec` | `706581620533` |
| AuditWalk | `auditwalk-a6935` | `169576243229` |
| ImplicitEx | `implicitex-236f2` | `495470657602` |

## Repository Configuration

Firebase was initialized from:

```bash
/home/adenmediagroup/DevEnv/implicitex
```

Do not run `firebase init` from `/home/adenmediagroup/DevEnv`; the Firebase CLI
requires a Firebase project directory.

Tracked Firebase files:

- `.firebaserc`
- `firebase.json`
- `app-web/frontend/public/404.html`

Ignored local Firebase cache:

- `.firebase/`

Relevant commits:

- `4951577 Configure Firebase Hosting for ImplicitEx`
- `7b30625 Ignore Firebase local cache`

## Hosting Settings

Firebase project alias:

```json
{
  "projects": {
    "default": "implicitex-236f2"
  }
}
```

Hosting configuration:

```json
{
  "hosting": {
    "public": "app-web/frontend/public",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "headers": [
      {
        "source": "**/*.js",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "no-cache, must-revalidate"
          }
        ]
      },
      {
        "source": "**",
        "headers": [
          { "key": "Content-Security-Policy", "value": "[see firebase.json]" },
          { "key": "X-Frame-Options", "value": "DENY" },
          { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
          { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=()" },
          { "key": "X-Content-Type-Options", "value": "nosniff" }
        ]
      }
    ]
  }
}
```

Setup choices:

- Feature initialized: Firebase Hosting
- Existing project selected: `implicitex-236f2` (`ImplicitEx`)
- Public directory: `app-web/frontend/public`
- Single-page app rewrite to `/index.html`: `No`
- Automatic GitHub builds/deploys: `No`
- Existing `index.html` was not overwritten
- Firebase wrote `app-web/frontend/public/404.html`

## Cache Headers

Firebase Hosting now sends this header for JavaScript assets:

```text
Cache-Control: no-cache, must-revalidate
```

Scope:

- Applies to `**/*.js` under `app-web/frontend/public`.
- Intended to prevent stale runtime modules such as `wallet.js` and
  `receipt-store.js` from surviving a deploy in browser cache.
- Does not make JavaScript immutable or long-lived; browsers may store a copy,
  but must revalidate before reuse.
- Keep this behavior in place while wallet, receipt, and pre-live transfer
  gating code are changing.

Operational note: if a stale wallet or receipt behavior appears after deploy,
first verify the response headers for the relevant `.js` file before assuming a
runtime state bug.

## Deploy Commands

From the repository root:

```bash
cd /home/adenmediagroup/DevEnv/implicitex
firebase deploy --only hosting
```

Observed deploy summary:

- Target project: `implicitex-236f2`
- Files found in public directory: `62`
- Deploy completed successfully
- Release URL: `https://implicitex-236f2.web.app`

## Pre-Deploy Checks

Run before deploying when site files change:

```bash
cd /home/adenmediagroup/DevEnv/implicitex/app-web
npm run check:static
```

Optional repository check:

```bash
cd /home/adenmediagroup/DevEnv/implicitex
git status --short --branch
```

Expected clean state before deploy:

```text
## main...origin/main
```

## Operational Notes

- Firebase Hosting is currently serving the static public shell from
  `app-web/frontend/public`.
- Live transfers remain controlled by application config and contract readiness
  gates, not by Firebase Hosting deployment.
- Current pre-live/read-only posture depends on both transfer gates remaining
  false: `IX_CONFIG.transfersEnabled === false` and
  `IX_CHAINS[137].transfersEnabled === false`.
- Do not commit `.firebase/`; it is a local deploy cache.
- Do not add secrets to Firebase Hosting config or this reference file.
- Re-check custom-domain setup separately when `implicitex.com` is connected.
