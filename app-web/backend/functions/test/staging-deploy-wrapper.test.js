'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {
  STAGING_CONFIG,
  STAGING_PROJECT_ID,
  VERIFIER_PATH,
  runGate1AStagingDeployment,
  validateInvocation,
  verifyFirebaseCliVersion,
} = require('../scripts/deploy-gate1a-staging');

const REVIEWED_COMMIT = 'a'.repeat(40);
const REPOSITORY_ROOT = '/reviewed/repository';
const LAUNCHER_CWD = '/mixed/development/worktree';
const TEMPORARY_ROOT = '/temporary';
const TEMPORARY_PARENT =
  '/temporary/implicitex-gate1a-staging-fixture';
const WORKTREE_PATH = `${TEMPORARY_PARENT}/worktree`;
const FUNCTIONS_PATH = `${WORKTREE_PATH}/app-web/backend/functions`;

function isCommand(call, command, firstArgument) {
  return (
    call.command === command &&
    (firstArgument === undefined || call.args[0] === firstArgument)
  );
}

function deploymentCalls(harness) {
  return harness.calls.filter(
    (call) => call.command === 'firebase' && call.args[0] === 'deploy',
  );
}

function findCall(harness, command, firstArgument) {
  return harness.calls.find((call) =>
    isCommand(call, command, firstArgument),
  );
}

function commandIndex(harness, command, firstArgument, onlyValue) {
  return harness.calls.findIndex((call) => {
    if (!isCommand(call, command, firstArgument)) {
      return false;
    }
    if (onlyValue === undefined) {
      return true;
    }
    const onlyIndex = call.args.indexOf('--only');
    return onlyIndex >= 0 && call.args[onlyIndex + 1] === onlyValue;
  });
}

function createHarness(options = {}) {
  const calls = [];
  const removals = [];
  let temporaryDirectoryCreated = false;
  let worktreeExists = false;
  const fail = options.fail || {};

  function runCommand(command, args, commandOptions) {
    const call = {
      command,
      args: [...args],
      options: {
        ...commandOptions,
        env: { ...commandOptions.env },
      },
    };
    calls.push(call);

    if (command === 'git' && args[0] === 'rev-parse') {
      if (fail.repositoryRoot) {
        throw new Error('repository root failure');
      }
      return REPOSITORY_ROOT;
    }
    if (command === 'git' && args[0] === 'cat-file') {
      if (fail.commitResolution) {
        throw new Error('commit resolution failure');
      }
      return '';
    }
    if (command === 'git' && args[0] === 'worktree' && args[1] === 'add') {
      worktreeExists = true;
      if (fail.worktreeCreation) {
        throw new Error('worktree creation failure');
      }
      return '';
    }
    if (command === 'firebase' && args[0] === '--version') {
      if (fail.firebaseVersionCommand) {
        throw new Error('firebase version command failure');
      }
      return options.firebaseVersion || '13.1.0';
    }
    if (command === 'npm') {
      if (fail.npm) {
        throw new Error('npm failure');
      }
      return '';
    }
    if (command === 'node') {
      if (fail.verifier) {
        throw new Error('verifier failure');
      }
      return '';
    }
    if (command === 'firebase' && args[0] === 'deploy') {
      const onlyIndex = args.indexOf('--only');
      const target = args[onlyIndex + 1];
      if (target === 'firestore:rules' && fail.firestore) {
        throw new Error('firestore failure');
      }
      if (target === 'functions' && fail.functions) {
        throw new Error('functions failure');
      }
      return '';
    }
    if (command === 'git' && args[0] === 'worktree' && args[1] === 'remove') {
      worktreeExists = false;
      if (fail.worktreeCleanup) {
        throw new Error('worktree cleanup failure');
      }
      return '';
    }

    throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
  }

  const fsAdapter = {
    mkdtempSync(prefix) {
      temporaryDirectoryCreated = true;
      assert.equal(
        prefix,
        path.join(TEMPORARY_ROOT, 'implicitex-gate1a-staging-'),
      );
      return TEMPORARY_PARENT;
    },
    existsSync(target) {
      return target === WORKTREE_PATH && worktreeExists;
    },
    rmSync(target, removeOptions) {
      removals.push({ target, options: { ...removeOptions } });
      if (fail.parentCleanup) {
        throw new Error('parent cleanup failure');
      }
    },
  };

  return {
    calls,
    removals,
    fail,
    fsAdapter,
    get temporaryDirectoryCreated() {
      return temporaryDirectoryCreated;
    },
    run() {
      return runGate1AStagingDeployment(
        options.argv || [REVIEWED_COMMIT],
        {
          runCommand,
          fs: fsAdapter,
          temporaryRoot: TEMPORARY_ROOT,
          cwd: LAUNCHER_CWD,
          env: {
            PATH: '/test/bin',
            HOME: '/test/home',
            GCLOUD_PROJECT: 'caller-controlled-project',
            GATE1A_REVIEWED_COMMIT: 'caller-controlled-commit',
          },
        },
      );
    },
  };
}

