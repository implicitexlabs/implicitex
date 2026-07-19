(function (root, factory) {
  'use strict';

  const schemaApi = root && root.IX && root.IX.receiptSchema
    ? root.IX.receiptSchema
    : (typeof require === 'function' ? require('./receipt-schema.js') : null);
  const api = factory(schemaApi);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IX = root.IX || {};
    root.IX.proofPacket = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function (schemaApi) {
  'use strict';

  const PROOF_PACKET_SCHEMA_VERSION = 'proof-packet.v1';

  function buildProofPacket(receipt) {
    const source = schemaApi ? schemaApi.migrateReceipt(receipt) : (receipt || {});
    return {
      app: 'ImplicitEx',
      schemaVersion: PROOF_PACKET_SCHEMA_VERSION,
      version: '0.1.0',
      network: source.network || '—',
      chainId: source.chainId || null,
      token: 'USDC',
      transferContract: source.contractAddress || null,
      coinCard: source.coinCard || null,
      sender: source.sender || null,
      recipient: source.recipient || null,
      amount: source.amount || null,
      fee: source.fee || null,
      totalDebit: source.totalDebit || null,
      transactionHash: source.transferHash || source.hash || null,
      approvalHash: source.approvalHash || null,
      blockNumber: source.blockNumber || null,
      status: source.state || 'unknown',
      fundsMoved: source.fundsMoved === undefined ? null : source.fundsMoved,
      explorerUrl: source.explorerUrl || null,
      purposeTag: source.purposeTag || '',
      referenceId: source.referenceId || '',
      memo: source.memo || '',
      observationSource: source.observationSource || '',
      lastObservedAt: source.lastObservedAt || null,
      createdAt: source.createdAt || source.timestamp || null,
      resolvedAt: source.resolvedAt || null,
      lastKnownMessage: source.lastKnownMessage || '',
      evidenceSections: buildReceiptEvidenceSections(source),
    };
  }

  function field(value) {
    return value === undefined || value === null || value === '' ? null : value;
  }

  function buildReceiptEvidenceSections(receipt) {
    const source = schemaApi ? schemaApi.migrateReceipt(receipt) : (receipt || {});
    const coinCard = source.coinCard || {};
    return [
      {
        title: 'Settlement Truth',
        owner: 'Blockchain',
        facts: {
          transactionHash: field(source.transferHash || source.hash),
          blockNumber: field(source.blockNumber),
          sender: field(source.sender),
          recipient: field(source.recipient),
          amount: field(source.amount),
          fee: field(source.fee),
          totalDebit: field(source.totalDebit),
          network: field(source.network),
          chainId: field(source.chainId),
          explorerUrl: field(source.explorerUrl),
        },
      },
      {
        title: 'Recorded Coin Card Evidence',
        owner: 'ImplicitEx',
        facts: {
          schema: field(coinCard.schema),
          version: field(coinCard.version),
          manifestUrl: field(coinCard.manifestUrl),
          manifestHash: field(coinCard.manifestHash),
          manifestCreated: field(coinCard.manifestCreated),
          manifestUpdated: field(coinCard.manifestUpdated),
          routeValidation: field(coinCard.routeValidation),
          recipientSource: field(coinCard.recipientSource),
          contractAddress: field(source.contractAddress),
        },
      },
      {
        title: 'Host-Published Manifest Data',
        owner: 'Publisher',
        facts: {
          name: field(coinCard.name),
          recipientAddress: field(source.recipient),
          network: field(source.network),
          token: 'USDC',
          status: field(coinCard.status),
        },
      },
    ];
  }

  return Object.freeze({
    PROOF_PACKET_SCHEMA_VERSION,
    buildProofPacket,
    buildReceiptEvidenceSections,
  });
});
