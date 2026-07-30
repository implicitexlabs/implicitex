(function () {
  'use strict';

  const DATA_URL = '/data/comprehensive-roadmap.json';
  const state = {
    data: null,
    currentView: 'command'
  };

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toneFor(value) {
    const normalized = String(value || '').toLowerCase();
    if (normalized.includes('active')) return 'active';
    if (normalized.includes('next authorized')) return 'next';
    if (normalized.includes('production-verified')) return 'verified';
    if (normalized.includes('approved governing')) return 'approved';
    if (normalized.includes('release-evidenced')) return 'verified';
    if (normalized.includes('implemented and tested')) return 'ready';
    if (normalized.includes('partially')) return 'warning';
    if (normalized.includes('ready but')) return 'ready';
    if (normalized.includes('legally')) return 'legal';
    if (normalized.includes('evidence-gated')) return 'gated';
    if (normalized.includes('decision')) return 'warning';
    if (normalized.includes('deferred')) return 'deferred';
    if (normalized.includes('concept')) return 'concept';
    return 'neutral';
  }

  function badge(value, label) {
    if (!value) return '';
    return `<span class="roadmap-badge" data-tone="${toneFor(value)}">${
      label ? `${escapeHtml(label)} · ` : ''
    }${escapeHtml(value)}</span>`;
  }

  function idChip(id, kind) {
    const prefix = kind || (id.startsWith('PC-') ? 'parent' : 'record');
    return `<a class="roadmap-id-chip" href="#${prefix}-${escapeHtml(id)}">${escapeHtml(id)}</a>`;
  }

  function field(label, value, full) {
    if (!value) return '';
    return `<div class="roadmap-field${full ? ' roadmap-field-full' : ''}">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>`;
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  function populateSelect(select, values) {
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  }

  function renderStats(data) {
    const totals = data.meta.totals;
    $('#sourceParentCount').textContent = totals.parents;
    $('#sourceRecordCount').textContent = totals.roadmapRecords;
    $('#statPackages').textContent = totals.workPackages;
    $('#statParents').textContent = totals.parents;
    $('#statFullRecords').textContent = totals.fullRecords;
    $('#statEvidenceGated').textContent =
      data.meta.counts.authorization['Evidence-gated'] || 0;
    $('#statProduction').textContent =
      data.meta.counts.maturity['Production-verified'] || 0;
    $('#statValidated').textContent =
      data.meta.counts.maturity['Customer-validated'] || 0;
    $('#projectionState').textContent = data.meta.sourceState;
    $('#inventoryRevision').textContent = data.meta.generatedFromInventoryRevision;
    $('#inventoryHash').textContent = data.meta.sourceSha256;
    $('#projectionBaseCommit').textContent = data.meta.projectionBaseCommit;
  }

  function renderWorkPackages(data) {
    const container = $('#workPackageList');
    container.innerHTML = data.workPackages
      .map((workPackage, index) => {
        const fields = workPackage.fields;
        const stopRule = fields['Stop rule'];
        const parentLinks = workPackage.parentIds.map((id) => idChip(id, 'parent')).join('');
        const recordLinks = workPackage.recordIds.map((id) => idChip(id, 'record')).join('');
        const isOpen = fields.State === 'Active change' ? ' open' : '';
        return `<article class="roadmap-package" id="package-${escapeHtml(workPackage.id)}"
          data-state="${escapeHtml(fields.State)}">
          <div class="roadmap-package-marker" aria-hidden="true">${String(index + 1).padStart(2, '0')}</div>
          <details${isOpen}>
            <summary class="roadmap-package-summary">
              <div>
                <code>${escapeHtml(workPackage.id)}</code>
                <h3>${escapeHtml(workPackage.name)}</h3>
                <p>${escapeHtml(fields.Purpose)}</p>
              </div>
              ${badge(fields.State)}
            </summary>
            <div class="roadmap-package-body">
              <dl class="roadmap-field-grid">
                ${field('Entry conditions', fields['Entry conditions'], true)}
                ${field('Exit evidence', fields['Exit evidence'], true)}
                ${field('Blockers', fields.Blockers)}
                ${field('Unlocks', fields.Unlocks)}
                ${stopRule ? field('Stop rule', stopRule, true) : ''}
                ${field('Decision-escalation loop', fields['Decision-escalation loop'], true)}
                ${field('Next authorized package', fields['Next authorized package'], true)}
              </dl>
              <div class="roadmap-package-links">
                <p class="roadmap-card-label">Included parent capabilities</p>
                <div class="roadmap-chip-row">${parentLinks || '<span class="roadmap-count-chip">None</span>'}</div>
              </div>
              <div class="roadmap-package-links">
                <p class="roadmap-card-label">Included detailed records</p>
                <div class="roadmap-chip-row">${recordLinks || '<span class="roadmap-count-chip">None</span>'}</div>
              </div>
            </div>
          </details>
        </article>`;
      })
      .join('');
  }

  function childRecord(record) {
    const fields = record.fields;
    return `<details class="roadmap-child" id="child-${escapeHtml(record.id)}">
      <summary>
        <span class="roadmap-child-title">
          <code>${escapeHtml(record.id)}</code>
          <strong>${escapeHtml(record.name)}</strong>
        </span>
        <span class="roadmap-badge-row">
          ${badge(fields['Implementation maturity'])}
          ${badge(fields['Work authorization'])}
        </span>
      </summary>
      <div class="roadmap-child-body">
        <p><strong>Purpose:</strong> ${escapeHtml(fields.Purpose)}</p>
        <p><strong>Current:</strong> ${escapeHtml(fields['Current implementation'])}</p>
        <p><strong>Remaining:</strong> ${escapeHtml(fields['Remaining work'])}</p>
        <p><strong>Boundary:</strong> ${escapeHtml(fields.Boundary)}</p>
        <p><strong>Next action:</strong> ${escapeHtml(fields['Next action'])}</p>
        <a class="roadmap-link-button" href="#record-${escapeHtml(record.id)}">Open full record</a>
      </div>
    </details>`;
  }

  function renderParents(data) {
    const recordMap = new Map(data.records.map((record) => [record.id, record]));
    const grouped = new Map();
    data.parents.forEach((parent) => {
      if (!grouped.has(parent.phaseGroup)) grouped.set(parent.phaseGroup, []);
      grouped.get(parent.phaseGroup).push(parent);
    });

    const parentPhaseFilter = $('#parentPhaseFilter');
    populateSelect(parentPhaseFilter, Array.from(grouped.keys()));

    $('#parentCapabilityGroups').innerHTML = Array.from(grouped.entries())
      .map(([phaseGroup, parents]) => `<section class="roadmap-phase-group" data-parent-phase="${escapeHtml(phaseGroup)}">
        <header class="roadmap-phase-header">
          <h3>${escapeHtml(phaseGroup)}</h3>
          <span>${parents.length} parent ${parents.length === 1 ? 'capability' : 'capabilities'}</span>
        </header>
        <div class="roadmap-parent-grid">
          ${parents
            .map((parent) => {
              const fields = parent.fields;
              const children = parent.childIds.map((id) => recordMap.get(id)).filter(Boolean);
              return `<details class="roadmap-parent-card" id="parent-${escapeHtml(parent.id)}">
                <summary class="roadmap-parent-summary">
                  <div class="roadmap-parent-heading">
                    <div>
                      <code>${escapeHtml(parent.id)}</code>
                      <h3>${escapeHtml(parent.name)}</h3>
                    </div>
                    <span class="roadmap-count-chip">${children.length} children</span>
                  </div>
                  <p>${escapeHtml(fields.Purpose)}</p>
                  <div class="roadmap-badge-row">
                    ${badge(fields['Aggregate maturity'], 'Maturity')}
                    ${badge(fields['Current authorization'], 'Authorization')}
                  </div>
                </summary>
                <div class="roadmap-parent-body">
                  <dl class="roadmap-field-grid">
                    ${field('User value', fields['User value'], true)}
                    ${field('Strategic role', fields['Strategic role'], true)}
                    ${field('Major dependencies', fields['Major dependencies'], true)}
                    ${field('Exit evidence', fields['Exit evidence'], true)}
                    ${field('Next authorized work package', fields['Next authorized work package'], true)}
                  </dl>
                  <div class="roadmap-parent-children">
                    ${children.map(childRecord).join('')}
                  </div>
                </div>
              </details>`;
            })
            .join('')}
        </div>
      </section>`)
      .join('');
  }

  const recordFieldOrder = [
    'Purpose',
    'Current implementation',
    'Remaining work',
    'Dependencies',
    'Entry gate',
    'Completion evidence',
    'Commercial hypothesis',
    'Boundary',
    'Stop rule',
    'Source / evidence locator',
    'Next action'
  ];

  function renderEvidenceReferences(record) {
    if (!record.evidenceReferences.length) return '';
    return `<div class="roadmap-record-links">
      <p class="roadmap-card-label">Revision-qualified evidence links</p>
      <div class="roadmap-evidence-list">
        ${record.evidenceReferences
          .map(
            (reference) =>
              `<a href="${escapeHtml(reference.href)}" target="_blank" rel="noreferrer">${escapeHtml(reference.label)}</a>`
          )
          .join('')}
      </div>
    </div>`;
  }

  function renderRecords(data) {
    $('#recordList').innerHTML = data.records
      .map((record) => {
        const fields = record.fields;
        const parentName = fields['Parent capability'].replace(`${record.parentId} — `, '');
        const searchText = [
          record.id,
          record.name,
          record.phaseGroup,
          record.parentId,
          parentName,
          ...Object.values(fields),
          ...record.tags
        ]
          .join(' ')
          .toLowerCase();
        return `<details class="roadmap-record-card"
          id="record-${escapeHtml(record.id)}"
          data-search="${escapeHtml(searchText)}"
          data-phase="${escapeHtml(record.phaseGroup)}"
          data-class="${escapeHtml(fields['Record class'])}"
          data-maturity="${escapeHtml(fields['Implementation maturity'])}"
          data-authorization="${escapeHtml(fields['Work authorization'])}"
          data-tags="${escapeHtml(record.tags.join('|'))}">
          <summary class="roadmap-record-summary">
            <div class="roadmap-record-heading">
              <div>
                <code>${escapeHtml(record.id)}</code>
                <h3>${escapeHtml(record.name)}</h3>
              </div>
              <span class="roadmap-record-meta">${escapeHtml(fields['Record class'])}</span>
            </div>
            <p>${escapeHtml(fields.Purpose)}</p>
            <div class="roadmap-badge-row">
              ${badge(fields['Implementation maturity'], 'Maturity')}
              ${badge(fields['Work authorization'], 'Authorization')}
            </div>
          </summary>
          <div class="roadmap-record-body">
            <div class="roadmap-record-meta">
              ${idChip(record.parentId, 'parent')} · ${escapeHtml(parentName)} · ${escapeHtml(record.phaseGroup)}
            </div>
            <div class="roadmap-role-row">
              ${record.tags.map((tag) => `<span class="roadmap-role">${escapeHtml(tag)}</span>`).join('')}
            </div>
            <dl class="roadmap-field-grid">
              ${recordFieldOrder
                .map((label) => field(label, fields[label], true))
                .join('')}
            </dl>
            ${renderEvidenceReferences(record)}
          </div>
        </details>`;
      })
      .join('');

    populateSelect($('#phaseFilter'), uniqueSorted(data.records.map((record) => record.phaseGroup)));
    populateSelect(
      $('#classFilter'),
      uniqueSorted(data.records.map((record) => record.fields['Record class']))
    );
    populateSelect(
      $('#maturityFilter'),
      uniqueSorted(data.records.map((record) => record.fields['Implementation maturity']))
    );
    populateSelect(
      $('#authorizationFilter'),
      uniqueSorted(data.records.map((record) => record.fields['Work authorization']))
    );
    populateSelect($('#tagFilter'), uniqueSorted(data.records.flatMap((record) => record.tags)));
  }

  function renderExclusions(data) {
    $('#exclusionList').innerHTML = data.exclusions
      .map((exclusion) => {
        const searchText = Object.values(exclusion).join(' ').toLowerCase();
        return `<article class="roadmap-exclusion" id="exclusion-${escapeHtml(exclusion.id)}"
          data-search="${escapeHtml(searchText)}">
          <header>
            <code>${escapeHtml(exclusion.id)}</code>
            <h3>${escapeHtml(exclusion.name)}</h3>
          </header>
          <dl>
            <div>
              <dt>Considered value</dt>
              <dd>${escapeHtml(exclusion.consideredValue)}</dd>
            </div>
            <div>
              <dt>Boundary</dt>
              <dd>${escapeHtml(exclusion.boundary)}</dd>
            </div>
            <div>
              <dt>Reopen gate</dt>
              <dd>${escapeHtml(exclusion.reopenGate)}</dd>
            </div>
          </dl>
        </article>`;
      })
      .join('');
  }

  function setView(view, options) {
    if (!['command', 'capabilities', 'records', 'exclusions'].includes(view)) return;
    state.currentView = view;
    $$('.roadmap-view').forEach((section) => {
      const active = section.dataset.view === view;
      section.hidden = !active;
      section.classList.toggle('is-active', active);
    });
    $$('.roadmap-view-tabs [data-view-target]').forEach((button) => {
      button.setAttribute('aria-selected', String(button.dataset.viewTarget === view));
    });
    if (!options || options.scroll !== false) {
      $('.roadmap-view-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function filterRecords() {
    const query = $('#recordSearch').value.trim().toLowerCase();
    const phase = $('#phaseFilter').value;
    const recordClass = $('#classFilter').value;
    const maturity = $('#maturityFilter').value;
    const authorization = $('#authorizationFilter').value;
    const tag = $('#tagFilter').value;
    let visible = 0;

    $$('.roadmap-record-card').forEach((card) => {
      const matches =
        (!query || card.dataset.search.includes(query)) &&
        (!phase || card.dataset.phase === phase) &&
        (!recordClass || card.dataset.class === recordClass) &&
        (!maturity || card.dataset.maturity === maturity) &&
        (!authorization || card.dataset.authorization === authorization) &&
        (!tag || card.dataset.tags.split('|').includes(tag));
      card.classList.toggle('is-filtered', !matches);
      if (matches) visible += 1;
    });

    $('#recordResultCount').textContent = `${visible} ${visible === 1 ? 'record' : 'records'}`;
    let empty = $('#recordEmpty');
    if (!visible && !empty) {
      empty = document.createElement('p');
      empty.id = 'recordEmpty';
      empty.className = 'roadmap-empty';
      empty.textContent = 'No records match these filters.';
      $('#recordList').appendChild(empty);
    } else if (visible && empty) {
      empty.remove();
    }
  }

  function clearRecordFilters() {
    $('#recordSearch').value = '';
    ['phaseFilter', 'classFilter', 'maturityFilter', 'authorizationFilter', 'tagFilter'].forEach(
      (id) => {
        $(`#${id}`).value = '';
      }
    );
    filterRecords();
  }

  function filterExclusions() {
    const query = $('#exclusionSearch').value.trim().toLowerCase();
    $$('.roadmap-exclusion').forEach((card) => {
      card.classList.toggle('is-filtered', query && !card.dataset.search.includes(query));
    });
  }

  function filterParentGroups() {
    const phase = $('#parentPhaseFilter').value;
    $$('.roadmap-phase-group').forEach((group) => {
      group.hidden = Boolean(phase && group.dataset.parentPhase !== phase);
    });
  }

  function focusElement(element) {
    if (!element) return;
    if (element.matches('details')) element.open = true;
    const parentDetails = element.closest('details');
    if (parentDetails) parentDetails.open = true;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.classList.remove('roadmap-focus-flash');
    window.requestAnimationFrame(() => element.classList.add('roadmap-focus-flash'));
    window.setTimeout(() => element.classList.remove('roadmap-focus-flash'), 1600);
  }

  function routeToHash() {
    if (!state.data) return;
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return;

    if (hash.startsWith('package-')) {
      setView('command', { scroll: false });
      focusElement(document.getElementById(hash));
      return;
    }

    if (hash.startsWith('parent-')) {
      $('#parentPhaseFilter').value = '';
      filterParentGroups();
      setView('capabilities', { scroll: false });
      focusElement(document.getElementById(hash));
      return;
    }

    if (hash.startsWith('record-')) {
      clearRecordFilters();
      setView('records', { scroll: false });
      focusElement(document.getElementById(hash));
      return;
    }

    if (hash.startsWith('exclusion-')) {
      $('#exclusionSearch').value = '';
      filterExclusions();
      setView('exclusions', { scroll: false });
      focusElement(document.getElementById(hash));
    }
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const viewControl = event.target.closest('[data-view-target]');
      if (viewControl) {
        setView(viewControl.dataset.viewTarget);
      }
      const packageControl = event.target.closest('[data-open-package]');
      if (packageControl && window.location.hash === packageControl.getAttribute('href')) {
        routeToHash();
      }
    });

    window.addEventListener('hashchange', routeToHash);

    ['recordSearch', 'phaseFilter', 'classFilter', 'maturityFilter', 'authorizationFilter', 'tagFilter']
      .forEach((id) => {
        $(`#${id}`).addEventListener(id === 'recordSearch' ? 'input' : 'change', filterRecords);
      });

    $('#clearRecordFilters').addEventListener('click', clearRecordFilters);
    $('#exclusionSearch').addEventListener('input', filterExclusions);
    $('#parentPhaseFilter').addEventListener('change', filterParentGroups);
    $('#collapseParents').addEventListener('click', () => {
      $$('.roadmap-parent-card').forEach((card) => {
        card.open = false;
      });
    });
  }

  function showLoadError(error) {
    const message = document.createElement('p');
    message.className = 'roadmap-load-error';
    message.textContent = `The generated roadmap data could not be loaded: ${error.message}`;
    document.body.insertBefore(message, document.body.firstChild);
  }

  async function initialize() {
    try {
      const response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      state.data = data;
      renderStats(data);
      renderWorkPackages(data);
      renderParents(data);
      renderRecords(data);
      renderExclusions(data);
      bindEvents();
      routeToHash();
    } catch (error) {
      showLoadError(error);
    }
  }

  initialize();
}());
