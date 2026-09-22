import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist/site');
createServer(async (req, res) => {
  try {
    const path = resolve(
      root,
      '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
    );
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const file = path === root ? path + '/index.html' : path;
    const data = await readFile(file);
    res.setHeader(
      'Content-Type',
      { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[
        extname(file)
      ] || 'application/octet-stream',
    );
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(4173, '127.0.0.1', () => console.log('http://127.0.0.1:4173'));
