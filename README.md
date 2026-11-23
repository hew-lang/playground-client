# @hew-lang/playground-client

Lightweight TypeScript client for the Hew Playground API.

## Install

Install the compiled archive from the versioned public release:

```bash
npm install https://github.com/hew-lang/playground-client/releases/download/v0.4.0/hew-lang-playground-client-0.4.0.tgz
```

The archive includes JavaScript and TypeScript declarations. It needs no GitHub
package token. The release also includes `SHA256SUMS`; consumers should commit
their package-manager lockfile to pin the archive's integrity.

## Simplest usage

```ts
import { HewPlaygroundClient } from '@hew-lang/playground-client';

const client = new HewPlaygroundClient('https://livecode-v1.hew.sh');

const result = await client.run(`
import std.io.scanner.{words};

enum Greeting {
  Message(string);
}

fn main() {
  let tokens = words("hello world");
  let greeting: Greeting = .Message("hello");
  match greeting {
    .Message(text) => println(f"{text} ({tokens.len()})"),
  }
}
`);
console.log(result.stdout);
```

Hew 0.11 uses dotted module paths and grouped selections such as
`std.io.scanner.{words}`, interpolated strings `f"{expr}"`, and contextual enum
constructors and patterns such as `.Message`. Retired `::` paths and Rust-style
turbofish syntax produce migration diagnostics such as
`E_PATH_LEGACY_SEPARATOR` and `E_LEGACY_TURBOFISH` on relevant compiler
releases.

This client neither embeds a compiler nor interprets compiler diagnostics: it
transports source and preserves opaque compiler stderr from the server. Its
default follows the server's current compiler; diagnostic text, codes, and
supported syntax remain compiler-version-dependent. Use `listVersions()` to see
which versions the server currently provides.

## Execution targets

The hosted API runs native programs (`execution_mode: "native"`). It refuses
`execution_mode: "wasm"` with HTTP 422 and never silently runs the request
natively. Successful `RunResponse` payloads always report
`execution_mode: "native"`.

For local browser execution, use `@hew-lang/playground-sandbox`. Its compiler
and VM report capability refusals explicitly. Upgrade those two local engine
packages together; they do not change the remote compiler selected by this HTTP
client. Await both clients' `run()` calls and display compiler-authored errors,
notes and suggestions without translating them into a different set of
diagnostic rules.

## Runtime requirements

- Works in modern browsers.
- Works in Node.js when `fetch` is available globally.
- For older runtimes or custom transport, pass your own `fetch` implementation in the client options.

## Client construction

```ts
import { HewPlaygroundClient } from '@hew-lang/playground-client';

const client = new HewPlaygroundClient({
  baseUrl: 'https://livecode-v1.hew.sh',
  headers: {
    Authorization: 'Bearer <token>',
  },
});
```

## Compiler version selection

By default, `run()` and `test()` omit `compiler_version` so the server chooses
its current default. Pin a version client-wide or per request when reproducible
version selection is required. Passing `null` also selects the server default:

```ts
const versions = await client.listVersions();
console.log(versions.default_version, versions.available_versions);

// Pin a version client-wide
const pinned = new HewPlaygroundClient({
  baseUrl: 'https://livecode-v1.hew.sh',
  compilerVersion: versions.default_version,
});

// Let the server decide (tracks the server's default as it advances)
const tracking = new HewPlaygroundClient({
  baseUrl: 'https://livecode-v1.hew.sh',
  compilerVersion: null,
});

// Per-request override
await pinned.run({ source: 'fn main() {}', compiler_version: '0.10.0' });
```

Examples returned by `listExamples()` carry a `capabilities` object
describing their execution tier (`browser` is always `'analysis-only'`;
`wasi` is `'runnable'` or `'unsupported'`):

```ts
const examples = await client.listExamples();
const runnableInWasi = examples.filter((example) => example.capabilities.wasi === 'runnable');
```

## Running tests

`test()` calls `POST /api/test` and parses the server's `application/x-ndjson`
event stream into a `TestResponse`:

```ts
const discovered = await client.test({
  source: `
