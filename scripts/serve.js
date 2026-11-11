/* Minimal static file server for local QA.
 *
 *   node scripts/serve.js [port]
 *
 * Python's http.server is single-threaded by default and stalls when a browser
 * opens many parallel connections, so the QA runs use this instead.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.argv[2] || process.env.PORT || '8099', 10);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(url.parse(req.url).pathname);
  if (pathname === '/') pathname = '/index.html';
  let file = path.join(ROOT, pathname);

  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      const notFound = path.join(ROOT, '404.html');
      fs.readFile(notFound, (e2, nf) => {
        if (e2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        } else {
          res.writeHead(404, { 'Content-Type': TYPES['.html'], 'Content-Length': nf.length }).end(nf);
        }
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
});

server.keepAliveTimeout = 5000;
server.listen(PORT, () => {
  console.log('serving ' + ROOT + ' on http://localhost:' + PORT);
});
