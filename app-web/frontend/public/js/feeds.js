/**
 * feeds.js — ImplicitEx news and network feed module
 *
 * Current state: renders static fallback items.
 * Production: replace fetchFeeds() with your Python backend endpoint.
 */

(function () {
  'use strict';

  const FEED_ENDPOINT = '/api/feeds'; // Python backend route

  // Static fallback shown until backend is live
  const STATIC_FEEDS = [
    {
      source: 'Polygon',
      text:   'ImplicitEx is live on Polygon mainnet. Contract deployed and verified.',
    },
    {
      source: 'Circle',
      text:   'USDC on Polygon maintains full 1:1 USD redemption.',
    },
    {
      source: 'ImplicitEx',
      text:   'Live transfers enabled. 1% flat fee routed to treasury on execution.',
    },
  ];

  function renderFeeds(items) {
    const list = document.getElementById('feedList');
    if (!list) return;

    list.innerHTML = items.map(item => `
      <div class="feed-item">
        <p class="feed-src">${escapeHtml(item.source)}</p>
        <p class="feed-text">${escapeHtml(item.text)}</p>
      </div>
    `).join('');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function fetchFeeds() {
    // TODO (production): uncomment when Python backend /api/feeds is live
    // Expected response shape:
    // [{ "source": "Polygon", "text": "..." }, ...]
    //
    // try {
    //   const res  = await fetch(FEED_ENDPOINT);
    //   const data = await res.json();
    //   renderFeeds(data);
    // } catch (e) {
    //   renderFeeds(STATIC_FEEDS); // fallback on error
    // }

    // Static fallback (remove when backend is live)
    renderFeeds(STATIC_FEEDS);
  }

  // Init on load
  fetchFeeds();

  // Refresh every 5 minutes
  setInterval(fetchFeeds, 5 * 60 * 1000);

})();
