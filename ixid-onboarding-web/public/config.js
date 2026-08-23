(function configureIxIdOnboarding(root) {
  'use strict';

  // Single reviewable public configuration boundary for IX ID onboarding.
  // Firebase web configuration is public, but production values are deliberately
  // absent from this local-only Slice E implementation. Activation is a later,
  // separately reviewed operation after Slices C, D, and F are complete.
  root.IXID_ONBOARDING_CONFIG = Object.freeze({
    enabled: false,
    holderApiBase: '/api/holder/v0.1',
    actionContinueUrl: 'https://app.ixid.me/register',
    firebase: Object.freeze({
      sdkVersion: '12.17.1',
      options: null,
    }),
  });
}(typeof globalThis !== 'undefined' ? globalThis : window));
