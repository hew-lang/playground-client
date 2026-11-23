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

function mockNdjsonResponse(events, status = 200, statusText = 'OK') {
  const lines = Array.isArray(events) ? events : [events];
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? 'application/x-ndjson' : null;
      },
    },
    async text() {
      return typeof events === 'string'
        ? events
        : `${lines.map((event) => JSON.stringify(event)).join('\n')}\n`;
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

test('run without a version follows the server default and preserves its reported version', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockJsonResponse({ success: true, stdout: 'hi\n', stderr: '', elapsed_ms: 50, compiler_version: '0.6.4' });
    },
  });

  const response = await client.run('fn main() { println("hi"); }');
  assert.equal(response.compiler_version, '0.6.4');
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.source, 'fn main() { println("hi"); }');
  assert.equal('compiler_version' in body, false);
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
        compiler_version: '0.6.1',
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
      return mockJsonResponse({ success: true, stdout: '', stderr: '', elapsed_ms: 5, compiler_version: '0.6.1' });
    },
  });
  await client.run('fn main() {}');
  const body = JSON.parse(requests[0].init.body);
  assert.equal('compiler_version' in body, false);
});

test('an unpinned object request omits compiler_version', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (input, init) => {
      requests.push({ input, init });
      return mockJsonResponse({ success: true, stdout: '', stderr: '', elapsed_ms: 5 });
    },
  });
  await client.run({ source: 'fn main() {}' });
  const body = JSON.parse(requests[0].init.body);
  assert.equal('compiler_version' in body, false);
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
  await client.createShare({ source: 'fn main() {}', compiler_version: '0.6.1' });
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.source, 'fn main() {}');
  assert.equal(body.compiler_version, '0.6.1');
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


test('preserves compiler-authored diagnostics and the actual remote version verbatim', async () => {
  const diagnostic = 'imported/worker.hew:4:7: error: task cannot outlive its scope\n  = note: café is borrowed here\n  = help: await the task before leaving the scope\n';
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    compilerVersion: null,
    fetch: async (_url, init) => {
      assert.equal(JSON.parse(init.body).compiler_version, undefined);
      return mockJsonResponse({
        success: false,
        stdout: '',
        stderr: '',
        compile_error: diagnostic,
        elapsed_ms: 1,
        compiler_version: '0.6.1',
      });
    },
  });
  const result = await client.run('fn main() {}');
  assert.equal(result.compile_error, diagnostic);
  assert.equal(result.compiler_version, '0.6.1');
});

test('run keeps wasm request compatibility while surfacing the server 422', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockJsonResponse(
        { success: false, stdout: '', stderr: 'Server-side wasm execution is unavailable', elapsed_ms: 0 },
        422,
        'Unprocessable Entity',
      );
    },
  });

  await assert.rejects(() => client.run({ source: 'fn main() {}', execution_mode: 'wasm' }), (error) => {
    assert.ok(error instanceof PlaygroundApiError);
    assert.equal(error.status, 422);
    return true;
  });
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.execution_mode, 'wasm');
  assert.equal(body.compiler_version, undefined);
});

test('run preserves native execution_mode reported by the server', async () => {
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () =>
      mockJsonResponse({
        success: true,
        stdout: 'ok\n',
        stderr: '',
        elapsed_ms: 8,
        compiler_version: '0.11.2',
        execution_mode: 'native',
      }),
  });

  const response = await client.run({ source: 'fn main() {}', execution_mode: 'native' });
  assert.equal(response.execution_mode, 'native');
});

test('listExamples exposes capabilities on every example entry', async () => {
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () =>
      mockJsonResponse([
        {
          name: 'Hello World',
          description: 'Your first Hew program',
          category: 'basics',
          source: 'fn main() { println("hello"); }',
          capabilities: {
            browser: 'analysis-only',
            wasi: 'runnable',
          },
        },
        {
          name: 'Supervisor',
          description: 'Supervision tree for fault-tolerant actors',
          category: 'concurrency',
          source: 'actor main {}',
          capabilities: {
            browser: 'analysis-only',
            wasi: 'unsupported',
          },
        },
      ]),
  });

  const examples = await client.listExamples();
  assert.equal(examples[0].capabilities.browser, 'analysis-only');
  assert.equal(examples[0].capabilities.wasi, 'runnable');
  assert.equal(examples[1].capabilities.wasi, 'unsupported');
});

