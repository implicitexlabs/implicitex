/**
 * Firebase Functions entry point — Coin Card backend.
 *
 * The routing spike remains isolated under src/spikes. The wallet challenge
 * exports are production-shaped but are not wired into the production
 * firebase.json until their emulator/security gate is approved.
 */

'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');

// Initialize the admin SDK once; emulator environment variables take effect
// before this module is loaded when running under firebase emulators:start.
if (getApps().length === 0) {
  initializeApp();
}

// Spike function: proves Hosting rewrite routing for the registryRead gate.
// This export is NOT the production coincard-registry-read function.
// It will be removed when the production function is implemented at step 7
// of the implementation sequence.
const { spikeRegistryRead } = require('./src/spikes/coincard-registry-read-spike');
exports.spikeRegistryRead = spikeRegistryRead;

const {
  coincardWalletChallenge,
  coincardWalletVerify,
} = require('./src/wallet-challenge/functions');
exports.coincardWalletChallenge = coincardWalletChallenge;
exports.coincardWalletVerify = coincardWalletVerify;
