'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');

// Initialize the admin SDK once; emulator environment variables take effect
// before this module is loaded when running under firebase emulators:start.
if (getApps().length === 0) {
  initializeApp();
}

const {
  coincardWalletChallenge,
  coincardWalletVerify,
} = require('./src/wallet-challenge/functions');
exports.coincardWalletChallenge = coincardWalletChallenge;
exports.coincardWalletVerify = coincardWalletVerify;