test('createShare still reports oversize source on 400 with empty id', async () => {
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => mockJsonResponse({ id: '' }, 400, 'Bad Request'),
  });

  await assert.rejects(
    () => client.createShare('fn main() {}'),
    (error) => {
      assert.ok(error instanceof PlaygroundApiError);
      assert.equal(error.status, 400);
      assert.ok(
        error.message.includes('source exceeds the 64 KiB limit'),
        `Expected "source exceeds the 64 KiB limit" in message, got: ${error.message}`,
      );
      return true;
    },
  );
});

test('createShare reports rate limiting on 429 with empty id', async () => {
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => mockJsonResponse({ id: '' }, 429, 'Too Many Requests'),
  });

  await assert.rejects(
    () => client.createShare('fn main() {}'),
    (error) => {
      assert.ok(error instanceof PlaygroundApiError);
      assert.equal(error.status, 429);
      assert.ok(!error.message.includes('64 KiB'), `Expected no "64 KiB" in 429 message, got: ${error.message}`);
      assert.ok(error.message.includes('429'), `Expected status 429 in message, got: ${error.message}`);
      return true;
    },
  );
});

test('createShare reports store full on 503 with empty id', async () => {
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => mockJsonResponse({ id: '' }, 503, 'Service Unavailable'),
  });

  await assert.rejects(
    () => client.createShare('fn main() {}'),
    (error) => {
      assert.ok(error instanceof PlaygroundApiError);
      assert.equal(error.status, 503);
      assert.ok(!error.message.includes('64 KiB'), `Expected no "64 KiB" in 503 message, got: ${error.message}`);
      assert.ok(error.message.includes('503'), `Expected status 503 in message, got: ${error.message}`);
      return true;
    },
  );
});

test('test parses passing NDJSON events from POST /api/test', async () => {
  const requests = [];
  const stream = [
    { event: 'run_started', tests: 1 },
    { event: 'file_compiled', file: 'program.hew', tests: ['works'], ok: true, diagnostics: null },
    { event: 'test_started', identity: 'program.hew::works', selector: 'program.hew::works' },
    {
      event: 'test_finished',
      identity: 'program.hew::works',
      selector: 'program.hew::works',
      outcome: 'passed',
      kind: null,
      message: null,
      reason: null,
      duration_ms: 4,
      output: '',
      report: null,
    },
    { event: 'run_finished', passed: 1, failed: 0, ignored: 0 },
  ];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async (url, init) => {
      requests.push({ url, init });
      return mockNdjsonResponse(stream);
    },
  });

  const result = await client.test('#[test] fn works() { assert(2 + 2 == 4); }');
  assert.equal(requests[0].url, 'https://playground.example/api/test');
  assert.equal(requests[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    source: '#[test] fn works() { assert(2 + 2 == 4); }',
  });
  assert.equal(result.success, true);
  assert.equal(result.passed, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.ignored, 0);
  assert.equal(result.tests.length, 1);
  assert.equal(result.discovered.length, 0);
  assert.equal(result.events.length, 5);
  assert.equal('error' in result, false);
});

