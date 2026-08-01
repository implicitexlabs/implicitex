(function () {
  'use strict';

  var els = {
    loadBtn: document.getElementById('loadBtn'),
    simulateBtn: document.getElementById('simulateBtn'),
    mutateBtn: document.getElementById('mutateBtn'),
    resetBtn: document.getElementById('resetBtn'),
    status: document.getElementById('status'),
    publishedFacts: document.getElementById('publishedFacts'),
    observedFacts: document.getElementById('observedFacts'),
    happenedFacts: document.getElementById('happenedFacts'),
    changedFacts: document.getElementById('changedFacts'),
    authorityResult: document.getElementById('authorityResult'),
    currentFacts: document.getElementById('currentFacts'),
    receiptFacts: document.getElementById('receiptFacts'),
    manifestJson: document.getElementById('manifestJson'),
    proofJson: document.getElementById('proofJson'),
    evidenceSections: document.getElementById('evidenceSections'),
  };

  var manifestApi = window.IX && window.IX.coincardFreeManifest;
  var receiptSchema = window.IX && window.IX.receiptSchema;
  var proofPacket = window.IX && window.IX.proofPacket;

  var state = {
    currentManifest: null,
    currentHash: null,
    receipt: null,
    packet: null,
    changedAfterReceipt: false,
  };

  function setStatus(message, tone) {
    els.status.textContent = message;
    els.status.className = 'status' + (tone ? ' ' + tone : '');
  }

  function pretty(value) {
    return JSON.stringify(value || {}, null, 2);
  }

  function renderFacts(container, facts) {
    container.replaceChildren();
    facts.forEach(function (fact) {
      var row = document.createElement('div');
      row.className = 'fact';
      var label = document.createElement('div');
      label.className = 'label';
      label.textContent = fact[0];
      var value = document.createElement('div');
      value.className = 'value';
      value.textContent = fact[1] === null || fact[1] === undefined || fact[1] === '' ? '-' : String(fact[1]);
      row.append(label, value);
      container.append(row);
    });
  }

  function renderEvidenceSections(packet) {
    els.evidenceSections.replaceChildren();
    var sections = packet && packet.evidenceSections || [];
    if (!sections.length) {
      var empty = document.createElement('p');
      empty.className = 'label';
      empty.textContent = 'No proof packet rendered.';
      els.evidenceSections.append(empty);
      return;
    }
    sections.forEach(function (section) {
      var wrap = document.createElement('div');
      wrap.className = 'evidence-section';
      var title = document.createElement('h2');
      title.textContent = section.title;
      var owner = document.createElement('p');
      owner.className = 'owner';
      owner.textContent = 'Owner: ' + section.owner;
      var facts = document.createElement('div');
      facts.className = 'fact-list';
      Object.keys(section.facts || {}).forEach(function (key) {
        var row = document.createElement('div');
        row.className = 'fact';
        var label = document.createElement('div');
        label.className = 'label';
        label.textContent = key;
        var value = document.createElement('div');
        value.className = 'value';
        value.textContent = section.facts[key] === null || section.facts[key] === undefined ? '-' : String(section.facts[key]);
        row.append(label, value);
        facts.append(row);
      });
      wrap.append(title, owner, facts);
      els.evidenceSections.append(wrap);
    });
  }

  function render() {
    els.manifestJson.textContent = pretty(state.currentManifest);
    els.proofJson.textContent = pretty(state.packet);
    renderFacts(els.publishedFacts, [
      ['Publisher', state.currentManifest && state.currentManifest.name],
      ['Published recipient', state.currentManifest && state.currentManifest.recipientAddress],
      ['Published on', state.currentManifest && state.currentManifest.created],
      ['Current updated', state.currentManifest && state.currentManifest.updated],
      ['Manifest fingerprint', state.currentHash],
    ]);
    renderFacts(els.observedFacts, [
      ['Coin Card loaded', state.currentManifest ? 'yes' : null],
      ['Route validated', state.currentManifest ? 'yes' : null],
      ['Network', state.currentManifest && state.currentManifest.network],
      ['Token', state.currentManifest && state.currentManifest.token],
      ['Recorded fingerprint', state.receipt && state.receipt.coinCard && state.receipt.coinCard.manifestHash],
    ]);
    renderFacts(els.happenedFacts, [
      ['Sender', state.receipt && state.receipt.sender],
      ['Recipient', state.receipt && state.receipt.recipient],
      ['Amount', state.receipt && state.receipt.amount ? state.receipt.amount + ' USDC' : null],
      ['Fee', state.receipt && state.receipt.fee ? state.receipt.fee + ' USDC' : null],
      ['Transaction', state.receipt && state.receipt.transferHash],
      ['Block', state.receipt && state.receipt.blockNumber],
    ]);
    renderFacts(els.changedFacts, [
      ['Current recipient', state.currentManifest && state.currentManifest.recipientAddress],
      ['Current updated', state.currentManifest && state.currentManifest.updated],
      ['Recipient used', state.receipt && state.receipt.recipient],
      ['Recorded hash', state.receipt && state.receipt.coinCard && state.receipt.coinCard.manifestHash],
    ]);
    if (!state.receipt) {
      els.authorityResult.textContent = 'No historical receipt yet.';
      els.authorityResult.className = 'result';
    } else if (state.changedAfterReceipt) {
      els.authorityResult.textContent = 'Historical receipt remains authoritative. The website changed later; the simulated payment used the earlier manifest evidence.';
      els.authorityResult.className = 'result warn';
    } else {
      els.authorityResult.textContent = 'Historical receipt recorded. Later manifest changes cannot rewrite it.';
      els.authorityResult.className = 'result ok';
    }
    renderFacts(els.currentFacts, [
      ['schema', state.currentManifest && state.currentManifest.schema],
      ['version', state.currentManifest && state.currentManifest.version],
      ['recipient', state.currentManifest && state.currentManifest.recipientAddress],
      ['updated', state.currentManifest && state.currentManifest.updated],
      ['manifest hash', state.currentHash],
    ]);
    renderFacts(els.receiptFacts, [
      ['recipient used', state.receipt && state.receipt.recipient],
      ['manifest hash', state.receipt && state.receipt.coinCard && state.receipt.coinCard.manifestHash],
      ['contract', state.receipt && state.receipt.contractAddress],
      ['tx hash', state.receipt && state.receipt.transferHash],
      ['block', state.receipt && state.receipt.blockNumber],
    ]);
    renderEvidenceSections(state.packet);
    els.simulateBtn.disabled = !state.currentManifest || !!state.receipt;
    els.mutateBtn.disabled = !state.currentManifest;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadSample() {
    return fetch('/coincard/coin-card.sample.json', { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) throw new Error('Sample manifest fetch failed');
        return response.json();
      })
      .then(function (manifest) {
        manifestApi.validateCoinCardManifest(manifest);
        return manifestApi.hashManifest(manifest).then(function (result) {
          state.currentManifest = manifest;
          state.currentHash = result.hash;
          state.receipt = null;
          state.packet = null;
          state.changedAfterReceipt = false;
          setStatus('Sample manifest loaded and route validated.', 'ok');
          render();
        });
      });
  }

  function simulateReceipt() {
    return manifestApi.buildReceiptCoinCardContext({
      manifestUrl: window.location.origin + '/coincard/coin-card.sample.json',
      manifest: state.currentManifest,
    }).then(function (coinCard) {
      state.receipt = receiptSchema.migrateReceipt({
        id: 'demo-receipt-001',
        state: 'confirmed',
        fundsMoved: true,
        sender: '0x3333333333333333333333333333333333333333',
        recipient: state.currentManifest.recipientAddress,
        amount: '10.000000',
        fee: '0.100000',
        totalDebit: '10.100000',
        chainId: 137,
        network: 'Polygon',
        contractAddress: '0x4444444444444444444444444444444444444444',
        transferHash: '0xabc0000000000000000000000000000000000000000000000000000000000000',
        hash: '0xabc0000000000000000000000000000000000000000000000000000000000',
        blockNumber: 12345678,
        explorerUrl: 'https://polygonscan.com/tx/0xabc0000000000000000000000000000000000000000000000000000000000',
        coinCard: coinCard,
        lastKnownMessage: 'Simulated confirmed transfer for Coin Card evidence demo.',
      });
        state.packet = proofPacket.buildProofPacket(state.receipt);
      state.changedAfterReceipt = false;
      setStatus('Historical receipt generated from transaction-time manifest evidence.', 'ok');
      render();
    });
  }

  function mutateManifest() {
    var changed = clone(state.currentManifest);
    changed.recipientAddress = '0x2222222222222222222222222222222222222222';
    changed.updated = '2026-07-04T19:00:00Z';
    return manifestApi.hashManifest(changed).then(function (result) {
      state.currentManifest = changed;
      state.currentHash = result.hash;
      if (state.receipt) {
        state.receipt = receiptSchema.mergeReceiptForward(state.receipt, {
          recipient: changed.recipientAddress,
          coinCard: {
            manifestHash: result.hash,
            manifestUpdated: changed.updated,
          },
          lastKnownMessage: 'Current host manifest changed after historical receipt was recorded.',
        });
        state.packet = proofPacket.buildProofPacket(state.receipt);
        state.changedAfterReceipt = true;
        setStatus('Current manifest changed. Historical receipt evidence remained authoritative.', 'warn');
      } else {
        state.changedAfterReceipt = false;
        setStatus('Current manifest changed before receipt simulation.', 'warn');
      }
      render();
    });
  }

  function reset() {
    state.currentManifest = null;
    state.currentHash = null;
    state.receipt = null;
    state.packet = null;
    state.changedAfterReceipt = false;
    setStatus('Ready.');
    render();
  }

  function run(action) {
    Promise.resolve()
      .then(action)
      .catch(function (err) {
        setStatus(err && err.message ? err.message : 'Demo action failed.', 'warn');
      });
  }

  els.loadBtn.addEventListener('click', function () { run(loadSample); });
  els.simulateBtn.addEventListener('click', function () { run(simulateReceipt); });
  els.mutateBtn.addEventListener('click', function () { run(mutateManifest); });
  els.resetBtn.addEventListener('click', reset);

  reset();
})();
