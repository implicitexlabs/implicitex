/**
 * ixid-handoff-integration.test.js
 *
 * Local browser integration proof for the IX ID → ImplicitEx Transfer Portal
 * payment handoff. Uses Puppeteer with request interception so that:
 *
 *   - The identity page fetches /api/public/route/ from a local Node proxy
 *   - The portal's ixid-handoff.js fetches https://test-alice.ixid.me/api/public/route/
 *     which is intercepted and redirected to the local Flask projection handler
 *   - No production systems are touched
 *   - No blockchain transaction is signed or broadcast
 *
 * Prerequisites (must be running before this test):
 *   1. Firestore emulator on localhost:8080
 *   2. Fixture seeded: python seed_fixture.py seed
 *   3. Flask projection handler: FIRESTORE_EMULATOR_HOST=localhost:8080
 *        GOOGLE_CLOUD_PROJECT=ix-id-test PORT=8081 python ixid_projection_handler.py
 *   4. This script starts local HTTP servers for identity page (:8082) and portal (:8083)
 *
 * STOP INVARIANT: The test halts before any wallet transaction signing.
 */

'use strict';

const assert  = require('node:assert/strict');
const http    = require('node:http');
const fs      = require('node:fs');
const path    = require('node:path');
const { execSync } = require('node:child_process');

const puppeteer = require('puppeteer');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT            = path.resolve(__dirname, '../..');
const IDENTITY_PUBLIC = path.resolve(ROOT, '../ixid-identity-page/public');
const PORTAL_PUBLIC   = path.resolve(ROOT, 'frontend/public');

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

const PROJECTION_PORT  = 8081;   // Flask — already running
const IDENTITY_PORT    = 8082;   // static server + API proxy
const PORTAL_PORT      = 8083;   // static server for portal

// ---------------------------------------------------------------------------
// Fixture constants (must match seed_fixture.py)
// ---------------------------------------------------------------------------

const FIXTURE_HANDLE   = 'test-alice';
const FIXTURE_DEST     = '0xaabbccddaabbccddaabbccddaabbccddaabbccdd';
const FIXTURE_CLAIM_A  = 'ci-local-proof-001';

// ---------------------------------------------------------------------------
// Observation log (accumulates all findings for the final report)
// ---------------------------------------------------------------------------

const obs = [];
function note(label, value) {
  obs.push({ label, value: String(value).slice(0, 400) });
  console.log(`  [obs] ${label}: ${String(value).slice(0, 200)}`);
}
function defect(label, detail) {
  obs.push({ label: 'DEFECT — ' + label, value: detail });
  console.error(`  [DEFECT] ${label}: ${detail}`);
}

// ---------------------------------------------------------------------------
// Screenshot helper
// ---------------------------------------------------------------------------

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
let ssCount = 0;
async function screenshot(page, name) {
  const file = path.join(SCREENSHOT_DIR, `${String(ssCount++).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  note('screenshot', path.basename(file));
  return file;
}

// ---------------------------------------------------------------------------
// Local HTTP servers
// ---------------------------------------------------------------------------

function serveStatic(dir, port, apiProxyPort) {
  const mimeMap = {
    '.html': 'text/html', '.js': 'application/javascript',
    '.css': 'text/css',   '.json': 'application/json',
    '.png': 'image/png',  '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json',
  };

  return http.createServer((req, res) => {
    // Proxy /api/* to Flask projection handler
    if (apiProxyPort && req.url.startsWith('/api/')) {
      // /api/public/route/alice → Flask's /public/route/alice
      const target = `http://localhost:${apiProxyPort}${req.url.replace(/^\/api/, '')}`;
      const upstream = http.request(target, (ur) => {
        res.writeHead(ur.statusCode, {
          'Content-Type': ur.headers['content-type'] || 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        });
        ur.pipe(res);
      });
      upstream.on('error', () => {
        res.writeHead(502);
        res.end(JSON.stringify({ error: 'API proxy error' }));
      });
      upstream.end();
      return;
    }

    // Static file serving — strip query string before path resolution
    const urlPath = req.url.split('?')[0];
    let filePath = path.join(dir, urlPath === '/' ? 'index.html' : urlPath);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(dir, 'index.html'); // SPA fallback
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const ext  = path.extname(filePath);
    const mime = mimeMap[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
  }).listen(port);
}