test('test reports failing test outcomes without throwing', async () => {
  const stream = [
    { event: 'run_started', tests: 2 },
    {
      event: 'test_finished',
      identity: 'program.hew::works',
      selector: 'program.hew::works',
      outcome: 'passed',
      kind: null,
      message: null,
      reason: null,
      duration_ms: 2,
      output: '',
      report: null,
    },
    {
      event: 'test_finished',
      identity: 'program.hew::fails',
      selector: 'program.hew::fails',
      outcome: 'failed',
      kind: 'assertion',
      message: 'assertion failed: 1 == 2',
      reason: null,
      duration_ms: 3,
      output: '',
      report: { outcome: 'failed', status: 1, fault_kind: 'assertion' },
    },
    { event: 'run_finished', passed: 1, failed: 1, ignored: 0 },
  ];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => mockNdjsonResponse(stream),
  });

  const result = await client.test('#[test] fn works() {}\n#[test] fn fails() { assert(1 == 2); }');
  assert.equal(result.success, false);
  assert.equal(result.passed, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.tests[1].outcome, 'failed');
  assert.equal(result.tests[1].kind, 'assertion');
});

test('test supports list_only discovery and forwards test and compiler_version options', async () => {
  const requests = [];
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    compilerVersion: '0.10.0',
    fetch: async (url, init) => {
      requests.push({ url, init });
      const payload = JSON.parse(init.body);
      if (payload.list_only) {
        return mockNdjsonResponse([
          {
            event: 'test_discovered',
            identity: 'program.hew::works',
            selector: 'program.hew::works',
            ignored: false,
            ignore_reason: null,
          },
        ]);
      }
      return mockNdjsonResponse([
        { event: 'run_finished', passed: 1, failed: 0, ignored: 0 },
      ]);
    },
  });

  const discovery = await client.test({
    source: '#[test] fn works() {}',
    list_only: true,
    compiler_version: '0.11.2',
  });
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    source: '#[test] fn works() {}',
    compiler_version: '0.11.2',
    list_only: true,
  });
  assert.equal(discovery.success, true);
  assert.equal(discovery.discovered.length, 1);
  assert.equal(discovery.discovered[0].identity, 'program.hew::works');

  await client.test({ source: '#[test] fn works() {}', test: '' });
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    source: '#[test] fn works() {}',
    compiler_version: '0.10.0',
    test: '',
  });
});

test('test captures post-admission stream error events', async () => {
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () =>
      mockNdjsonResponse([
        { event: 'error', message: 'error: parse error' },
      ]),
  });

  const result = await client.test('fn broken( {');
  assert.equal(result.success, false);
  assert.equal(result.error, 'error: parse error');
  assert.equal(result.events.length, 1);
});

test('test surfaces pre-admission NDJSON errors as PlaygroundApiError', async () => {
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () =>
      mockNdjsonResponse({ event: 'error', message: 'Invalid test selection' }, 400, 'Bad Request'),
  });

  await assert.rejects(
    () => client.test({ source: '#[test] fn ok() {}', test: '../other.hew::ok' }),
    (error) => {
      assert.ok(error instanceof PlaygroundApiError);
      assert.equal(error.status, 400);
      assert.deepEqual(error.body, { event: 'error', message: 'Invalid test selection' });
      assert.ok(error.message.includes('Invalid test selection'));
      return true;
    },
  );
});

test('test rejects unexpected non-NDJSON 200 responses', async () => {
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'text/plain' },
      async text() {
        return 'ok';
      },
    }),
  });

  await assert.rejects(() => client.test('#[test] fn ok() {}'), /non-NDJSON/);
});

test('test rejects malformed NDJSON lines on 200 responses', async () => {
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => mockNdjsonResponse('{"event":"run_started","tests":1}\nnot-json\n'),
  });

  await assert.rejects(() => client.test('#[test] fn ok() {}'), /invalid NDJSON/);
});

test('test rejects truncated streams without run_finished or error', async () => {
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () =>
      mockNdjsonResponse([
        { event: 'run_started', tests: 2 },
        { event: 'test_started', identity: 'program.hew::a', selector: 'program.hew::a' },
      ]),
  });

  await assert.rejects(() => client.test('#[test] fn a() {}'), /run_finished/);
});

