/**
 * portal-install.js
 *
 * Install promotion for the portal.
 * Uses the browser's native install prompt when available and otherwise
 * shows browser-specific installation guidance inside the portal.
 */

(function () {
  'use strict';

  var promotion = document.getElementById('portalInstallPromotion');
  var actionBtn = document.getElementById('portalInstallAction');
  var helpBtn = document.getElementById('portalInstallHelp');
  var instructions = document.getElementById('portalInstallInstructions');
  var status = document.getElementById('portalInstallStatus');
  var deferredPrompt = null;
  var installedThisSession = false;
  var hasGuide = !!instructions;

  function isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
        return true;
      }
    } catch (error) {}

    try {
      return !!window.navigator.standalone;
    } catch (error2) {
      return false;
    }
  }

  function getUserAgent() {
    try {
      return String(window.navigator && window.navigator.userAgent || '');
    } catch (error) {
      return '';
    }
  }

  function isIOS() {
    var ua = getUserAgent();
    return /iPad|iPhone|iPod/i.test(ua) || (window.navigator && window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  }

  function isSafari() {
    var ua = getUserAgent().toLowerCase();
    return ua.indexOf('safari') !== -1
      && ua.indexOf('chrome') === -1
      && ua.indexOf('crios') === -1
      && ua.indexOf('fxios') === -1
      && ua.indexOf('edgios') === -1;
  }

  function getMode() {
    if (isStandalone()) return 'standalone';
    if (deferredPrompt) return 'prompt';
    if (isIOS()) return isSafari() ? 'ios-safari' : 'ios-browser';
    return 'desktop';
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.hidden = hidden;
  }

  function setExpanded(hidden) {
    if (!helpBtn) return;
    helpBtn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
  }

  function hideInstructions() {
    if (!instructions) return;
    instructions.hidden = true;
    instructions.innerHTML = '';
    setExpanded(true);
  }

  function instructionMarkup(mode) {
    if (mode === 'ios-safari') {
      return [
        '<p>Add ImplicitEx to your iPhone or iPad</p>',
        '<ol>',
        '<li>Open this page in Safari.</li>',
        '<li>Tap Safari&rsquo;s Share button &mdash; the square with the upward arrow.</li>',
        '<li>Tap View More when Add to Home Screen is not immediately visible.</li>',
        '<li>Select Add to Home Screen.</li>',
        '<li>Leave Open as Web App enabled.</li>',
        '<li>Tap Add.</li>',
        '</ol>'
      ].join('');
    }

    if (mode === 'ios-browser') {
      return [
        '<p>Open this page in Safari to add ImplicitEx as a Home Screen web app.</p>',
        '<ol>',
        '<li>Open this page in Safari.</li>',
        '<li>Tap Safari&rsquo;s Share button &mdash; the square with the upward arrow.</li>',
        '<li>Tap View More when Add to Home Screen is not immediately visible.</li>',
        '<li>Select Add to Home Screen.</li>',
        '<li>Leave Open as Web App enabled.</li>',
        '<li>Tap Add.</li>',
        '</ol>'
      ].join('');
    }

    if (mode === 'desktop') {
      return '<p>Use your browser&rsquo;s install icon or browser menu to install ImplicitEx or create an app shortcut.</p>';
    }

    return '<p>Add this portal as an app or shortcut using your browser&rsquo;s page or installation menu.</p>';
  }

  function statusCopy(mode) {
    if (mode === 'prompt') {
      return 'Your browser can install ImplicitEx directly.';
    }

    if (mode === 'ios-safari') {
      return 'Safari installs this portal through Share and Add to Home Screen.';
    }

    if (mode === 'ios-browser') {
      return 'Open this page in Safari to install ImplicitEx as a Home Screen web app.';
    }

    if (mode === 'desktop') {
      return 'Use your browser’s install icon or menu to create an app shortcut.';
    }

    return 'Install this portal using your browser’s page or installation menu.';
  }

  function showInstructions(mode) {
    if (!instructions) return;

    instructions.innerHTML = instructionMarkup(mode);
    instructions.hidden = false;
    setExpanded(false);
  }

  function syncPromotion() {
    if (!promotion || !actionBtn) return;

    if (isStandalone() || installedThisSession) {
      setHidden(promotion, true);
      if (hasGuide) {
        hideInstructions();
        if (status) {
          status.textContent = '';
          status.hidden = true;
        }
      }
      return;
    }

    setHidden(promotion, false);

    if (!hasGuide) {
      return;
    }

    var mode = getMode();
    if (status) {
      status.textContent = statusCopy(mode);
      status.hidden = false;
    }

    actionBtn.textContent = 'Install ImplicitEx';
    actionBtn.title = deferredPrompt ? 'Install ImplicitEx' : 'Show installation instructions';
    actionBtn.setAttribute('aria-label', deferredPrompt ? 'Install ImplicitEx' : 'Show installation instructions');

    if (helpBtn) {
      helpBtn.hidden = false;
      helpBtn.title = 'Show installation instructions';
    }
  }

  function openOrToggleInstructions() {
    if (!hasGuide) return;

    var mode = getMode();

    if (!instructions) return;

    if (!instructions.hidden) {
      hideInstructions();
      return;
    }

    showInstructions(mode);
  }

  if (hasGuide && actionBtn) {
    actionBtn.addEventListener('click', function () {
      if (isStandalone()) {
        return;
      }

      if (!deferredPrompt) {
        openOrToggleInstructions();
        return;
      }

      try {
        deferredPrompt.prompt();
      } catch (error) {
        openOrToggleInstructions();
        return;
      }

      Promise.resolve(deferredPrompt.userChoice)
        .then(function (choiceResult) {
          deferredPrompt = null;
          if (choiceResult && choiceResult.outcome === 'accepted') {
            installedThisSession = true;
          }
          syncPromotion();

          if (choiceResult && choiceResult.outcome === 'accepted') {
            setHidden(promotion, true);
            hideInstructions();
            if (status) {
              status.textContent = '';
              status.hidden = true;
            }
            return;
          }

          openOrToggleInstructions();
        })
        .catch(function () {
          deferredPrompt = null;
          syncPromotion();
          openOrToggleInstructions();
        });
    });
  }

  if (hasGuide && helpBtn) {
    helpBtn.addEventListener('click', function () {
      if (isStandalone()) {
        return;
      }

      openOrToggleInstructions();
    });
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    syncPromotion();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    installedThisSession = true;
    setHidden(promotion, true);
    hideInstructions();
    if (status) {
      status.textContent = '';
      status.hidden = true;
    }
    syncPromotion();
  });

  document.addEventListener('DOMContentLoaded', function () {
    syncPromotion();
  });

  syncPromotion();
})();