#[test]
fn adds() {
  assert(2 + 2 == 4);
}
`,
  list_only: true,
});
console.log(discovered.discovered.map((entry) => entry.identity));

const report = await client.test({
  source: `
#[test]
fn adds() {
  assert(2 + 2 == 4);
}
`,
  test: 'adds',
});
console.log(report.success, report.passed, report.failed);
```

### Constructor options

| Option | Type | Description |
| --- | --- | --- |
| `baseUrl` | `string` | Base URL of the playground server. |
| `fetch` | `PlaygroundFetch` | Optional custom fetch implementation. |
| `headers` | `PlaygroundHeadersInit` | Optional default headers added to every request. |
| `compilerVersion` | `string \| null` | Optional `compiler_version` sent on every `run()` and `test()`. Omit it or pass `null` to use the server default. |

## API overview

The client mirrors the HTTP API with typed methods:

| Method | Description |
| --- | --- |
| `health()` | Checks worker readiness (`GET /api/health`). |
| `run(sourceOrRequest)` | Compiles and runs Hew source code. Pass a string for defaults, or a `RunRequest` object to set `compiler_version` and `execution_mode`. |
| `test(sourceOrRequest)` | Discovers or runs Hew `#[test]` functions (`POST /api/test`) and parses the NDJSON event stream into a `TestResponse`. |
| `listVersions()` | Lists available compiler versions and the server default. |
| `listExamples()` | Lists built-in example programs plus capability metadata. |
| `createShare(sourceOrRequest)` | Stores source code and returns a share ID. |
| `getShare(id)` | Fetches a previously shared snippet. |

The package exports these request/response types:

- `ExecutionMode`, `RunRequest`, `RunResponse`
- `TestRequest`, `TestResponse`, `TestEvent`, `TestOutcome`, `TestReport`
- `TestDiscoveredEvent`, `TestRunStartedEvent`, `TestFileCompiledEvent`, `TestStartedEvent`, `TestFinishedEvent`, `TestRunFinishedEvent`, `TestErrorEvent`
- `Example`, `ExampleCapabilities`, `BrowserExampleCapability`, `WasiExampleCapability`
- `ShareRequest`, `ShareResponse`, `ShareGetResponse`
- `VersionsResponse`
- `ErrorResponse`
- `PlaygroundClientOptions`
- `PlaygroundApiError`

It also exports the `createHewPlaygroundClient()` factory and the
`isPlaygroundApiError()` type guard.

## Error handling

Non-2xx HTTP responses throw `PlaygroundApiError`.

```ts
import { HewPlaygroundClient, PlaygroundApiError } from '@hew-lang/playground-client';

const client = new HewPlaygroundClient('https://livecode-v1.hew.sh');

try {
  const share = await client.createShare('fn main() { println(1); }');
  console.log(share.id);
} catch (error) {
  if (error instanceof PlaygroundApiError) {
    console.error(error.status, error.body);
  }
}
```

`run()` and `test()` report compile failures and test failures inside their
returned `RunResponse` (`success`, `compile_error`, `exit_code`) or `TestResponse`
(`success`, `failed`, `error`, `tests`) rather than throwing on HTTP 200.

The share API stores source only. A UI that pins a shared snippet must retain
the compiler version in its URL and pass that value to `run()` when executing
the snippet.

## Related artifacts

- `openapi.json` — machine-readable HTTP API specification.
- `hew-playground-client.ts` — canonical single-file SDK source if you want to vendor the client directly.

For a local checkout of this repository, you can swap the import path to `./hew-playground-client`.

## Releasing

1. Bump `version` in `package.json` and update the README/API docs.
2. Run `npm run test:sdk` locally.
3. Commit and push to `main`.
4. After publication approval, tag the release. The **Release** workflow checks
   the exact tag/version, installs and tests without registry credentials, then
   publishes the compiled archive and `SHA256SUMS` with the release notes.

An approved older tag can be packaged with the workflow's `release_tag` input.
Reruns compare existing assets and refuse to replace different bytes. The
separate **Publish** workflow remains available for optional registry mirrors;
its ownership and permissions are unchanged.

## License

MIT License. Copyright (c) 2026 Stephen Olesen.
