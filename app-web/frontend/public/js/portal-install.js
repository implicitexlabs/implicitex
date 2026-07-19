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
  var browserLabel = document.getElementById('portalInstallBrowser');
  var actions = document.getElementById('portalInstallActions');
  var footerInstallLink = document.getElementById('portalFooterInstallLink');
  var deferredPrompt = null;
  var installedThisSession = false;
  var hasGuide = !!instructions;
  var hasInstallPage = !!promotion;

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

  function isAndroid() {
    return /Android/i.test(getUserAgent());
  }

  function isWindows() {
    return /Win/i.test((window.navigator && window.navigator.platform) || '') || /Windows/i.test(getUserAgent());
  }

  function isMac() {
    return /Mac/i.test((window.navigator && window.navigator.platform) || '') || /Mac OS X/i.test(getUserAgent());
  }

  function isLinux() {
    return /Linux/i.test((window.navigator && window.navigator.platform) || '') || /Linux/i.test(getUserAgent());
  }

  function isSafari() {
    var ua = getUserAgent().toLowerCase();
    return ua.indexOf('safari') !== -1
      && ua.indexOf('chrome') === -1
      && ua.indexOf('crios') === -1
      && ua.indexOf('fxios') === -1
      && ua.indexOf('edgios') === -1;
  }

  function isBrave() {
    var ua = getUserAgent().toLowerCase();
    try {
      if (window.navigator && window.navigator.brave) {
        return true;
      }
    } catch (error) {}
    return ua.indexOf('brave') !== -1;
  }

  function isEdge() {
    return /Edg\//i.test(getUserAgent());
  }

  function isFirefox() {
    return /Firefox\//i.test(getUserAgent());
  }

  function isChrome() {
    var ua = getUserAgent().toLowerCase();
    return ua.indexOf('chrome') !== -1
      && ua.indexOf('chromium') === -1
      && ua.indexOf('crios') === -1
      && ua.indexOf('edg/') === -1
      && ua.indexOf('opr/') === -1
      && ua.indexOf('opera') === -1
      && ua.indexOf('brave') === -1
      && !isSafari();
  }

  function getMode() {
    if (isStandalone()) return 'standalone';
    if (deferredPrompt) return 'prompt';
    if (isIOS()) return isSafari() ? 'ios-safari' : 'ios-browser';
    if (isAndroid()) return isChrome() ? 'android-chrome' : 'android-browser';
    if (isBrave()) return 'desktop-brave';
    if (isEdge()) return 'desktop-edge';
    if (isFirefox()) return isWindows() ? 'desktop-firefox-windows' : 'desktop-firefox-unsupported';
    if (isChrome()) return 'desktop-chrome';
    return 'desktop-generic';
  }

  function getBrowserLabel(mode) {
    if (mode === 'standalone') return 'Installed · this device';
    if (mode === 'prompt') return 'Install ready';
    if (mode === 'ios-safari') return 'Safari · iPhone or iPad';
    if (mode === 'ios-browser') return 'iPhone or iPad browser';
    if (mode === 'android-chrome') return 'Chrome · Android';
    if (mode === 'android-browser') return 'Android browser';
    if (mode === 'desktop-brave') return 'Brave · Desktop';
    if (mode === 'desktop-chrome') return 'Chrome · Desktop';
    if (mode === 'desktop-edge') return 'Edge · Desktop';
    if (mode === 'desktop-firefox-windows') return 'Firefox · Windows';
    if (mode === 'desktop-firefox-unsupported') return 'Firefox · macOS/Linux';
    return 'Desktop browser';
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

  function otherDevicesMarkup(mode) {
    if (mode === 'ios-safari' || mode === 'ios-browser') {
      return [
        '<p>On desktop, use your browser&rsquo;s install command or shortcut menu if it provides one.</p>',
        '<p>On Android, use Chrome&rsquo;s install icon or browser menu to create an app shortcut.</p>'
      ].join('');
    }

    if (mode.indexOf('desktop-') === 0 || mode === 'desktop-generic') {
      return [
        '<p>On iPhone or iPad, open this page in Safari and use Share &rarr; Add to Home Screen.</p>',
        '<p>On Android, open Chrome and use the browser menu or install icon.</p>'
      ].join('');
    }

    if (mode.indexOf('android-') === 0) {
      return [
        '<p>On iPhone or iPad, open this page in Safari and use Share &rarr; Add to Home Screen.</p>',
        '<p>On desktop, use your browser&rsquo;s install command or shortcut menu if it provides one.</p>'
      ].join('');
    }

    if (mode === 'standalone' || mode === 'prompt') {
      return [
        '<p>On iPhone or iPad, use Safari&rsquo;s Share button and Add to Home Screen.</p>',
        '<p>On desktop, use the browser&rsquo;s install command or shortcut menu if it offers one.</p>'
      ].join('');
    }

    return [
      '<p>Use the browser&rsquo;s install command or shortcut menu on each device you want to add.</p>'
    ].join('');
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
        '</ol>',
        '<details class="portal-install-other">',
        '<summary>Other devices</summary>',
        otherDevicesMarkup(mode),
        '</details>'
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
        '</ol>',
        '<details class="portal-install-other">',
        '<summary>Other devices</summary>',
        otherDevicesMarkup(mode),
        '</details>'
      ].join('');
    }

    if (mode === 'desktop-brave') {
      return [
        '<p>Install on this computer</p>',
        '<ol>',
        '<li>Open Brave&rsquo;s main menu.</li>',
        '<li>Choose Save and Share, then Install ImplicitEx.</li>',
        '<li>Confirm Install.</li>',
        '<li>If the address-bar install icon appears, use it instead.</li>',
        '</ol>',
        '<details class="portal-install-other">',
        '<summary>Other devices</summary>',
        otherDevicesMarkup(mode),
        '</details>'
      ].join('');
    }

    if (mode === 'desktop-chrome') {
      return [
        '<p>Install on this computer</p>',
        '<ol>',
        '<li>Open Chrome&rsquo;s main menu.</li>',
        '<li>Choose More, then Cast, save, and share.</li>',
        '<li>Choose Install page as app.</li>',
        '<li>Confirm Install.</li>',
        '<li>If Chrome shows an address-bar install icon, use that instead.</li>',
        '</ol>',
        '<details class="portal-install-other">',
        '<summary>Other devices</summary>',
        otherDevicesMarkup(mode),
        '</details>'
      ].join('');
    }

    if (mode === 'desktop-edge') {
      return [
        '<p>Install on this computer</p>',
        '<ol>',
        '<li>Open Edge&rsquo;s menu in the upper-right corner.</li>',
        '<li>Choose the app or install command for this page.</li>',
        '<li>Confirm Install.</li>',
        '<li>If Edge shows an address-bar install icon, use that instead.</li>',
        '</ol>',
        '<details class="portal-install-other">',
        '<summary>Other devices</summary>',
        otherDevicesMarkup(mode),
        '</details>'
      ].join('');
    }

    if (mode === 'desktop-firefox-windows') {
      return [
        '<p>Install on this Windows computer</p>',
        '<ol>',
        '<li>Open Firefox on Windows.</li>',
        '<li>Use the web-app button in the address bar.</li>',
        '<li>Confirm Add or Install.</li>',
        '</ol>',
        '<details class="portal-install-other">',
        '<summary>Other devices</summary>',
        otherDevicesMarkup(mode),
        '</details>'
      ].join('');
    }

    if (mode === 'desktop-firefox-unsupported') {
      return [
        '<p>Firefox web apps are supported on Windows.</p>',
        '<p>On macOS or Linux, create a normal desktop shortcut if you need one.</p>',
        '<details class="portal-install-other">',
        '<summary>Other devices</summary>',
        otherDevicesMarkup(mode),
        '</details>'
      ].join('');
    }

    if (mode === 'android-chrome') {
      return [
        '<p>Install on this Android device</p>',
        '<ol>',
        '<li>Open this page in Chrome.</li>',
        '<li>Tap Chrome&rsquo;s menu, then Add to Home screen.</li>',
        '<li>Choose Install when Chrome shows the install prompt.</li>',
        '<li>Confirm the install.</li>',
        '</ol>',
        '<details class="portal-install-other">',
        '<summary>Other devices</summary>',
        otherDevicesMarkup(mode),
        '</details>'
      ].join('');
    }

    if (mode === 'standalone') {
      return '<p>ImplicitEx is installed on this device.</p>';
    }

    if (mode === 'prompt') {
      return [
        '<p>Your browser can install ImplicitEx directly.</p>',
        '<p>Use the button below to trigger the browser prompt, or open the steps if you need the manual path.</p>',
        '<details class="portal-install-other">',
        '<summary>Other devices</summary>',
        otherDevicesMarkup(mode),
        '</details>'
      ].join('');
    }

    if (mode === 'desktop-generic' || mode === 'android-browser') {
      return [
        '<p>This browser does not support automatic installation.</p>',
        '<p>Use the browser&rsquo;s menu to create a shortcut if it offers one.</p>',
        '<details class="portal-install-other">',
        '<summary>Other devices</summary>',
        otherDevicesMarkup(mode),
        '</details>'
      ].join('');
    }

    return [
      '<p>This browser does not support automatic installation.</p>',
      '<p>Use the browser&rsquo;s menu to create a shortcut if it offers one.</p>',
      '<details class="portal-install-other">',
      '<summary>Other devices</summary>',
      otherDevicesMarkup(mode),
      '</details>'
    ].join('');
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

    if (mode === 'android-chrome') {
      return 'Chrome on Android can install ImplicitEx from More > Add to Home screen > Install.';
    }

    if (mode === 'desktop-brave') {
      return 'Brave can install ImplicitEx from Save and Share > Install ImplicitEx or the address-bar install icon.';
    }

    if (mode === 'desktop-chrome') {
      return 'Chrome can install ImplicitEx from More > Cast, save, and share > Install page as app.';
    }

    if (mode === 'desktop-edge') {
      return 'Edge can install ImplicitEx from its menu or address-bar install icon.';
    }

    if (mode === 'desktop-firefox-windows') {
      return 'Firefox on Windows can install ImplicitEx from the address-bar web-app button.';
    }

    if (mode === 'desktop-firefox-unsupported') {
      return 'Firefox web apps are available on Windows; on macOS or Linux, create a normal desktop shortcut if needed.';
    }

    if (mode === 'standalone') {
      return 'ImplicitEx is installed on this device.';
    }

    if (mode === 'desktop-generic') {
      return 'This browser does not support automatic installation.';
    }

    if (mode === 'android-browser') {
      return 'Use your browser’s menu to create a shortcut or install ImplicitEx if it offers one.';
    }

    return 'This browser does not support automatic installation.';
  }

  function showInstructions(mode) {
    if (!instructions) return;

    instructions.innerHTML = instructionMarkup(mode);
    instructions.hidden = false;
    setExpanded(false);
  }

  function syncPromotion() {
    if (!actionBtn) return;

    var installedState = isStandalone() || installedThisSession;
    var mode = installedState ? 'standalone' : getMode();
    var browserState = installedState ? 'Installed · this device' : getBrowserLabel(mode);
    var statusState = installedState ? 'ImplicitEx is installed on this device.' : statusCopy(mode);

    if (browserLabel) {
      browserLabel.textContent = browserState;
    }

    if (hasInstallPage) {
      setHidden(promotion, false);

      if (status) {
        status.textContent = statusState;
        status.hidden = false;
      }

      if (installedState) {
        setHidden(actions, false);
        actionBtn.hidden = false;
        actionBtn.textContent = 'Open Transfer Portal';
        actionBtn.title = 'Open Transfer Portal';
        actionBtn.setAttribute('aria-label', 'Open Transfer Portal');
        if (helpBtn) {
          helpBtn.hidden = true;
        }
        hideInstructions();
        return;
      }

      if (mode === 'prompt') {
        setHidden(actions, false);
        actionBtn.hidden = false;
        actionBtn.textContent = 'Install on this device';
        actionBtn.title = 'Install on this device';
        actionBtn.setAttribute('aria-label', 'Install on this device');
        if (helpBtn) {
          helpBtn.hidden = false;
          helpBtn.textContent = 'Show installation steps';
          helpBtn.title = 'Show installation steps';
          helpBtn.setAttribute('aria-label', 'Show installation steps');
        }
        hideInstructions();
        return;
      }

      setHidden(actions, true);
      actionBtn.hidden = true;
      if (helpBtn) {
        helpBtn.hidden = true;
      }
      if (instructions) {
        instructions.innerHTML = instructionMarkup(mode);
        instructions.hidden = false;
        setExpanded(true);
      }
      return;
    }

    var hidden = installedState;
    if (promotion) {
      setHidden(promotion, hidden);
    }
    setHidden(actionBtn, hidden);
    setHidden(footerInstallLink, hidden);

    if (hidden) {
      if (hasGuide) {
        hideInstructions();
        if (status) {
          status.textContent = '';
          status.hidden = true;
        }
      }
      return;
    }

    if (!hasGuide) {
      actionBtn.textContent = '';
      actionBtn.title = 'Install ImplicitEx';
      actionBtn.setAttribute('aria-label', 'Install ImplicitEx');
      return;
    }

    actionBtn.textContent = 'Install ImplicitEx';
    actionBtn.title = deferredPrompt ? 'Install ImplicitEx' : 'Show installation instructions';
    actionBtn.setAttribute('aria-label', deferredPrompt ? 'Install ImplicitEx' : 'Show installation instructions');

    if (status) {
      status.textContent = statusCopy(mode);
      status.hidden = false;
    }

    if (helpBtn) {
      helpBtn.hidden = false;
      helpBtn.textContent = 'Show installation instructions';
      helpBtn.title = 'Show installation instructions';
      helpBtn.setAttribute('aria-label', 'Show installation instructions');
    }
    setHidden(actions, false);
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

  if (actionBtn) {
    actionBtn.addEventListener('click', function () {
      var installedState = isStandalone() || installedThisSession;
      var mode = installedState ? 'standalone' : getMode();

      if (hasInstallPage && installedState) {
        window.location.assign('/portal-index.html');
        return;
      }

      if (isStandalone() && !hasInstallPage) {
        return;
      }

      if (!deferredPrompt) {
        if (hasInstallPage) {
          return;
        }

        if (hasGuide) {
          openOrToggleInstructions();
        } else {
          window.location.assign('/install.html');
        }
        return;
      }

      try {
        deferredPrompt.prompt();
      } catch (error) {
        if (hasGuide) {
          openOrToggleInstructions();
        } else {
          window.location.assign('/install.html');
        }
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
            if (!hasInstallPage && promotion) {
              setHidden(promotion, true);
            }
            if (!hasInstallPage) {
              hideInstructions();
              if (status) {
                status.textContent = '';
                status.hidden = true;
              }
            }
            return;
          }

          if (hasGuide && !hasInstallPage) {
            openOrToggleInstructions();
          }
        })
        .catch(function () {
          deferredPrompt = null;
          syncPromotion();
          if (hasGuide && !hasInstallPage) {
            openOrToggleInstructions();
          }
        });
    });
  }

  if (hasGuide && helpBtn) {
    helpBtn.addEventListener('click', function () {
      if (isStandalone() && !hasInstallPage) {
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
    if (hasInstallPage) {
      syncPromotion();
      return;
    }
    setHidden(promotion, true);
    setHidden(footerInstallLink, true);
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
