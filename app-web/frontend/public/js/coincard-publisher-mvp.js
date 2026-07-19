/* coincard-publisher-mvp.js - browser orchestration for publisher-mvp.html */
(function () {
  'use strict';

  var state = {
    unsignedManifest: null,
    signedManifest: null,
    registryRecord: null,
    verificationOutput: null,
    evidenceArchive: null,
    payloadHash: null,
    manifestHash: null,
  };

  function el(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    var node = el(id);
    if (node) node.textContent = text;
  }

  function setValue(id, value) {
    var node = el(id);
    if (node) node.value = value;
  }

  function getValue(id) {
    var node = el(id);
    return node ? node.value.trim() : '';
  }

  function pretty(value) {
    return JSON.stringify(value, null, 2);
  }

  function truncateHash(value) {
    if (!value || value.length < 24) return value || 'Pending';
    return value.slice(0, 19) + '...' + value.slice(-8);
  }

  function truncateAddress(value) {
    if (!value || value.length < 12) return value || 'Pending';
    return value.slice(0, 6) + '...' + value.slice(-4);
  }

  function setStep(step, status, detail) {
    var node = el('ccpStep' + step);
    if (!node) return;
    node.dataset.status = status;
    var statusNode = node.querySelector('.ccp-step-status');
    var detailNode = node.querySelector('.ccp-step-detail');
    if (statusNode) statusNode.textContent = status;
    if (detailNode) detailNode.textContent = detail || '';
  }

  function setNotice(kind, message) {
    var notice = el('ccpNotice');
    if (!notice) return;
    notice.dataset.kind = kind;
    notice.textContent = message;
    notice.hidden = !message;
  }

  function renderJson() {
    setValue('ccpManifestJson', state.signedManifest ? pretty(state.signedManifest) : pretty(state.unsignedManifest || {}));
    setValue('ccpRegistryJson', pretty(state.registryRecord || {}));
    setValue('ccpVerificationJson', pretty(state.verificationOutput || {}));
    setValue('ccpArchiveJson', pretty(state.evidenceArchive || {}));
  }

  function renderEvidence() {
    setText('ccpEvidenceCardId', state.unsignedManifest ? state.unsignedManifest.card_id : 'Pending');
    setText('ccpEvidenceIssuer', state.unsignedManifest ? truncateAddress(state.unsignedManifest.issuer.address) : 'Pending');
    setText('ccpEvidenceRecipient', state.unsignedManifest ? truncateAddress(state.unsignedManifest.recipient.address) : 'Pending');
    setText('ccpEvidencePayloadHash', truncateHash(state.payloadHash));
    setText('ccpEvidenceManifestHash', truncateHash(state.manifestHash));
    setText('ccpEvidenceVerificationState', state.verificationOutput ? state.verificationOutput.verification_state : 'Pending');
    setText('ccpEvidenceUncertainty', state.verificationOutput ? (state.verificationOutput.uncertainty_reason || 'none reported') : 'Pending');
  }

  function renderAll() {
    renderJson();
    renderEvidence();
  }

  function getCore() {
    if (!window.IX || !window.IX.coincardPublisherCore) {
      throw new Error('Coin Card publisher core unavailable');
    }
    return window.IX.coincardPublisherCore;
  }

  function getInputs() {
    return {
      subject_type: getValue('ccpSubjectType'),
      subject_name: getValue('ccpSubjectName'),
      display_name: getValue('ccpDisplayName'),
      description: getValue('ccpDescription'),
      recipient_address: getValue('ccpRecipientAddress'),
      issuer_address: getValue('ccpIssuerAddress'),
      reference_uri: getValue('ccpReferenceUri'),
      expires_at: getValue('ccpExpiresAt'),
      created_at: getValue('ccpCreatedAt'),
    };
  }

  function connectIssuer() {
    if (!window.ethereum || typeof window.ethereum.request !== 'function') {
      setNotice('error', 'Wallet provider unavailable. Install or unlock a browser wallet.');
      return Promise.resolve();
    }
    return window.ethereum.request({ method: 'eth_requestAccounts' })
      .then(function (accounts) {
        if (!accounts || !accounts[0]) throw new Error('No wallet account returned.');
        setValue('ccpIssuerAddress', accounts[0]);
        setNotice('ok', 'Issuer wallet selected. Review the payment identity before signing.');
      })
      .catch(function (err) {
        setNotice('error', err && err.message ? err.message : 'Wallet connection failed.');
      });
  }

  function generateManifest() {
    var core = getCore();
    setNotice('', '');
    try {
      state.unsignedManifest = core.buildUnsignedManifest(getInputs());
      state.signedManifest = null;
      state.registryRecord = null;
      state.verificationOutput = null;
      state.evidenceArchive = null;
      state.manifestHash = null;
      setStep(1, 'observed', 'Canonical unsigned payload generated.');
      setStep(2, 'pending', 'Creator signature required.');
      setStep(3, 'pending', 'Registry draft waits for signature evidence.');
      setStep(4, 'pending', 'Verification output waits for registry draft.');
      setStep(5, 'pending', 'Archive waits for evidence output.');
      return core.hashCanonicalPayload(state.unsignedManifest).then(function (payload) {
        state.payloadHash = payload.hash;
        setValue('ccpCanonicalPayload', payload.canonical);
        renderAll();
        setNotice('ok', 'Canonical manifest generated. Review the payload before signing.');
      });
    } catch (err) {
      setNotice('error', err.message);
      renderAll();
      return Promise.resolve();
    }
  }

  function signManifest() {
    var core = getCore();
    setNotice('', '');
    if (!state.unsignedManifest) {
      setNotice('error', 'Generate a canonical manifest before signing.');
      return Promise.resolve();
    }
    return core.signPayload(state.unsignedManifest)
      .then(function (signed) {
        state.signedManifest = signed.manifest;
        state.payloadHash = signed.payload_hash;
        setStep(2, 'observed', 'Creator signature captured from issuer wallet.');
        renderAll();
        setNotice('ok', 'Signed manifest created. This is not a transfer and not yet a registry publication.');
      })
      .catch(function (err) {
        setNotice('error', err.message || 'Signing failed.');
      });
  }

  function createRegistryDraft() {
    var core = getCore();
    setNotice('', '');
    if (!state.signedManifest) {
      setNotice('error', 'Sign the manifest before creating a registry draft.');
      return Promise.resolve();
    }
    return core.createRegistryRecord(state.signedManifest, {
      manifest_uri: '/registry/coincards/' + encodeURIComponent(state.signedManifest.card_id) + '.json',
    }).then(function (result) {
      state.registryRecord = result.record;
      state.manifestHash = result.manifest_hash;
      setStep(3, 'observed', 'Registry draft created. Registry signature remains pending.');
      renderAll();
      setNotice('ok', 'Registry draft created. Operational validity remains pending until registry evidence is complete.');
    }).catch(function (err) {
      setNotice('error', err.message || 'Registry draft failed.');
    });
  }

  function verifyDraft() {
    var core = getCore();
    setNotice('', '');
    if (!state.signedManifest || !state.registryRecord) {
      setNotice('error', 'Create a signed manifest and registry draft before verification.');
      return Promise.resolve();
    }
    return core.createVerificationOutput(state.signedManifest, state.registryRecord)
      .then(function (output) {
        state.verificationOutput = output;
        setStep(4, 'observed', 'Verification output created with explicit uncertainty.');
        renderAll();
        setNotice('ok', 'Verification output created. Review the uncertainty reason before treating publication as complete.');
      })
      .catch(function (err) {
        setNotice('error', err.message || 'Verification failed.');
      });
  }

  function createArchive() {
    var core = getCore();
    setNotice('', '');
    if (!state.signedManifest || !state.registryRecord || !state.verificationOutput) {
      setNotice('error', 'Create verification output before archiving evidence.');
      return;
    }
    state.evidenceArchive = core.createEvidenceArchive(
      state.signedManifest,
      state.registryRecord,
      state.verificationOutput,
      {
        reviewed_binding: !!el('ccpConfirmBinding').checked,
        reviewed_boundaries: !!el('ccpConfirmBoundaries').checked,
        reviewed_uncertainty: !!el('ccpConfirmUncertainty').checked,
      }
    );
    setStep(5, 'observed', 'Evidence archive constructed.');
    renderAll();
    setNotice('ok', 'Evidence archive created. The MVP has produced proof artifacts, not a payment execution.');
  }

  function copyOutput(id) {
    var node = el(id);
    if (!node) return;
    node.select();
    navigator.clipboard.writeText(node.value).then(function () {
      setNotice('ok', 'Copied artifact to clipboard.');
    }).catch(function () {
      setNotice('error', 'Clipboard unavailable. Select and copy the artifact manually.');
    });
  }

  function initDefaults() {
    var now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    setValue('ccpCreatedAt', now);
    setValue('ccpReferenceUri', 'https://implicitex.com/coincard/publisher-mvp.html');
  }

  function bind() {
    var actions = {
      ccpConnectIssuer: connectIssuer,
      ccpGenerateManifest: generateManifest,
      ccpSignManifest: signManifest,
      ccpCreateRegistry: createRegistryDraft,
      ccpVerifyDraft: verifyDraft,
      ccpCreateArchive: createArchive,
    };
    Object.keys(actions).forEach(function (id) {
      var button = el(id);
      if (button) {
        button.addEventListener('click', function () {
          Promise.resolve(actions[id]()).catch(function (err) {
            setNotice('error', err.message || 'Action failed.');
          });
        });
      }
    });
    document.querySelectorAll('[data-copy-output]').forEach(function (button) {
      button.addEventListener('click', function () {
        copyOutput(button.getAttribute('data-copy-output'));
      });
    });
  }

  function init() {
    initDefaults();
    bind();
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
