'use strict';

/**
 * Footer parity test
 *
 * Asserts that the portal footer (portal-index.html) and the main-site footer
 * (index.html) expose identical data-footer-entry keys in identical group order,
 * with no duplicate keys within either footer, and that per-surface behavioral
 * expectations are met (e.g. Install app is a button on the portal and an anchor
 * with ?install=1 on the main site).
 *
 * Rules:
 *   - Group count must match.
 *   - Group labels must match, in order.
 *   - data-footer-entry keys per group must match exactly (order-insensitive).
 *   - No duplicate data-footer-entry key within a single footer.
 *   - Per-surface expectations defined in SURFACE_RULES must pass.
 */

var fs     = require('fs');
var path   = require('path');
var test   = require('node:test');
var assert = require('node:assert/strict');

var PUBLIC = path.join(__dirname, '../../frontend/public');

// ─── Per-surface behavioral expectations ─────────────────────────────────────
// Each rule: { entry, surface, check(el) } where el is the raw HTML tag string.

var SURFACE_RULES = [
  {
    entry:   'install-app',
    surface: 'portal',
    label:   'portal Install app must be a <button>',
    check: function (tag) { return /^<button\b/.test(tag); }
  },
  {
    entry:   'install-app',
    surface: 'site',
    label:   'site Install app must be an <a> with href containing ?install=1',
    check: function (tag) {
      return /^<a\b/.test(tag) && tag.indexOf('?install=1') !== -1;
    }
  }
];

// ─── Extractors ──────────────────────────────────────────────────────────────

/**
 * Extract footer groups from portal-index.html.
 * Returns [{ label, entries: [{ key, tag }] }]
 */
function extractPortalGroups(html) {
  var groups = [];
  var groupRe  = /<div class="portal-footer-group">([\s\S]*?)<\/div>/g;
  var labelRe  = /class="portal-footer-label"[^>]*>([\s\S]*?)<\/span>/;
  var entryRe  = /<(?:a|button)(\s[^>]*)?>[\s\S]*?<\/(?:a|button)>/g;
  var keyRe    = /data-footer-entry="([^"]+)"/;
  var match, em;

  while ((match = groupRe.exec(html)) !== null) {
    var block = match[1];
    var labelMatch = labelRe.exec(block);
    if (!labelMatch) continue;
    var label = labelMatch[1].trim();
    var entries = [];
    var entryPattern = /<(?:a|button)(\s[^>]*)?>[\s\S]*?<\/(?:a|button)>/g;
    while ((em = entryPattern.exec(block)) !== null) {
      var tag = em[0];
      var keyMatch = keyRe.exec(tag);
      if (keyMatch) entries.push({ key: keyMatch[1], tag: tag });
    }
    groups.push({ label: label, entries: entries });
  }
  return groups;
}

/**
 * Extract footer groups from index.html.
 * Returns [{ label, entries: [{ key, tag }] }]
 */
function extractSiteGroups(html) {
  var groups = [];
  var groupRe  = /<div class="f-group">([\s\S]*?)<\/div>/g;
  var labelRe  = /class="f-group-label"[^>]*>([\s\S]*?)<\/span>/;
  var keyRe    = /data-footer-entry="([^"]+)"/;
  var match, em;

  while ((match = groupRe.exec(html)) !== null) {
    var block = match[1];
    var labelMatch = labelRe.exec(block);
    if (!labelMatch) continue;
    var label = labelMatch[1].trim();
    var entries = [];
    var entryPattern = /<a(\s[^>]*)?>[\s\S]*?<\/a>/g;
    while ((em = entryPattern.exec(block)) !== null) {
      var tag = em[0];
      var keyMatch = keyRe.exec(tag);
      if (keyMatch) entries.push({ key: keyMatch[1], tag: tag });
    }
    groups.push({ label: label, entries: entries });
  }
  return groups;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('footer data-footer-entry keys are identical across portal and main site', function () {
  var portalHtml = fs.readFileSync(path.join(PUBLIC, 'portal-index.html'), 'utf8');
  var siteHtml   = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');

  var portalGroups = extractPortalGroups(portalHtml);
  var siteGroups   = extractSiteGroups(siteHtml);

  assert.ok(portalGroups.length > 0, 'portal footer must have at least one group');
  assert.ok(siteGroups.length > 0,   'site footer must have at least one group');

  assert.equal(
    portalGroups.length,
    siteGroups.length,
    'group count must match: portal=' + portalGroups.length + ' site=' + siteGroups.length
  );

  for (var i = 0; i < portalGroups.length; i++) {
    var pg = portalGroups[i];
    var sg = siteGroups[i];

    assert.equal(
      pg.label,
      sg.label,
      'group ' + i + ' label mismatch: portal="' + pg.label + '" site="' + sg.label + '"'
    );

    var portalKeys = pg.entries.map(function (e) { return e.key; });
    var siteKeys   = sg.entries.map(function (e) { return e.key; });

    assert.deepEqual(
      portalKeys,
      siteKeys,
      'group "' + pg.label + '" key mismatch (order-sensitive):\n' +
        '  portal: ' + JSON.stringify(portalKeys) + '\n' +
        '  site:   ' + JSON.stringify(siteKeys)
    );
  }
});

test('no duplicate data-footer-entry keys within portal footer', function () {
  var portalHtml   = fs.readFileSync(path.join(PUBLIC, 'portal-index.html'), 'utf8');
  var portalGroups = extractPortalGroups(portalHtml);
  var seen = {};
  portalGroups.forEach(function (g) {
    g.entries.forEach(function (e) {
      assert.ok(
        !seen[e.key],
        'duplicate data-footer-entry key in portal footer: "' + e.key + '" (group "' + g.label + '")'
      );
      seen[e.key] = true;
    });
  });
});

test('no duplicate data-footer-entry keys within site footer', function () {
  var siteHtml   = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  var siteGroups = extractSiteGroups(siteHtml);
  var seen = {};
  siteGroups.forEach(function (g) {
    g.entries.forEach(function (e) {
      assert.ok(
        !seen[e.key],
        'duplicate data-footer-entry key in site footer: "' + e.key + '" (group "' + g.label + '")'
      );
      seen[e.key] = true;
    });
  });
});

test('per-surface behavioral expectations', function () {
  var portalHtml   = fs.readFileSync(path.join(PUBLIC, 'portal-index.html'), 'utf8');
  var siteHtml     = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  var portalGroups = extractPortalGroups(portalHtml);
  var siteGroups   = extractSiteGroups(siteHtml);

  // Build key→tag lookup for each surface
  function buildLookup(groups) {
    var map = {};
    groups.forEach(function (g) {
      g.entries.forEach(function (e) { map[e.key] = e.tag; });
    });
    return map;
  }
  var portalLookup = buildLookup(portalGroups);
  var siteLookup   = buildLookup(siteGroups);

  SURFACE_RULES.forEach(function (rule) {
    var lookup = rule.surface === 'portal' ? portalLookup : siteLookup;
    var tag    = lookup[rule.entry];
    assert.ok(tag !== undefined, rule.label + ' — entry "' + rule.entry + '" not found in ' + rule.surface + ' footer');
    assert.ok(rule.check(tag),  rule.label + '\n  actual tag: ' + tag.split('\n')[0]);
  });
});
