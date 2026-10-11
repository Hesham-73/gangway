import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from '../src/server.mjs';

async function listen() {
  const server = createApp();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

test('health, readiness, and metrics are served', async () => {
  const app = await listen();
  try {
    assert.deepEqual(await (await fetch(`${app.base}/health`)).json(), { ok: true });
    assert.deepEqual(await (await fetch(`${app.base}/ready`)).json(), { ready: true });
    const metrics = await (await fetch(`${app.base}/metrics`)).text();
    assert.match(metrics, /gangway_releases 0/);
    assert.match(metrics, /gangway_releases_ready 0/);
  } finally {
    await app.close();
  }
});

test('a release is ready only after every required check passes', async () => {
  const app = await listen();
  try {
    const created = await fetch(`${app.base}/v1/releases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service: 'ledger', version: '1.4.0' })
    });
    assert.equal(created.status, 201);
    const release = await created.json();
    assert.equal(release.status, 'open');
    assert.deepEqual(release.missing, ['unit', 'image', 'manifests']);

    const failed = await fetch(`${app.base}/v1/releases/${release.id}/evidence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ check: 'unit', result: 'fail' })
    });
    assert.equal((await failed.json()).status, 'blocked');

    for (const [check, result] of [['unit', 'pass'], ['image', 'pass'], ['manifests', 'pass']]) {
      const response = await fetch(`${app.base}/v1/releases/${release.id}/evidence`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ check, result })
      });
      assert.equal(response.status, 200);
    }
    const ready = await (await fetch(`${app.base}/v1/releases/${release.id}`)).json();
    assert.equal(ready.status, 'ready');
    assert.deepEqual(ready.failed, []);
    const metrics = await (await fetch(`${app.base}/metrics`)).text();
    assert.match(metrics, /gangway_releases_ready 1/);
  } finally {
    await app.close();
  }
});

test('invalid release input and unknown checks are rejected', async () => {
  const app = await listen();
  try {
    const missing = await fetch(`${app.base}/v1/releases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service: 'ledger' })
    });
    assert.equal(missing.status, 400);
    const created = await (await fetch(`${app.base}/v1/releases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service: 'ledger', version: '1.4.0' })
    })).json();
    const bad = await fetch(`${app.base}/v1/releases/${created.id}/evidence`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ check: 'deploy', result: 'pass' })
    });
    assert.equal(bad.status, 400);
    assert.equal((await fetch(`${app.base}/v1/releases/gw-missing`)).status, 404);
  } finally {
    await app.close();
  }
});
