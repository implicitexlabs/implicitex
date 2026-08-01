# ImplicitEx Widget — Product Specification

**Status:** Draft — v0.1  
**Date:** 2026-06-23  
**Author:** Antoine Dennison

---

## 1. Purpose

The ImplicitEx widget is a static trust card that a creator embeds on any web page to accept USDC transfers. It displays recipient context (name, address) and an optional amount, then hands the user off to ImplicitEx to complete the transfer.

The widget is not a payment processor. It is a redirect shim. All wallet interaction, fee collection, and transaction execution occur exclusively on the ImplicitEx domain.

---

## 2. User Roles

**Creator**  
The person or organization accepting USDC. Configures the widget once via a `<script>` tag and its `data-*` attributes. Does not interact with the widget at runtime.

**Sender**  
The person sending USDC. Sees the trust card on the creator's site, confirms intent, and is handed off to ImplicitEx to complete the transfer.

**ImplicitEx**  
Receives the handoff via URL parameters. Pre-populates the transfer form. Handles wallet connection, approval, execution, and receipt.

---

## 3. Fixed vs. Configurable Values

### Fixed by Creator (required)

| Field | Description |
|---|---|
| `data-to` | Recipient wallet address (checksummed, full) |
| `data-name` | Display name shown on the trust card (e.g. "Antoine Dennison") |

### Configurable by Creator (optional)

| Field | Default | Description |
|---|---|---|
| `data-amount` | — | Fixed USDC amount. If set, sender cannot change it. |
| `data-label` | `"Send USDC"` | Button label text |
| `data-theme` | `"dark"` | `"dark"` or `"light"` |
| `data-accent` | `"#D4A017"` | Accent color for button and highlights |

### Derived at Runtime (not configurable)

- Truncated address display (`0x1234…abcd`)
- Polygon network indicator
- USDC token label

---

## 4. Embed Format

Single `<script>` tag. No iframe. No external CSS file required.

```html
<script
  src="https://implicitex.com/js/widget.js"
  data-to="0xRecipientAddressHere"
  data-name="Antoine Dennison"
  data-amount="25"
  data-label="Send USDC"
  data-theme="dark"
></script>
```

The script injects a self-contained widget `<div>` immediately after its own `<script>` tag. All styles are inlined or scoped. The widget does not depend on the host page's CSS framework.

**Minimum viable embed** (required fields only):

```html
<script
  src="https://implicitex.com/js/widget.js"
  data-to="0xRecipientAddressHere"
  data-name="Antoine Dennison"
></script>
```

---

## 5. Redirect URL Contract

On button click, the widget opens the ImplicitEx transfer page in a new tab with the recipient and amount pre-populated as query parameters.

### URL structure

```
https://implicitex.com/?to={address}&amount={amount}
```

### Parameters

| Parameter | Required | Source | Notes |
|---|---|---|---|
| `to` | Yes | `data-to` | Full checksummed address |
| `amount` | No | `data-amount` | Omit if not fixed; ImplicitEx renders an open amount field |

### Example

```
https://implicitex.com/?to=0x1234...abcd&amount=25
```

ImplicitEx reads these parameters on load and pre-populates the transfer form. The sender reviews the pre-filled recipient and amount, connects their wallet, and completes the transfer.

The widget does not receive any return signal from ImplicitEx. There is no callback, no postMessage, no webhook at MVP. The redirect is one-way.

---

## 6. Security Boundaries

The following constraints are permanent, not deferred. They define what the widget is allowed to be.

**The widget must never:**

- Execute wallet logic of any kind
- Request wallet permissions (`eth_requestAccounts`, `wallet_connect`, etc.)
- Read or collect wallet addresses from the host page or user
- establish a connection to any wallet provider
- Render inside an `<iframe>` or use `postMessage` to bridge to a parent frame
- Store, transmit, or log any user data
- Load scripts from any domain other than `implicitex.com`

**Enforcement:**  
These boundaries are maintained by keeping `widget.js` a static asset with no SDK dependencies, no API calls, and no state beyond the values passed in `data-*` attributes. The script reads `data-*`, renders HTML, and attaches a click handler that builds a URL. That is its complete execution surface.

---

## 7. Revenue Model

No separate widget pricing. The widget drives traffic to implicitex.com, where the standard protocol fee applies to every transfer. The widget is a distribution channel, not a billable product.

Creator revenue attribution (tracking which widget generated which transfer) is a post-MVP concern and requires a creator dashboard. It is explicitly excluded from this version.

---

## 8. MVP Exclusions

The following are explicitly out of scope for v1. They are documented here to prevent scope creep, not to schedule them.

| Excluded Feature | Reason |
|---|---|
| Iframe transfer flow | Wallet injection unreliable in cross-origin iframes |
| Wallet connection inside widget | Security boundary — wallet surface belongs to ImplicitEx domain only |
| postMessage bridge | No return signal needed; redirect is one-way |
| Creator analytics / per-widget attribution | Requires creator accounts and dashboard infrastructure |
| Creator dashboard | Out of scope for distribution channel v1 |
| Hosted checkout session | Not needed; URL params carry sufficient state |
| Widget builder UI | Creators use the `<script>` tag directly at MVP |
| Multi-recipient routing | One recipient per widget instance |
| Fiat amount display | USDC amounts only; no currency conversion |
| Mobile wallet deep links | WalletConnect handles this on the ImplicitEx side after redirect |

---

## 9. Success Metrics

Success is defined at the funnel level, not the analytics level. These criteria can be verified manually before any tracking infrastructure exists.

**Funnel**

```
Widget configured by creator
        ↓
Widget embedded on host page
        ↓
Widget clicked by sender
        ↓
Sender lands on ImplicitEx with form pre-populated
        ↓
Transfer completed
```

**Acceptance criteria**

| Criterion | Pass condition |
|---|---|
| Time to embed | Creator can produce a working `<script>` tag in under 60 seconds |
| Dependency footprint | Widget loads with no external dependencies beyond `widget.js` |
| Address integrity | Recipient address cannot be modified by the sender at any point |
| Pre-population | Transfer form is correctly populated from URL parameters on arrival |
| Reduced friction | Sender reaches transfer-ready state in fewer steps than manually entering recipient information |
| Isolation | Removing the widget from a host page leaves no trace in DOM, console, or network activity |

These criteria do not require a creator dashboard, analytics pipeline, or backend instrumentation to verify. They are testable with a browser and a stopwatch.

---

## 10. Implementation Scope (when ready)

**`widget.js`** (~200–300 lines, no dependencies)
- Read `data-*` attributes from the script tag
- Inject a styled trust card into the DOM
- Attach click handler: build redirect URL, open in new tab
- Inline all styles (no external CSS)

**`index.html` URL param handling** (small addition to `wallet.js`)
- On load, read `?to=` and `?amount=` from `window.location.search`
- Pre-populate recipient and amount fields if present
- Proceed as normal transfer flow

No new backend infrastructure required for MVP.
