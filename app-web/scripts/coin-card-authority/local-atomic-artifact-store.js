'use strict';

const canonicalJsonApi = require('../../frontend/public/card/coin-card-canonical-json-v1.js');

function clone(value) {
  const canonical = canonicalJsonApi.canonicalizeJson(value);
  if (canonical === null) throw new TypeError('store accepts canonical plain JSON only');
  return JSON.parse(canonical);
}

function frozenClone(value) {
  const copy = clone(value);
  (function freeze(item) {
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) return;
    Object.getOwnPropertyNames(item).forEach((key) => freeze(item[key]));
    Object.freeze(item);
  }(copy));
  return copy;
}

function createLocalAtomicArtifactStore() {
  const immutable = new Map();
  const current = new Map();

  return Object.freeze({
    async putImmutable(key, value) {
      if (typeof key !== 'string' || !key) throw new TypeError('immutable key is required');
      const next = frozenClone(value);
      if (immutable.has(key)) {
        const existing = immutable.get(key);
        if (canonicalJsonApi.canonicalizeJson(existing) !== canonicalJsonApi.canonicalizeJson(next)) {
          throw new Error('immutable artifact conflict');
        }
        return existing;
      }
      immutable.set(key, next);
      return next;
    },
    async readImmutable(key) {
      return immutable.has(key) ? frozenClone(immutable.get(key)) : null;
    },
    async compareAndSwapCurrent(scope, expectedHash, nextPointer) {
      if (typeof scope !== 'string' || !scope) throw new TypeError('current scope is required');
      const prior = current.get(scope) || null;
      const priorHash = prior && prior.artifactHash || null;
      if (priorHash !== expectedHash) throw new Error('current pointer compare-and-swap conflict');
      if (
        !nextPointer
        || typeof nextPointer.artifactKey !== 'string'
        || typeof nextPointer.artifactHash !== 'string'
        || !immutable.has(nextPointer.artifactKey)
      ) throw new Error('current pointer must reference a written immutable artifact');
      current.set(scope, frozenClone(nextPointer));
      return frozenClone(nextPointer);
    },
    async readCurrent(scope) {
      return current.has(scope) ? frozenClone(current.get(scope)) : null;
    },
    async readCurrentArtifact(scope) {
      const pointer = current.get(scope);
      return pointer ? frozenClone(immutable.get(pointer.artifactKey)) : null;
    },
  });
}

module.exports = Object.freeze({ createLocalAtomicArtifactStore });
