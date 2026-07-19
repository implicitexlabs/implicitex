const { validateArchitecture } = require('../../scripts/validate_coin_card_architecture.js');

try {
  validateArchitecture({ silent: true });
  console.log('ok - Coin Card architecture validator passes');
} catch (err) {
  console.error(`not ok - ${err.message}`);
  throw err;
}
