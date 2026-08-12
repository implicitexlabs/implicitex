/**
 * Firestore transaction boundary for the non-production holder control plane.
 *
 * Direct browser access remains denied by the repository Firestore rules.
 * This store persists holder intent only and never writes public registries,
 * lifecycle records, Transaction Evidence, or executable authority.
 */

'use strict';

const crypto = require('node:crypto');
const {
  ACCOUNT_SCHEMA,
  CARD_SCHEMA,
  ENVIRONMENT,
  OPERATION_SCHEMA,
  RESERVATION_SCHEMA,
  ENTITLEMENT_STATES,
  WALLET_CONTROL_STATES,
  HolderControlPlaneError,
  asDate,
  clone,
  deriveActivationReadiness,
} = require('./contract');

const COLLECTIONS = Object.freeze({
  accounts: 'coinCardHolderAccounts',
  usernameClaims: 'coinCardHolderUsernameClaims',
  reservations: 'coinCardHolderReservations',
  cards: 'coinCardHolderCards',
  operations: 'coinCardHolderOperations',
  evidenceUses: 'coinCardHolderEvidenceUses',
});

function fail(code, message, details = null) {
  throw new HolderControlPlaneError(code, message, details);
}

function dataOf(snapshot) {
  return snapshot && snapshot.exists ? snapshot.data() : null;
}

function operationDocumentId(accountId, operationId) {
  return crypto.createHash('sha256').update(`${accountId}\0${operationId}`, 'utf8').digest('hex');
}

function validateReplay(stored, input) {
  if (
    !stored
    || stored.schemaVersion !== OPERATION_SCHEMA
    || stored.environment !== ENVIRONMENT
    || stored.accountId !== input.accountId
    || stored.operationId !== input.operationId
    || stored.operationType !== input.operationType
    || stored.requestFingerprint !== input.requestFingerprint
  ) fail('IDEMPOTENCY_CONFLICT', 'Operation ID was already used for different canonical input.');
  return clone(stored.result);
}

