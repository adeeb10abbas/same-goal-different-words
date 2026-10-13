// Serves the rollout media directory with HTTP Range requests and CORS, mirroring the external media host used in
// production (Safari needs Range to play video; timeline.json is fetched cross-origin).
// Usage: node scripts/media-server.mjs [root=../media] [--port 4400]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const portAt = args.indexOf('--port');
const PORT = portAt >= 0 ? +args[portAt + 1] : +(process.env.PORT ?? 4400);
const rootArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port');
const ROOT = path.resolve(rootArg ?? fileURLToPath(new URL('../../media', import.meta.url)));
const TYPES = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json',
};

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();

    const file = path.join(ROOT, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
    if (!file.startsWith(ROOT + path.sep)) return res.writeHead(403).end();

    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return res.writeHead(404).end();
      res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=600');

      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      if (!m || (!m[1] && !m[2])) {
        res.writeHead(200, { 'Content-Length': st.size });
        return req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(res);
      }
      const start = m[1] ? +m[1] : Math.max(0, st.size - +m[2]);
      const end = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      if (start >= st.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return req.method === 'HEAD' ? res.end() : fs.createReadStream(file, { start, end }).pipe(res);
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`media: http://127.0.0.1:${PORT}/ -> ${ROOT}`));
