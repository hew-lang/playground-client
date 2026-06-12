# @hew-lang/playground-client

Lightweight TypeScript client for the Hew Playground API.

## Install

```bash
npm install @hew-lang/playground-client
```

npmjs is the canonical registry.

### Installing from GitHub Packages

The same versions are mirrored to GitHub Packages. To install from there, point the
`@hew-lang` scope at the GitHub npm registry in an `.npmrc` (GitHub Packages requires
an authenticated token, even for installs):

```ini
@hew-lang:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Versions and dist-tags are independent per registry; prefer npmjs unless you
specifically need the GitHub Packages mirror.

## Simplest usage

```ts
import { HewPlaygroundClient } from '@hew-lang/playground-client';

const client = new HewPlaygroundClient('https://livecode-v1.hew.sh');

const result = await client.run('fn main() { println("hello"); }');
console.log(result.stdout);
```

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

npmjs is canonical; GitHub Packages is kept in sync by the same workflow.

1. Bump `version` in `package.json` and update the README/API docs.
2. Run `npm run test:sdk` locally.
3. Commit and push to `main`.
4. Run the **Publish** workflow (`workflow_dispatch`) with `dry_run: true` to
   validate, then `dry_run: false` to publish to npmjs and mirror to GitHub Packages
   in the same run (npmjs first, then the mirror).
5. Tag the release — `git tag vX.Y.Z && git push --tags` — to generate the GitHub
   Release notes.

## License

MIT License. Copyright (c) 2026 Stephen Olesen.
