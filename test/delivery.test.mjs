import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

function blockAfter(text, heading) {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing ${heading}`);
  return text.slice(start);
}

test('the service selector matches the pod labels', async () => {
  const manifest = await read('deploy/k8s/base/gangway.yaml');
  const deployment = blockAfter(manifest, 'kind: Deployment');
  assert.match(deployment, /matchLabels:\n\s+app: gangway/);
  assert.match(deployment, /template:\n\s+metadata:\n\s+labels:\n\s+app: gangway/);
  const service = blockAfter(manifest, 'kind: Service');
  assert.match(service, /selector:\n\s+app: gangway/);
  assert.match(deployment, /path: \/health/);
  assert.match(deployment, /path: \/ready/);
  assert.match(deployment, /containerPort: 8080/);
});

test('helm, compose, and the image agree on the same port and name', async () => {
  const chart = await read('charts/gangway/templates/deployment.yaml');
  const service = await read('charts/gangway/templates/service.yaml');
  const values = await read('charts/gangway/values.yaml');
  const compose = await read('compose.yaml');
  const dockerfile = await read('Dockerfile');
  assert.match(chart, /app: gangway/);
  assert.match(service, /app: gangway/);
  assert.match(values, /port: 8080/);
  assert.match(compose, /8080:8080/);
  assert.match(dockerfile, /EXPOSE 8080/);
  assert.match(dockerfile, /USER node/);
});

test('continuous integration covers tests, image, manifests, and terraform', async () => {
  const workflow = await read('.github/workflows/check.yml');
  for (const job of ['test:', 'image:', 'manifests:', 'terraform:']) assert.match(workflow, new RegExp(`\\n  ${job}`));
  assert.match(workflow, /npm test/);
  assert.match(workflow, /kubectl kustomize deploy\/k8s\/overlays\/prod/);
  assert.match(workflow, /helm template gangway charts\/gangway/);
  assert.match(workflow, /terraform validate/);
  assert.doesNotMatch(workflow, /terraform apply/);
});
