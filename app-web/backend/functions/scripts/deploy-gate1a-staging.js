'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const STAGING_PROJECT_ID = 'implicitex-236f2';
const STAGING_CONFIG = 'firebase.gate1a-staging.json';
const REVIEWED_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const MINIMUM_FIREBASE_CLI_VERSION = Object.freeze([10, 7, 1]);
const VERIFIER_PATH =
  'app-web/backend/functions/scripts/verify-gate1a-staging-deploy.js';
const FUNCTIONS_PATH = 'app-web/backend/functions';

class DeploymentError extends Error {
  constructor(phase, cleanupFailed = false) {
    const suffix = cleanupFailed ? ' Cleanup also failed.' : '';
    super(`Gate 1A staging deployment failed during ${phase}.${suffix}`);
    this.name = 'DeploymentError';
    this.phase = phase;
    this.cleanupFailed = cleanupFailed;
  }
}

function validateInvocation(argv) {
  if (!Array.isArray(argv) || argv.length !== 1) {
    throw new DeploymentError(
      'invocation; expected exactly one reviewed commit argument',
    );
  }

  const reviewedCommit = argv[0];
  if (!REVIEWED_COMMIT_PATTERN.test(reviewedCommit)) {
    throw new DeploymentError(
      'invocation; reviewed commit must be 40 lowercase hexadecimal characters',
    );
  }

  return reviewedCommit;
}

function parseFirebaseCliVersion(output) {
  const value = typeof output === 'string' ? output.trim() : '';
  const match =
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
      value,
    );

  if (!match) {
    throw new DeploymentError('Firebase CLI version validation');
  }
  if (match[4]) {
    throw new DeploymentError(
      'Firebase CLI version validation; prerelease versions are unsupported',
    );
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function verifyFirebaseCliVersion(output) {
  const parsed = parseFirebaseCliVersion(output);
  if (compareVersions(parsed, MINIMUM_FIREBASE_CLI_VERSION) < 0) {
    throw new DeploymentError(
      'Firebase CLI version validation; version 10.7.1 or newer is required',
    );
  }
  return parsed.join('.');
}

function defaultRunCommand(command, args, options) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  }).trim();
}

function buildDeploymentEnvironment(baseEnvironment, reviewedCommit) {
  return {
    ...baseEnvironment,
    GCLOUD_PROJECT: STAGING_PROJECT_ID,
    GATE1A_REVIEWED_COMMIT: reviewedCommit,
    CI: '1',
  };
}

function toDeploymentError(phase, error) {
  if (error instanceof DeploymentError) {
    return error;
  }
  return new DeploymentError(phase);
}

function cleanupTemporaryWorktree({
  repositoryRoot,
  temporaryParent,
  worktreePath,
  worktreeAdded,
  worktreeCreationAttempted,
  runCommand,
  fsAdapter,
  environment,
}) {
  let failed = false;

  const partialWorktreeExists =
    worktreeCreationAttempted &&
    worktreePath &&
    fsAdapter.existsSync(worktreePath);

  if (worktreeAdded || partialWorktreeExists) {
    try {
      runCommand('git', ['worktree', 'remove', worktreePath], {
        cwd: repositoryRoot,
        env: environment,
        shell: false,
      });
    } catch {
      failed = true;
    }
  }

  if (temporaryParent) {
    try {
      fsAdapter.rmSync(temporaryParent, { recursive: true, force: true });
    } catch {
      failed = true;
    }
  }

  return failed;
}

