/**
 * app.js — ImplicitEx application init
 * Runs after all other scripts.
 */

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // Logo mark
  // Builds a pixel grid from a pattern until the real logomark SVG
  // is dropped into assets/logomark.svg and the <img> tag is
  // uncommented in index.html.
  // ----------------------------------------------------------------
  function buildLogoMark() {
    const el = document.getElementById('logoMark');
    if (!el) return;

    // 5×4 pixel pattern — replace with actual logomark geometry
    // 1 = filled pixel, 0 = empty
    const pattern = [
      1, 0, 1, 0, 1,
      1, 1, 0, 1, 0,
      0, 1, 1, 0, 1,
      1, 0, 1, 1, 0,
    ];

    el.style.cssText = [
      'display:grid',
      'grid-template-columns:repeat(5,4px)',
      'grid-template-rows:repeat(4,4px)',
      'gap:2px',
      'width:26px',
      'height:22px',
      'align-content:center',
    ].join(';');

    pattern.forEach(on => {
      const px = document.createElement('span');
      px.style.cssText = [
        'display:block',
        on
          ? 'background:rgba(242,242,240,1)'
          : 'background:transparent',
      ].join(';');
      el.appendChild(px);
    });
  }

  // ----------------------------------------------------------------
  // Init
  // ----------------------------------------------------------------
  function init() {
    buildLogoMark();

    // Swap logo placeholder for real logomark when asset exists
    // Uncomment the lines below and comment out buildLogoMark() above:
    //
    // const placeholder = document.getElementById('logoMark');
    // const img = document.createElement('img');
    // img.src = 'assets/logomark.svg';
    // img.className = 'logo-mark';
    // img.alt = '';
    // img.setAttribute('aria-hidden', 'true');
    // placeholder.replaceWith(img);
  }

  document.addEventListener('DOMContentLoaded', init);

})();
