import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const REQUIRED = ['unit', 'image', 'manifests'];

export function createApp() {
  const releases = new Map();
  let sequence = 0;

  function view(item) {
    const failed = REQUIRED.filter(name => item.checks[name] === 'fail');
    const missing = REQUIRED.filter(name => !item.checks[name]);
    const status = failed.length ? 'blocked' : missing.length ? 'open' : 'ready';
    return {
      id: item.id,
      service: item.service,
      version: item.version,
      status,
      checks: item.checks,
      missing,
      failed
    };
  }

  function send(response, status, body, type = 'application/json; charset=utf-8') {
    const payload = type.startsWith('application/json') ? JSON.stringify(body) : body;
    response.writeHead(status, { 'content-type': type });
    response.end(payload);
  }

  function readBody(request) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      request.on('data', chunk => {
        size += chunk.length;
        if (size > 32000) {
          reject(Object.assign(new Error('body too large'), { status: 413 }));
          request.destroy();
        } else chunks.push(chunk);
      });
      request.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        if (!text) return resolve({});
        try { resolve(JSON.parse(text)); }
        catch { reject(Object.assign(new Error('invalid json'), { status: 400 })); }
      });
      request.on('error', reject);
    });
  }

  return createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    try {
      if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ok: true });
      if (request.method === 'GET' && url.pathname === '/ready') return send(response, 200, { ready: true });
      if (request.method === 'GET' && url.pathname === '/metrics') {
        const items = [...releases.values()].map(view);
        const ready = items.filter(item => item.status === 'ready').length;
        const blocked = items.filter(item => item.status === 'blocked').length;
        const text = [
          '# HELP gangway_releases Recorded releases.',
          '# TYPE gangway_releases gauge',
          `gangway_releases ${releases.size}`,
          '# HELP gangway_releases_ready Releases whose required checks all passed.',
          '# TYPE gangway_releases_ready gauge',
          `gangway_releases_ready ${ready}`,
          '# HELP gangway_releases_blocked Releases with a failed required check.',
          '# TYPE gangway_releases_blocked gauge',
          `gangway_releases_blocked ${blocked}`,
          ''
        ].join('\n');
        return send(response, 200, text, 'text/plain; version=0.0.4');
      }

      if (request.method === 'GET' && url.pathname === '/v1/releases') {
        return send(response, 200, { releases: [...releases.values()].map(view) });
      }

      if (request.method === 'POST' && url.pathname === '/v1/releases') {
        const body = await readBody(request);
        const service = typeof body.service === 'string' ? body.service.trim() : '';
        const version = typeof body.version === 'string' ? body.version.trim() : '';
        if (!service || !version) return send(response, 400, { error: 'service and version are required' });
        sequence += 1;
        const item = { id: `gw-${sequence}`, service, version, checks: {} };
        releases.set(item.id, item);
        return send(response, 201, view(item));
      }

      const evidence = url.pathname.match(/^\/v1\/releases\/([^/]+)\/evidence$/);
      const single = url.pathname.match(/^\/v1\/releases\/([^/]+)$/);
      if (request.method === 'POST' && evidence) {
        const item = releases.get(decodeURIComponent(evidence[1]));
        if (!item) return send(response, 404, { error: 'release not found' });
        const body = await readBody(request);
        if (!REQUIRED.includes(body.check)) return send(response, 400, { error: 'unknown check', allowed: REQUIRED });
        if (body.result !== 'pass' && body.result !== 'fail') return send(response, 400, { error: 'result must be pass or fail' });
        item.checks[body.check] = body.result;
        return send(response, 200, view(item));
      }
      if (request.method === 'GET' && single) {
        const item = releases.get(decodeURIComponent(single[1]));
        if (!item) return send(response, 404, { error: 'release not found' });
        return send(response, 200, view(item));
      }
      send(response, 404, { error: 'not found' });
    } catch (error) {
      const status = error && error.status ? error.status : 500;
      if (!response.headersSent) send(response, status, { error: status === 500 ? 'internal error' : error.message });
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT || 8080);
  createApp().listen(port, '0.0.0.0');
}
