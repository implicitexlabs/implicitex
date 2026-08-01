'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  sha256,
  verifyGate1AStagingDeploy,
  verifyProject,
} = require('../scripts/verify-gate1a-staging-deploy');

const REVIEWED_COMMIT = 'a'.repeat(40);
const VALID_NOW = new Date('2026-07-25T12:00:00Z');
const EXPECTED_PREDEPLOY =
  'node "$PROJECT_DIR/app-web/backend/functions/scripts/verify-gate1a-staging-deploy.js"';
const REQUIRED_IGNORES = [
  '.git',
  '.runtimeconfig.json',
  'firebase-debug.log',
  'firebase-debug.*.log',
  'node_modules',
  'src/spikes/**',
  'test/**',
  'scripts/**',
];

const VALID_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
`;

const VALID_EXCEPTION = `# Coin Card Gate 1A Dependency Security Exception

- Decision: TEMPORARY STAGING EXCEPTION
- Production deployment: PROHIBITED
- Non-production staging: PERMITTED after repository review
- Mandatory review: no later than August 24, 2026.
- GHSA-mh99-v99m-4gvg
- GHSA-w5hq-g745-h8pq
`;

function writeFile(rootDir, relativePath, content) {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

function validConfig() {
  return {
    functions: [
      {
        source: 'app-web/backend/functions',
        codebase: 'coincard-gate1a-staging',
        runtime: 'nodejs22',
        ignore: [...REQUIRED_IGNORES],
        predeploy: [EXPECTED_PREDEPLOY],
      },
    ],
    firestore: {
      rules: 'app-web/backend/firestore.rules',
    },
  };
}

function createFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate1a-boundary-'));
  const config = validConfig();

  writeFile(
    rootDir,
    'firebase.gate1a-staging.json',
    `${JSON.stringify(config, null, 2)}\n`,
  );
  writeFile(
    rootDir,
    'app-web/backend/functions/index.js',
    "'use strict';\nexports.coincardWalletChallenge = () => {};\nexports.coincardWalletVerify = () => {};\n",
  );
  writeFile(
    rootDir,
    'app-web/backend/functions/src/wallet-challenge/functions.js',
    "'use strict';\n",
  );
  writeFile(rootDir, 'app-web/backend/firestore.rules', VALID_RULES);
  writeFile(
    rootDir,
    'app-web/docs/product/coin-card/COIN_CARD_GATE1A_DEPENDENCY_EXCEPTION_2026-07-25.md',
    VALID_EXCEPTION,
  );

  const gitState = {
    head: REVIEWED_COMMIT,
    detached: true,
    status: '',
  };
  const git = {
    revParseHead() {
      return gitState.head;
    },
    isDetached() {
      return gitState.detached;
    },
    statusPorcelain() {
      return gitState.status;
    },
  };

  return {
    rootDir,
    config,
    git,
    gitState,
    env: {
      GCLOUD_PROJECT: 'implicitex-236f2',
      GATE1A_REVIEWED_COMMIT: REVIEWED_COMMIT,
    },
    expectedRulesHash: sha256(VALID_RULES),
    now: () => new Date(VALID_NOW),
    rewriteConfig() {
      writeFile(
        rootDir,
        'firebase.gate1a-staging.json',
        `${JSON.stringify(this.config, null, 2)}\n`,
      );
    },
    cleanup() {
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

function runVerifier(fixture) {
  return verifyGate1AStagingDeploy({
    rootDir: fixture.rootDir,
    env: fixture.env,
    git: fixture.git,
    expectedRulesHash: fixture.expectedRulesHash,
    now: fixture.now,
  });
}

function fixtureTest(name, callback) {
  test(name, () => {
    const fixture = createFixture();
    try {
      callback(fixture);
    } finally {
      fixture.cleanup();
    }
  });
}

test('accepts the exact staging project', () => {
  assert.doesNotThrow(() => verifyProject('implicitex-236f2'));
});

test('rejects a missing project', () => {
  assert.throws(() => verifyProject(undefined), /GCLOUD_PROJECT must be exactly/);
});

test('rejects the ImplicitEx production project', () => {
  assert.throws(() => verifyProject('implicitex'), /GCLOUD_PROJECT must be exactly/);
});

test('rejects an unknown project', () => {
  assert.throws(() => verifyProject('another-project'), /GCLOUD_PROJECT must be exactly/);
});

fixtureTest('rejects an attached branch', (fixture) => {
  fixture.gitState.detached = false;
  assert.throws(() => runVerifier(fixture), /HEAD must be detached/);
});

fixtureTest('rejects a dirty tracked working tree', (fixture) => {
  fixture.gitState.status = ' M app-web/backend/functions/index.js';
  assert.throws(() => runVerifier(fixture), /working tree and index must be clean/);
});

fixtureTest('rejects an untracked file', (fixture) => {
  fixture.gitState.status = '?? app-web/backend/functions/untracked.js';
  assert.throws(() => runVerifier(fixture), /working tree and index must be clean/);
});

fixtureTest('rejects a reviewed-commit mismatch', (fixture) => {
  fixture.env.GATE1A_REVIEWED_COMMIT = 'b'.repeat(40);
  assert.throws(() => runVerifier(fixture), /HEAD does not match/);
});

fixtureTest('rejects a missing reviewed-commit environment value', (fixture) => {
  delete fixture.env.GATE1A_REVIEWED_COMMIT;
  assert.throws(() => runVerifier(fixture), /GATE1A_REVIEWED_COMMIT is required/);
});

fixtureTest('rejects a malformed reviewed-commit hash', (fixture) => {
  fixture.env.GATE1A_REVIEWED_COMMIT = 'not-a-commit';
  assert.throws(() => runVerifier(fixture), /full 40-character lowercase/);
});

fixtureTest('rejects an abbreviated reviewed-commit hash', (fixture) => {
  fixture.env.GATE1A_REVIEWED_COMMIT = REVIEWED_COMMIT.slice(0, 12);
  assert.throws(() => runVerifier(fixture), /full 40-character lowercase/);
});

fixtureTest('rejects a third Function export', (fixture) => {
  fs.appendFileSync(
    path.join(fixture.rootDir, 'app-web/backend/functions/index.js'),
    'exports.unexpectedFunction = () => {};\n',
  );
  assert.throws(() => runVerifier(fixture), /Functions exports must be exactly/);
});

fixtureTest('rejects an incorrect Functions source', (fixture) => {
  fixture.config.functions[0].source = 'app-web/backend/other-functions';
  fixture.rewriteConfig();
  assert.throws(() => runVerifier(fixture), /Functions source must be/);
});

fixtureTest('rejects an incorrect Functions codebase', (fixture) => {
  fixture.config.functions[0].codebase = 'another-codebase';
  fixture.rewriteConfig();
  assert.throws(() => runVerifier(fixture), /Functions codebase must be/);
});

fixtureTest('rejects an incorrect Functions runtime', (fixture) => {
  fixture.config.functions[0].runtime = 'nodejs20';
  fixture.rewriteConfig();
  assert.throws(() => runVerifier(fixture), /Functions runtime must be/);
});

fixtureTest('rejects an altered predeploy command', (fixture) => {
  fixture.config.functions[0].predeploy = ['node scripts/another-command.js'];
  fixture.rewriteConfig();
  assert.throws(() => runVerifier(fixture), /predeploy hook does not match/);
});

fixtureTest('rejects spikeRegistryRead in deployable source', (fixture) => {
  fs.appendFileSync(
    path.join(
      fixture.rootDir,
      'app-web/backend/functions/src/wallet-challenge/functions.js',
    ),
    'const spikeRegistryRead = null;\n',
  );
  assert.throws(() => runVerifier(fixture), /forbidden spikeRegistryRead marker/);
});

fixtureTest('rejects an existing src/spikes directory', (fixture) => {
  fs.mkdirSync(
    path.join(fixture.rootDir, 'app-web/backend/functions/src/spikes'),
    { recursive: true },
  );
  assert.throws(() => runVerifier(fixture), /src\/spikes must not exist/);
});

fixtureTest('rejects an altered Firestore rules hash', (fixture) => {
  fs.appendFileSync(
    path.join(fixture.rootDir, 'app-web/backend/firestore.rules'),
    '// altered\n',
  );
  assert.throws(() => runVerifier(fixture), /SHA-256 does not match/);
});

fixtureTest('rejects permissive Firestore rules', (fixture) => {
  const permissiveRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
`;
  writeFile(
    fixture.rootDir,
    'app-web/backend/firestore.rules',
    permissiveRules,
  );
  fixture.expectedRulesHash = sha256(permissiveRules);
  assert.throws(() => runVerifier(fixture), /permissive allow-if-true/);
});

