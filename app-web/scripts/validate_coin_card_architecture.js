const path = require('node:path');
const { validateArchitecture } = require('../../contracts/architecture/validator.js');

function validateCoinCardArchitecture({ silent = false } = {}) {
  return validateArchitecture({
    repoRoot: path.resolve(__dirname, '../..'),
    artifactPath: 'docs/product/coin-card/coin-card.artifact.json',
    structurePath: 'docs/product/coin-card/coin-card.structure/v1.json',
    artifactPathForContract: 'docs/product/coin-card/coin-card.artifact.json',
    structurePathForContract: 'docs/product/coin-card/coin-card.structure/v1.json',
    silent,
  });
}

if (require.main === module) {
  try {
    validateCoinCardArchitecture();
  } catch (err) {
    console.error(`not ok - ${err.message}`);
    process.exit(1);
  }
}

module.exports = {
  validateArchitecture: validateCoinCardArchitecture,
};
