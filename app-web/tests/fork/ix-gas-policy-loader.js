'use strict';

/**
 * ix-gas-policy-loader.js — Node-compatible loader for ix-execution-gas-policy.js.
 *
 * The canonical module is a browser IIFE that assigns to window.IX_EXECUTION_GAS_POLICY.
 * This adapter evaluates it in a vm sandbox with a stub window, then extracts the
 * COIN_CARD_POLYGON_V1 policy via the exported resolveGasPolicy API.
 *
 * The adapter must NOT copy any address, hash, fee, amount, precision, or gas-limit
 * literal. It must fail immediately if any required export or field is absent.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const POLICY_MODULE_PATH = path.resolve(
  __dirname,
  '../../frontend/public/js/ix-execution-gas-policy.js',
);

function loadCanonicalPolicy(overridePath) {
  const modulePath = overridePath || POLICY_MODULE_PATH;

  let src;
  try {
    src = fs.readFileSync(modulePath, 'utf8');
  } catch (err) {
    throw new Error(
      `ix-gas-policy-loader: cannot read policy module at ${modulePath}: ${err.message}`,
    );
  }

  // The module is a browser IIFE that assigns to window.IX_EXECUTION_GAS_POLICY.
  // Evaluate it in a sandbox with a stub window object.
  const sandbox = { window: {} };
  try {
    vm.runInNewContext(src, sandbox, { filename: modulePath });
  } catch (err) {
    throw new Error(
      `ix-gas-policy-loader: failed to evaluate policy module: ${err.message}`,
    );
  }

  const api = sandbox.window.IX_EXECUTION_GAS_POLICY;
  if (!api || typeof api !== 'object') {
    throw new Error(
      'ix-gas-policy-loader: IX_EXECUTION_GAS_POLICY not assigned to window after evaluation',
    );
  }

  if (!api.POLICY_IDS || typeof api.POLICY_IDS !== 'object') {
    throw new Error('ix-gas-policy-loader: POLICY_IDS not exported');
  }

  const policyId = api.POLICY_IDS.COIN_CARD_POLYGON_V1;
  if (typeof policyId !== 'string' || !policyId) {
    throw new Error('ix-gas-policy-loader: COIN_CARD_POLYGON_V1 not in POLICY_IDS');
  }

  if (typeof api.resolveGasPolicy !== 'function') {
    throw new Error('ix-gas-policy-loader: resolveGasPolicy not exported');
  }

  const policy = api.resolveGasPolicy(policyId);
  if (!policy || typeof policy !== 'object') {
    throw new Error(
      `ix-gas-policy-loader: resolveGasPolicy('${policyId}') returned null or non-object`,
    );
  }

  // The resolved policy object has shape { security, provenance }.
  // Validate that security and all required sub-fields exist and have the right types.
  const sec = policy.security;
  if (!sec || typeof sec !== 'object') {
    throw new Error("ix-gas-policy-loader: policy.security is missing or not an object");
  }

  function requireString(obj, path) {
    const parts = path.split('.');
    let cursor = obj;
    for (const part of parts) {
      if (!cursor || typeof cursor !== 'object') {
        throw new Error(`ix-gas-policy-loader: policy.security.${path} is missing`);
      }
      cursor = cursor[part];
    }
    if (typeof cursor !== 'string' || !cursor) {
      throw new Error(
        `ix-gas-policy-loader: policy.security.${path} must be a non-empty string, got ${JSON.stringify(cursor)}`,
      );
    }
    return cursor;
  }

  function requireFalse(obj, path) {
    const parts = path.split('.');
    let cursor = obj;
    for (const part of parts) {
      if (!cursor || typeof cursor !== 'object') {
        throw new Error(`ix-gas-policy-loader: policy.security.${path} is missing`);
      }
      cursor = cursor[part];
    }
    if (cursor !== false) {
      throw new Error(
        `ix-gas-policy-loader: policy.security.${path} must be false, got ${JSON.stringify(cursor)}`,
      );
    }
    return cursor;
  }

  // Token fields
  requireString(sec, 'token.address');
  requireString(sec, 'token.implementationSlot');
  requireString(sec, 'token.runtimeKeccak256');
  requireString(sec, 'token.implementationAddress');
  requireString(sec, 'token.implementationRuntimeKeccak256');

  // Execution contract fields
  requireString(sec, 'executionContract.address');
  requireString(sec, 'executionContract.runtimeKeccak256');
  requireString(sec, 'executionContract.treasuryAddress');
  requireFalse(sec, 'executionContract.paused');

  // Amount policy fields (stored as decimal strings in the module)
  requireString(sec, 'amountPolicy.feeBasisPoints');
  requireString(sec, 'amountPolicy.minimumRecipientAmountAtomic');
  requireString(sec, 'amountPolicy.maximumRecipientAmountAtomic');
  requireString(sec, 'amountPolicy.precisionIncrementAtomic');

  // Gas limits
  requireString(sec, 'gasLimits.approve');
  requireString(sec, 'gasLimits.transferWithFee');

  // chainId (stored as a number in the source constants, as string after normalization)
  const chainIdRaw = sec.chainId;
  if (
    typeof chainIdRaw !== 'string' &&
    typeof chainIdRaw !== 'number'
  ) {
    throw new Error(
      `ix-gas-policy-loader: policy.security.chainId must be a string or number, got ${typeof chainIdRaw}`,
    );
  }

  return Object.freeze({ policyId, policy });
}

module.exports = { loadCanonicalPolicy, POLICY_MODULE_PATH };