function runGate1AStagingDeployment(argv, adapters = {}) {
  const reviewedCommit = validateInvocation(argv);
  const runCommand = adapters.runCommand || defaultRunCommand;
  const fsAdapter = adapters.fs || fs;
  const temporaryRoot = adapters.temporaryRoot || os.tmpdir();
  const launcherCwd = adapters.cwd || process.cwd();
  const baseEnvironment = adapters.env || process.env;
  const deploymentEnvironment = buildDeploymentEnvironment(
    baseEnvironment,
    reviewedCommit,
  );

  let repositoryRoot;
  let temporaryParent;
  let worktreePath;
  let worktreeAdded = false;
  let worktreeCreationAttempted = false;
  let primaryError;
  let phase = 'repository root resolution';

  try {
    repositoryRoot = runCommand('git', ['rev-parse', '--show-toplevel'], {
      cwd: launcherCwd,
      env: baseEnvironment,
      shell: false,
    });

    phase = 'reviewed commit resolution';
    runCommand('git', ['cat-file', '-e', `${reviewedCommit}^{commit}`], {
      cwd: repositoryRoot,
      env: baseEnvironment,
      shell: false,
    });

    phase = 'temporary directory creation';
    temporaryParent = fsAdapter.mkdtempSync(
      path.join(temporaryRoot, 'implicitex-gate1a-staging-'),
    );
    worktreePath = path.join(temporaryParent, 'worktree');

    phase = 'detached worktree creation';
    worktreeCreationAttempted = true;
    runCommand(
      'git',
      ['worktree', 'add', '--detach', worktreePath, reviewedCommit],
      {
        cwd: repositoryRoot,
        env: baseEnvironment,
        shell: false,
      },
    );
    worktreeAdded = true;

    phase = 'Firebase CLI version validation';
    const firebaseVersion = runCommand('firebase', ['--version'], {
      cwd: worktreePath,
      env: deploymentEnvironment,
      shell: false,
    });
    verifyFirebaseCliVersion(firebaseVersion);

    phase = 'npm dependency installation';
    runCommand('npm', ['ci', '--omit=dev'], {
      cwd: path.join(worktreePath, FUNCTIONS_PATH),
      env: deploymentEnvironment,
      shell: false,
    });

    phase = 'direct predeploy verification';
    runCommand('node', [VERIFIER_PATH], {
      cwd: worktreePath,
      env: deploymentEnvironment,
      shell: false,
    });

    phase = 'Firestore rules deployment';
    runCommand(
      'firebase',
      [
        'deploy',
        '--config',
        STAGING_CONFIG,
        '--project',
        STAGING_PROJECT_ID,
        '--only',
        'firestore:rules',
        '--non-interactive',
      ],
      {
        cwd: worktreePath,
        env: deploymentEnvironment,
        shell: false,
      },
    );

    phase = 'Functions deployment';
    runCommand(
      'firebase',
      [
        'deploy',
        '--config',
        STAGING_CONFIG,
        '--project',
        STAGING_PROJECT_ID,
        '--only',
        'functions',
        '--non-interactive',
      ],
      {
        cwd: worktreePath,
        env: deploymentEnvironment,
        shell: false,
      },
    );
  } catch (error) {
    primaryError = toDeploymentError(phase, error);
  } finally {
    const cleanupFailed = cleanupTemporaryWorktree({
      repositoryRoot,
      temporaryParent,
      worktreePath,
      worktreeAdded,
      worktreeCreationAttempted,
      runCommand,
      fsAdapter,
      environment: baseEnvironment,
    });

    if (cleanupFailed) {
      if (primaryError) {
        primaryError = new DeploymentError(primaryError.phase, true);
      } else {
        primaryError = new DeploymentError('temporary worktree cleanup');
      }
    }
  }

  if (primaryError) {
    throw primaryError;
  }

  return {
    projectId: STAGING_PROJECT_ID,
    reviewedCommit,
  };
}

if (require.main === module) {
  try {
    const result = runGate1AStagingDeployment(process.argv.slice(2));
    console.log(
      `Gate 1A staging deployment completed for reviewed commit ${result.reviewedCommit}.`,
    );
  } catch (error) {
    const message =
      error instanceof DeploymentError
        ? error.message
        : 'Gate 1A staging deployment failed unexpectedly.';
    console.error(message);
    process.exitCode = 1;
  }
}

module.exports = {
  DeploymentError,
  MINIMUM_FIREBASE_CLI_VERSION,
  STAGING_CONFIG,
  STAGING_PROJECT_ID,
  VERIFIER_PATH,
  buildDeploymentEnvironment,
  parseFirebaseCliVersion,
  runGate1AStagingDeployment,
  validateInvocation,
  verifyFirebaseCliVersion,
};
