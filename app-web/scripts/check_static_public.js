const fs = require("node:fs");
const path = require("node:path");

const publicRoot = path.resolve(__dirname, "../frontend/public");
const siteHostnames = new Set(["implicitex.com", "www.implicitex.com"]);
const skippedSchemes = /^(mailto:|tel:|data:|javascript:|#)/i;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function publicPathToFile(urlPath) {
  const cleanPath = urlPath.split("#")[0].split("?")[0];
  if (!cleanPath || cleanPath === "/") return path.join(publicRoot, "index.html");
  return path.join(publicRoot, cleanPath.replace(/^\/+/, ""));
}

function resolveTarget(rawTarget, fromFile) {
  const target = rawTarget.trim();
  if (!target || skippedSchemes.test(target)) return null;

  if (/^https?:\/\//i.test(target)) {
    const parsed = new URL(target);
    if (!siteHostnames.has(parsed.hostname)) return null;
    return publicPathToFile(parsed.pathname);
  }

  if (target.startsWith("/")) return publicPathToFile(target);

  return path.resolve(path.dirname(fromFile), target.split("#")[0].split("?")[0]);
}

function collectHtmlTargets(file, contents) {
  const targets = [];
  const attrPattern = /\b(?:href|src)=["']([^"']+)["']/gi;
  const metaImagePattern = /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
  const manifestPattern = /<link[^>]+rel=["']manifest["'][^>]+href=["']([^"']+)["'][^>]*>/gi;

  for (const match of contents.matchAll(attrPattern)) targets.push(match[1]);
  for (const match of contents.matchAll(metaImagePattern)) targets.push(match[1]);
  for (const match of contents.matchAll(manifestPattern)) targets.push(match[1]);
  return targets.map((target) => ({ target, from: file }));
}

function collectManifestTargets(file, contents) {
  const manifest = JSON.parse(contents);
  const targets = [];
  if (manifest.start_url) targets.push(manifest.start_url);
  if (Array.isArray(manifest.icons)) {
    for (const icon of manifest.icons) {
      if (icon && icon.src) targets.push(icon.src);
    }
  }
  return targets.map((target) => ({ target, from: file }));
}

function collectSitemapTargets(file, contents) {
  return [...contents.matchAll(/<loc>([^<]+)<\/loc>/gi)]
    .map((match) => ({ target: match[1], from: file }));
}

const files = walk(publicRoot);
const references = [];

for (const file of files) {
  const ext = path.extname(file);
  const base = path.basename(file);

  if (ext === ".html") {
    const contents = fs.readFileSync(file, "utf8");
    references.push(...collectHtmlTargets(file, contents));
  }
  if (base === "manifest.json") {
    const contents = fs.readFileSync(file, "utf8");
    references.push(...collectManifestTargets(file, contents));
  }
  if (base === "sitemap.xml") {
    const contents = fs.readFileSync(file, "utf8");
    references.push(...collectSitemapTargets(file, contents));
  }
}

const missing = [];

for (const reference of references) {
  const resolved = resolveTarget(reference.target, reference.from);
  if (!resolved) continue;
  if (!resolved.startsWith(publicRoot) || !fs.existsSync(resolved)) {
    missing.push({
      from: path.relative(publicRoot, reference.from),
      target: reference.target,
      resolved: path.relative(publicRoot, resolved)
    });
  }
}

if (missing.length > 0) {
  console.error("Static public check failed. Missing local targets:");
  for (const item of missing) {
    console.error(`- ${item.from}: ${item.target} -> ${item.resolved}`);
  }
  process.exit(1);
}

console.log(`Static public check passed (${references.length} local references checked).`);
