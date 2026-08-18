# @hew-lang/playground-client

Lightweight TypeScript client for the Hew Playground API.

## Install

`@hew-lang/playground-client` is published to **GitHub Packages**, the canonical
registry for the `@hew-lang` scope. Point the scope at GitHub Packages in an
`.npmrc` (GitHub Packages requires an authenticated token — a `read:packages`
PAT — even for installs):

```ini
@hew-lang:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```bash
npm install @hew-lang/playground-client
```

A convenience mirror is also published to npmjs as needed, for consumers who
prefer it:

```bash
npm install @hew-lang/playground-client --@hew-lang:registry=https://registry.npmjs.org/
```

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
  let tokens = words("hello");
  let greeting: Greeting = .Message("hello");
  match greeting {
    .Message(text) => println(text),
  }
  println(tokens.len());
}
`);
console.log(result.stdout);
```

The playground accepts dotted module paths and grouped selections such as
`std.io.scanner.{words}`. Variant constructors and patterns are contextual, so use
`.Message` when the enum type is known. The retired `::` path separator, glob
imports, and turbofish syntax are rejected by the compiler. Compile responses
preserve the migration diagnostics, including `E_PATH_LEGACY_SEPARATOR` and
`E_LEGACY_TURBOFISH`.

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

Every `run()` sends `compiler_version` in the request body. The client
defaults to `'0.5.0'`; override it client-wide or per request, or pass
`null` to omit the field and let the server pick its default version:

```ts
// Pin a version client-wide
const pinned = new HewPlaygroundClient({
  baseUrl: 'https://livecode-v1.hew.sh',
  compilerVersion: '0.4.0',
});

// Let the server decide (tracks the server's default as it advances)
const tracking = new HewPlaygroundClient({
  baseUrl: 'https://livecode-v1.hew.sh',
  compilerVersion: null,
});

// Per-request override
await pinned.run({ source: 'fn main() {}', compiler_version: '0.5.0' });
```

Examples returned by `listExamples()` carry a `capabilities` object
describing their execution tier (`browser` is always `'analysis-only'`;
`wasi` is `'runnable'` or `'unsupported'`).

### Constructor options

| Option | Type | Description |
| --- | --- | --- |
| `baseUrl` | `string` | Base URL of the playground server. |
| `fetch` | `PlaygroundFetch` | Optional custom fetch implementation. |
| `headers` | `PlaygroundHeadersInit` | Optional default headers added to every request. |
| `compilerVersion` | `string \| null` | Default `compiler_version` sent on every `run()`. Defaults to `'0.5.0'`; pass `null` to omit it and use the server default. |

## API overview

The client mirrors the HTTP API with typed methods:

| Method | Description |
| --- | --- |
| `health()` | Returns the plain-text health response. |
| `run(sourceOrRequest)` | Compiles and runs Hew source code. |
| `listVersions()` | Lists available compiler versions and the server default. |
| `listExamples()` | Lists built-in example programs. |
| `createShare(sourceOrRequest)` | Stores source code and returns a share ID. |
| `getShare(id)` | Fetches a previously shared snippet. |

The package exports these request/response types:

- `RunRequest`, `RunResponse`
- `Example`, `ExampleCapabilities`
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

`run()` has one important API-level nuance: compile failures still come back as a normal JSON `RunResponse`, so check `success`, `compile_error`, and `exit_code` rather than assuming every unsuccessful program run throws.

## Related artifacts

- `openapi.json` — machine-readable HTTP API specification.
- `hew-playground-client.ts` — canonical single-file SDK source if you want to vendor the client directly.

For a local checkout of this repository, you can swap the import path to `./hew-playground-client`.

## Releasing

GitHub Packages is canonical; npmjs is an optional mirror published in the same run.

1. Bump `version` in `package.json` and update the README/API docs.
2. Run `npm run test:sdk` locally.
3. Commit and push to `main`.
4. Run the **Publish** workflow (`workflow_dispatch`) with `dry_run: true` to
   validate, then `dry_run: false` to publish to GitHub Packages (and, when
   `mirror_npm` is enabled, mirror to npmjs in the same run).
5. Tag the release — `git tag vX.Y.Z && git push --tags` — to generate the GitHub
   Release notes.

## License

MIT License. Copyright (c) 2026 Stephen Olesen.