fixtureTest('rejects an incorrect Firestore rules path', (fixture) => {
  fixture.config.firestore.rules = 'app-web/backend/permissive.rules';
  fixture.rewriteConfig();
  assert.throws(() => runVerifier(fixture), /Firestore rules path must be/);
});

fixtureTest('rejects Hosting configuration', (fixture) => {
  fixture.config.hosting = { public: 'public' };
  fixture.rewriteConfig();
  assert.throws(() => runVerifier(fixture), /declare only functions and firestore/);
});

fixtureTest('rejects another service configuration', (fixture) => {
  fixture.config.storage = { rules: 'storage.rules' };
  fixture.rewriteConfig();
  assert.throws(() => runVerifier(fixture), /declare only functions and firestore/);
});

fixtureTest('rejects missing standard ignore entries', (fixture) => {
  fixture.config.functions[0].ignore =
    fixture.config.functions[0].ignore.filter((entry) => entry !== 'node_modules');
  fixture.rewriteConfig();
  assert.throws(() => runVerifier(fixture), /missing required entry: node_modules/);
});

fixtureTest('rejects a missing dependency-exception record', (fixture) => {
  fs.unlinkSync(
    path.join(
      fixture.rootDir,
      'app-web/docs/product/coin-card/COIN_CARD_GATE1A_DEPENDENCY_EXCEPTION_2026-07-25.md',
    ),
  );
  assert.throws(() => runVerifier(fixture), /dependency exception is missing/);
});

fixtureTest('rejects an incomplete dependency-exception record', (fixture) => {
  writeFile(
    fixture.rootDir,
    'app-web/docs/product/coin-card/COIN_CARD_GATE1A_DEPENDENCY_EXCEPTION_2026-07-25.md',
    VALID_EXCEPTION.replace('- GHSA-w5hq-g745-h8pq\n', ''),
  );
  assert.throws(
    () => runVerifier(fixture),
    /dependency exception is missing required marker/,
  );
});

fixtureTest('rejects an expired dependency exception', (fixture) => {
  fixture.now = () => new Date('2026-08-25T06:00:00Z');
  assert.throws(() => runVerifier(fixture), /dependency exception expired/);
});

fixtureTest('accepts the complete valid fixture', (fixture) => {
  assert.doesNotThrow(() => runVerifier(fixture));
});