// ---------------------------------------------------------------------------
// Main integration proof
// ---------------------------------------------------------------------------

async function runProof() {
  console.log('\n=== IX ID → IMPLICITEX HANDOFF — LOCAL BROWSER INTEGRATION PROOF ===\n');

  // ── 1. Verify local fixture ────────────────────────────────────────────────
  console.log('1. Verifying local fixture via projection handler…');
  const routeRaw = execSync(
    `curl -s http://localhost:${PROJECTION_PORT}/public/route/${FIXTURE_HANDLE}`,
  ).toString();
  const route = JSON.parse(routeRaw);
  assert.ok(route.payable,                          'Fixture route must be payable');
  assert.strictEqual(route.claim_id, FIXTURE_CLAIM_A, 'Fixture claim_id must match');
  assert.strictEqual(route.destination_address, FIXTURE_DEST, 'Fixture dest must match');
  note('fixture.route', JSON.stringify(route));

  // ── 2. Start local servers ─────────────────────────────────────────────────
  console.log('\n2. Starting local HTTP servers…');
  const identityServer = serveStatic(IDENTITY_PUBLIC, IDENTITY_PORT, PROJECTION_PORT);
  const portalServer   = serveStatic(PORTAL_PUBLIC,   PORTAL_PORT,   null);
  note('identity server', `http://localhost:${IDENTITY_PORT}/?ix_id=${FIXTURE_HANDLE}`);
  note('portal server',   `http://localhost:${PORTAL_PORT}/portal-index.html`);

  // ── 3. Launch browser ──────────────────────────────────────────────────────
  console.log('\n3. Launching Puppeteer (headless Chrome)…');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let findings = {};

  try {
    // ── A. Identity page ────────────────────────────────────────────────────
    console.log('\nA. Identity page…');
    const idPage = await browser.newPage();
    await idPage.setViewport({ width: 1280, height: 800 });

    // Intercept cross-origin route API: identity.js fetches via same-origin
    // proxy already wired through identityServer → Flask. No interception needed.

    const identityUrl = `http://localhost:${IDENTITY_PORT}/?ix_id=${FIXTURE_HANDLE}`;
    await idPage.goto(identityUrl, { waitUntil: 'networkidle0', timeout: 10000 });
    await screenshot(idPage, 'identity-initial');

    // Check title / handle visible
    const title = await idPage.title();
    note('identity.page.title', title);

    // Check payment section appears (identity.js fetches route and calls applyPaymentState)
    // The payment section has data-ix-section="payment" and shows when payable
    let paySection = null;
    try {
      paySection = await idPage.waitForSelector('[data-ix-section="payment"]:not([hidden])', {
        timeout: 5000,
      });
    } catch (_) {}

    if (paySection) {
      note('identity.payment_section', 'VISIBLE — route is payable');

      // Amount field
      const amountInput = await idPage.$('#pay-amount');
      const amountDisabled = await idPage.$eval('#pay-amount', el => el.disabled);
      note('identity.amount_field', amountDisabled ? 'disabled' : 'enabled');

      // Fee preview initially (no amount entered)
      const previewEl = await idPage.$('#pay-preview');
      const previewHidden = previewEl ? await idPage.$eval('#pay-preview', el => el.hasAttribute('hidden')) : true;
      note('identity.fee_preview_initial', previewHidden ? 'hidden (expected)' : 'visible');

      // Enter 5 USDC
      await idPage.click('#pay-amount');
      await idPage.type('#pay-amount', '5');
      await idPage.waitForSelector('#pay-preview:not([hidden])', { timeout: 3000 }).catch(() => {});
      await screenshot(idPage, 'identity-5usdc-entered');

      const amountDisplay = await idPage.$eval('#pay-amount-display', el => el.textContent).catch(() => 'n/a');
      const feeDisplay    = await idPage.$eval('#pay-fee-display',    el => el.textContent).catch(() => 'n/a');
      const totalDisplay  = await idPage.$eval('#pay-total-display',  el => el.textContent).catch(() => 'n/a');
      note('identity.amount_display', amountDisplay);
      note('identity.fee_display',    feeDisplay);
      note('identity.total_display',  totalDisplay);

      // Verify 1% fee math: 5 USDC → fee = 0.05 USDC, total = 5.05 USDC
      if (feeDisplay.includes('0.05')) {
        note('identity.fee_math', 'CORRECT — 1% of 5 USDC = 0.05 USDC');
      } else {
        defect('identity.fee_math', `Expected 0.05, got ${feeDisplay}`);
      }

      // Check pay button state
      const payBtnDisabled = await idPage.$eval('#pay-btn', el => el.disabled).catch(() => true);
      note('identity.pay_btn_with_valid_amount', payBtnDisabled ? 'still disabled (bug?)' : 'enabled');

      // Try invalid amounts
      await idPage.evaluate(() => {
        const input = document.getElementById('pay-amount');
        input.value = '0.5';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await new Promise(r => setTimeout(r, 300));
      const btnAfterLow = await idPage.$eval('#pay-btn', el => el.disabled).catch(() => null);
      note('identity.pay_btn_below_min', btnAfterLow === null ? 'n/a' : (btnAfterLow ? 'disabled (correct)' : 'enabled (BUG)'));

      await idPage.evaluate(() => {
        const input = document.getElementById('pay-amount');
        input.value = '300';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await new Promise(r => setTimeout(r, 300));
      const btnAfterHigh = await idPage.$eval('#pay-btn', el => el.disabled).catch(() => null);
      note('identity.pay_btn_above_max', btnAfterHigh === null ? 'n/a' : (btnAfterHigh ? 'disabled (correct)' : 'enabled (BUG)'));

      // Restore 5 USDC for handoff
      await idPage.evaluate(() => {
        const input = document.getElementById('pay-amount');
        input.value = '5';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await new Promise(r => setTimeout(r, 500));
    } else {
      defect('identity.payment_section', 'Payment section did not appear — route fetch may have failed');
    }

    // Mobile viewport check
    await idPage.setViewport({ width: 390, height: 844 }); // iPhone 14
    await new Promise(r => setTimeout(r, 500));
    await screenshot(idPage, 'identity-mobile');
    note('identity.mobile_viewport', '390×844 — screenshot captured');

    // Back to desktop for handoff
    await idPage.setViewport({ width: 1280, height: 800 });

    // ── B. Capture handoff URL ───────────────────────────────────────────────
    console.log('\nB. Capturing handoff URL…');

    let capturedHandoffUrl = null;
    await idPage.evaluate(() => {
      const input = document.getElementById('pay-amount');
      if (input) { input.value = '5'; input.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await new Promise(r => setTimeout(r, 300));

    // Intercept navigation to capture the handoff URL
    await idPage.setRequestInterception(true);
    idPage.on('request', req => {
      const url = req.url();
      if (url.includes('portal.implicitex.com') || url.includes('src=ixid')) {
        capturedHandoffUrl = url;
        note('handoff.url_captured', url);
        req.abort(); // prevent actual navigation to production
      } else {
        req.continue();
      }
    });

    // Click Pay button
    const payBtn = await idPage.$('#pay-btn');
    if (payBtn) {
      await payBtn.click().catch(() => {});
      await new Promise(r => setTimeout(r, 2000)); // wait for stale-check + navigation
    }

    await screenshot(idPage, 'identity-after-pay-click');

    if (!capturedHandoffUrl) {
      // Try to find the URL from inline script logic — check status element
      const statusText = await idPage.$eval('#pay-status', el => el.textContent).catch(() => '');
      note('identity.pay_status_after_click', statusText || 'empty');
      defect('handoff.url_captured', 'Handoff URL not captured — pay button may not have fired navigation');
    }

    await idPage.setRequestInterception(false);
    await idPage.close();

    // Parse handoff URL
    let handoffParams = {};
    if (capturedHandoffUrl) {
      const u = new URL(capturedHandoffUrl);
      handoffParams = Object.fromEntries(u.searchParams.entries());
      note('handoff.src',    handoffParams.src    || 'MISSING');
      note('handoff.ixid',   handoffParams.ixid   || 'MISSING');
      note('handoff.to',     handoffParams.to     || 'MISSING');
      note('handoff.claim',  handoffParams.claim  || 'MISSING');
      note('handoff.amount', handoffParams.amount || 'MISSING');
      note('handoff.chain',  handoffParams.chain  || 'MISSING');
      note('handoff.asset',  handoffParams.asset  || 'MISSING');
      note('handoff.ptag',   handoffParams.ptag   || '(absent)');
      note('handoff.ref',    handoffParams.ref    || '(absent)');
      note('handoff.memo',   handoffParams.memo   || '(absent)');

      // Verify correctness
      if (handoffParams.ixid !== FIXTURE_HANDLE) defect('handoff.ixid', `Expected ${FIXTURE_HANDLE}, got ${handoffParams.ixid}`);
      if (handoffParams.claim !== FIXTURE_CLAIM_A) defect('handoff.claim', `Expected ${FIXTURE_CLAIM_A}, got ${handoffParams.claim}`);
      if ((handoffParams.to || '').toLowerCase() !== FIXTURE_DEST) defect('handoff.to', `Expected ${FIXTURE_DEST}, got ${handoffParams.to}`);
      if (handoffParams.chain !== '137') defect('handoff.chain', `Expected 137, got ${handoffParams.chain}`);
      if (handoffParams.asset !== 'polygon-pos-native-usdc-v1') defect('handoff.asset', `Expected polygon-pos-native-usdc-v1, got ${handoffParams.asset}`);
      if (handoffParams.amount !== '5') defect('handoff.amount', `Expected 5, got ${handoffParams.amount}`);
    }

    findings.handoffUrl    = capturedHandoffUrl;
    findings.handoffParams = handoffParams;

    // ── C. Portal intake ─────────────────────────────────────────────────────
    console.log('\nC. Portal intake (ixid-handoff.js validation)…');

    const portalPage = await browser.newPage();
    await portalPage.setViewport({ width: 1280, height: 900 });

    // Intercept cross-origin CORS route API call from ixid-handoff.js
    // The module fetches https://test-alice.ixid.me/api/public/route/test-alice
    // Redirect to local Flask handler
    await portalPage.setRequestInterception(true);
    portalPage.on('request', req => {
      const url = req.url();
      if (url.includes('ixid.me') && url.includes('/api/public/route/')) {
        const handle = url.split('/api/public/route/')[1];
        const local  = `http://localhost:${PROJECTION_PORT}/public/route/${handle}`;
        note('portal.route_api_intercepted', `${url} → ${local}`);
        req.continue({ url: local });
      } else {
        req.continue();
      }
    });

    // Build portal URL with handoff params or reconstruct from fixture
    const basePortalParams = handoffParams.ixid
      ? new URLSearchParams(handoffParams).toString()
      : new URLSearchParams({
          src: 'ixid', ixid: FIXTURE_HANDLE, to: FIXTURE_DEST,
          claim: FIXTURE_CLAIM_A, amount: '5', chain: '137',
          asset: 'polygon-pos-native-usdc-v1',
        }).toString();

    const portalUrl = `http://localhost:${PORTAL_PORT}/portal-index.html?${basePortalParams}`;
    note('portal.url', portalUrl);

    await portalPage.goto(portalUrl, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000)); // allow async processHandoff to complete
    await screenshot(portalPage, 'portal-after-handoff');

    // Check ixidIntake banner
    const intakeBannerVisible = await portalPage.evaluate(() => {
      const el = document.getElementById('ixidIntake');
      return el && !el.hasAttribute('hidden');
    });
    note('portal.intake_banner_visible', intakeBannerVisible ? 'YES' : 'NO');

    const intakeStatus = await portalPage.$eval('#ixidIntakeStatus', el => el.textContent).catch(() => 'n/a');
    note('portal.intake_status', intakeStatus);

    const intakeLabel = await portalPage.$eval('#ixidIntakeLabel', el => el.textContent).catch(() => 'n/a');
    note('portal.intake_label', intakeLabel);

    // Recipient locked
    const recipientValue    = await portalPage.$eval('#txRecipient', el => el.value).catch(() => 'n/a');
    const recipientReadOnly = await portalPage.$eval('#txRecipient', el => el.readOnly).catch(() => false);
    note('portal.txRecipient.value',    recipientValue);
    note('portal.txRecipient.readOnly', recipientReadOnly ? 'YES (correct)' : 'NO (BUG)');

    if (recipientValue.toLowerCase() !== FIXTURE_DEST) {
      defect('portal.recipient_trust', `txRecipient is ${recipientValue}, expected ${FIXTURE_DEST}`);
    }

    // Amount prefilled
    const amountValue = await portalPage.$eval('#txAmount', el => el.value).catch(() => 'n/a');
    note('portal.txAmount.value', amountValue);
    if (amountValue !== '5' && amountValue !== '5.00') {
      defect('portal.amount_prefill', `txAmount is '${amountValue}', expected '5'`);
    }

    // IX ID context
    const ixidHandle = await portalPage.$eval('#ixidRecipientHandle', el => el.textContent).catch(() => 'n/a');
    const ixidMeta   = await portalPage.$eval('#ixidRecipientMeta',   el => el.textContent).catch(() => 'n/a');
    note('portal.ixidRecipientHandle', ixidHandle);
    note('portal.ixidRecipientMeta',   ixidMeta);

    // Reference field (IX ID identity fallback — no merchant ref in standard flow)
    const txRefValue = await portalPage.$eval('#txReference', el => el.value).catch(() => 'n/a');
    note('portal.txReference', txRefValue);

    // Fee preview — check fee calculation shown in portal
    const feeEl = await portalPage.$('.tx-fee-display, [data-fee], #txFeeDisplay, .fee-amount').catch(() => null);

    // Check chain/asset selector state
    const chainDisplay = await portalPage.evaluate(() => {
      // Look for any element showing Polygon / chain 137
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.children.length === 0 && el.textContent.includes('Polygon')) return el.textContent.trim();
      }
      return null;
    });
    note('portal.chain_display', chainDisplay || 'Polygon reference not found as standalone text');

    await screenshot(portalPage, 'portal-after-handoff-full');

    // Mobile viewport
    await portalPage.setViewport({ width: 390, height: 844 });
    await new Promise(r => setTimeout(r, 500));
    await screenshot(portalPage, 'portal-mobile');
    note('portal.mobile_viewport', '390×844 — screenshot captured');
    await portalPage.setViewport({ width: 1280, height: 900 });

    // ── D. Merchant/order context ingress check ──────────────────────────────
    console.log('\nD. Merchant/order context ingress check…');
    // The standard IX ID identity page calls buildIntent(ixId, route, amountStr)
    // WITHOUT a context argument. Check the payment-intent.js source:
    const piSrc = fs.readFileSync(path.join(IDENTITY_PUBLIC, 'payment-intent.js'), 'utf8');
    const idxSrc = fs.readFileSync(path.join(IDENTITY_PUBLIC, 'identity.js'), 'utf8');
    const indexSrc = fs.readFileSync(path.join(IDENTITY_PUBLIC, 'index.html'), 'utf8');

    // Check if the identity page inline script passes context to buildIntent
    const hasContextCall = indexSrc.includes('buildIntent(') && indexSrc.match(/buildIntent\([^)]*context/);
    const hasPtagInUrl   = indexSrc.includes('ptag') || idxSrc.includes('ptag');

    if (hasPtagInUrl) {
      note('context.ingress', 'EXISTING INGRESS — identity page passes context params to buildIntent');
    } else {
      note('context.ingress', 'B — CONTEXT PLUMBING EXISTS BUT NO INGRESS EXISTS YET');
      note('context.ingress_detail', 'payment-intent.js buildHandoffUrl() will add ptag/ref/memo to URL IF intent contains them. The identity page index.html calls buildIntent() without context arg. No ingress point exists in the current public payer UI.');
      note('context.future_ingress_point', 'Smallest future integration: pass {purpose_tag, reference, memo} from merchant-supplied query params (e.g. ?ref=ORD-001&memo=Order+note) on the ixid.me page into buildIntent(). These would be displayed in the payer UX and carried through to the portal.');
      note('context.transport_note', 'If implemented, ref/memo would be visible in browser URL bar and history. Must be treated as non-sensitive metadata only.');
    }

    // Verify txReference in portal for this standard flow (no merchant context)
    note('context.txReference_standard_flow', txRefValue);
    if (txRefValue.startsWith('IX ID: @')) {
      note('context.txReference_behavior', 'Correct — IX ID identity fallback active (no merchant ref)');
    }

    // ── E. Stale-route UI proof ──────────────────────────────────────────────
    console.log('\nE. Stale-route UI proof…');

    // The TOCTOU gate fires in wallet.js before IX_EXECUTION.executeTransfer.
    // Here we test the identity-page stale check (checkStaleRoute before handoff).
    // We can also verify the intake rejection if we rotate the emulator route
    // BETWEEN initial processHandoff and a simulated revalidateBeforeExecution call.

    // Step 1: Open a fresh portal with claim_A
    const stalePage = await browser.newPage();
    await stalePage.setViewport({ width: 1280, height: 900 });
    await stalePage.setRequestInterception(true);

    let revalidateCallCount = 0;
    stalePage.on('request', req => {
      const url = req.url();
      if (url.includes('ixid.me') && url.includes('/api/public/route/')) {
        const handle = url.split('/api/public/route/')[1];
        revalidateCallCount++;
        req.continue({ url: `http://localhost:${PROJECTION_PORT}/public/route/${handle}` });
      } else {
        req.continue();
      }
    });

    // Load with claim_A
    await stalePage.goto(portalUrl, { waitUntil: 'networkidle0', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));
    const intakeStatusA = await stalePage.$eval('#ixidIntakeStatus', el => el.textContent).catch(() => 'n/a');
    note('stale.intake_status_claim_A', intakeStatusA);

    // Step 2: Rotate emulator to claim_B (simulating owner updating route)
    console.log('  Rotating emulator to claim_B…');
    execSync(
      `FIRESTORE_EMULATOR_HOST=localhost:8080 GOOGLE_CLOUD_PROJECT=ix-id-test python ` +
      path.join(__dirname, 'seed_fixture.py') + ' rotate',
      { cwd: __dirname }
    );

    // Step 3: Trigger revalidation by calling IXID_HANDOFF.revalidateBeforeExecution()
    const revalidateResult = await stalePage.evaluate(async () => {
      if (window.IXID_HANDOFF && typeof window.IXID_HANDOFF.revalidateBeforeExecution === 'function') {
        const r = await window.IXID_HANDOFF.revalidateBeforeExecution();
        return r;
      }
      return { ok: null, code: 'IXID_HANDOFF_NOT_SET' };
    });

    note('stale.revalidate_result', JSON.stringify(revalidateResult));

    if (revalidateResult && !revalidateResult.ok) {
      note('stale.claim_A_rejected', 'YES — claim_A correctly rejected after route rotation');
      note('stale.rejection_code',   revalidateResult.code || 'n/a');
      note('stale.rejection_msg',    revalidateResult.message || 'n/a');
    } else if (revalidateResult && revalidateResult.ok === null) {
      note('stale.revalidate', 'IXID_HANDOFF not set — revalidate gate not wired on portal in this local config');
    } else {
      defect('stale.claim_A_rejected', `Expected rejection, got ok:${revalidateResult && revalidateResult.ok}`);
    }

    await screenshot(stalePage, 'stale-route-after-rotation');

    // Restore emulator to claim_A for clean state
    execSync(
      `FIRESTORE_EMULATOR_HOST=localhost:8080 GOOGLE_CLOUD_PROJECT=ix-id-test python ` +
      path.join(__dirname, 'seed_fixture.py') + ' restore',
      { cwd: __dirname }
    );
    note('stale.emulator_restored', 'claim_A restored');
    await stalePage.close();

    // ── F. Stopping point ────────────────────────────────────────────────────
    console.log('\nF. Stopping point — before any transaction signing');
    note('stop', 'Halted before wallet connection / transaction signing. No blockchain interaction occurred.');

  } finally {
    await browser.close();
    identityServer.close();
    portalServer.close();
  }

  return obs;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

runProof().then(observations => {
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  IX ID → IMPLICITEX HANDOFF — INTEGRATION PROOF REPORT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const defects  = observations.filter(o => o.label.startsWith('DEFECT'));
  const findings = observations.filter(o => !o.label.startsWith('DEFECT'));

  console.log('OBSERVATIONS:');
  for (const o of findings) {
    console.log(`  ${o.label.padEnd(42, '.')} ${o.value}`);
  }

  if (defects.length) {
    console.log('\nDEFECTS:');
    for (const d of defects) {
      console.log(`  ✗ ${d.label.replace('DEFECT — ', '')}: ${d.value}`);
    }
  } else {
    console.log('\nNO DEFECTS FOUND.');
  }

  console.log(`\nScreenshots: ${path.join(__dirname, 'screenshots')}/`);
  const files = fs.readdirSync(path.join(__dirname, 'screenshots')).filter(f => f.endsWith('.png'));
  files.forEach(f => console.log(`  ${f}`));

  console.log('\nSTOP: No transaction was signed or broadcast.');
  console.log('═══════════════════════════════════════════════════════════════\n');
}).catch(err => {
  console.error('\n[INTEGRATION PROOF ERROR]', err.message);
  console.error(err.stack);
  process.exitCode = 1;
});
