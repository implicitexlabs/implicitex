/* Coin Card canonical username policy.
 *
 * This is the single source used to generate the browser and Firebase
 * Functions runtime copies. Current issuance is deliberately distinct from
 * historical registry verification.
 */

(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && typeof root === 'object') {
    Object.defineProperty(root, 'IX_COIN_CARD_CANONICAL_USERNAME', {
      value: api,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }
})(typeof window === 'object' ? window : null, function () {
  'use strict';

  var REGISTRY_SCHEMA_V1 = 'coin-card-public-username-registry.v1';
  var REGISTRY_SCHEMA_V2 = 'coin-card-public-username-registry.v2';
  var POLICY_V1 = Object.freeze({
    policyVersion: 'coin-card-username-policy.v1',
    minimumLength: 3,
    maximumLength: 30,
    registrySchemaVersion: REGISTRY_SCHEMA_V1,
  });
  var CURRENT_POLICY = Object.freeze({
    policyVersion: 'coin-card-username-policy.v2',
    minimumLength: 4,
    maximumLength: 32,
    registrySchemaVersion: REGISTRY_SCHEMA_V2,
  });
  var POLICY_BY_SCHEMA = Object.freeze({
    [REGISTRY_SCHEMA_V1]: POLICY_V1,
    [REGISTRY_SCHEMA_V2]: CURRENT_POLICY,
  });

  function result(valid, code, username, policy) {
    return Object.freeze({
      valid: valid === true,
      code: code || null,
      username: valid === true ? username : null,
      policyVersion: policy && policy.policyVersion || null,
      registrySchemaVersion: policy && policy.registrySchemaVersion || null,
    });
  }

  function validateWithPolicy(value, policy) {
    if (!policy) return result(false, 'USERNAME_POLICY_UNSUPPORTED', null, null);
    if (typeof value !== 'string') return result(false, 'USERNAME_TYPE_INVALID', null, policy);
    if (value.length < policy.minimumLength || value.length > policy.maximumLength) {
      return result(false, 'USERNAME_LENGTH_INVALID', null, policy);
    }
    if (!/^[\x00-\x7f]+$/.test(value)) {
      return result(false, 'USERNAME_NON_ASCII', null, policy);
    }
    if (!/^[a-z0-9-]+$/.test(value)) {
      return result(false, 'USERNAME_CHARACTER_INVALID', null, policy);
    }
    if (value[0] === '-' || value[value.length - 1] === '-') {
      return result(false, 'USERNAME_HYPHEN_BOUNDARY_INVALID', null, policy);
    }
    return result(true, null, value, policy);
  }

  function policyForRegistrySchema(schemaVersion) {
    return Object.prototype.hasOwnProperty.call(POLICY_BY_SCHEMA, schemaVersion)
      ? POLICY_BY_SCHEMA[schemaVersion]
      : null;
  }

  function validateCurrentUsername(value) {
    return validateWithPolicy(value, CURRENT_POLICY);
  }

  function validateHistoricalV1Username(value) {
    return validateWithPolicy(value, POLICY_V1);
  }

  function validateRegistryUsername(value, schemaVersion) {
    return validateWithPolicy(value, policyForRegistrySchema(schemaVersion));
  }

  function canonicalizePublicRouteUsername(value) {
    if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return null;
    if (!/^[A-Za-z0-9-]+$/.test(value)) return null;
    var normalized = value.toLowerCase();
    return validateCurrentUsername(normalized).valid ? normalized : null;
  }

  function assertCurrentUsername(value) {
    var validation = validateCurrentUsername(value);
    if (!validation.valid) {
      var error = new TypeError('Coin Card username must be 4–32 lowercase ASCII letters, digits, or hyphens without a leading or trailing hyphen.');
      error.code = validation.code;
      throw error;
    }
    return validation.username;
  }

  return Object.freeze({
    REGISTRY_SCHEMA_V1: REGISTRY_SCHEMA_V1,
    REGISTRY_SCHEMA_V2: REGISTRY_SCHEMA_V2,
    POLICY_V1: POLICY_V1,
    CURRENT_POLICY: CURRENT_POLICY,
    policyForRegistrySchema: policyForRegistrySchema,
    validateCurrentUsername: validateCurrentUsername,
    validateHistoricalV1Username: validateHistoricalV1Username,
    validateRegistryUsername: validateRegistryUsername,
    canonicalizePublicRouteUsername: canonicalizePublicRouteUsername,
    assertCurrentUsername: assertCurrentUsername,
  });
});
