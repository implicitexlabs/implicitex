/* ============================================================
   ImplicitEx — news-data.js
   Canonical article store. Loaded by index.html (last 3
   preview cards) and news.html (full article listing).

   Ordering: oldest first. The homepage slice takes the last
   N entries so new articles go at the bottom of this array.

   Article schema:
     id        – URL-safe slug used as anchor on news.html
     date      – human-readable display date
     dateIso   – YYYY-MM-DD for <time> datetime attribute
     category  – Platform | Policy | Regulation | Opinion | Analysis
     title     – article headline
     lede      – first paragraph shown in the preview card
     body      – array of paragraph strings (full article body,
                 including the lede as the first entry)
   ============================================================ */

var IX_NEWS = [

  {
    id:       'soft-launch-june-2026',
    date:     'June 2, 2026',
    dateIso:  '2026-06-02',
    category: 'Platform',
    title:    'Live transfer smoke complete',
    lede:     'ImplicitEx transfer execution is live on Polygon mainnet under a limited soft-launch scope. The hardened contract has been deployed, source-verified, and smoke-tested on-chain with real USDC.',
    body: [
      'ImplicitEx transfer execution is live on Polygon mainnet under a limited soft-launch scope. The hardened contract has been deployed, source-verified, and smoke-tested on-chain with real USDC.',
      'Current launch controls: 1% platform fee, 250 USDC soft-launch cap, non-custodial wallet execution, and continued production readiness review. No custody. No escrow. Funds move directly between wallets.'
    ]
  }

  /* ── Add new articles below this line, oldest → newest ── */

];
