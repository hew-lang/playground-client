export interface RunRequest {
  source: string;
  /** Request a specific compiler version (e.g. `"0.2.0"`). Overrides the
   *  client-wide `compilerVersion` and the `X-Hew-Version` header. */
  compiler_version?: string;
  /** Execution backend. Defaults to `"native"` on the server when absent. */
  execution_mode?: 'native' | 'wasm';
}

export interface RunResponse {
  success: boolean;
  stdout: string;
  stderr: string;
  compile_error?: string;
  exit_code?: number;
  elapsed_ms: number;
  profile?: string;
  /** The compiler version that was used for this run. */
  compiler_version?: string;
  /** The execution lane that actually handled the request. Reports what ran,
   *  not what was requested — a `"wasm"` request served while the server's
   *  WASM lane is disabled says `"native"`. Absent when the request was
   *  rejected before an execution lane was selected, and on responses from
   *  servers that predate the field. */
  execution_mode?: 'native' | 'wasm';
}

export interface ExampleCapabilities {
  /** Browser capability — the browser lane exposes analysis only. */
  browser: 'analysis-only';
  /** WASI capability: `runnable` executes under wasm32-wasi. */
  wasi: 'runnable' | 'unsupported';
}

export interface Example {
  name: string;
  description: string;
  category: string;
  source: string;
  capabilities: ExampleCapabilities;
}

export interface ShareRequest {
  source: string;
  /** Pin the snippet to a specific compiler version (e.g. `"0.5.0"`) so the
   *  share link reproduces under that version. Omit to let the server default. */
  compiler_version?: string;
}

export interface ShareResponse {
  id: string;
}

export interface ShareGetResponse {
  source: string;
}

export interface ErrorResponse {
  error: string;
}

export interface VersionsResponse {
  default_version: string;
  available_versions: string[];
}

export interface PlaygroundHeadersLike {
  forEach(callback: (value: string, key: string) => void): void;
}

export type PlaygroundHeadersInit =
  | Record<string, string>
  | Iterable<readonly [string, string]>
  | PlaygroundHeadersLike;

export interface PlaygroundRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface PlaygroundResponseHeaders {
  get(name: string): string | null;
}

export interface PlaygroundResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: PlaygroundResponseHeaders;
  text(): Promise<string>;
}

export type PlaygroundFetch = (
  input: string,
  init?: PlaygroundRequestInit,
) => Promise<PlaygroundResponseLike>;

export interface PlaygroundClientOptions {
  baseUrl: string;
  fetch?: PlaygroundFetch;
  headers?: PlaygroundHeadersInit;
  /** Default compiler version sent as `compiler_version` in the request body
   *  on every `run()` call. Can be overridden per-request via the
   *  `compiler_version` field in `RunRequest`. Pass `null` to omit the field
   *  entirely and let the server choose its default version. */
  compilerVersion?: string | null;
}

export class PlaygroundApiError<TBody = unknown> extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: TBody;
  readonly response: PlaygroundResponseLike;

  constructor(response: PlaygroundResponseLike, body: TBody, message?: string) {
    super(message ?? `Playground API request failed with ${response.status} ${response.statusText}`);
    this.name = 'PlaygroundApiError';
    this.status = response.status;
    this.statusText = response.statusText;
    this.body = body;
    this.response = response;
  }
}

export function isPlaygroundApiError(error: unknown): error is PlaygroundApiError {
  return error instanceof PlaygroundApiError;
}

