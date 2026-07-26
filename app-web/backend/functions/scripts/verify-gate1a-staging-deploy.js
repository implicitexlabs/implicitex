'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const STAGING_PROJECT_ID = 'implicitex-236f2';
const EXPECTED_EXPORTS = Object.freeze([
  'coincardWalletChallenge',
  'coincardWalletVerify',
]);
const EXPECTED_CODEBASE = 'coincard-gate1a-staging';
const EXPECTED_RUNTIME = 'nodejs22';
const EXPECTED_SOURCE = 'app-web/backend/functions';
const EXPECTED_RULES_PATH = 'app-web/backend/firestore.rules';
const EXPECTED_RULES_SHA256 =
  '9a17cc205e2285b25533516220459e4b024a7cb50162d80ad01e6cefaa2f17e2';
const EXPECTED_PREDEPLOY =
  'node "$PROJECT_DIR/app-web/backend/functions/scripts/verify-gate1a-staging-deploy.js"';
const REQUIRED_IGNORE_ENTRIES = Object.freeze([
  '.git',
  '.runtimeconfig.json',
  'firebase-debug.log',
  'firebase-debug.*.log',
  'node_modules',
  'src/spikes/**',
  'test/**',
  'scripts/**',
]);
const EXCEPTION_EXPIRATION = new Date('2026-08-25T06:00:00Z');
const EXCEPTION_MARKERS = Object.freeze([
  'TEMPORARY STAGING EXCEPTION',
  'Production deployment: PROHIBITED',
  'Non-production staging: PERMITTED after repository review',
  'August 24, 2026',
  'GHSA-mh99-v99m-4gvg',
  'GHSA-w5hq-g745-h8pq',
]);

class VerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VerificationError';
  }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new VerificationError(message);
  }
}

function readJson(filePath, label) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new VerificationError(`${label} is missing or unreadable: ${error.message}`);
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new VerificationError(`${label} is not valid JSON: ${error.message}`);
  }
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function createGitAdapter() {
  function run(rootDir, args) {
    return execFileSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  return {
    revParseHead(rootDir) {
      return run(rootDir, ['rev-parse', 'HEAD']);
    },
    isDetached(rootDir) {
      try {
        run(rootDir, ['symbolic-ref', '-q', 'HEAD']);
        return false;
      } catch (error) {
        if (error && error.status === 1) {
          return true;
        }
        throw new VerificationError(`Unable to determine HEAD state: ${error.message}`);
      }
    },
    statusPorcelain(rootDir) {
      return run(rootDir, ['status', '--porcelain=v1', '--untracked-files=all']);
    },
  };
}

function verifyProject(projectId) {
  assertCondition(
    projectId === STAGING_PROJECT_ID,
    `GCLOUD_PROJECT must be exactly ${STAGING_PROJECT_ID}`,
  );
}

function verifyReviewedCommit({ reviewedCommit, rootDir, git }) {
  assertCondition(
    typeof reviewedCommit === 'string' && reviewedCommit.length > 0,
    'GATE1A_REVIEWED_COMMIT is required',
  );
  assertCondition(
    /^[0-9a-f]{40}$/.test(reviewedCommit),
    'GATE1A_REVIEWED_COMMIT must be a full 40-character lowercase Git commit hash',
  );

  const head = git.revParseHead(rootDir);
  assertCondition(head === reviewedCommit, 'HEAD does not match GATE1A_REVIEWED_COMMIT');
  assertCondition(git.isDetached(rootDir), 'HEAD must be detached');

  const status = git.statusPorcelain(rootDir);
  assertCondition(
    status.length === 0,
    'Repository working tree and index must be clean with no untracked files',
  );
}

function loadExportKeys(indexPath) {
  let resolved;
  try {
    resolved = require.resolve(indexPath);
    delete require.cache[resolved];
    return Object.keys(require(resolved)).sort();
  } catch (error) {
    throw new VerificationError(`Unable to load Functions entry point: ${error.message}`);
  } finally {
    if (resolved) {
      delete require.cache[resolved];
    }
  }
}

function verifyExports(indexPath, loadExports = loadExportKeys) {
  const actual = loadExports(indexPath).slice().sort();
  assertCondition(
    JSON.stringify(actual) === JSON.stringify(EXPECTED_EXPORTS),
    `Functions exports must be exactly: ${EXPECTED_EXPORTS.join(', ')}`,
  );
}

function listJavaScriptFiles(directoryPath) {
  const files = [];

  if (!fs.existsSync(directoryPath)) {
    return files;
  }

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new VerificationError(`Symbolic link is not allowed in deployable source: ${entryPath}`);
    }
    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }

  return files;
}