function createFirestoreHolderControlPlaneStore(db) {
  if (!db || typeof db.runTransaction !== 'function' || typeof db.collection !== 'function') {
    throw new TypeError('Firestore database with transactions is required');
  }

  function ref(collection, id) {
    return db.collection(collection).doc(id);
  }

  function operationRef(accountId, operationId) {
    return ref(COLLECTIONS.operations, operationDocumentId(accountId, operationId));
  }

  function writeOperation(transaction, operationReference, input, now, result) {
    transaction.create(operationReference, {
      schemaVersion: OPERATION_SCHEMA,
      environment: ENVIRONMENT,
      accountId: input.accountId,
      operationId: input.operationId,
      operationType: input.operationType,
      requestFingerprint: input.requestFingerprint,
      committedAt: now,
      result: clone(result),
    });
  }

  async function ensureAccount({ accountId, now }) {
    const accountRef = ref(COLLECTIONS.accounts, accountId);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(accountRef);
      const existing = dataOf(snapshot);
      if (existing) {
        if (existing.accountId !== accountId || existing.schemaVersion !== ACCOUNT_SCHEMA) {
          fail('ACCOUNT_RECORD_INVALID', 'Stored holder account is invalid.');
        }
        return clone(existing);
      }
      const account = {
        schemaVersion: ACCOUNT_SCHEMA,
        environment: ENVIRONMENT,
        accountId,
        username: null,
        cardId: null,
        originalHolder: true,
        activeReservationId: null,
        reservedUsername: null,
        reservationExpiresAt: null,
        entitlementState: ENTITLEMENT_STATES.REQUIRED,
        controlPlaneRevision: 0,
        activationReadiness: 'PREREQUISITES_MISSING',
        authoritativeLifecycleState: null,
        authoritativeStateSource: 'EXTERNAL_READ_ONLY_NOT_STORED',
        executionEligible: false,
        createdAt: now,
        updatedAt: now,
      };
      transaction.create(accountRef, account);
      return clone(account);
    });
  }

  async function loadAccount({ accountId, now }) {
    const accountSnapshot = await ref(COLLECTIONS.accounts, accountId).get();
    const account = dataOf(accountSnapshot);
    if (!account) return null;
    if (account.accountId !== accountId || account.schemaVersion !== ACCOUNT_SCHEMA) {
      fail('ACCOUNT_RECORD_INVALID', 'Stored holder account is invalid.');
    }
    let card = null;
    if (account.cardId) {
      const cardSnapshot = await ref(COLLECTIONS.cards, account.cardId).get();
      card = dataOf(cardSnapshot);
      if (!card || card.schemaVersion !== CARD_SCHEMA || card.accountId !== accountId) {
        fail('ACCOUNT_CARD_DISAGREEMENT', 'Stored holder account and card disagree.');
      }
    }
    const readiness = deriveActivationReadiness(account, card, now);
    return { account: clone(account), card: clone(card), readiness: clone(readiness) };
  }

  async function reserveUsername(input) {
    const accountRef = ref(COLLECTIONS.accounts, input.accountId);
    const claimRef = ref(COLLECTIONS.usernameClaims, input.username);
    const opRef = operationRef(input.accountId, input.operationId);
    const proposedReservationRef = ref(COLLECTIONS.reservations, input.reservationId);

    return db.runTransaction(async (transaction) => {
      const opSnapshot = await transaction.get(opRef);
      if (opSnapshot.exists) return validateReplay(opSnapshot.data(), input);
      const [accountSnapshot, claimSnapshot] = await Promise.all([
        transaction.get(accountRef), transaction.get(claimRef),
      ]);
      const account = dataOf(accountSnapshot);
      const claim = dataOf(claimSnapshot);
      if (!account || account.accountId !== input.accountId) {
        fail('ACCOUNT_NOT_FOUND', 'Holder account does not exist.');
      }
      if (account.username || account.cardId) {
        fail('ACCOUNT_ALREADY_ASSIGNED', 'Account already owns its one Coin Card identity.');
      }

      const nowMs = input.now.getTime();
      if (account.activeReservationId && account.reservedUsername) {
        const accountReservationLive = asDate(
          account.reservationExpiresAt, 'account.reservationExpiresAt',
        ).getTime() > nowMs;
        if (accountReservationLive && account.reservedUsername !== input.username) {
          fail('ACCOUNT_RESERVATION_EXISTS', 'Account already has another live username reservation.');
        }
      }

      if (claim && ['ALLOCATED', 'TOMBSTONED', 'PERMANENTLY_HELD'].includes(claim.status)) {
        fail('USERNAME_PERMANENTLY_UNAVAILABLE', 'Username is permanently unavailable.');
      }
      if (claim && claim.status === 'RESERVED') {
        const live = asDate(claim.expiresAt, 'claim.expiresAt').getTime() > nowMs;
        if (live && claim.accountId !== input.accountId) {
          fail('USERNAME_RESERVED', 'Username is reserved by another account.');
        }
        if (live && claim.accountId === input.accountId) {
          const existing = {
            schemaVersion: RESERVATION_SCHEMA,
            status: 'RESERVED',
            authoritative: false,
            reservationId: claim.reservationId,
            accountId: input.accountId,
            username: input.username,
            createdAt: asDate(claim.createdAt, 'claim.createdAt'),
            expiresAt: asDate(claim.expiresAt, 'claim.expiresAt'),
            intendedOperation: 'ALLOCATE_COIN_CARD_IDENTITY',
            idempotent: true,
          };
          writeOperation(transaction, opRef, input, input.now, existing);
          return clone(existing);
        }
      }

      const reservation = {
        schemaVersion: RESERVATION_SCHEMA,
        environment: ENVIRONMENT,
        status: 'RESERVED',
        authoritative: false,
        reservationId: input.reservationId,
        accountId: input.accountId,
        username: input.username,
        createdAt: input.now,
        expiresAt: input.expiresAt,
        intendedOperation: 'ALLOCATE_COIN_CARD_IDENTITY',
        idempotent: false,
      };
      const nextAccount = {
        ...account,
        activeReservationId: input.reservationId,
        reservedUsername: input.username,
        reservationExpiresAt: input.expiresAt,
        controlPlaneRevision: account.controlPlaneRevision + 1,
        updatedAt: input.now,
      };
      transaction.set(accountRef, nextAccount);
      transaction.set(claimRef, {
        schemaVersion: 'coin-card-holder-username-claim.v1',
        environment: ENVIRONMENT,
        status: 'RESERVED',
        username: input.username,
        accountId: input.accountId,
        cardId: null,
        reservationId: input.reservationId,
        createdAt: input.now,
        expiresAt: input.expiresAt,
        updatedAt: input.now,
      });
      transaction.create(proposedReservationRef, reservation);
      writeOperation(transaction, opRef, input, input.now, reservation);
      return clone(reservation);
    });
  }

  async function allocateIdentity(input) {
    const accountRef = ref(COLLECTIONS.accounts, input.accountId);
    const claimRef = ref(COLLECTIONS.usernameClaims, input.username);
    const reservationRef = ref(COLLECTIONS.reservations, input.reservationId);
    const cardRef = ref(COLLECTIONS.cards, input.cardId);
    const opRef = operationRef(input.accountId, input.operationId);

    return db.runTransaction(async (transaction) => {
      const opSnapshot = await transaction.get(opRef);
      if (opSnapshot.exists) return validateReplay(opSnapshot.data(), input);
      const [accountSnapshot, claimSnapshot, reservationSnapshot, cardSnapshot] = await Promise.all([
        transaction.get(accountRef), transaction.get(claimRef),
        transaction.get(reservationRef), transaction.get(cardRef),
      ]);
      const account = dataOf(accountSnapshot);
      const claim = dataOf(claimSnapshot);
      const reservation = dataOf(reservationSnapshot);
      const existingCard = dataOf(cardSnapshot);
      if (!account || account.accountId !== input.accountId) {
        fail('ACCOUNT_NOT_FOUND', 'Holder account does not exist.');
      }
      if (account.cardId || account.username) {
        if (account.username === input.username
          && reservation
          && reservation.status === 'ALLOCATED'
          && reservation.accountId === input.accountId
          && reservation.username === input.username
          && reservation.cardId === account.cardId
          && claim
          && claim.status === 'ALLOCATED'
          && claim.cardId === account.cardId) {
          const existing = {
            authoritative: false,
            accountId: input.accountId,
            username: input.username,
            cardId: account.cardId,
            reservationId: input.reservationId,
            controlPlaneState: 'DRAFT',
            idempotent: true,
          };
          writeOperation(transaction, opRef, input, input.now, existing);
          return clone(existing);
        }
        fail('ACCOUNT_ALREADY_ASSIGNED', 'Account already owns its one Coin Card identity.');
      }
      if (!claim || claim.status !== 'RESERVED'
        || claim.accountId !== input.accountId
        || claim.reservationId !== input.reservationId
        || claim.username !== input.username) {
        fail('RESERVATION_OWNERSHIP_INVALID', 'Current username reservation is not owned by this account.');
      }
      if (!reservation || reservation.status !== 'RESERVED'
        || reservation.accountId !== input.accountId
        || reservation.username !== input.username) {
        fail('RESERVATION_INVALID', 'Username reservation record is invalid.');
      }
      if (asDate(reservation.expiresAt, 'reservation.expiresAt').getTime() <= input.now.getTime()) {
        fail('RESERVATION_EXPIRED', 'Username reservation has expired.');
      }
      if (existingCard) fail('CARD_ID_COLLISION', 'Opaque Coin Card ID is already allocated.');

      const card = {
        schemaVersion: CARD_SCHEMA,
        environment: ENVIRONMENT,
        cardId: input.cardId,
        accountId: input.accountId,
        username: input.username,
        localControlPlaneState: 'DRAFT',
        presentationDraft: null,
        presentationRevision: 0,
        routeIntent: null,
        routeRevision: 0,
        walletEvidence: null,
        walletControlState: WALLET_CONTROL_STATES.WALLET_NOT_CONFIGURED,
        entitlementState: ENTITLEMENT_STATES.REQUIRED,
        activationReadiness: 'PREREQUISITES_MISSING',
        authoritativeLifecycleState: null,
        authoritativeStateSource: 'EXTERNAL_READ_ONLY_NOT_STORED',
        executionEligible: false,
        paymentControlEnabled: false,
        controlPlaneRevision: 0,
        createdAt: input.now,
        updatedAt: input.now,
      };
      const nextAccount = {
        ...account,
        username: input.username,
        cardId: input.cardId,
        activeReservationId: null,
        reservedUsername: null,
        reservationExpiresAt: null,
        controlPlaneRevision: account.controlPlaneRevision + 1,
        updatedAt: input.now,
      };
      const result = {
        authoritative: false,
        accountId: input.accountId,
        username: input.username,
        cardId: input.cardId,
        reservationId: input.reservationId,
        controlPlaneState: 'DRAFT',
        idempotent: false,
      };
      transaction.set(accountRef, nextAccount);
      transaction.set(claimRef, {
        ...claim,
        status: 'ALLOCATED',
        cardId: input.cardId,
        expiresAt: null,
        updatedAt: input.now,
      });
      transaction.set(reservationRef, {
        ...reservation,
        status: 'ALLOCATED',
        cardId: input.cardId,
        allocatedAt: input.now,
      });
      transaction.create(cardRef, card);
      writeOperation(transaction, opRef, input, input.now, result);
      return clone(result);
    });
  }

  async function updateCard(input, mutation) {
    const accountRef = ref(COLLECTIONS.accounts, input.accountId);
    const cardRef = ref(COLLECTIONS.cards, input.cardId);
    const opRef = operationRef(input.accountId, input.operationId);
    return db.runTransaction(async (transaction) => {
      const opSnapshot = await transaction.get(opRef);
      if (opSnapshot.exists) return validateReplay(opSnapshot.data(), input);
      const [accountSnapshot, cardSnapshot] = await Promise.all([
        transaction.get(accountRef), transaction.get(cardRef),
      ]);
      const account = dataOf(accountSnapshot);
      const card = dataOf(cardSnapshot);
      if (!account || account.accountId !== input.accountId
        || account.username !== input.username || account.cardId !== input.cardId) {
        fail('ACCOUNT_CARD_CONJUNCTION_INVALID', 'Account, username, and Coin Card do not agree.');
      }
      if (!card || card.accountId !== input.accountId
        || card.username !== input.username || card.cardId !== input.cardId) {
        fail('CARD_OWNERSHIP_INVALID', 'Coin Card belongs to another identity.');
      }
      const changed = mutation(account, card, transaction);
      if (changed.extraWrites) await changed.extraWrites();
      const nextCard = {
        ...changed.card,
        controlPlaneRevision: card.controlPlaneRevision + 1,
        updatedAt: input.now,
      };
      const readiness = deriveActivationReadiness(account, nextCard, input.now);
      nextCard.activationReadiness = readiness.status;
      nextCard.walletControlState = readiness.walletControlState;
      const result = { ...changed.result, readiness: clone(readiness) };
      transaction.set(cardRef, nextCard);
      transaction.set(accountRef, {
        ...account,
        entitlementState: nextCard.entitlementState,
        activationReadiness: readiness.status,
        controlPlaneRevision: account.controlPlaneRevision + 1,
        updatedAt: input.now,
      });
      writeOperation(transaction, opRef, input, input.now, result);
      return clone(result);
    });
  }

  async function savePresentation(input) {
    return updateCard(input, (_account, card) => {
      if (card.presentationRevision !== input.expectedRevision) {
        fail('STALE_PRESENTATION_REVISION', 'Presentation draft was updated by another operation.');
      }
      const revision = card.presentationRevision + 1;
      return {
        card: { ...card, presentationDraft: clone(input.presentation), presentationRevision: revision },
        result: {
          authoritative: false,
          accountId: input.accountId,
          username: input.username,
          cardId: input.cardId,
          presentation: clone(input.presentation),
          presentationRevision: revision,
        },
      };
    });
  }

  async function saveRouteIntent(input) {
    return updateCard(input, (_account, card) => {
      if (card.routeRevision !== input.expectedRevision) {
        fail('STALE_ROUTE_REVISION', 'Route intent was updated by another operation.');
      }
      const revision = card.routeRevision + 1;
      const routeIntent = {
        ...clone(input.route),
        intentId: input.operationId,
        revision,
        authoritative: false,
        writeDisposition: 'DURABLE_NON_PRODUCTION_CONTROL_PLANE_INTENT',
        stagedAt: input.now,
      };
      return {
        card: {
          ...card,
          routeIntent,
          routeRevision: revision,
          walletEvidence: null,
          walletControlState: card.routeIntent
            ? WALLET_CONTROL_STATES.ROUTE_UPDATE_REQUIRES_EVIDENCE
            : WALLET_CONTROL_STATES.WALLET_CONTROL_UNVERIFIED,
        },
        result: {
          authoritative: false,
          accountId: input.accountId,
          username: input.username,
          cardId: input.cardId,
          ...clone(input.route),
          intentId: input.operationId,
          proposedRevision: String(revision),
          walletEvidenceInvalidated: card.walletEvidence !== null,
          writeDisposition: 'DURABLE_NON_PRODUCTION_CONTROL_PLANE_INTENT',
        },
      };
    });
  }

  async function attachWalletEvidence(input) {
    const evidenceUseRef = ref(COLLECTIONS.evidenceUses, input.evidence.proofId);
    return updateCard(input, (_account, card, transaction) => {
      if (!card.routeIntent || card.routeRevision !== input.expectedRouteRevision) {
        fail('STALE_EVIDENCE_ROUTE_REVISION', 'Wallet evidence does not bind the current route revision.');
      }
      const evidence = clone(input.evidence);
      const exact = evidence.status === 'VERIFIED'
        && evidence.accountId === input.accountId
        && evidence.username === input.username
        && evidence.cardId === input.cardId
        && evidence.walletAddress === card.routeIntent.recipientAddress
        && evidence.chainId === card.routeIntent.chainId
        && evidence.tokenContractAddress === card.routeIntent.tokenContractAddress
        && evidence.routeRevision === card.routeRevision;
      if (!exact) fail('WALLET_EVIDENCE_BINDING_MISMATCH', 'Wallet evidence bindings are invalid.');
      if (asDate(evidence.expiresAt, 'evidence.expiresAt').getTime() <= input.now.getTime()) {
        fail('WALLET_EVIDENCE_EXPIRED', 'Wallet evidence is expired.');
      }
      const metadata = {
        schemaVersion: 'coin-card-holder-wallet-evidence-reference.v1',
        status: 'VERIFIED',
        proofId: evidence.proofId,
        accountId: evidence.accountId,
        username: evidence.username,
        cardId: evidence.cardId,
        walletAddress: evidence.walletAddress,
        chainId: evidence.chainId,
        tokenContractAddress: evidence.tokenContractAddress,
        routeRevision: evidence.routeRevision,
        verifiedAt: asDate(evidence.verifiedAt, 'evidence.verifiedAt'),
        expiresAt: asDate(evidence.expiresAt, 'evidence.expiresAt'),
        proofAuthority: 'INJECTED_WALLET_VERIFIER_BOUNDARY',
      };
      return {
        card: { ...card, walletEvidence: metadata, walletControlState: 'WALLET_CONTROL_VERIFIED' },
        extraWrites: async function () {
          const used = await transaction.get(evidenceUseRef);
          if (used.exists) fail('WALLET_EVIDENCE_REPLAYED', 'Wallet proof was already attached.');
          transaction.create(evidenceUseRef, {
            schemaVersion: 'coin-card-holder-wallet-evidence-use.v1',
            environment: ENVIRONMENT,
            proofId: evidence.proofId,
            accountId: input.accountId,
            username: input.username,
            cardId: input.cardId,
            routeRevision: card.routeRevision,
            attachedAt: input.now,
          });
        },
        result: {
          authoritative: false,
          accountId: input.accountId,
          username: input.username,
          cardId: input.cardId,
          status: 'VERIFIED',
          proofId: metadata.proofId,
          walletAddress: metadata.walletAddress,
          chainId: metadata.chainId,
          routeRevision: metadata.routeRevision,
          verifiedAt: metadata.verifiedAt,
          expiresAt: metadata.expiresAt,
        },
      };
    });
  }

  async function persistEntitlement(input) {
    return updateCard(input, (_account, card) => ({
      card: { ...card, entitlementState: input.entitlement.status },
      result: {
        authoritative: false,
        accountId: input.accountId,
        cardId: input.cardId,
        status: input.entitlement.status,
        source: 'INJECTED_ENTITLEMENT_AUTHORITY',
      },
    }));
  }

  return Object.freeze({
    ensureAccount,
    loadAccount,
    reserveUsername,
    allocateIdentity,
    savePresentation,
    saveRouteIntent,
    attachWalletEvidence,
    persistEntitlement,
  });
}

module.exports = Object.freeze({
  COLLECTIONS,
  operationDocumentId,
  createFirestoreHolderControlPlaneStore,
});
