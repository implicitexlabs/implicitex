/**
 * portal-install.js
 *
 * Install affordance for portal.implicitex.com.
 * Uses the browser's native install prompt when available and falls back to
 * inline instructions in the portal footer.
 */

(function () {
  'use strict';

  var installBtn = document.getElementById('portalInstallBtn');
  var morePanel = document.getElementById('portalFooterMore');
  var deferredPrompt = null;

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

  function syncInstallButton() {
    if (!installBtn) return;

    if (isStandalone()) {
      installBtn.hidden = true;
      return;
    }

    installBtn.hidden = false;
    installBtn.setAttribute(
      'aria-label',
      deferredPrompt
        ? 'Install ImplicitEx Transfer Portal'
        : 'Show ImplicitEx Transfer Portal install instructions'
    );
    installBtn.title = deferredPrompt
      ? 'Install ImplicitEx Transfer Portal'
      : 'Show install instructions';
  }

  function openInstallHelp() {
    if (morePanel && !morePanel.open) {
      morePanel.open = true;
    }

    if (morePanel && typeof morePanel.scrollIntoView === 'function') {
      morePanel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  if (installBtn) {
    installBtn.addEventListener('click', function () {
      if (!deferredPrompt) {
        openInstallHelp();
        return;
      }

      try {
        deferredPrompt.prompt();
      } catch (error) {
        openInstallHelp();
        return;
      }

      Promise.resolve(deferredPrompt.userChoice)
        .then(function (choiceResult) {
          deferredPrompt = null;
          syncInstallButton();

          if (!choiceResult || choiceResult.outcome !== 'accepted') {
            openInstallHelp();
          }
        })
        .catch(function () {
          deferredPrompt = null;
          syncInstallButton();
          openInstallHelp();
        });
    });
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    deferredPrompt = event;
    syncInstallButton();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    syncInstallButton();
  });

  document.addEventListener('DOMContentLoaded', function () {
    syncInstallButton();
  });

  syncInstallButton();
})();