function verifySpikeBoundary({ functionsRoot }) {
  const spikeDirectory = path.join(functionsRoot, 'src', 'spikes');
  assertCondition(!fs.existsSync(spikeDirectory), 'src/spikes must not exist');

  const filesToScan = [
    path.join(functionsRoot, 'index.js'),
    ...listJavaScriptFiles(path.join(functionsRoot, 'src')),
  ];

  for (const filePath of filesToScan) {
    const content = fs.readFileSync(filePath, 'utf8');
    assertCondition(
      !content.includes('spikeRegistryRead'),
      `Deployable source contains forbidden spikeRegistryRead marker: ${filePath}`,
    );
  }
}

function verifyConfiguration(configPath) {
  const config = readJson(configPath, 'Gate 1A staging configuration');
  const topLevelKeys = Object.keys(config).sort();
  assertCondition(
    JSON.stringify(topLevelKeys) === JSON.stringify(['firestore', 'functions']),
    'Configuration must declare only functions and firestore',
  );

  assertCondition(
    Array.isArray(config.functions) && config.functions.length === 1,
    'Configuration must contain exactly one Functions entry',
  );

  const functionsConfig = config.functions[0];
  const functionKeys = Object.keys(functionsConfig).sort();
  const allowedFunctionKeys = ['codebase', 'ignore', 'predeploy', 'runtime', 'source'];
  assertCondition(
    JSON.stringify(functionKeys) === JSON.stringify(allowedFunctionKeys),
    'Functions entry contains an unexpected or missing field',
  );
  assertCondition(
    functionsConfig.source === EXPECTED_SOURCE,
    `Functions source must be ${EXPECTED_SOURCE}`,
  );
  assertCondition(
    functionsConfig.codebase === EXPECTED_CODEBASE,
    `Functions codebase must be ${EXPECTED_CODEBASE}`,
  );
  assertCondition(
    functionsConfig.runtime === EXPECTED_RUNTIME,
    `Functions runtime must be ${EXPECTED_RUNTIME}`,
  );
  assertCondition(
    Array.isArray(functionsConfig.predeploy) &&
      functionsConfig.predeploy.length === 1 &&
      functionsConfig.predeploy[0] === EXPECTED_PREDEPLOY,
    'Functions predeploy hook does not match the reviewed verifier command',
  );
  assertCondition(
    Array.isArray(functionsConfig.ignore),
    'Functions ignore must be an array',
  );
  for (const requiredEntry of REQUIRED_IGNORE_ENTRIES) {
    assertCondition(
      functionsConfig.ignore.includes(requiredEntry),
      `Functions ignore is missing required entry: ${requiredEntry}`,
    );
  }

  assertCondition(
    config.firestore &&
      typeof config.firestore === 'object' &&
      !Array.isArray(config.firestore),
    'Configuration must contain one Firestore rules entry',
  );
  assertCondition(
    JSON.stringify(Object.keys(config.firestore).sort()) === JSON.stringify(['rules']),
    'Firestore configuration must declare only the rules path',
  );
  assertCondition(
    config.firestore.rules === EXPECTED_RULES_PATH,
    `Firestore rules path must be ${EXPECTED_RULES_PATH}`,
  );

  const serialized = JSON.stringify(config);
  for (const forbiddenMarker of [
    'spikeRegistryRead',
    'coincard-spike',
    'firebase.routing-spike.json',
  ]) {
    assertCondition(
      !serialized.includes(forbiddenMarker),
      `Configuration contains forbidden marker: ${forbiddenMarker}`,
    );
  }

  return config;
}

