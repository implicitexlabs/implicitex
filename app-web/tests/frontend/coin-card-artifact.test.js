const assert = require('node:assert/strict');
const path = require('node:path');
const { validateArchitecture } = require('../../scripts/validate_coin_card_architecture.js');
const { validateArtifactContract } = require('../../../contracts/architecture/validator.js');

try {
  const result = validateArchitecture({ silent: true });
  const repoRoot = path.resolve(__dirname, '../../..');
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const unit = result.artifact.promotionUnits.find(
    (candidate) => candidate.id === 'coinCardEvidenceAuthorityV1'
  );

  assert.equal(unit.status, 'sealed');
  const partiallyPromoted = clone(result.artifact);
  partiallyPromoted.graph.nodes.find(
    (node) => node.id === unit.normativeContracts[0]
  ).status = 'proposed';
  assert.throws(
    () => validateArtifactContract(partiallyPromoted, { repoRoot }),
    /promotion contract status must match unit sealed/
  );

  const graphOnlyDemotion = clone(result.artifact);
  graphOnlyDemotion.promotionUnits[0].status = 'proposed';
  for (const nodeId of unit.normativeContracts) {
    graphOnlyDemotion.graph.nodes.find((node) => node.id === nodeId).status = 'proposed';
  }
  assert.throws(
    () => validateArtifactContract(graphOnlyDemotion, { repoRoot }),
    /promotion contract Markdown status must match unit proposed/
  );

  const missingImplementationTest = clone(result.artifact);
  missingImplementationTest.graph.nodes.find(
    (node) => node.id === 'executableRegistryRecordVerificationTest'
  ).source = 'app-web/tests/frontend/missing-executable-registry-runtime-test.js';
  assert.throws(
    () => validateArtifactContract(missingImplementationTest, { repoRoot }),
    /governed source for executableRegistryRecordVerificationTest does not exist/
  );

  console.log('ok - Coin Card architecture validator governs promotion and implementation tests');
} catch (err) {
  console.error(`not ok - ${err.message}`);
  throw err;
}