test('test marks file_compiled.ok false as unsuccessful even with zero failed test_finished events', async () => {
  const client = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () =>
      mockNdjsonResponse([
        { event: 'run_started', tests: 1 },
        { event: 'file_compiled', file: 'program.hew', tests: ['a'], ok: false, diagnostics: 'type error' },
        { event: 'run_finished', passed: 0, failed: 0, ignored: 0 },
      ]),
  });

  const result = await client.test('#[test] fn a() {}');
  assert.equal(result.success, false);
});

test('test rejects empty NDJSON streams and non-TestEvent JSON payloads on HTTP 200', async () => {
  const jsonClient = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => mockJsonResponse({ error: 'upstream timeout' }),
  });
  await assert.rejects(() => jsonClient.test('#[test] fn ok() {}'), /non-NDJSON/);

  const nonEventClient = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => mockNdjsonResponse({ error: 'upstream timeout' }),
  });
  await assert.rejects(() => nonEventClient.test('#[test] fn ok() {}'), /unrecognized test event/);

  const missingMessageErrorClient = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => mockNdjsonResponse({ event: 'error' }),
  });
  await assert.rejects(() => missingMessageErrorClient.test('#[test] fn ok() {}'), /unrecognized test event/);

  const emptyStreamClient = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => mockNdjsonResponse('\n  \n'),
  });
  await assert.rejects(() => emptyStreamClient.test('#[test] fn ok() {}'), /empty NDJSON/);

  const listOnlyExecutionClient = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () =>
      mockNdjsonResponse([{ event: 'run_started', tests: 1 }]),
  });
  await assert.rejects(() => listOnlyExecutionClient.test({ source: '#[test] fn ok() {}', list_only: true }), /without test discovery/);
});

test('mergeHeaders normalizes case, handles all Iterable types, and snapshots single-use iterators', async () => {
  const captured = [];
  const sourceHeaders = new Headers({ 'x-api-key': 'secret', 'X-Hew-Version': '0.11.2' });
  const clientFromIterator = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    headers: sourceHeaders.entries(),
    fetch: async (_url, init) => {
      captured.push(init.headers);
      return mockJsonResponse({ id: 'abc123def4567890' });
    },
  });

  await clientFromIterator.createShare('fn main() {}');
  await clientFromIterator.createShare('fn main() {}');
  assert.deepEqual(captured[0], {
    'x-api-key': 'secret',
    'x-hew-version': '0.11.2',
    'content-type': 'application/json',
  });
  assert.deepEqual(captured[1], captured[0]);

  const capturedMixed = [];
  const customForEachOnly = {
    forEach(cb) {
      cb('custom', 'X-Custom');
    },
  };
  const customIterable = {
    *[Symbol.iterator]() {
      yield ['X-Iter', 'iter-val'];
    },
  };
  const clientMixed = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    headers: { 'Content-Type': 'text/plain', 'X-Hew-Version': '0.10.0' },
    fetch: async (_url, init) => {
      capturedMixed.push(init.headers);
      return mockJsonResponse({ id: 'abc123def4567890' });
    },
  });
  await clientMixed.createShare('fn main() {}');
  assert.deepEqual(capturedMixed[0], {
    'content-type': 'application/json',
    'x-hew-version': '0.10.0',
  });

  const capturedSetAndCustom = [];
  const clientSet = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    headers: new Set([['X-Set-Header', 'from-set']]),
    fetch: async (_url, init) => {
      capturedSetAndCustom.push(init.headers);
      return mockJsonResponse({ default_version: '0.11.2', available_versions: ['0.11.2'] });
    },
  });
  await clientSet.listVersions();
  assert.deepEqual(capturedSetAndCustom[0], { 'x-set-header': 'from-set' });

  const clientCustom = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    headers: customIterable,
    fetch: async (_url, init) => {
      capturedSetAndCustom.push(init.headers);
      return mockJsonResponse({ default_version: '0.11.2', available_versions: ['0.11.2'] });
    },
  });
  await clientCustom.listVersions();
  assert.deepEqual(capturedSetAndCustom[1], { 'x-iter': 'iter-val' });

  const clientForEachOnly = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    headers: customForEachOnly,
    fetch: async (_url, init) => {
      capturedSetAndCustom.push(init.headers);
      return mockJsonResponse({ default_version: '0.11.2', available_versions: ['0.11.2'] });
    },
  });
  await clientForEachOnly.listVersions();
  assert.deepEqual(capturedSetAndCustom[2], { 'x-custom': 'custom' });
});

