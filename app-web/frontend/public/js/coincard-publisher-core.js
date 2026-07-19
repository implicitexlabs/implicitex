/* coincard-publisher-core.js - Coin Card Publisher MVP trust primitives
 *
 * Presentation-free implementation of the MVP trust stack:
 * canonicalization, hashing, signing, signature verification, registry record
 * drafting, verification output, and evidence archive construction.
 *
 * This module does not render UI, execute transfers, write files, or mutate
 * the legacy Coin Card registry.
 */
(function (root, factory) {
  'use strict';

  var api = factory(root);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IX = root.IX || {};
    root.IX.coincardPublisherCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var MANIFEST_VERSION = 1;
  var REGISTRY_VERSION = 1;
  var REVOCATION_STATUS_CLEAR = 'clear';
  var SIGNATURE_TYPE = 'eip191';
  var HASH_PREFIX = 'sha256:';

  var SUPPORTED_SUBJECT_TYPES = {
    person: true,
    creator: true,
    organization: true,
    project: true,
    merchant: true,
  };

  var SUPPORTED_NETWORKS = {
    polygon: {
      chain_id: 137,
      name: 'polygon',
    },
  };

  var SUPPORTED_ASSETS = {
    USDC: {
      symbol: 'USDC',
      contract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      decimals: 6,
    },
  };

  var HEX_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
  var HEX_SIGNATURE_RE = /^0x[0-9a-fA-F]+$/;
  var CARD_ID_RE = /^coincard:[a-z0-9-]+:[a-z0-9-]+$/;
  var RFC3339_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  var URL_RE = /^https:\/\/[^\s<>"]+$/;
  var FORBIDDEN_TEXT_RE = /<[^>]*>|javascript:|data:text\/html|on[a-z]+\s*=|trusted recipient|safe recipient|safe merchant|verified business|guaranteed payment|insured transfer|fraud-proof|risk-free|legally approved/i;

  var ALLOWED_TOP_LEVEL = {
    version: true,
    card_id: true,
    subject: true,
    recipient: true,
    network: true,
    asset: true,
    created_at: true,
    issuer: true,
    signature: true,
    display_name: true,
    description: true,
    website: true,
    avatar_uri: true,
    reference_uri: true,
    metadata_uri: true,
    expires_at: true,
  };

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function assertPlainObject(value, path) {
    if (!isPlainObject(value)) {
      throw new Error(path + ' must be an object');
    }
  }

  function assertNoArrays(value, path) {
    if (Array.isArray(value)) {
      throw new Error(path + ' arrays are not permitted in V1');
    }
    if (isPlainObject(value)) {
      Object.keys(value).forEach(function (key) {
        assertNoArrays(value[key], path + '.' + key);
      });
    }
  }

  function assertNoNullsOrEmptyStrings(value, path) {
    if (value === null) {
      throw new Error(path + ' null values are not permitted');
    }
    if (typeof value === 'string' && value.trim() === '') {
      throw new Error(path + ' empty strings are not permitted');
    }
    if (isPlainObject(value)) {
      Object.keys(value).forEach(function (key) {
        assertNoNullsOrEmptyStrings(value[key], path + '.' + key);
      });
    }
  }

  function assertNoForbiddenText(value, path) {
    if (typeof value === 'string' && FORBIDDEN_TEXT_RE.test(value)) {
      throw new Error(path + ' contains executable, presentation, or forbidden trust language');
    }
    if (isPlainObject(value)) {
      Object.keys(value).forEach(function (key) {
        assertNoForbiddenText(value[key], path + '.' + key);
      });
    }
  }

  function assertKnownFields(object, allowed, path) {
    Object.keys(object).forEach(function (key) {
      if (!allowed[key]) {
        throw new Error(path + '.' + key + ' is not permitted');
      }
    });
  }

  function canonicalize(value) {
    if (value === null || value === undefined) {
      throw new Error('null and undefined are not canonical payload values');
    }
    if (Array.isArray(value)) {
      throw new Error('arrays are not permitted in V1 canonical payloads');
    }
    if (typeof value === 'string') {
      if (value === '') throw new Error('empty strings are not permitted');
      return JSON.stringify(value);
    }
    if (typeof value === 'number') {
      if (!Number.isInteger(value)) throw new Error('only integer numbers are permitted');
      return String(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (isPlainObject(value)) {
      var keys = Object.keys(value).sort();
      return '{' + keys.map(function (key) {
        return JSON.stringify(key) + ':' + canonicalize(value[key]);
      }).join(',') + '}';
    }
    throw new Error('unsupported canonical payload value');
  }

  function utf8Bytes(text) {
    return new TextEncoder().encode(text);
  }

  function toHex(buffer) {
    return Array.prototype.map.call(new Uint8Array(buffer), function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function sha256Hex(text) {
    if (!root.crypto || !root.crypto.subtle) {
      return Promise.reject(new Error('Web Crypto SHA-256 unavailable'));
    }
    return root.crypto.subtle.digest('SHA-256', utf8Bytes(text)).then(toHex);
  }

  function normalizeString(value) {
    return String(value || '').trim();
  }

  function normalizeAddress(value) {
    return normalizeString(value);
  }

  function lowerAddress(value) {
    return normalizeAddress(value).toLowerCase();
  }

  function assertAddress(value, path) {
    if (!HEX_ADDRESS_RE.test(normalizeAddress(value))) {
      throw new Error(path + ' must be a valid EVM address');
    }
  }

  function assertTimestamp(value, path) {
    if (!RFC3339_UTC_RE.test(normalizeString(value))) {
      throw new Error(path + ' must be an RFC 3339 UTC timestamp');
    }
    if (Number.isNaN(new Date(value).getTime())) {
      throw new Error(path + ' must be a valid timestamp');
    }
  }

  function assertHttpsUri(value, path) {
    if (!URL_RE.test(normalizeString(value))) {
      throw new Error(path + ' must be an HTTPS URI');
    }
  }

  function slugify(value) {
    return normalizeString(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  function buildCardId(subjectType, subjectName) {
    var slug = slugify(subjectName);
    if (!SUPPORTED_SUBJECT_TYPES[subjectType]) {
      throw new Error('unsupported subject type');
    }
    if (!slug) throw new Error('subject name must produce a card slug');
    return 'coincard:' + subjectType + ':' + slug;
  }

  function stripSignature(manifest) {
    var clone = Object.assign({}, manifest);
    delete clone.signature;
    return clone;
  }

  function buildUnsignedManifest(input) {
    var subjectType = normalizeString(input.subject_type || input.subjectType || 'creator').toLowerCase();
    var subjectName = normalizeString(input.subject_name || input.subjectName);
    var cardId = normalizeString(input.card_id || input.cardId) || buildCardId(subjectType, subjectName);
    var createdAt = normalizeString(input.created_at || input.createdAt) || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    var networkKey = normalizeString(input.network || 'polygon').toLowerCase();
    var assetKey = normalizeString(input.asset || 'USDC').toUpperCase();
    var network = SUPPORTED_NETWORKS[networkKey];
    var asset = SUPPORTED_ASSETS[assetKey];
    var manifest = {
      version: MANIFEST_VERSION,
      card_id: cardId,
      subject: {
        type: subjectType,
        name: subjectName,
      },
      recipient: {
        address: normalizeAddress(input.recipient_address || input.recipientAddress),
      },
      network: {
        chain_id: network ? network.chain_id : Number(input.chain_id || input.chainId),
        name: network ? network.name : networkKey,
      },
      asset: {
        symbol: asset ? asset.symbol : assetKey,
        contract: asset ? asset.contract : normalizeAddress(input.asset_contract || input.assetContract),
        decimals: asset ? asset.decimals : Number(input.asset_decimals || input.assetDecimals),
      },
      created_at: createdAt,
      issuer: {
        type: 'wallet',
        address: normalizeAddress(input.issuer_address || input.issuerAddress),
      },
    };

    var optionalStrings = [
      ['display_name', input.display_name || input.displayName],
      ['description', input.description],
      ['website', input.website],
      ['avatar_uri', input.avatar_uri || input.avatarUri],
      ['reference_uri', input.reference_uri || input.referenceUri],
      ['metadata_uri', input.metadata_uri || input.metadataUri],
      ['expires_at', input.expires_at || input.expiresAt],
    ];

    optionalStrings.forEach(function (pair) {
      var value = normalizeString(pair[1]);
      if (value) manifest[pair[0]] = value;
    });

    validateUnsignedManifest(manifest);
    return manifest;
  }

  function validateUnsignedManifest(manifest) {
    assertPlainObject(manifest, 'manifest');
    assertKnownFields(manifest, ALLOWED_TOP_LEVEL, 'manifest');
    assertNoArrays(manifest, 'manifest');
    assertNoNullsOrEmptyStrings(manifest, 'manifest');
    assertNoForbiddenText(manifest, 'manifest');

    if (manifest.version !== MANIFEST_VERSION) throw new Error('unsupported manifest version');
    if (!CARD_ID_RE.test(manifest.card_id)) throw new Error('card_id is malformed');
    assertPlainObject(manifest.subject, 'manifest.subject');
    if (!SUPPORTED_SUBJECT_TYPES[manifest.subject.type]) throw new Error('subject.type is unsupported');
    if (!manifest.subject.name) throw new Error('subject.name is required');
    assertPlainObject(manifest.recipient, 'manifest.recipient');
    assertAddress(manifest.recipient.address, 'manifest.recipient.address');
    assertPlainObject(manifest.network, 'manifest.network');
    if (manifest.network.chain_id !== 137 || manifest.network.name !== 'polygon') {
      throw new Error('unsupported network');
    }
    assertPlainObject(manifest.asset, 'manifest.asset');
    if (manifest.asset.symbol !== 'USDC') throw new Error('unsupported asset');
    assertAddress(manifest.asset.contract, 'manifest.asset.contract');
    if (manifest.asset.decimals !== 6) throw new Error('unsupported asset decimals');
    assertTimestamp(manifest.created_at, 'manifest.created_at');
    if (manifest.expires_at) {
      assertTimestamp(manifest.expires_at, 'manifest.expires_at');
      if (new Date(manifest.expires_at).getTime() <= new Date(manifest.created_at).getTime()) {
        throw new Error('expires_at must be later than created_at');
      }
      if (new Date(manifest.expires_at).getTime() <= Date.now()) {
        throw new Error('payload has expired');
      }
    }
    assertPlainObject(manifest.issuer, 'manifest.issuer');
    if (manifest.issuer.type !== 'wallet') throw new Error('unsupported issuer.type');
    assertAddress(manifest.issuer.address, 'manifest.issuer.address');
    ['website', 'avatar_uri', 'reference_uri', 'metadata_uri'].forEach(function (key) {
      if (manifest[key]) assertHttpsUri(manifest[key], 'manifest.' + key);
    });
  }

  function hashCanonicalPayload(unsignedManifest) {
    validateUnsignedManifest(unsignedManifest);
    var canonical = canonicalize(unsignedManifest);
    return sha256Hex(canonical).then(function (hash) {
      return {
        canonical: canonical,
        hash: HASH_PREFIX + hash,
      };
    });
  }

  function hashCompleteManifest(manifest) {
    validateSignedManifestShape(manifest);
    var canonical = canonicalize(manifest);
    return sha256Hex(canonical).then(function (hash) {
      return {
        canonical: canonical,
        hash: HASH_PREFIX + hash,
      };
    });
  }

  function validateSignedManifestShape(manifest) {
    assertPlainObject(manifest, 'manifest');
    assertKnownFields(manifest, ALLOWED_TOP_LEVEL, 'manifest');
    if (!manifest.signature) throw new Error('manifest.signature is required');
    var unsigned = stripSignature(manifest);
    validateUnsignedManifest(unsigned);
    assertPlainObject(manifest.signature, 'manifest.signature');
    if (manifest.signature.type !== SIGNATURE_TYPE) throw new Error('unsupported signature.type');
    if (!HEX_SIGNATURE_RE.test(manifest.signature.value)) throw new Error('signature.value is malformed');
  }

  function getEthers() {
    if (!root.ethers) throw new Error('ethers is required for signing and signature verification');
    return root.ethers;
  }

  function getEthereum() {
    if (!root.ethereum || typeof root.ethereum.request !== 'function') {
      throw new Error('wallet provider unavailable');
    }
    return root.ethereum;
  }

  function requestAccounts() {
    return getEthereum().request({ method: 'eth_requestAccounts' }).then(function (accounts) {
      if (!accounts || !accounts[0]) throw new Error('no wallet account connected');
      return accounts[0];
    });
  }

  function signPayload(unsignedManifest) {
    return hashCanonicalPayload(unsignedManifest).then(function (payload) {
      return requestAccounts().then(function (account) {
        if (lowerAddress(account) !== lowerAddress(unsignedManifest.issuer.address)) {
          throw new Error('connected wallet does not match issuer.address');
        }
        return getEthereum().request({
          method: 'personal_sign',
          params: [payload.canonical, account],
        }).then(function (signature) {
          var signed = Object.assign({}, unsignedManifest, {
            signature: {
              type: SIGNATURE_TYPE,
              value: signature,
            },
          });
          return {
            manifest: signed,
            canonical: payload.canonical,
            payload_hash: payload.hash,
            signer: account,
          };
        });
      });
    });
  }

  function verifySignature(manifest) {
    validateSignedManifestShape(manifest);
    var unsigned = stripSignature(manifest);
    var canonical = canonicalize(unsigned);
    var ethers = getEthers();
    var recovered = ethers.verifyMessage(canonical, manifest.signature.value);
    var ok = lowerAddress(recovered) === lowerAddress(manifest.issuer.address);
    return hashCanonicalPayload(unsigned).then(function (payload) {
      return {
        ok: ok,
        recovered: recovered,
        issuer: manifest.issuer.address,
        payload_hash: payload.hash,
      };
    });
  }

  function createRegistryRecord(manifest, options) {
    options = options || {};
    validateSignedManifestShape(manifest);
    return Promise.all([
      hashCompleteManifest(manifest),
      verifySignature(manifest),
    ]).then(function (results) {
      var manifestHash = results[0].hash;
      var signatureResult = results[1];
      if (!signatureResult.ok) throw new Error('manifest signature does not match issuer');
      var now = (options.now || new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');
      var record = {
        registry_version: REGISTRY_VERSION,
        card_id: manifest.card_id,
        manifest_hash: manifestHash,
        manifest_uri: options.manifest_uri || '/registry/coincards/' + encodeURIComponent(manifest.card_id) + '.json',
        status: options.status || 'ACTIVE',
        published_at: options.published_at || now,
        updated_at: options.updated_at || now,
      };
      if (options.registry_signature) {
        record.registry_signature = {
          type: SIGNATURE_TYPE,
          value: options.registry_signature,
        };
      }
      return {
        record: record,
        manifest_hash: manifestHash,
        registry_signature_status: options.registry_signature ? 'present' : 'pending',
      };
    });
  }

  function createVerificationOutput(manifest, registryRecord, options) {
    options = options || {};
    var output = {
      identity_binding_status: 'pending',
      destination_status: 'pending',
      manifest_signature_status: 'pending',
      registry_status: registryRecord && registryRecord.status || 'UNKNOWN',
      registry_lookup_state: registryRecord ? 'FOUND' : 'NOT_FOUND',
      revocation_status: options.revocation_status || REVOCATION_STATUS_CLEAR,
      evidence_freshness: options.evidence_freshness || 'current',
      last_checked_at: options.last_checked_at || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      payload_hash: null,
      manifest_hash_match: false,
      registry_signature_status: options.registry_signature_status ||
        (registryRecord && registryRecord.registry_signature ? 'present' : 'pending'),
      revocation_signature_status: options.revocation_signature_status || 'not_applicable',
      verification_state: 'pending',
      uncertainty_reason: null,
      summary: '',
    };

    try {
      validateSignedManifestShape(manifest);
      output.identity_binding_status = 'valid';
      output.destination_status = 'valid';
      return Promise.all([
        verifySignature(manifest),
        hashCompleteManifest(manifest),
      ]).then(function (results) {
        var signature = results[0];
        var completeHash = results[1].hash;
        output.manifest_signature_status = signature.ok ? 'valid' : 'invalid';
        output.payload_hash = signature.payload_hash;
        output.manifest_hash_match = !!(registryRecord && registryRecord.manifest_hash === completeHash);
        if (!signature.ok) {
          output.verification_state = 'invalid';
          output.uncertainty_reason = 'signature_mismatch';
        } else if (!registryRecord) {
          output.verification_state = 'unknown';
          output.uncertainty_reason = 'registry_record_missing';
        } else if (!output.manifest_hash_match) {
          output.verification_state = 'mismatch';
          output.uncertainty_reason = 'manifest_hash_mismatch';
        } else if (registryRecord.status !== 'ACTIVE') {
          output.verification_state = String(registryRecord.status || 'UNKNOWN').toLowerCase();
          output.uncertainty_reason = registryRecord.status === 'UNKNOWN' ? 'registry_status_unknown' : null;
        } else if (output.registry_signature_status === 'pending') {
          output.verification_state = 'pending';
          output.uncertainty_reason = 'registry_signature_pending';
        } else if (output.registry_signature_status === 'present') {
          output.verification_state = 'pending';
          output.uncertainty_reason = 'registry_signature_unverified';
        } else {
          output.verification_state = 'active';
        }
        output.summary = buildVerificationSummary(output);
        return output;
      });
    } catch (err) {
      output.verification_state = 'invalid';
      output.uncertainty_reason = err.message;
      output.summary = buildVerificationSummary(output);
      return Promise.resolve(output);
    }
  }

  function buildVerificationSummary(output) {
    if (output.verification_state === 'active') {
      return 'Verified payment identity; registry ACTIVE; revocation clear.';
    }
    if (output.verification_state === 'pending') {
      return 'Verification pending. Current operational validity cannot be fully established.';
    }
    if (output.verification_state === 'mismatch') {
      return 'Manifest hash mismatch. Do not treat this Coin Card as active.';
    }
    if (output.verification_state === 'unknown') {
      return 'Current operational validity cannot be established.';
    }
    return 'Verification failed or unavailable. Do not treat this Coin Card as active.';
  }

  function createEvidenceArchive(manifest, registryRecord, verificationOutput, publisherConfirmation) {
    return {
      archive_version: 1,
      created_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      card_id: manifest && manifest.card_id || null,
      signed_manifest: manifest || null,
      registry_record: registryRecord || null,
      verification_output: verificationOutput || null,
      publisher_confirmation: publisherConfirmation || null,
      evidence_state: {
        observed: [
          'signed_manifest',
          registryRecord ? 'registry_record' : null,
          verificationOutput ? 'verification_output' : null,
        ].filter(Boolean),
        inferred: [],
        stale: verificationOutput && verificationOutput.evidence_freshness === 'stale' ? ['registry_status'] : [],
        missing: [
          registryRecord && registryRecord.registry_signature ? null : 'registry_signature',
        ].filter(Boolean),
        failed: verificationOutput && verificationOutput.verification_state === 'invalid' ? ['verification'] : [],
        unknown: verificationOutput && verificationOutput.verification_state === 'unknown' ? ['operational_validity'] : [],
      },
    };
  }

  return Object.freeze({
    MANIFEST_VERSION: MANIFEST_VERSION,
    REGISTRY_VERSION: REGISTRY_VERSION,
    SUPPORTED_NETWORKS: SUPPORTED_NETWORKS,
    SUPPORTED_ASSETS: SUPPORTED_ASSETS,
    canonicalize: canonicalize,
    sha256Hex: sha256Hex,
    buildCardId: buildCardId,
    buildUnsignedManifest: buildUnsignedManifest,
    validateUnsignedManifest: validateUnsignedManifest,
    validateSignedManifestShape: validateSignedManifestShape,
    hashCanonicalPayload: hashCanonicalPayload,
    hashCompleteManifest: hashCompleteManifest,
    signPayload: signPayload,
    verifySignature: verifySignature,
    createRegistryRecord: createRegistryRecord,
    createVerificationOutput: createVerificationOutput,
    createEvidenceArchive: createEvidenceArchive,
  });
});
