'use strict';

/**
 * portal-nesting-integrity.test.js
 *
 * Regression guard for the portal containment failure (commit 0e087ef).
 *
 * Root cause: an orphan </div> caused the browser to terminate the
 * .modules.transfer-portal section early, ejecting transferMod, networkMod,
 * verificationMod, and the telemetry surface outside the display:grid
 * container. Two-column layout collapsed and the portal body appeared to
 * escape its frame.
 *
 * This test asserts, via real browser evaluation (puppeteer headless), that:
 *   1. transferMod, networkMod, verificationMod are descendants of #modules.
 *   2. The telemetry and status surfaces are descendants of #modules.
 *   3. The desktop grid computes two columns.
 *   4. Full-page screenshots are captured for the acceptance record.
 *   6. Required transfer runtime scripts load before wallet.js.
 *   7. The rewritten root route is explicitly non-cacheable.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test } = require('node:test');
const puppeteer = require('puppeteer');

const appRoot = path.resolve(__dirname, '../..');
const publicRoot = path.join(appRoot, 'frontend/public');
const portalIndexPath = path.join(publicRoot, 'portal-index.html');
const firebaseConfigPath = path.resolve(appRoot, '../firebase.json');
const screenshotRoot = path.join('/tmp', 'implicitex-portal-nesting-integrity');
const responsiveScreenshotRoot = path.join('/tmp', 'implicitex-portal-header-footer');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const relativePath = requestPath === '/' ? '/portal-index.html' : requestPath;
    const filePath = path.join(publicRoot, relativePath);

    if (!filePath.startsWith(publicRoot)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404); res.end('Not found'); return;
    }

    if (path.basename(filePath) === 'portal-index.html') {
      // Stub ethers so wallet.js does not throw before page is interactive.
      const html = fs.readFileSync(filePath, 'utf8').replace(
        /<script\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/ethers@[\d.]+\/dist\/ethers\.umd\.min\.js"[\s\S]*?<\/script>\s*/m,
        `<script>
          window.ethers = {
            getAddress(a) {
              const v = String(a || '').trim();
              if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error('invalid address');
              return v.toLowerCase();
            },
            formatUnits(value, decimals) {
              const big = typeof value === 'bigint' ? value : BigInt(value);
              const scale = BigInt(10) ** BigInt(decimals || 0);
              const whole = big / scale;
              const fraction = big % scale;
              return fraction === 0n ? String(whole) : String(whole) + '.' + String(fraction).padStart(Number(decimals || 0), '0');
            },
          };
        </script>\n`
      );
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.woff2': 'font/woff2',
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function openPortal(page, baseUrl, width, height, theme) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((t) => {
    try { localStorage.setItem('implicitex-theme', t); } catch (_) {}
  }, theme);
  await page.evaluateOnNewDocument(() => {
    window.ethers = {
      getAddress(a) {
        const v = String(a || '').trim();
        if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error('invalid address');
        return v.toLowerCase();
      },
      formatUnits(value, decimals) {
        const big = typeof value === 'bigint' ? value : BigInt(value);
        const scale = BigInt(10) ** BigInt(decimals || 0);
        const whole = big / scale;
        const fraction = big % scale;
        return fraction === 0n ? String(whole) : String(whole) + '.' + String(fraction).padStart(Number(decimals || 0), '0');
      },
    };
  });
  await page.goto(`${baseUrl}/portal-index.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  // Wait for the modules section to be in the DOM — proves the page rendered.
  await page.waitForSelector('#modules', { timeout: 15000 });
  await page.waitForFunction(() => {
    const launch = document.getElementById('ix-launch');
    if (!launch) return true;
    const style = getComputedStyle(launch);
    return style.display === 'none' || style.opacity === '0';
  }, { timeout: 7000 });
}

async function collectHeaderFooter(page) {
  return page.evaluate(() => {
    const nav = document.getElementById('portalPrimaryNav');
    const buttons = nav ? Array.from(nav.querySelectorAll('.portal-primary-nav-button')) : [];
    const mobileNav = document.getElementById('portalMobileNav');
    const mobileButtons = mobileNav
      ? Array.from(mobileNav.querySelectorAll('[data-mobile-destination]'))
      : [];
    const active = buttons.find((button) => button.getAttribute('aria-current') === 'page');
    const wallet = document.getElementById('walletMenu');
    const walletTrigger = document.getElementById('walletMenuTrigger');
    const walletLabel = walletTrigger && walletTrigger.querySelector('.wallet-account-label');
    // Mobile wallet rail — alternative connected control at ≤600px.
    const railEl = document.getElementById('portalWalletRail');
    const railConnected = railEl && railEl.querySelector('.rail-connected');
    const railAddress = railEl && railEl.querySelector('.rail-address');
    const workspaceLabel = document.querySelector('.portal-workspace-label');
    const workspace = document.getElementById('portalWorkspaceControls');
    const workspaceButtons = workspace
      ? Array.from(workspace.querySelectorAll('.portal-ctrl-btn'))
      : [];
    const footerNav = document.querySelector('.portal-footer-nav');
    const footer = document.getElementById('portalFooter');
    const footerLabels = footerNav
      ? Array.from(footerNav.querySelectorAll('.portal-footer-label')).map((label) => label.textContent.trim())
      : [];
    const navRects = buttons.map((button) => button.getBoundingClientRect());
    const activeStyle = active ? getComputedStyle(active) : null;
    const activeBefore = active ? getComputedStyle(active, '::before') : null;
    const activeAfter = active ? getComputedStyle(active, '::after') : null;
    const walletRect = wallet ? wallet.getBoundingClientRect() : null;
    const walletTriggerRect = walletTrigger ? walletTrigger.getBoundingClientRect() : null;
    const workspaceButtonRects = workspaceButtons
      .map((button) => button.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const navRect = nav ? nav.getBoundingClientRect() : null;
    const portal = document.querySelector('.transfer-portal');
    const fields = Array.from(document.querySelectorAll('#txForm input, #txForm textarea, #txForm select'));
    const pseudoIsVisible = (style) => !!(
      style &&
      style.display !== 'none' &&
      style.content !== 'none' &&
      style.content !== 'normal' &&
      style.content !== ''
    );

    // Rail connected button is visible when it has layout (display:flex and non-zero rect).
    const railConnectedRect = railConnected ? railConnected.getBoundingClientRect() : null;
    const railConnectedVisible = !!(
      railConnected &&
      getComputedStyle(railConnected).display !== 'none' &&
      railConnectedRect && railConnectedRect.width > 0 && railConnectedRect.height > 0
    );
    return {
      walletVisible: !!(
        (wallet && !wallet.hidden &&
         getComputedStyle(wallet).display !== 'none' &&
         walletRect && walletRect.width > 0 && walletRect.height > 0) ||
        railConnectedVisible
      ),
      walletLabel: walletLabel
        ? walletLabel.textContent.trim()
        : (railEl && railEl.classList.contains('is-connected') ? 'CONNECTED WALLET' : ''),
      walletAddress: document.getElementById('walletAddr')?.textContent.trim() ||
        (railAddress ? railAddress.textContent.trim() : '') || '',
      primaryNavGrouped: !!(
        nav && buttons.length === 3 &&
        buttons.every((button) => button.parentElement === nav) &&
        navRects.every((rect) => rect.width > 0 && rect.height > 0) &&
        navRects.every((rect) => Math.abs(rect.top - navRects[0].top) < 2)
      ),
      mobileNavVisible: !!(
        mobileNav && getComputedStyle(mobileNav).display !== 'none' &&
        mobileNav.getBoundingClientRect().width > 0 && mobileNav.getBoundingClientRect().height > 0
      ),
      mobileNavGrouped: !!(
        mobileNav && mobileButtons.length === 3 &&
        mobileButtons.every((button) => button.getBoundingClientRect().width > 0) &&
        mobileButtons.every((button) => Math.abs(button.getBoundingClientRect().top - mobileButtons[0].getBoundingClientRect().top) < 2)
      ),
      mobileSettingsPresent: !!(mobileNav && mobileNav.querySelector('[data-mobile-settings]')),
      primaryNavButtonHeights: navRects.map((rect) => Math.round(rect.height)),
      primaryNavBorderWidths: buttons.map((button) => {
        const style = getComputedStyle(button);
        return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
      }),
      workspaceButtonHeights: workspaceButtonRects.map((rect) => Math.round(rect.height)),
      primaryNavCompact: !!(
        navRect &&
        navRect.width < 400 &&
        navRects.every((rect) => rect.width < 150)
      ),
      wideControlsOneRow: !!(
        navRects.length &&
        walletTriggerRect &&
        workspaceButtonRects.length &&
        Math.abs(navRects[0].top - walletTriggerRect.top) < 2 &&
        Math.abs(navRects[0].top - workspaceButtonRects[0].top) < 2
      ),
      workspaceLabelPresent: !!workspaceLabel,
      workspaceVisible: !!(
        workspace && getComputedStyle(workspace).display !== 'none' &&
        workspace.getBoundingClientRect().width > 0
      ),
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      fieldHeights: fields.map((field) => Math.round(field.getBoundingClientRect().height)).filter(Boolean),
      fieldRadii: fields.map((field) => getComputedStyle(field).borderRadius),
      activeHasUnderline: !!(
        active && activeStyle && (
          activeStyle.boxShadow.includes('inset') ||
          parseFloat(activeStyle.borderBottomWidth) > parseFloat(activeStyle.borderTopWidth) ||
          pseudoIsVisible(activeBefore) ||
          pseudoIsVisible(activeAfter)
        )
      ),
      activeHasRaisedSurface: !!(
        active && activeStyle && activeStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'
      ),
      footerLabels,
      footerGridColumns: footerNav ? getComputedStyle(footerNav).gridTemplateColumns : '',
      footerBorderTopWidth: footer ? parseFloat(getComputedStyle(footer).borderTopWidth) : -1,
      footerStatementPresent: !!document.querySelector('.portal-footer-statement'),
      // ── Two-row hierarchy (Change 7) ────────────────────────────────────────
      headerHeight: (function () {
        var h = document.querySelector('.portal-header');
        return h ? Math.round(h.getBoundingClientRect().height) : -1;
      }()),
      walletRailVisible: (function () {
        var rail = document.getElementById('portalWalletRail');
        if (!rail) return false;
        var r = rail.getBoundingClientRect();
        return getComputedStyle(rail).display !== 'none' && r.width > 0 && r.height > 0;
      }()),
      desktopWalletHidden: (function () {
        var connectBtn = document.getElementById('connectBtn');
        var walletMenu  = document.getElementById('walletMenu');
        var btnHidden  = !connectBtn || connectBtn.hidden ||
          getComputedStyle(connectBtn).display === 'none' ||
          connectBtn.getBoundingClientRect().width === 0;
        var menuHidden = !walletMenu || walletMenu.hidden ||
          getComputedStyle(walletMenu).display === 'none' ||
          walletMenu.getBoundingClientRect().width === 0;
        return btnHidden && menuHidden;
      }()),
      row1Aligned: (function () {
        // Brand vertical center and active wallet control vertical center within 8px.
        // 8px tolerance accommodates height differences (brand 36px, wallet btn 44px).
        var id = document.querySelector('.portal-header-identity');
        if (!id) return false;
        var idR    = id.getBoundingClientRect();
        var trigger    = document.getElementById('walletMenuTrigger');
        var connectBtn = document.getElementById('connectBtn');
        var trigVisible = trigger && !trigger.hidden &&
          getComputedStyle(trigger).display !== 'none' &&
          trigger.getBoundingClientRect().width > 0;
        var btnVisible = connectBtn && !connectBtn.hidden &&
          getComputedStyle(connectBtn).display !== 'none' &&
          connectBtn.getBoundingClientRect().width > 0;
        var ctrlEl = trigVisible ? trigger : (btnVisible ? connectBtn : null);
        if (!ctrlEl) return false;
        var ctrlR = ctrlEl.getBoundingClientRect();
        return Math.abs((idR.top + idR.height / 2) - (ctrlR.top + ctrlR.height / 2)) < 8;
      }()),
      row2Aligned: (function () {
        // Nav buttons and first visible workspace control share the same top (within 2px).
        var navButtons = Array.from(document.querySelectorAll('.portal-primary-nav-button'));
        var wsButtons  = Array.from(
          document.querySelectorAll('.portal-workspace-controls .portal-ctrl-btn')
        ).filter(function (b) { return b.getBoundingClientRect().width > 0; });
        if (!navButtons.length || !wsButtons.length) return false;
        return Math.abs(
          navButtons[0].getBoundingClientRect().top - wsButtons[0].getBoundingClientRect().top
        ) < 2;
      }()),
      secondaryBelowPrimary: (function () {
        // Primary row bottom = max(identity.bottom, wallet-control.bottom).
        // The wallet button is taller than the brand lockup; using only identity.bottom
        // would allow the sticky bar to overlap the wallet button.
        var id = document.querySelector('.portal-header-identity');
        var sb = document.querySelector('.portal-sticky-bar');
        if (!id || !sb) return false;
        var trigger    = document.getElementById('walletMenuTrigger');
        var connectBtn = document.getElementById('connectBtn');
        var trigVisible = trigger && !trigger.hidden &&
          getComputedStyle(trigger).display !== 'none' &&
          trigger.getBoundingClientRect().width > 0;
        var btnVisible = connectBtn && !connectBtn.hidden &&
          getComputedStyle(connectBtn).display !== 'none' &&
          connectBtn.getBoundingClientRect().width > 0;
        var ctrlEl = trigVisible ? trigger : (btnVisible ? connectBtn : null);
        var primaryBottom = id.getBoundingClientRect().bottom;
        if (ctrlEl) primaryBottom = Math.max(primaryBottom, ctrlEl.getBoundingClientRect().bottom);
        return sb.getBoundingClientRect().top >= primaryBottom;
      }()),
      primaryRowGap: (function () {
        // Signed gap between the bottom of row 1 and the top of the sticky bar.
        // Positive = correct separation; zero or negative = overlap.
        var id = document.querySelector('.portal-header-identity');
        var sb = document.querySelector('.portal-sticky-bar');
        if (!id || !sb) return -1;
        var trigger    = document.getElementById('walletMenuTrigger');
        var connectBtn = document.getElementById('connectBtn');
        var trigVisible = trigger && !trigger.hidden &&
          getComputedStyle(trigger).display !== 'none' &&
          trigger.getBoundingClientRect().width > 0;
        var btnVisible = connectBtn && !connectBtn.hidden &&
          getComputedStyle(connectBtn).display !== 'none' &&
          connectBtn.getBoundingClientRect().width > 0;
        var ctrlEl = trigVisible ? trigger : (btnVisible ? connectBtn : null);
        var primaryBottom = id.getBoundingClientRect().bottom;
        if (ctrlEl) primaryBottom = Math.max(primaryBottom, ctrlEl.getBoundingClientRect().bottom);
        return Math.round(sb.getBoundingClientRect().top - primaryBottom);
      }()),
      secondaryGroupsWrapped: (function () {
        // True when workspace group top ≥ nav group bottom (secondary wraps to two lines).
        var navButtons = Array.from(document.querySelectorAll('.portal-primary-nav-button'));
        var wsButtons  = Array.from(
          document.querySelectorAll('.portal-workspace-controls .portal-ctrl-btn')
        ).filter(function (b) { return b.getBoundingClientRect().width > 0; });
        if (!navButtons.length || !wsButtons.length) return false;
        var navBottom = Math.max.apply(null, navButtons.map(function (b) {
          return b.getBoundingClientRect().bottom;
        }));
        var wsTop = Math.min.apply(null, wsButtons.map(function (b) {
          return b.getBoundingClientRect().top;
        }));
        return wsTop >= navBottom;
      }()),
      secondaryGroupsOverlap: (function () {
        // True when nav and workspace rectangles share vertical space (groups overlap).
        var navButtons = Array.from(document.querySelectorAll('.portal-primary-nav-button'));
        var wsButtons  = Array.from(
          document.querySelectorAll('.portal-workspace-controls .portal-ctrl-btn')
        ).filter(function (b) { return b.getBoundingClientRect().width > 0; });
        if (!navButtons.length || !wsButtons.length) return false;
        var navTop    = Math.min.apply(null, navButtons.map(function (b) { return b.getBoundingClientRect().top; }));
        var navBottom = Math.max.apply(null, navButtons.map(function (b) { return b.getBoundingClientRect().bottom; }));
        var wsTop     = Math.min.apply(null, wsButtons.map(function (b) { return b.getBoundingClientRect().top; }));
        var wsBottom  = Math.max.apply(null, wsButtons.map(function (b) { return b.getBoundingClientRect().bottom; }));
        return navTop < wsBottom && wsTop < navBottom;
      }()),
      walletRightAligned: (function () {
        // Active wallet control right edge within 40px of header right edge.
        var trigger    = document.getElementById('walletMenuTrigger');
        var connectBtn = document.getElementById('connectBtn');
        var header = document.querySelector('.portal-header');
        if (!header) return false;
        var headerRight = header.getBoundingClientRect().right;
        var trigVisible = trigger && !trigger.hidden &&
          getComputedStyle(trigger).display !== 'none' &&
          trigger.getBoundingClientRect().width > 0;
        var btnVisible = connectBtn && !connectBtn.hidden &&
          getComputedStyle(connectBtn).display !== 'none' &&
          connectBtn.getBoundingClientRect().width > 0;
        var ctrlEl = trigVisible ? trigger : (btnVisible ? connectBtn : null);
        if (!ctrlEl) return false;
        return headerRight - ctrlEl.getBoundingClientRect().right < 40;
      }()),
      workspaceRightAligned: (function () {
        // Last visible workspace control right edge within 40px of header right edge.
        var btns = Array.from(
          document.querySelectorAll('.portal-workspace-controls .portal-ctrl-btn')
        ).filter(function (b) { return b.getBoundingClientRect().width > 0; });
        var header = document.querySelector('.portal-header');
        if (!btns.length || !header) return false;
        var lastR = btns[btns.length - 1].getBoundingClientRect();
        return header.getBoundingClientRect().right - lastR.right < 40;
      }()),
      navButtonsGrouped: (function () {
        // All nav buttons are on the same row (tops within 2px) — group-level wrap only.
        var buttons = Array.from(document.querySelectorAll('.portal-primary-nav-button'));
        if (!buttons.length) return true;
        var tops = buttons.map(function (b) { return Math.round(b.getBoundingClientRect().top); });
        return tops.every(function (t) { return Math.abs(t - tops[0]) < 2; });
      }()),
      workspaceButtonsGrouped: (function () {
        // All visible workspace controls are on the same row — group-level wrap only.
        var btns = Array.from(
          document.querySelectorAll('.portal-workspace-controls .portal-ctrl-btn')
        ).filter(function (b) { return b.getBoundingClientRect().width > 0; });
        if (!btns.length) return true;
        var tops = btns.map(function (b) { return Math.round(b.getBoundingClientRect().top); });
        return tops.every(function (t) { return Math.abs(t - tops[0]) < 2; });
      }()),
    };
  });
}

function injectConnectedMockProvider(page) {
  return page.evaluateOnNewDocument(() => {
    let authorized = false;
    const address = '0xf614000000000000000000000000000000000f1d';
    window.ethereum = {
      request({ method }) {
        if (method === 'eth_accounts') return Promise.resolve(authorized ? [address] : []);
        if (method === 'eth_requestAccounts') {
          authorized = true;
          return Promise.resolve([address]);
        }
        if (method === 'eth_chainId') return Promise.resolve('0x89');
        return Promise.resolve('0x0');
      },
      on() {},
      removeListener() {},
    };
  });
}

test('portal entrypoint preserves transfer dependency order and root cache policy', () => {
  const html = fs.readFileSync(portalIndexPath, 'utf8');
  const scriptSources = Array.from(
    html.matchAll(/<script[^>]+src="([^"]+)"/g),
    (match) => match[1]
  );
  const chainsIndex = scriptSources.indexOf('config/chains.js');
  const executionIndex = scriptSources.indexOf('js/ix-execution.js');
  const walletIndex = scriptSources.indexOf('js/wallet.js');

  assert.notEqual(walletIndex, -1, 'portal-index.html must load js/wallet.js');
  assert.notEqual(
    executionIndex,
    -1,
    'portal-index.html must not load wallet.js without js/ix-execution.js'
  );
  assert.notEqual(chainsIndex, -1, 'portal-index.html must load config/chains.js');
  assert.ok(
    chainsIndex < executionIndex && executionIndex < walletIndex,
    'portal scripts must load in order: config/chains.js, js/ix-execution.js, js/wallet.js'
  );

  const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
  const portalHosting = firebaseConfig.hosting.find((entry) => entry.target === 'portal');
  assert.ok(portalHosting, 'firebase.json must define the portal hosting target');

  const rootHeaders = portalHosting.headers.find((entry) => entry.source === '/');
  assert.ok(rootHeaders, 'portal root route must declare explicit response headers');

  const cacheControl = rootHeaders.headers.find((entry) => (
    entry.key.toLowerCase() === 'cache-control'
  ));
  assert.equal(
    cacheControl && cacheControl.value,
    'no-cache, must-revalidate',
    'portal root route must revalidate rewritten HTML'
  );
});

/**
 * collectContainment — the core regression assertion.
 * Runs inside the browser via page.evaluate.
 * Returns an object with containment booleans + geometry data.
 */
async function collectContainment(page, width) {
  return page.evaluate((viewportWidth) => {
    const modules = document.getElementById('modules');
    const transferMod  = document.getElementById('transferMod');
    const networkMod   = document.getElementById('networkMod');
    const verificationMod = document.getElementById('verificationMod');
    const telemetry    = document.querySelector('.telemetry');
    const statusSurface = document.getElementById('portalPrimaryNavStatus');
    function rect(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
    }

    // The decisive structural test: each operational surface must be a DOM
    // descendant of #modules. This will catch any future orphan-close regression.
    const containsTransfer      = modules ? modules.contains(transferMod) : false;
    const containsNetwork       = modules ? modules.contains(networkMod) : false;
    const containsVerification  = modules ? modules.contains(verificationMod) : false;
    const containsTelemetry     = modules ? modules.contains(telemetry) : false;
    const containsStatus        = modules ? modules.contains(statusSurface) : false;

    const modulesRect      = rect(modules);
    const transferRect     = rect(transferMod);
    const networkRect      = rect(networkMod);
    const verificationRect = rect(verificationMod);

    // Grid column count — "repeat(2, 1fr)" resolves to gridTemplateColumns
    // containing two track sizes separated by a space.
    const gridColumns = modules ? getComputedStyle(modules).gridTemplateColumns : '';
    const columnCount = gridColumns ? gridColumns.trim().split(/\s+/).length : 0;

    // transferMod and mod-col (network+verification) should be in different
    // horizontal positions at desktop width (>= 800px).
    let columnsAreSeparate = false;
    if (transferRect && networkRect && viewportWidth >= 800) {
      columnsAreSeparate = Math.abs(transferRect.left - networkRect.left) > 10;
    }

    // Bracket pseudo-elements: check via ::before/::after of .transfer-portal
    // We can't inspect pseudo-element rects directly from JS, but we can verify
    // the containing block dimensions match the full portal shell.
    const portalShell = document.querySelector('.transfer-portal');
    const shellRect = rect(portalShell);

    // All module rects should be horizontally within the shell.
    function withinShellHorizontally(r) {
      if (!r || !shellRect) return null;
      return r.left >= shellRect.left - 2 && r.right <= shellRect.right + 2;
    }
    function withinShellVertically(r) {
      if (!r || !shellRect) return null;
      return r.top >= shellRect.top - 2 && r.bottom <= shellRect.bottom + 2;
    }

    // Header title legibility: display:none is insufficient — the title can
    // be present but invisible if font-size is tiny or color opacity is near 0.
    // Assert font-size >= 11px and opacity >= 0.9 at mobile widths.
    const headerTitle = document.querySelector('.portal-header-title');
    const headerTitleComputed = headerTitle ? getComputedStyle(headerTitle) : null;
    const headerTitleFontPx = headerTitleComputed
      ? parseFloat(headerTitleComputed.fontSize) : 0;
    // Extract alpha channel from computed color (rgba or rgb)
    const headerTitleColorStr = headerTitleComputed ? headerTitleComputed.color : '';
    const rgbaMatch = headerTitleColorStr.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
    const headerTitleOpacity = rgbaMatch ? parseFloat(rgbaMatch[1]) : 1.0; // rgb() = fully opaque
    const headerTitleLegible = headerTitleFontPx >= 11 && headerTitleOpacity >= 0.9;

    return {
      // Containment (structural — the primary regression guard)
      containsTransfer,
      containsNetwork,
      containsVerification,
      containsTelemetry,
      containsStatus,

      // Grid structure
      gridColumns,
      columnCount,
      columnsAreSeparate,

      // Geometry
      modulesRect,
      shellRect,
      transferRect,
      networkRect,
      verificationRect,

      // Module containment within shell bounds
      transferWithinShell: withinShellHorizontally(transferRect) && withinShellVertically(transferRect),
      networkWithinShell:  withinShellHorizontally(networkRect)  && withinShellVertically(networkRect),
      verificationWithinShell: withinShellHorizontally(verificationRect) && withinShellVertically(verificationRect),

      // Header title legibility
      headerTitleFontPx,
      headerTitleOpacity,
      headerTitleLegible,
    };
  }, width);
}

test('portal modules are DOM descendants of #modules (containment regression guard)', async () => {
  ensureDir(screenshotRoot);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-crash-reporter',
    ],
  });

  const { server, baseUrl } = await startStaticServer();
  const pageErrors = [];

  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // ---- Desktop light: full acceptance smoke ----
    await openPortal(page, baseUrl, 1365, 1800, 'light');
    const runtimeState = await page.evaluate(() => ({
      executionReady: !!(
        window.IX_EXECUTION &&
        typeof window.IX_EXECUTION.calculateFee === 'function' &&
        typeof window.IX_EXECUTION.executeTransfer === 'function'
      ),
    }));
    const desktopLight = await collectContainment(page, 1365);

    assert.equal(runtimeState.executionReady, true, 'transfer execution runtime must initialize');

    // Core containment assertions
    assert.equal(desktopLight.containsTransfer,     true,  'transferMod must be a descendant of #modules');
    assert.equal(desktopLight.containsNetwork,      true,  'networkMod must be a descendant of #modules');
    assert.equal(desktopLight.containsVerification, true,  'verificationMod must be a descendant of #modules');
    assert.equal(desktopLight.containsTelemetry,    true,  'telemetry surface must be a descendant of #modules');
    assert.equal(desktopLight.containsStatus,       true,  'status surface must be a descendant of #modules');

    // Desktop two-column grid
    assert.equal(desktopLight.columnCount, 2, `desktop grid must have 2 columns, got "${desktopLight.gridColumns}"`);
    assert.equal(desktopLight.columnsAreSeparate, true, 'transferMod and networkMod must be in separate horizontal positions');

    // Module rects within shell bounds
    assert.equal(desktopLight.transferWithinShell,      true, 'transferMod must be within portal shell bounds');
    assert.equal(desktopLight.networkWithinShell,       true, 'networkMod must be within portal shell bounds');
    assert.equal(desktopLight.verificationWithinShell,  true, 'verificationMod must be within portal shell bounds');

    await page.screenshot({
      path: path.join(screenshotRoot, 'desktop-light-full.png'),
      fullPage: true,
    });

    // ---- Desktop dark ----
    await openPortal(page, baseUrl, 1365, 1800, 'dark');
    const desktopDark = await collectContainment(page, 1365);

    assert.equal(desktopDark.containsTransfer,     true,  'dark: transferMod must be a descendant of #modules');
    assert.equal(desktopDark.containsNetwork,      true,  'dark: networkMod must be a descendant of #modules');
    assert.equal(desktopDark.containsVerification, true,  'dark: verificationMod must be a descendant of #modules');
    assert.equal(desktopDark.columnCount, 2, `dark: desktop grid must have 2 columns`);
    assert.equal(desktopDark.columnsAreSeparate, true, 'dark: transfer and network must be in separate columns');

    await page.screenshot({
      path: path.join(screenshotRoot, 'desktop-dark-full.png'),
      fullPage: true,
    });

    // ---- Mobile light ----
    await openPortal(page, baseUrl, 390, 1600, 'light');
    const mobileLight = await collectContainment(page, 390);

    // Containment must hold at mobile width too
    assert.equal(mobileLight.containsTransfer,     true,  'mobile light: transferMod must be a descendant of #modules');
    assert.equal(mobileLight.containsNetwork,      true,  'mobile light: networkMod must be a descendant of #modules');
    assert.equal(mobileLight.containsVerification, true,  'mobile light: verificationMod must be a descendant of #modules');
    // Header title legibility: display:!none is necessary but not sufficient.
    // 10px Orbitron at rgba(8,8,8,0.58) is invisible at mobile scale even when
    // the element is technically rendered. Assert minimum font size and opacity.
    assert.equal(mobileLight.headerTitleLegible, true,
      `mobile light: header title must be legible (got ${mobileLight.headerTitleFontPx}px opacity=${mobileLight.headerTitleOpacity})`);

    await page.screenshot({
      path: path.join(screenshotRoot, 'mobile-light-full.png'),
      fullPage: true,
    });

    // ---- Mobile dark ----
    await openPortal(page, baseUrl, 390, 1600, 'dark');
    const mobileDark = await collectContainment(page, 390);

    assert.equal(mobileDark.containsTransfer,     true,  'mobile dark: transferMod must be a descendant of #modules');
    assert.equal(mobileDark.containsNetwork,      true,  'mobile dark: networkMod must be a descendant of #modules');
    assert.equal(mobileDark.containsVerification, true,  'mobile dark: verificationMod must be a descendant of #modules');
    assert.equal(mobileDark.headerTitleLegible, true,
      `mobile dark: header title must be legible (got ${mobileDark.headerTitleFontPx}px opacity=${mobileDark.headerTitleOpacity})`);

    await page.screenshot({
      path: path.join(screenshotRoot, 'mobile-dark-full.png'),
      fullPage: true,
    });

    // ---- Header/footer responsive refinement ----
    // Exercise the connected state so wallet visibility is tested against the
    // actual account control, not only the disconnected Connect button.
    ensureDir(responsiveScreenshotRoot);
    const responsivePage = await browser.newPage();
    injectConnectedMockProvider(responsivePage);
    const responsiveViewports = [
      { name: 'desktop', width: 1365, height: 900, expectedFooterColumns: 7, expectedWideInlineHeader: false },
      { name: 'tablet', width: 820, height: 1000, expectedFooterColumns: 4 },
      { name: 'narrow-tablet', width: 620, height: 900, expectedFooterColumns: 4, isNarrowTablet: true },
      // 601px is the lowest width that enters the two-row grid (min-width: 601px).
      // At this width the secondary row wraps: workspace drops below navigation.
      { name: 'wrap-boundary', width: 601, height: 900, expectedFooterColumns: 4, isNarrowTablet: true, isWrapped: true },
      { name: 'phone-portrait', width: 390, height: 844, expectedFooterColumns: 2 },
      { name: 'phone-landscape', width: 844, height: 390, expectedFooterColumns: 4 },
    ];
    const canonicalFooterLabels = [
      'Product', 'Legal', 'Trust', 'Developers', 'Support', 'Company', 'Social',
    ];

    for (const viewport of responsiveViewports) {
      await openPortal(responsivePage, baseUrl, viewport.width, viewport.height, 'light');
      await responsivePage.evaluate(() => window.IX && window.IX.connect());
      await new Promise((resolve) => setTimeout(resolve, 350));

      const responsive = await collectHeaderFooter(responsivePage);
      assert.equal(responsive.walletVisible, true,
        `${viewport.name}: connected wallet control must remain visible`);
      assert.equal(responsive.walletLabel, 'CONNECTED WALLET',
        `${viewport.name}: wallet control must expose the connected-wallet label`);
      assert.match(responsive.walletAddress, /^0xf614…0f1d$/i,
        `${viewport.name}: truncated connected wallet address must remain visible`);
      const isMobileViewport = viewport.name === 'phone-portrait' || viewport.name === 'phone-landscape';
      const isNarrowTablet  = !!viewport.isNarrowTablet;
      const isWrapped       = !!viewport.isWrapped;
      if (isMobileViewport) {
        assert.equal(responsive.primaryNavGrouped, false,
          `${viewport.name}: duplicate top destination navigation must be hidden`);
        assert.equal(responsive.mobileNavVisible, true,
          `${viewport.name}: mobile bottom navigation must be visible`);
        assert.equal(responsive.mobileNavGrouped, true,
          `${viewport.name}: mobile destination buttons must remain grouped`);
        assert.equal(responsive.mobileSettingsPresent, true,
          `${viewport.name}: mobile Settings access must be present`);
        // Mobile: rail replaces desktop wallet; desktop controls remain hidden.
        assert.equal(responsive.walletRailVisible, true,
          `${viewport.name}: mobile wallet rail must be visible`);
        assert.equal(responsive.desktopWalletHidden, true,
          `${viewport.name}: desktop Connect Wallet must be hidden on mobile`);
      } else {
        assert.equal(responsive.primaryNavGrouped, true,
          `${viewport.name}: primary navigation buttons must remain grouped`);
        assert.equal(responsive.primaryNavCompact, true,
          `${viewport.name}: primary navigation must remain content-width and compact`);
      }
      if (!isMobileViewport) {
        assert.ok(
          responsive.primaryNavButtonHeights.every((height) => height === 38),
          `${viewport.name}: every primary navigation button must be 38px high`
        );
        assert.ok(
          responsive.primaryNavBorderWidths.every((widths) => widths.every((width) => width === '1px')),
          `${viewport.name}: selected and unselected primary navigation buttons must retain a 1px outline`
        );
      }
      assert.ok(
        responsive.workspaceButtonHeights.every((height) => height === 38),
        `${viewport.name}: workspace controls must share the primary navigation's 38px height`
      );
      if (viewport.expectedWideInlineHeader !== undefined) {
        assert.equal(responsive.wideControlsOneRow, viewport.expectedWideInlineHeader,
          'desktop: the default header should preserve identity, navigation, and account hierarchy');
      }
      assert.equal(responsive.workspaceLabelPresent, false,
        `${viewport.name}: WORKSPACE label must be absent`);
      assert.equal(responsive.workspaceVisible, !isMobileViewport,
        `${viewport.name}: workspace controls should remain visible on larger viewports and move behind mobile Settings`);
      // ── Two-row hierarchy assertions (Change 7) ───────────────────────────
      if (!isMobileViewport) {
        assert.equal(responsive.row1Aligned, true,
          `${viewport.name}: branding and Connect Wallet must share row one (vertical centers within 8px)`);
        // secondaryBelowPrimary uses max(identity.bottom, walletControl.bottom) —
        // the sticky bar must not overlap the wallet button.
        assert.equal(responsive.secondaryBelowPrimary, true,
          `${viewport.name}: secondary row must begin at or below the bottom of the tallest primary-row element`);
        assert.ok(responsive.primaryRowGap > 0,
          `${viewport.name}: primary-to-secondary row gap must be >0px, got ${responsive.primaryRowGap}px`);
        assert.equal(responsive.walletRightAligned, true,
          `${viewport.name}: Connect Wallet must be right-aligned in the header`);
        assert.equal(responsive.navButtonsGrouped, true,
          `${viewport.name}: navigation buttons must stay on the same row (group-level wrapping only)`);
        assert.equal(responsive.workspaceButtonsGrouped, true,
          `${viewport.name}: workspace controls must stay on the same row (group-level wrapping only)`);
        if (isWrapped) {
          // At the wrap boundary the secondary groups cannot share one row;
          // workspace must be fully below the navigation group with no overlap.
          assert.equal(responsive.secondaryGroupsWrapped, true,
            `${viewport.name}: workspace controls must be below (not beside) the navigation row`);
          assert.equal(responsive.secondaryGroupsOverlap, false,
            `${viewport.name}: navigation and workspace groups must not overlap when wrapped`);
          assert.ok(responsive.headerHeight <= 190,
            `${viewport.name}: wrapped header height must be ≤190px, got ${responsive.headerHeight}px`);
        } else if (!isNarrowTablet) {
          // At full tablet/desktop widths the two secondary groups fit on one row.
          assert.equal(responsive.row2Aligned, true,
            `${viewport.name}: navigation and workspace controls must share row two (tops within 2px)`);
          assert.equal(responsive.workspaceRightAligned, true,
            `${viewport.name}: workspace controls must be right-aligned in the header`);
          assert.ok(responsive.headerHeight <= 140,
            `${viewport.name}: header height must be ≤140px, got ${responsive.headerHeight}px`);
        }
      }
      // ─────────────────────────────────────────────────────────────────────
      assert.equal(responsive.activeHasUnderline, false,
        `${viewport.name}: active navigation button must not have an underline indicator`);
      assert.equal(responsive.activeHasRaisedSurface, true,
        `${viewport.name}: active navigation button must use a raised surface`);
      assert.equal(responsive.noHorizontalOverflow, true,
        `${viewport.name}: portal must not introduce horizontal overflow`);
      assert.ok(responsive.fieldHeights.every((height) => height >= 44),
        `${viewport.name}: form controls must retain a 44px minimum height`);
      assert.ok(new Set(responsive.fieldRadii).size <= 2,
        `${viewport.name}: form controls must use a consistent corner radius`);
      assert.deepEqual(responsive.footerLabels, canonicalFooterLabels,
        `${viewport.name}: footer groups must remain canonical`);
      assert.equal(
        responsive.footerGridColumns.trim().split(/\s+/).length,
        viewport.expectedFooterColumns,
        `${viewport.name}: footer should use ${viewport.expectedFooterColumns} columns`
      );
      assert.equal(responsive.footerStatementPresent, false,
        `${viewport.name}: standalone footer statement must be removed`);
      assert.equal(responsive.footerBorderTopWidth, 0,
        `${viewport.name}: detached rule above the footer must be removed`);

      await responsivePage.screenshot({
        path: path.join(responsiveScreenshotRoot, `${viewport.name}.png`),
        fullPage: true,
      });
      if (isMobileViewport) {
        await responsivePage.screenshot({
          path: path.join(responsiveScreenshotRoot, `${viewport.name}-viewport.png`),
          fullPage: false,
        });
      }
    }
    await responsivePage.setViewport({ width: 390, height: 844 });
    await responsivePage.evaluate(() => document.querySelector('[data-mobile-settings]')?.click());
    const mobileSettingsState = await responsivePage.evaluate(() => ({
      expanded: document.querySelector('[data-mobile-settings]')?.getAttribute('aria-expanded'),
      workspaceOpen: document.getElementById('portalWorkspace')?.classList.contains('is-mobile-open'),
    }));
    assert.equal(mobileSettingsState.expanded, 'true', 'phone portrait: Settings must expose workspace preferences');
    assert.equal(mobileSettingsState.workspaceOpen, true, 'phone portrait: Settings must open workspace preferences');
    await responsivePage.screenshot({
      path: path.join(responsiveScreenshotRoot, 'phone-settings-open-viewport.png'),
      fullPage: false,
    });
    await responsivePage.close();
    console.log(`Responsive screenshots: ${responsiveScreenshotRoot}/`);

    // ---- Geometry report (desktop light) ----
    const d = desktopLight;
    const report = [
      '',
      '=== Portal Nesting Integrity — Geometry Report (desktop light, 1365px) ===',
      '',
      'CONTAINMENT',
      `  #modules contains transferMod     : ${d.containsTransfer}`,
      `  #modules contains networkMod      : ${d.containsNetwork}`,
      `  #modules contains verificationMod : ${d.containsVerification}`,
      `  #modules contains telemetry       : ${d.containsTelemetry}`,
      `  #modules contains statusSurface   : ${d.containsStatus}`,
      '',
      'GRID',
      `  gridTemplateColumns  : ${d.gridColumns}`,
      `  column count         : ${d.columnCount}`,
      `  transfer ≠ network x : ${d.columnsAreSeparate}`,
      '',
      'SHELL BOUNDS (px)',
      `  .transfer-portal     : top=${d.shellRect?.top?.toFixed(1)} left=${d.shellRect?.left?.toFixed(1)} right=${d.shellRect?.right?.toFixed(1)} bottom=${d.shellRect?.bottom?.toFixed(1)}`,
      '',
      'MODULE RECTS (px)',
      `  transferMod          : top=${d.transferRect?.top?.toFixed(1)} bottom=${d.transferRect?.bottom?.toFixed(1)} left=${d.transferRect?.left?.toFixed(1)} right=${d.transferRect?.right?.toFixed(1)}`,
      `  networkMod           : top=${d.networkRect?.top?.toFixed(1)} bottom=${d.networkRect?.bottom?.toFixed(1)} left=${d.networkRect?.left?.toFixed(1)} right=${d.networkRect?.right?.toFixed(1)}`,
      `  verificationMod      : top=${d.verificationRect?.top?.toFixed(1)} bottom=${d.verificationRect?.bottom?.toFixed(1)} left=${d.verificationRect?.left?.toFixed(1)} right=${d.verificationRect?.right?.toFixed(1)}`,
      '',
      'MODULE WITHIN SHELL',
      `  transferMod          : ${d.transferWithinShell}`,
      `  networkMod           : ${d.networkWithinShell}`,
      `  verificationMod      : ${d.verificationWithinShell}`,
      '',
      '=== END REPORT ===',
      '',
    ].join('\n');

    const reportPath = path.join(screenshotRoot, 'geometry-report.txt');
    fs.writeFileSync(reportPath, report, 'utf8');
    console.log(report);
    console.log(`Screenshots: ${screenshotRoot}/`);
    console.log(`Geometry report: ${reportPath}`);

    // Confirm no critical page errors (MetaMask-absent errors are expected and ignored)
    const criticalErrors = pageErrors.filter(e =>
      !e.includes('MetaMask') &&
      !e.includes('ethereum') &&
      !e.includes('window.ethereum') &&
      !e.includes('gas') &&
      !e.includes('Cannot read properties of undefined') &&
      !e.includes('not defined')
    );
    assert.equal(criticalErrors.length, 0,
      `Critical page errors: ${criticalErrors.join('; ')}`);

  } finally {
    await browser.close();
    server.close();
  }
});
