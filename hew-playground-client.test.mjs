import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('run without version sends package default version in body', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockJsonResponse({ success: true, stdout: 'hi\n', stderr: '', elapsed_ms: 50, compiler_version: '0.5.0' });
    },
  });

  const response = await client.run('fn main() { println("hi"); }');
  assert.equal(response.compiler_version, '0.5.0');
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.source, 'fn main() { println("hi"); }');
  assert.equal(body.compiler_version, '0.5.0');
});

const dottedSurfaceSource = `import std.io.scanner.{words};

enum Greeting {
  Message(string);
}

fn main() {
  let tokens = words("hello");
  let greeting: Greeting = .Message("hello");
  match greeting {
    .Message(text) => println(text),
  }
  println(tokens.len());
}`;

const legacyPathSource = `import std::io::scanner::{words};

fn main() {
  println(words("hello").len());
}`;
const legacyPathDiagnostic = 'error: E_PATH_LEGACY_SEPARATOR: `::` path separators have been removed; use dotted paths: `import std.io.scanner.{words};`\n  = help: use the migrated spelling `import std.io.scanner.{words};`';

const legacyTurbofishSource = `fn main() {
  let value = parse::<i64>("42");
  println(value);
}`;
const legacyTurbofishDiagnostic = 'error: E_LEGACY_TURBOFISH: Rust-style `::<...>` has been removed; use Hew generic application: `let value = parse<i64>("42");`\n  = help: use the migrated spelling `let value = parse<i64>("42");`';

function assertIllustrativeDiagnosticCoupling(serializedRequest, diagnostic, retiredSyntax, code) {
  const request = JSON.parse(serializedRequest);
  assert.match(request.source, retiredSyntax, `${code} requires the corresponding retired syntax in the request source`);
  assert.match(diagnostic, new RegExp(`^error: ${code}:`));
}

test('preserves valid dotted and contextual source unchanged', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockJsonResponse({
        success: true,
        stdout: 'hello\n',
        stderr: '',
        elapsed_ms: 5,
        compiler_version: '0.5.0',
      });
    },
  });

  const response = await client.run(dottedSurfaceSource);
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.source, dottedSurfaceSource);
  assert.match(body.source, /std\.io\.scanner\.\{words\}/);
  assert.match(body.source, /\.Message/);
  assert.equal(response.stdout, 'hello\n');
});

test('serializes a legacy-path request and preserves an illustrative rc2 response', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockJsonResponse({
        success: false,
        stdout: '',
        stderr: '',
        compile_error: legacyPathDiagnostic,
        elapsed_ms: 5,
        compiler_version: '0.6.0-rc2',
      });
    },
  });

  const response = await client.run({ source: legacyPathSource, compiler_version: '0.6.0-rc2' });
  assert.equal(requests[0].init.body, JSON.stringify({ source: legacyPathSource, compiler_version: '0.6.0-rc2' }));
  assertIllustrativeDiagnosticCoupling(requests[0].init.body, response.compile_error, /::/, 'E_PATH_LEGACY_SEPARATOR');
  assert.equal(response.compile_error, legacyPathDiagnostic);
});

test('serializes a legacy-turbofish request and preserves an illustrative rc2 response', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockJsonResponse({
        success: false,
        stdout: '',
        stderr: '',
        compile_error: legacyTurbofishDiagnostic,
        elapsed_ms: 5,
        compiler_version: '0.6.0-rc2',
      });
    },
  });

  const response = await client.run({ source: legacyTurbofishSource, compiler_version: '0.6.0-rc2' });
  assert.equal(requests[0].init.body, JSON.stringify({ source: legacyTurbofishSource, compiler_version: '0.6.0-rc2' }));
  assertIllustrativeDiagnosticCoupling(requests[0].init.body, response.compile_error, /::<[^>]+>/, 'E_LEGACY_TURBOFISH');
  assert.equal(response.compile_error, legacyTurbofishDiagnostic);
});

test('mutation control rejects an unrelated valid request for an rc2 migration diagnostic', () => {
  const unrelatedValidRequest = JSON.stringify({ source: dottedSurfaceSource, compiler_version: '0.6.0-rc2' });
  assert.throws(
    () => assertIllustrativeDiagnosticCoupling(unrelatedValidRequest, legacyPathDiagnostic, /::/, 'E_PATH_LEGACY_SEPARATOR'),
    /requires the corresponding retired syntax/,
  );
});

test('documents only the dotted Hew surface in the OpenAPI source example', () => {
  const specification = JSON.parse(readFileSync(new URL('./openapi.json', import.meta.url), 'utf8'));
  const examples = specification.paths['/api/run'].post.requestBody.content['application/json'].examples;
  const source = examples.dottedSurface.value.source;
  const responses = specification.paths['/api/run'].post.responses['200'].content['application/json'].examples;

  assert.match(source, /std\.io\.scanner\.\{words\}/);
  assert.match(source, /\.Message/);
  assert.doesNotMatch(source, /::|\.\*|::<|turbofish/);
  assert.equal(examples.legacyPathSeparatorRc2.value.source, legacyPathSource);
  assert.equal(examples.legacyTurbofishRc2.value.source, legacyTurbofishSource);
  assert.match(responses.legacyPathSeparatorRc2.value.compile_error, /^error: E_PATH_LEGACY_SEPARATOR:/);
  assert.match(responses.legacyTurbofishRc2.value.compile_error, /^error: E_LEGACY_TURBOFISH:/);
  assert.equal(responses.legacyPathSeparatorRc2.value.compiler_version, '0.6.0-rc2');
  assert.equal(responses.legacyTurbofishRc2.value.compiler_version, '0.6.0-rc2');
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

test('run with execution_mode wasm sends it in request body', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockJsonResponse({ success: true, stdout: '', stderr: '', elapsed_ms: 5, compiler_version: '0.2.1' });
    },
  });

  await client.run({ source: 'fn main() {}', execution_mode: 'wasm' });
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.execution_mode, 'wasm');
});

test('run without execution_mode omits the field from request body', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockJsonResponse({ success: true, stdout: '', stderr: '', elapsed_ms: 5, compiler_version: '0.2.1' });
    },
  });

  await client.run({ source: 'fn main() {}' });
  const body = JSON.parse(requests[0].init.body);
  assert.ok(!('execution_mode' in body), 'execution_mode must be absent when not provided');
});

test('compilerVersion: null omits compiler_version (server default)', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    compilerVersion: null,
    fetch: async (input, init) => {
      requests.push({ input, init });
      return mockJsonResponse({ success: true, stdout: '', stderr: '', elapsed_ms: 5, compiler_version: '0.5.0' });
    },
  });
  await client.run('fn main() {}');
  const body = JSON.parse(requests[0].init.body);
  assert.equal('compiler_version' in body, false);
});

test('default client sends compiler_version 0.5.0', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (input, init) => {
      requests.push({ input, init });
      return mockJsonResponse({ success: true, stdout: '', stderr: '', elapsed_ms: 5 });
    },
  });
  await client.run('fn main() {}');
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.compiler_version, '0.5.0');
});

test('createShare with compiler_version sends it in the body', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockJsonResponse({ id: 'abc123def4567890' });
    },
  });
  await client.createShare({ source: 'fn main() {}', compiler_version: '0.5.0' });
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.source, 'fn main() {}');
  assert.equal(body.compiler_version, '0.5.0');
});

test('createShare with a string omits compiler_version', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockJsonResponse({ id: 'abc123def4567890' });
    },
  });
  await client.createShare('fn main() {}');
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.source, 'fn main() {}');
  assert.equal('compiler_version' in body, false);
});