test('rejects a missing reviewed commit', () => {
  assert.throws(
    () => validateInvocation([]),
    /expected exactly one reviewed commit argument/,
  );
});

test('rejects an abbreviated reviewed commit', () => {
  assert.throws(
    () => validateInvocation([REVIEWED_COMMIT.slice(0, 12)]),
    /40 lowercase hexadecimal/,
  );
});

test('rejects a malformed reviewed commit', () => {
  assert.throws(
    () => validateInvocation(['not-a-commit']),
    /40 lowercase hexadecimal/,
  );
});

test('rejects an uppercase reviewed commit', () => {
  assert.throws(
    () => validateInvocation(['A'.repeat(40)]),
    /40 lowercase hexadecimal/,
  );
});

test('rejects caller-supplied project or extra arguments', () => {
  assert.throws(
    () => validateInvocation([REVIEWED_COMMIT, 'another-project']),
    /expected exactly one reviewed commit argument/,
  );
});

test('rejects a reviewed commit that Git cannot resolve', () => {
  const harness = createHarness({ fail: { commitResolution: true } });
  assert.throws(() => harness.run(), /reviewed commit resolution/);
  assert.equal(harness.temporaryDirectoryCreated, false);
});

test('rejects malformed Firebase CLI version output', () => {
  assert.throws(
    () => verifyFirebaseCliVersion('Firebase CLI unknown'),
    /Firebase CLI version validation/,
  );
});

test('rejects Firebase CLI older than 10.7.1', () => {
  assert.throws(
    () => verifyFirebaseCliVersion('10.7.0'),
    /version 10\.7\.1 or newer is required/,
  );
});

test('rejects a Firebase CLI prerelease', () => {
  assert.throws(
    () => verifyFirebaseCliVersion('13.1.0-rc.1'),
    /prerelease versions are unsupported/,
  );
});

test('accepts a supported stable Firebase CLI version', () => {
  assert.equal(verifyFirebaseCliVersion('13.1.0'), '13.1.0');
});

test('creates a detached worktree at the exact reviewed commit', () => {
  const harness = createHarness();
  harness.run();
  const call = harness.calls.find(
    (candidate) =>
      candidate.command === 'git' &&
      candidate.args[0] === 'worktree' &&
      candidate.args[1] === 'add',
  );
  assert.deepEqual(call.args, [
    'worktree',
    'add',
    '--detach',
    WORKTREE_PATH,
    REVIEWED_COMMIT,
  ]);
  assert.equal(call.options.cwd, REPOSITORY_ROOT);
});

test('runs npm ci with exactly --omit=dev', () => {
  const harness = createHarness();
  harness.run();
  assert.deepEqual(findCall(harness, 'npm').args, ['ci', '--omit=dev']);
});

test('runs npm ci inside the temporary Functions directory', () => {
  const harness = createHarness();
  harness.run();
  assert.equal(findCall(harness, 'npm').options.cwd, FUNCTIONS_PATH);
});

test('runs the direct verifier after npm ci', () => {
  const harness = createHarness();
  harness.run();
  const npmIndex = commandIndex(harness, 'npm');
  const verifierIndex = commandIndex(harness, 'node');
  assert.ok(npmIndex >= 0);
  assert.ok(verifierIndex > npmIndex);
  assert.deepEqual(harness.calls[verifierIndex].args, [VERIFIER_PATH]);
});

test('supplies exact project, reviewed commit, and CI environment values', () => {
  const harness = createHarness();
  harness.run();
  const verifier = findCall(harness, 'node');
  assert.equal(verifier.options.env.GCLOUD_PROJECT, STAGING_PROJECT_ID);
  assert.equal(
    verifier.options.env.GATE1A_REVIEWED_COMMIT,
    REVIEWED_COMMIT,
  );
  assert.equal(verifier.options.env.CI, '1');
});

test('deploys Firestore rules before Functions', () => {
  const harness = createHarness();
  harness.run();
  const rulesIndex = commandIndex(
    harness,
    'firebase',
    'deploy',
    'firestore:rules',
  );
  const functionsIndex = commandIndex(
    harness,
    'firebase',
    'deploy',
    'functions',
  );
  assert.ok(rulesIndex >= 0);
  assert.ok(functionsIndex > rulesIndex);
});

test('uses exactly firebase.gate1a-staging.json for both deployments', () => {
  const harness = createHarness();
  harness.run();
  for (const call of deploymentCalls(harness)) {
    const configIndex = call.args.indexOf('--config');
    assert.equal(call.args[configIndex + 1], STAGING_CONFIG);
  }
});

test('uses exactly project implicitex-236f2 for both deployments', () => {
  const harness = createHarness();
  harness.run();
  for (const call of deploymentCalls(harness)) {
    const projectIndex = call.args.indexOf('--project');
    assert.equal(call.args[projectIndex + 1], STAGING_PROJECT_ID);
  }
});

