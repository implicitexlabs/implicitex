'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');

const publicRoot = path.resolve(__dirname, '..', 'frontend', 'public');
const outputPath = path.join(
  publicRoot,
  'downloads',
  'implicitex-v1-execution-plan-rev6.pdf'
);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf'
};

function resolveRequestPath(url) {
  const requestPath = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  const relativePath = requestPath === '/' ? 'v1-execution.html' : requestPath.slice(1);
  const resolved = path.resolve(publicRoot, relativePath);
  return resolved.startsWith(publicRoot + path.sep) ? resolved : null;
}

async function main() {
  const server = http.createServer((request, response) => {
    const filePath = resolveRequestPath(request.url);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream'
    });
    fs.createReadStream(filePath).pipe(response);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.emulateMediaType('print');
    await page.goto(
      `http://127.0.0.1:${address.port}/v1-execution.html?pdf=1`,
      { waitUntil: 'networkidle0' }
    );
    await page.evaluate(async () => {
      document.documentElement.dataset.theme = 'light';
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    await page.pdf({
      path: outputPath,
      format: 'Letter',
      printBackground: true,
      preferCSSPageSize: true
    });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  process.stdout.write(`${outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
