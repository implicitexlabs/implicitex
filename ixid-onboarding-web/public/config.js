(function configureIxIdOnboarding(root) {
  'use strict';

  // Single reviewable public configuration boundary for IX ID onboarding.
  // Firebase web SDK config values are public by design (client-side only).
  // Retrieved 2026-08-26 from ixid-prod project via Firebase Management API.
  //
  // Remaining activation step (must be done in Firebase Console):
  //   Authentication → Templates → Email address verification → Action URL
  //   Set to: https://app.ixid.me/auth/action
  //   (EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED blocks programmatic update for
  //   Identity Platform projects via the Admin v2 API)
  root.IXID_ONBOARDING_CONFIG = Object.freeze({
    enabled: false,
    holderApiBase: '/api/holder/v0.1',
    actionContinueUrl: 'https://app.ixid.me/register',
    firebase: Object.freeze({
      sdkVersion: '12.17.1',
      options: Object.freeze({
        apiKey: 'AIzaSyBXS69-zFK7lSCKb97omysJ4tJPE05G3bE',
        authDomain: 'ixid-prod.firebaseapp.com',
        projectId: 'ixid-prod',
        storageBucket: 'ixid-prod.firebasestorage.app',
        messagingSenderId: '551374626488',
        appId: '1:551374626488:web:61f555cd27815373ff9e4d',
      }),
    }),
  });
}(typeof globalThis !== 'undefined' ? globalThis : window));