test('uses exactly --only firestore:rules for the rules phase', () => {
  const harness = createHarness();
  harness.run();
  const call = deploymentCalls(harness)[0];
  const onlyIndex = call.args.indexOf('--only');
  assert.equal(call.args[onlyIndex + 1], 'firestore:rules');
});

test('uses exactly --only functions for the Functions phase', () => {
  const harness = createHarness();
  harness.run();
  const call = deploymentCalls(harness)[1];
  const onlyIndex = call.args.indexOf('--only');
  assert.equal(call.args[onlyIndex + 1], 'functions');
});

test('includes --non-interactive in both deployments', () => {
  const harness = createHarness();
  harness.run();
  for (const call of deploymentCalls(harness)) {
    assert.ok(call.args.includes('--non-interactive'));
  }
});

test('never uses shell execution', () => {
  const harness = createHarness();
  harness.run();
  for (const call of harness.calls) {
    assert.equal(call.options.shell, false);
  }
});

test('stops before Firebase deployment when npm ci fails', () => {
  const harness = createHarness({ fail: { npm: true } });
  assert.throws(() => harness.run(), /npm dependency installation/);
  assert.equal(deploymentCalls(harness).length, 0);
});

test('stops before Firebase deployment when direct verification fails', () => {
  const harness = createHarness({ fail: { verifier: true } });
  assert.throws(() => harness.run(), /direct predeploy verification/);
  assert.equal(deploymentCalls(harness).length, 0);
});

test('does not deploy Functions when Firestore deployment fails', () => {
  const harness = createHarness({ fail: { firestore: true } });
  assert.throws(() => harness.run(), /Firestore rules deployment/);
  assert.equal(
    commandIndex(harness, 'firebase', 'deploy', 'functions'),
    -1,
  );
});

test('reports Functions deployment failure', () => {
  const harness = createHarness({ fail: { functions: true } });
  assert.throws(() => harness.run(), /Functions deployment/);
});

test('cleans up the worktree and parent after success', () => {
  const harness = createHarness();
  harness.run();
  const cleanup = harness.calls.find(
    (call) =>
      call.command === 'git' &&
      call.args[0] === 'worktree' &&
      call.args[1] === 'remove',
  );
  assert.deepEqual(cleanup.args, ['worktree', 'remove', WORKTREE_PATH]);
  assert.deepEqual(harness.removals, [
    {
      target: TEMPORARY_PARENT,
      options: { recursive: true, force: true },
    },
  ]);
});

for (const [name, failure] of [
  ['npm failure', 'npm'],
  ['verifier failure', 'verifier'],
  ['Firestore failure', 'firestore'],
  ['Functions failure', 'functions'],
]) {
  test(`cleans up after ${name}`, () => {
    const harness = createHarness({ fail: { [failure]: true } });
    assert.throws(() => harness.run());
    assert.ok(
      harness.calls.some(
        (call) =>
          call.command === 'git' &&
          call.args[0] === 'worktree' &&
          call.args[1] === 'remove',
      ),
    );
    assert.equal(harness.removals.length, 1);
  });
}

test('preserves the original deployment error when cleanup also fails', () => {
  const harness = createHarness({
    fail: {
      functions: true,
      worktreeCleanup: true,
      parentCleanup: true,
    },
  });
  assert.throws(
    () => harness.run(),
    (error) => {
      assert.match(error.message, /Functions deployment/);
      assert.match(error.message, /Cleanup also failed/);
      return true;
    },
  );
});

test('cleans the temporary parent after detached worktree creation fails', () => {
  const harness = createHarness({ fail: { worktreeCreation: true } });
  assert.throws(() => harness.run(), /detached worktree creation/);
  assert.ok(
    harness.calls.some(
      (call) =>
        call.command === 'git' &&
        call.args[0] === 'worktree' &&
        call.args[1] === 'remove',
    ),
  );
  assert.deepEqual(harness.removals, [
    {
      target: TEMPORARY_PARENT,
      options: { recursive: true, force: true },
    },
  ]);
});

test('cleans up after Firebase CLI version validation fails', () => {
  const harness = createHarness({ firebaseVersion: '9.0.0' });
  assert.throws(() => harness.run(), /Firebase CLI version validation/);
  assert.ok(
    harness.calls.some(
      (call) =>
        call.command === 'git' &&
        call.args[0] === 'worktree' &&
        call.args[1] === 'remove',
    ),
  );
  assert.equal(harness.removals.length, 1);
});

test('never deploys from the launcher working tree', () => {
  const harness = createHarness();
  harness.run();
  for (const call of harness.calls) {
    if (
      call.command === 'npm' ||
      call.command === 'node' ||
      call.command === 'firebase'
    ) {
      assert.notEqual(call.options.cwd, LAUNCHER_CWD);
      assert.ok(call.options.cwd.startsWith(WORKTREE_PATH));
    }
  }
});
