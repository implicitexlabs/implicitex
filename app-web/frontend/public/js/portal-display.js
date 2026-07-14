(function () {
  'use strict';

  var fullscreenBtn = document.getElementById('portalFullscreenAction');
  var fullscreenEnterIcon = document.querySelector('.portal-fullscreen-icon--enter');
  var fullscreenExitIcon = document.querySelector('.portal-fullscreen-icon--exit');
  var displayMenu = document.getElementById('portalDisplayMenu');
  var displayMenuToggle = document.getElementById('portalDisplayMenuToggle');
  var displayPanel = document.getElementById('portalDisplayPanel');
  var wakeLockToggle = document.getElementById('portalWakeLockToggle');
  var wakeLockState = document.getElementById('portalWakeLockState');
  var wakeLockStatus = document.getElementById('portalWakeLockStatus');
  var modules = document.getElementById('modules');
  var minimizeBtn = document.getElementById('modulesMinimize');

  var fullscreenUnavailable = false;
  var wakeLockRequested = false;
  var wakeLockUnsupported = false;
  var wakeLockActivationFailed = false;
  var wakeLockSentinel = null;
  var wakeLockRequestPromise = null;
  var pageIsClosing = false;

  function hasFullscreenSupport() {
    return !!(modules && typeof modules.requestFullscreen === 'function' && document.fullscreenEnabled !== false);
  }

  function isFullscreenActive() {
    return !!document.fullscreenElement;
  }

  function isPortalCollapsed() {
    return !!(modules && modules.classList && modules.classList.contains('is-minimized'));
  }

  function setMenuOpen(open) {
    if (!displayPanel || !displayMenuToggle) return;
    displayPanel.hidden = !open;
    displayMenuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  function syncFullscreenUi() {
    var active = isFullscreenActive();
    var supported = hasFullscreenSupport();
    var available = supported && !fullscreenUnavailable;
    var label = active ? 'Exit fullscreen' : (available ? 'Enter fullscreen' : 'Fullscreen unavailable on this device');

    if (fullscreenBtn) {
      fullscreenBtn.disabled = !available && !active;
      fullscreenBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
      fullscreenBtn.setAttribute('aria-label', label);
      fullscreenBtn.setAttribute('title', label);
      fullscreenBtn.setAttribute('aria-disabled', (!available && !active) ? 'true' : 'false');
    }

    if (fullscreenEnterIcon) {
      fullscreenEnterIcon.hidden = active;
    }
    if (fullscreenExitIcon) {
      fullscreenExitIcon.hidden = !active;
    }
  }

  function renderWakeLockUi() {
    var supported = !!(navigator && navigator.wakeLock && navigator.wakeLock.request);
    var active = !!wakeLockSentinel;
    var requested = wakeLockRequested;
    var unavailable = !supported || wakeLockUnsupported;
    var failed = wakeLockActivationFailed;
    var paused = requested && !active && !unavailable && !failed;
    var stateText = 'Off';
    var statusText = '';

    if (wakeLockToggle) {
      wakeLockToggle.checked = requested;
      wakeLockToggle.disabled = unavailable;
      wakeLockToggle.setAttribute('aria-disabled', unavailable ? 'true' : 'false');
    }

    if (wakeLockState) {
      if (unavailable) {
        stateText = 'Unavailable';
      } else if (failed) {
        stateText = 'Could not activate';
      } else if (active) {
        stateText = 'On';
      } else if (paused) {
        stateText = 'Paused';
      }

      wakeLockState.textContent = stateText;
    }

    if (wakeLockStatus) {
      if (unavailable) {
        statusText = 'Unavailable on this device.';
      } else if (failed) {
        statusText = 'Could not keep screen awake.';
      } else if (active) {
        statusText = 'Screen is being kept awake for this session.';
      } else if (paused) {
        statusText = 'Wake lock is paused until the portal is visible again.';
      }

      wakeLockStatus.hidden = !statusText;
      wakeLockStatus.textContent = statusText;
    }
  }

  function releaseWakeLock() {
    var sentinel = wakeLockSentinel;
    wakeLockSentinel = null;

    if (sentinel && typeof sentinel.release === 'function') {
      try {
        sentinel.release();
      } catch (error) {}
    }
  }

  function shouldHoldWakeLock() {
    return wakeLockRequested && !document.hidden && !isPortalCollapsed() && !pageIsClosing;
  }

  function onWakeLockRelease() {
    wakeLockSentinel = null;
    renderWakeLockUi();

    if (shouldHoldWakeLock()) {
      requestWakeLock();
    }
  }

  function requestWakeLock() {
    if (!navigator || !navigator.wakeLock || typeof navigator.wakeLock.request !== 'function') {
      wakeLockUnsupported = true;
      wakeLockActivationFailed = false;
      wakeLockRequested = false;
      releaseWakeLock();
      renderWakeLockUi();
      return Promise.resolve();
    }

    if (!shouldHoldWakeLock() || wakeLockSentinel || wakeLockRequestPromise) {
      renderWakeLockUi();
      return wakeLockRequestPromise || Promise.resolve();
    }

    wakeLockRequestPromise = Promise.resolve()
      .then(function () {
        return navigator.wakeLock.request('screen');
      })
      .then(function (sentinel) {
        wakeLockRequestPromise = null;

        if (!shouldHoldWakeLock()) {
          try {
            if (sentinel && typeof sentinel.release === 'function') {
              sentinel.release();
            }
          } catch (error) {}
          renderWakeLockUi();
          return;
        }

        wakeLockSentinel = sentinel;
        wakeLockUnsupported = false;
        wakeLockActivationFailed = false;

        if (wakeLockSentinel && typeof wakeLockSentinel.addEventListener === 'function') {
          wakeLockSentinel.addEventListener('release', onWakeLockRelease);
        }

        renderWakeLockUi();
      })
      .catch(function () {
        wakeLockRequestPromise = null;
        wakeLockActivationFailed = true;
        wakeLockRequested = false;
        releaseWakeLock();
        renderWakeLockUi();
      });

    return wakeLockRequestPromise;
  }

  function syncWakeLock() {
    if (!wakeLockRequested) {
      releaseWakeLock();
      renderWakeLockUi();
      return;
    }

    if (document.hidden || isPortalCollapsed()) {
      releaseWakeLock();
      renderWakeLockUi();
      return;
    }

    requestWakeLock();
  }

  function setFullscreenState(nextActive) {
    if (fullscreenUnavailable && !nextActive) {
      syncFullscreenUi();
      return Promise.resolve();
    }

    if (nextActive) {
      if (!hasFullscreenSupport()) {
        fullscreenUnavailable = true;
        syncFullscreenUi();
        return Promise.resolve();
      }

      try {
        return Promise.resolve((modules || document.documentElement).requestFullscreen()).catch(function () {
          fullscreenUnavailable = true;
          syncFullscreenUi();
        });
      } catch (error) {
        fullscreenUnavailable = true;
        syncFullscreenUi();
        return Promise.resolve();
      }
    }

    if (typeof document.exitFullscreen !== 'function') {
      syncFullscreenUi();
      return Promise.resolve();
    }

    try {
      return Promise.resolve(document.exitFullscreen()).catch(function () {
        syncFullscreenUi();
      });
    } catch (error2) {
      syncFullscreenUi();
      return Promise.resolve();
    }
  }

  function toggleFullscreen() {
    if (!fullscreenBtn || fullscreenBtn.disabled) return;
    if (isFullscreenActive()) {
      setFullscreenState(false);
    } else {
      closeMenu();
      setFullscreenState(true);
    }
  }

  function updateMenuButtonState() {
    if (!displayMenuToggle) return;
    displayMenuToggle.setAttribute('aria-expanded', displayPanel && !displayPanel.hidden ? 'true' : 'false');
  }

  function toggleMenu() {
    if (!displayPanel || !displayMenuToggle) return;
    setMenuOpen(displayPanel.hidden);
  }

  function onDocumentClick(event) {
    if (!displayMenu || displayPanel.hidden) return;
    if (!displayMenu.contains(event.target)) {
      closeMenu();
    }
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      if (displayPanel && !displayPanel.hidden) {
        closeMenu();
      }
    }
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleFullscreen);
  }

  if (displayMenuToggle) {
    displayMenuToggle.addEventListener('click', function () {
      toggleMenu();
    });
  }

  if (wakeLockToggle) {
    wakeLockToggle.addEventListener('change', function () {
      wakeLockActivationFailed = false;
      wakeLockRequested = !!wakeLockToggle.checked;

      if (!wakeLockRequested) {
        releaseWakeLock();
        renderWakeLockUi();
        return;
      }

      syncWakeLock();
    });
  }

  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', function () {
      window.requestAnimationFrame(function () {
        syncWakeLock();
        if (isPortalCollapsed()) {
          closeMenu();
        }
      });
    });
  }

  document.addEventListener('fullscreenchange', function () {
    syncFullscreenUi();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      releaseWakeLock();
      renderWakeLockUi();
      return;
    }

    syncWakeLock();
  });

  document.addEventListener('pagehide', function () {
    pageIsClosing = true;
    releaseWakeLock();
    renderWakeLockUi();
  });

  document.addEventListener('keydown', onKeydown);
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('beforeunload', function () {
    pageIsClosing = true;
    releaseWakeLock();
    renderWakeLockUi();
  });

  if (!hasFullscreenSupport()) {
    fullscreenUnavailable = true;
  }

  syncFullscreenUi();
  renderWakeLockUi();
  updateMenuButtonState();
  closeMenu();
})();
