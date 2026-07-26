'use strict';

const admin = require('firebase-admin');

// Initialize the admin SDK once; emulator environment variables take effect
// before this module is loaded when running under firebase emulators:start.
if (!admin.apps.length) {
  admin.initializeApp();
}

const {
  coincardWalletChallenge,
  coincardWalletVerify,
} = require('./src/wallet-challenge/functions');
exports.coincardWalletChallenge = coincardWalletChallenge;
exports.coincardWalletVerify = coincardWalletVerify;
