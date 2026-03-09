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