function verifyRules({ rulesPath, expectedHash = EXPECTED_RULES_SHA256 }) {
  let rules;
  try {
    rules = fs.readFileSync(rulesPath, 'utf8');
  } catch (error) {
    throw new VerificationError(`Firestore rules are missing or unreadable: ${error.message}`);
  }

  assertCondition(
    !/allow\s+[^;]*:\s*if\s+true\s*;/u.test(rules),
    'Firestore rules contain a permissive allow-if-true statement',
  );
  assertCondition(
    sha256(rules) === expectedHash,
    'Firestore rules SHA-256 does not match the reviewed Gate 1A rules',
  );
}

function verifyDependencyException({ exceptionPath, now = () => new Date() }) {
  let record;
  try {
    record = fs.readFileSync(exceptionPath, 'utf8');
  } catch (error) {
    throw new VerificationError(
      `Gate 1A dependency exception is missing or unreadable: ${error.message}`,
    );
  }

  for (const marker of EXCEPTION_MARKERS) {
    assertCondition(
      record.includes(marker),
      `Gate 1A dependency exception is missing required marker: ${marker}`,
    );
  }

  const currentTime = now();
  assertCondition(
    currentTime instanceof Date && !Number.isNaN(currentTime.getTime()),
    'Injected verification clock must return a valid Date',
  );
  assertCondition(
    currentTime.getTime() < EXCEPTION_EXPIRATION.getTime(),
    'Gate 1A dependency exception expired at 2026-08-25T06:00:00Z',
  );
}

function verifyGate1AStagingDeploy(options = {}) {
  const rootDir =
    options.rootDir || path.resolve(__dirname, '..', '..', '..', '..');
  const functionsRoot = path.join(rootDir, 'app-web', 'backend', 'functions');
  const environment = options.env || process.env;
  const git = options.git || createGitAdapter();

  verifyProject(environment.GCLOUD_PROJECT);
  verifyReviewedCommit({
    reviewedCommit: environment.GATE1A_REVIEWED_COMMIT,
    rootDir,
    git,
  });
  verifyExports(
    path.join(functionsRoot, 'index.js'),
    options.loadExports || loadExportKeys,
  );
  verifySpikeBoundary({ functionsRoot });
  verifyConfiguration(path.join(rootDir, 'firebase.gate1a-staging.json'));
  verifyRules({
    rulesPath: path.join(rootDir, EXPECTED_RULES_PATH),
    expectedHash: options.expectedRulesHash || EXPECTED_RULES_SHA256,
  });
  verifyDependencyException({
    exceptionPath: path.join(
      rootDir,
      'app-web',
      'docs',
      'product',
      'coin-card',
      'COIN_CARD_GATE1A_DEPENDENCY_EXCEPTION_2026-07-25.md',
    ),
    now: options.now || (() => new Date()),
  });
}

if (require.main === module) {
  try {
    verifyGate1AStagingDeploy();
    console.log('Gate 1A staging predeploy verification passed.');
  } catch (error) {
    const message =
      error instanceof VerificationError ? error.message : `Unexpected verification error: ${error.message}`;
    console.error(`Gate 1A staging predeploy verification failed: ${message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  EXCEPTION_EXPIRATION,
  EXPECTED_EXPORTS,
  EXPECTED_RULES_SHA256,
  REQUIRED_IGNORE_ENTRIES,
  STAGING_PROJECT_ID,
  VerificationError,
  sha256,
  verifyConfiguration,
  verifyDependencyException,
  verifyExports,
  verifyGate1AStagingDeploy,
  verifyProject,
  verifyReviewedCommit,
  verifyRules,
  verifySpikeBoundary,
};