test('forwards explicit empty compiler_version and treats per-request null as server default', async () => {
  const bodies = [];
  const pinnedClient = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    compilerVersion: '0.11.2',
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return mockJsonResponse({ success: true, stdout: '', stderr: '', elapsed_ms: 1 });
    },
  });

  await pinnedClient.run({ source: 'fn main() {}', compiler_version: '' });
  await pinnedClient.run({ source: 'fn main() {}', compiler_version: null });
  assert.equal(bodies[0].compiler_version, '');
  assert.equal('compiler_version' in bodies[1], false);

  const emptyPinnedClient = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    compilerVersion: '',
    fetch: async (url, init) => {
      bodies.push(JSON.parse(init.body));
      if (url.endsWith('/api/test')) {
        return mockNdjsonResponse([{ event: 'run_finished', passed: 0, failed: 0, ignored: 0 }]);
      }
      return mockJsonResponse({ success: true, stdout: '', stderr: '', elapsed_ms: 1 });
    },
  });

  await emptyPinnedClient.test({ source: '#[test] fn a() {}', compiler_version: '' });
  await emptyPinnedClient.test({ source: '#[test] fn a() {}', compiler_version: null });
  await emptyPinnedClient.test('#[test] fn a() {}');
  assert.equal(bodies[2].compiler_version, '');
  assert.equal('compiler_version' in bodies[3], false);
  assert.equal(bodies[4].compiler_version, '');
});

test('requestJson surfaces non-JSON 502 responses as PlaygroundApiError and parses multi-event NDJSON + share errors', async () => {
  const badGatewayClient = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => ({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      headers: { get: () => 'application/json' },
      async text() {
        return '<html>502 Bad Gateway</html>';
      },
    }),
  });
  await assert.rejects(
    () => badGatewayClient.run('fn main() {}'),
    (error) => error instanceof PlaygroundApiError && error.status === 502 && error.message.includes('502 Bad Gateway'),
  );

  const multiEventErrorClient = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () =>
      mockNdjsonResponse(
        [
          { event: 'run_started', tests: 1 },
          { event: 'error', message: 'worker failure after start' },
        ],
        503,
        'Service Unavailable',
      ),
  });
  await assert.rejects(
    () => multiEventErrorClient.test('#[test] fn ok() {}'),
    (error) => error instanceof PlaygroundApiError && error.message.includes('worker failure after start'),
  );

  const shareRateLimitedClient = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => mockJsonResponse({ id: '' }, 429, 'Too Many Requests'),
  });
  await assert.rejects(
    () => shareRateLimitedClient.createShare('fn main() {}'),
    (error) => error instanceof PlaygroundApiError && error.message.includes('rate limit exceeded'),
  );

  const shareStoreFullClient = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => mockJsonResponse({ id: '' }, 503, 'Service Unavailable'),
  });
  await assert.rejects(
    () => shareStoreFullClient.createShare('fn main() {}'),
    (error) => error instanceof PlaygroundApiError && error.message.includes('share store unavailable'),
  );
});

test('health accepts empty 200 readiness responses and throws PlaygroundApiError on 503', async () => {
  const healthyClient = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => null },
      async text() {
        return '';
      },
    }),
  });
  assert.equal(await healthyClient.health(), '');

  const unavailableClient = new HewPlaygroundClient({
    baseUrl: 'https://playground.example',
    fetch: async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: { get: () => null },
      async text() {
        return '';
      },
    }),
  });
  await assert.rejects(
    () => unavailableClient.health(),
    (error) => error instanceof PlaygroundApiError && error.status === 503,
  );
});
