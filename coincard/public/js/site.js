(function () {
  'use strict';

  var header = document.querySelector('[data-site-header]');
  var navToggle = document.querySelector('[data-nav-toggle]');
  var navLinks = document.querySelector('[data-nav-links]');

  function updateHeader() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
  }

  if (header) {
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      var open = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!open));
      navLinks.classList.toggle('is-open', !open);
    });

    navLinks.addEventListener('click', function (event) {
      if (!event.target.closest('a')) return;
      navToggle.setAttribute('aria-expanded', 'false');
      navLinks.classList.remove('is-open');
    });
  }

  var handleForms = document.querySelectorAll('[data-handle-form]');
  handleForms.forEach(function (form) {
    var input = form.querySelector('[data-handle-input]');
    var error = form.parentElement.querySelector('[data-handle-error]');
    if (!input) return;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var handle = input.value.trim().toLowerCase()
        .replace(/^https?:\/\/coincard\.click\//, '')
        .replace(/^@/, '')
        .replace(/^\/+|\/+$/g, '');

      if (!/^[a-z0-9_-]{3,32}$/.test(handle)) {
        if (error) error.textContent = 'Enter a Coin Card handle using 3–32 letters, numbers, hyphens, or underscores.';
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }

      if (error) error.textContent = '';
      input.removeAttribute('aria-invalid');
      window.location.assign('/' + encodeURIComponent(handle) + '/');
    });
  });

  var amountInput = document.querySelector('[data-amount-input]');
  var amountButtons = document.querySelectorAll('[data-amount]');
  if (amountInput && amountButtons.length) {
    amountButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        amountInput.value = button.getAttribute('data-amount');
        amountButtons.forEach(function (candidate) { candidate.classList.remove('is-active'); });
        button.classList.add('is-active');
      });
    });
  }
})();