export class HewPlaygroundClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: PlaygroundFetch;
  private readonly defaultHeaders?: PlaygroundHeadersInit;
  private readonly compilerVersion?: string;

  constructor(options: string | PlaygroundClientOptions) {
    const resolved = typeof options === 'string' ? { baseUrl: options } : options;
    this.baseUrl = resolved.baseUrl;
    this.fetchImpl = resolved.fetch ?? resolveFetch();
    this.defaultHeaders = resolved.headers;
    this.compilerVersion =
      resolved.compilerVersion === null ? undefined : (resolved.compilerVersion ?? '0.5.0');
  }

  async health(): Promise<string> {
    const response = await this.fetchImpl(this.url('/api/health'), {
      method: 'GET',
      headers: mergeHeaders(this.defaultHeaders),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new PlaygroundApiError(response, body, buildErrorMessage('GET /api/health', response.status, body));
    }
    return body;
  }

  async run(request: RunRequest | string): Promise<RunResponse> {
    const body = normalizeRunRequest(request, this.compilerVersion);
    return this.requestJson<RunResponse>('POST /api/run', '/api/run', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async listVersions(): Promise<VersionsResponse> {
    return this.requestJson<VersionsResponse>('GET /api/versions', '/api/versions', {
      method: 'GET',
    });
  }

  async listExamples(): Promise<Example[]> {
    return this.requestJson<Example[]>('GET /api/examples', '/api/examples', {
      method: 'GET',
    });
  }

  async createShare(request: ShareRequest | string): Promise<ShareResponse> {
    return this.requestJson<ShareResponse>('POST /api/share', '/api/share', {
      method: 'POST',
      body: JSON.stringify(normalizeSource(request)),
    });
  }

  async getShare(id: string): Promise<ShareGetResponse> {
    return this.requestJson<ShareGetResponse>('GET /api/share/{id}', `/api/share/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
  }

  private async requestJson<T>(label: string, path: string, init: PlaygroundRequestInit): Promise<T> {
    const headers = init.body === undefined
      ? mergeHeaders(this.defaultHeaders, init.headers)
      : mergeHeaders(this.defaultHeaders, init.headers, {
          'content-type': 'application/json',
        });
    const response = await this.fetchImpl(this.url(path), {
      ...init,
      headers,
    });

    const raw = await response.text();
    const body = parseBody(response, raw);
    if (!response.ok) {
      throw new PlaygroundApiError(response, body, buildErrorMessage(label, response.status, body));
    }
    if (body === null || typeof body !== 'object') {
      throw new Error(`${label} returned an unexpected non-JSON success body.`);
    }
    return body as T;
  }

  private url(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }
}

export function createHewPlaygroundClient(options: string | PlaygroundClientOptions): HewPlaygroundClient {
  return new HewPlaygroundClient(options);
}

function resolveFetch(): PlaygroundFetch {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error(
      'No fetch implementation is available. Pass one in the client options when using an older runtime.',
    );
  }
  return (input, init) => globalThis.fetch(input, init) as Promise<PlaygroundResponseLike>;
}

function normalizeSource(request: RunRequest | ShareRequest | string): { source: string; compiler_version?: string } {
  if (typeof request === 'string') {
    return { source: request };
  }
  const body: { source: string; compiler_version?: string } = { source: request.source };
  if (request.compiler_version) {
    body.compiler_version = request.compiler_version;
  }
  return body;
}

function normalizeRunRequest(
  request: RunRequest | string,
  clientVersion?: string,
): { source: string; compiler_version?: string; execution_mode?: 'native' | 'wasm' } {
  if (typeof request === 'string') {
    return clientVersion ? { source: request, compiler_version: clientVersion } : { source: request };
  }
  const body: { source: string; compiler_version?: string; execution_mode?: 'native' | 'wasm' } = { source: request.source };
  if (request.compiler_version) {
    body.compiler_version = request.compiler_version;
  } else if (clientVersion) {
    body.compiler_version = clientVersion;
  }
  if (request.execution_mode) {
    body.execution_mode = request.execution_mode;
  }
  return body;
}

function mergeHeaders(...headerSets: Array<PlaygroundHeadersInit | Record<string, string> | undefined>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const headerSet of headerSets) {
    if (!headerSet) {
      continue;
    }
    if (Array.isArray(headerSet)) {
      for (const [key, value] of headerSet) {
        headers[key] = value;
      }
      continue;
    }
    if (isHeadersLike(headerSet)) {
      headerSet.forEach((value, key) => {
        headers[key] = value;
      });
      continue;
    }
    for (const [key, value] of Object.entries(headerSet)) {
      headers[key] = value;
    }
  }
  return headers;
}

function isHeadersLike(headerSet: PlaygroundHeadersInit | Record<string, string>): headerSet is PlaygroundHeadersLike {
  return typeof (headerSet as { forEach?: unknown }).forEach === 'function';
}

function parseBody(response: PlaygroundResponseLike, raw: string): unknown {
  if (raw.length === 0) {
    return null;
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('json')) {
    return raw;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`Response returned invalid JSON: ${String(error)}`);
  }
}

function buildErrorMessage(label: string, status: number, body: unknown): string {
  if (typeof body === 'string' && body.trim().length > 0) {
    return `${label} failed with ${status}: ${body}`;
  }
  if (body && typeof body === 'object') {
    if ('error' in body && typeof (body as Record<string, unknown>).error === 'string') {
      return `${label} failed with ${status}: ${(body as Record<string, unknown>).error as string}`;
    }
    if ('stderr' in body && typeof (body as Record<string, unknown>).stderr === 'string') {
      const stderr = ((body as Record<string, unknown>).stderr as string).trim();
      if (stderr.length > 0) {
        return `${label} failed with ${status}: ${stderr}`;
      }
    }
    if ('compile_error' in body && typeof (body as Record<string, unknown>).compile_error === 'string') {
      return `${label} failed with ${status}: ${(body as Record<string, unknown>).compile_error as string}`;
    }
    if ('id' in body && (body as Record<string, unknown>).id === '') {
      return `${label} failed with ${status}: source exceeds the 64 KiB limit`;
    }
  }
  return `${label} failed with ${status}`;
}
