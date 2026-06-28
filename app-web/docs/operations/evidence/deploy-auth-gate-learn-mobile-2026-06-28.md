# Deploy/Auth Gate Evidence - Learn Mobile Fix - 2026-06-28

## Status

Deploy/Auth Gate was blocked by a mobile `/learn.html` failure on staging.

## Failure

Mobile `/learn.html` opened the topic browser inline. The sidebar pushed the Learn content down instead of behaving as a bounded mobile drawer.

Classification:

- Page-specific Learn CSS issue
- Not a shared mobile hamburger issue
- Not a missing script or asset issue

## Fix

Commit:

```text
e53db39 fix: stabilize learn mobile topic drawer
```

Changed files:

```text
app-web/frontend/public/css/main.css
app-web/frontend/public/learn.html
```

Change summary:

- Mobile Learn topic list now opens as a fixed drawer below the Learn toggle.
- Drawer no longer reflows the page content.
- Topic selection closes the drawer and resets the toggle text to `Browse Topics`.

## Validation

Static validation:

```text
npm run check:static
Static public check passed (1325 local references checked).
```

Staging deploy:

```text
firebase deploy --only hosting --project implicitex-236f2
Deploy complete.
Hosting URL: https://implicitex-236f2.web.app
```

Staging smoke timestamp:

```text
2026-06-28T19:22:41.669Z
```

Staging `/learn.html` mobile:

```text
URL: https://implicitex-236f2.web.app/learn.html
Viewport: 390 x 844
Console/page errors: none
Drawer display: flex
Drawer position: fixed
Drawer rect: x=0, y=98, width=390, height=420
Topic count: 33
Body width: 390
Viewport width: 390
Selected topic: Wallet
Selected hash: #wallet
After selection sidebar display: none
After selection toggle text: Browse Topics
After selection aria-expanded: false
```

Affected surface smoke:

```text
/            title: ImplicitEx - Send USDC without platform custody. stale copy: none errors: none
/verify.html title: ImplicitEx - Verify                              stale copy: none errors: none
/learn.html  title: ImplicitEx - Learn                               stale copy: none errors: none
/news.html   title: ImplicitEx - News                                stale copy: none errors: none
/faq.html    title: ImplicitEx - FAQ                                 stale copy: none errors: none
```

Mobile `/` hamburger:

```text
Viewport: 390 x 844
Menu open: true
aria-expanded: true
Wallet status: No wallet connected.
Mobile menu links: 14
Body width: 390
Viewport width: 390
Console/page errors: none
```

## Residual Note

Desktop `/` reported `bodyW=1294` at a `1280` viewport during smoke. That is outside the `/learn.html` mobile gate failure and was not changed in this patch.
