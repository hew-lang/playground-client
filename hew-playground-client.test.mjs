import assert from 'node:assert/strict';
import test from 'node:test';

import { HewPlaygroundClient, PlaygroundApiError } from './dist/hew-playground-client.js';

function mockJsonResponse(body, status = 200, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? 'application/json' : null;
      },
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

test('supports custom fetch without a global Headers constructor', async () => {
  const originalHeaders = Object.getOwnPropertyDescriptor(globalThis, 'Headers');
  Object.defineProperty(globalThis, 'Headers', {
    configurable: true,
    writable: true,
    value: undefined,
  });

  const requests = [];

  try {
    const client = new HewPlaygroundClient({
      baseUrl: 'https://playground.example',
      headers: { 'x-client': 'sdk-test' },
      fetch: async (url, init) => {
        requests.push({ url, init });
        return mockJsonResponse({ id: 'abc123def4567890' });
      },
    });

    const response = await client.createShare('fn main() { println(1); }');
    assert.deepEqual(response, { id: 'abc123def4567890' });
    assert.equal(requests[0].url, 'https://playground.example/api/share');
    assert.deepEqual(requests[0].init?.headers, {
      'x-client': 'sdk-test',
      'content-type': 'application/json',
    });
  } finally {
    if (originalHeaders) {
      Object.defineProperty(globalThis, 'Headers', originalHeaders);
    } else {
      delete globalThis.Headers;
    }
  }
});

test('run without version sends only source in body', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockJsonResponse({ success: true, stdout: 'hi\n', stderr: '', elapsed_ms: 50, compiler_version: '0.2.0' });
    },
  });

  const response = await client.run('fn main() { println("hi"); }');
  assert.equal(response.compiler_version, '0.2.0');
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.source, 'fn main() { println("hi"); }');
  assert.equal(body.compiler_version, undefined);
});

test('run with client compilerVersion sends compiler_version in body', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    compilerVersion: '0.1.9',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockJsonResponse({ success: true, stdout: '', stderr: '', elapsed_ms: 10, compiler_version: '0.1.9' });
    },
  });

  await client.run('fn main() {}');
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.compiler_version, '0.1.9');
});

test('run with per-request compiler_version overrides client default', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    compilerVersion: '0.1.9',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockJsonResponse({ success: true, stdout: '', stderr: '', elapsed_ms: 10, compiler_version: '0.2.0' });
    },
  });

  await client.run({ source: 'fn main() {}', compiler_version: '0.2.0' });
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.compiler_version, '0.2.0');
});

test('listVersions calls GET /api/versions and returns parsed response', async () => {
  const requests = [];
  const versionsBody = { default_version: '0.2.0', available_versions: ['0.2.0', '0.1.9'] };
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockJsonResponse(versionsBody);
    },
  });

  const response = await client.listVersions();
  assert.equal(requests[0].url, 'https://playground.example/api/versions');
  assert.equal(requests[0].init.method, 'GET');
  assert.deepEqual(response, versionsBody);
});

test('listVersions propagates server error as PlaygroundApiError', async () => {
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => mockJsonResponse({ error: 'internal error' }, 500, 'Internal Server Error'),
  });

  await assert.rejects(
    () => client.listVersions(),
    (error) => {
      assert.ok(error instanceof PlaygroundApiError);
      assert.equal(error.status, 500);
      return true;
    },
  );
});

test('throws PlaygroundApiError with the parsed JSON error body', async () => {
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => mockJsonResponse({ error: 'snippet not found' }, 404, 'Not Found'),
  });

  await assert.rejects(
    () => client.getShare('missing'),
    (error) => {
      assert.ok(error instanceof PlaygroundApiError);
      assert.equal(error.status, 404);
      assert.deepEqual(error.body, { error: 'snippet not found' });
      return true;
    },
  );
});
