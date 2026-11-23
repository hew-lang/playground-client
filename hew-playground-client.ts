export type ExecutionMode = 'native' | 'wasm';

export interface RunRequest {
  source: string;
  /** Request a specific compiler version (e.g. `"0.11.1"`). Overrides the
   *  client-wide `compilerVersion` and the `X-Hew-Version` header. */
  compiler_version?: string;
  /** Request a specific execution lane. `"native"` is the default. `"wasm"`
   *  remains accepted for compatibility, but the server rejects it with HTTP
   *  422 and never falls back to native execution. Use `@hew-lang/playground-sandbox`
   *  for local browser execution. */
  execution_mode?: ExecutionMode;
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
  /** Successful server-side runs are always native. Absent when validation or
   *  control-plane admission rejected the request, and on older servers. */
  execution_mode?: 'native';
}

export interface TestRequest {
  source: string;
  /** Request a specific compiler version (e.g. `"0.11.1"`). Overrides the
   *  client-wide `compilerVersion` and the `X-Hew-Version` header. */
  compiler_version?: string;
  /** Emit `test_discovered` events without executing tests. */
  list_only?: boolean;
  /** Run only this single test (bare identifier from discovery; disallowed when
   *  `list_only` is true). */
  test?: string;
}

export type TestOutcome = 'passed' | 'failed' | 'ignored';

export interface TestReportSite {
  file: string;
  line: number;
  col: number;
}

export interface TestReportAssertion {
  operator: string;
  left: string;
  right: string;
}

export interface TestReport {
  outcome: string;
  status: number;
  fault_kind: string | null;
  fault_code?: number | null;
  message?: string | null;
  site?: TestReportSite | null;
  assertion?: TestReportAssertion | null;
  schedule?: string | null;
  seed?: string | null;
  steps?: number | null;
  virtual_time_ms?: number | null;
  [key: string]: unknown;
}

export interface TestDiscoveredEvent {
  event: 'test_discovered';
  identity: string;
  selector: string;
  ignored: boolean;
  ignore_reason: string | null;
}

export interface TestRunStartedEvent {
  event: 'run_started';
  tests: number;
}

export interface TestFileCompiledEvent {
  event: 'file_compiled';
  file: string;
  tests: string[];
  ok: boolean;
  diagnostics: string | null;
}

export interface TestStartedEvent {
  event: 'test_started';
  identity: string;
  selector: string;
}

export interface TestFinishedEvent {
  event: 'test_finished';
  identity: string;
  selector: string;
  outcome: TestOutcome;
  kind: string | null;
  message: string | null;
  reason: string | null;
  duration_ms: number;
  output: string;
  report: TestReport | null;
}

export interface TestRunFinishedEvent {
  event: 'run_finished';
  passed: number;
  failed: number;
  ignored: number;
}

export interface TestErrorEvent {
  event: 'error';
  message: string;
}

export type TestEvent =
  | TestDiscoveredEvent
  | TestRunStartedEvent
  | TestFileCompiledEvent
  | TestStartedEvent
  | TestFinishedEvent
  | TestRunFinishedEvent
  | TestErrorEvent;

export interface TestResponse {
  /** True when execution completed without test failures or stream errors (or,
   *  for `list_only`, when discovery completed without a stream error). */
  success: boolean;
  /** Ordered NDJSON events emitted by `POST /api/test`. */
  events: TestEvent[];
  /** Discovered tests from `test_discovered` events. */
  discovered: TestDiscoveredEvent[];
  /** Completed test case results from `test_finished` events. */
  tests: TestFinishedEvent[];
  /** Count of passed tests from `run_finished` (or `test_finished` fallback). */
  passed: number;
  /** Count of failed tests from `run_finished` (or `test_finished` fallback). */
  failed: number;
  /** Count of ignored tests from `run_finished` (or `test_finished` fallback). */
  ignored: number;
  /** Stream error message when an `{"event":"error"}` line terminated the stream. */
  error?: string;
}

export type BrowserExampleCapability = 'analysis-only';
export type WasiExampleCapability = 'runnable' | 'unsupported';

export interface ExampleCapabilities {
  /** Browser capability — the browser lane exposes analysis only. */
  browser: BrowserExampleCapability;
  /** WASI capability: `runnable` executes under wasm32-wasi. */
  wasi: WasiExampleCapability;
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
  /** @deprecated The hosted share API stores source only. Keep a selected
   *  compiler version in the share URL, then pass it to run(). */
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
   *  on every `run()` and `test()` call. Can be overridden per-request via
   *  `compiler_version`. Omit this option or pass `null` to let the server
   *  choose its default version. */
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
    this.compilerVersion = resolved.compilerVersion ?? undefined;
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

  async test(request: TestRequest | string): Promise<TestResponse> {
    const body = normalizeTestRequest(request, this.compilerVersion);
    const events = await this.requestNdjson('POST /api/test', '/api/test', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return buildTestResponse(events);
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
    const response = await this.send(path, init);
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

  private async requestNdjson(label: string, path: string, init: PlaygroundRequestInit): Promise<TestEvent[]> {
    const response = await this.send(path, init);
    const raw = await response.text();
    if (!response.ok) {
      const errorBody = parseErrorBody(response, raw);
      throw new PlaygroundApiError(response, errorBody, buildErrorMessage(label, response.status, errorBody));
    }
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (raw.trim().length === 0 || (!contentType.includes('ndjson') && !contentType.includes('json'))) {
      throw new Error(`${label} returned an unexpected non-NDJSON success body.`);
    }
    return parseNdjsonEvents(raw);
  }

  private async send(path: string, init: PlaygroundRequestInit): Promise<PlaygroundResponseLike> {
    const headers = init.body === undefined
      ? mergeHeaders(this.defaultHeaders, init.headers)
      : mergeHeaders(this.defaultHeaders, init.headers, {
          'content-type': 'application/json',
        });
    return this.fetchImpl(this.url(path), {
      ...init,
      headers,
    });
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
): { source: string; compiler_version?: string; execution_mode?: ExecutionMode } {
  if (typeof request === 'string') {
    return clientVersion ? { source: request, compiler_version: clientVersion } : { source: request };
  }
  const body: { source: string; compiler_version?: string; execution_mode?: ExecutionMode } = {
    source: request.source,
  };
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

function normalizeTestRequest(
  request: TestRequest | string,
  clientVersion?: string,
): { source: string; compiler_version?: string; list_only?: boolean; test?: string } {
  if (typeof request === 'string') {
    return clientVersion ? { source: request, compiler_version: clientVersion } : { source: request };
  }
  const body: { source: string; compiler_version?: string; list_only?: boolean; test?: string } = {
    source: request.source,
  };
  if (request.compiler_version) {
    body.compiler_version = request.compiler_version;
  } else if (clientVersion) {
    body.compiler_version = clientVersion;
  }
  if (typeof request.list_only === 'boolean') {
    body.list_only = request.list_only;
  }
  if (request.test !== undefined) {
    body.test = request.test;
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

function parseErrorBody(response: PlaygroundResponseLike, raw: string): unknown {
  if (raw.length === 0) {
    return null;
  }
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  if (contentType.includes('ndjson')) {
    try {
      const events = parseNdjsonEvents(raw);
      if (events.length === 1) {
        return events[0];
      }
      if (events.length > 1) {
        return events;
      }
      return raw;
    } catch {
      return raw;
    }
  }
  if (!contentType.includes('json')) {
    return raw;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function parseNdjsonEvents(raw: string): TestEvent[] {
  const events: TestEvent[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch (error) {
      throw new Error(`Response returned invalid NDJSON: ${String(error)}`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Response returned an unexpected non-object NDJSON line.');
    }
    events.push(parsed as TestEvent);
  }
  if (events.length === 0) {
    throw new Error('Response returned an empty NDJSON stream.');
  }
  return events;
}

function buildTestResponse(events: TestEvent[]): TestResponse {
  const discovered: TestDiscoveredEvent[] = [];
  const tests: TestFinishedEvent[] = [];
  let runFinished: TestRunFinishedEvent | undefined;
  let errorEvent: TestErrorEvent | undefined;

  for (const event of events) {
    switch (event.event) {
      case 'test_discovered':
        discovered.push(event);
        break;
      case 'test_finished':
        tests.push(event);
        break;
      case 'run_finished':
        runFinished = event;
        break;
      case 'error':
        errorEvent = event;
        break;
      default:
        break;
    }
  }

  const passed = runFinished ? runFinished.passed : tests.filter((t) => t.outcome === 'passed').length;
  const failed = runFinished ? runFinished.failed : tests.filter((t) => t.outcome === 'failed').length;
  const ignored = runFinished ? runFinished.ignored : tests.filter((t) => t.outcome === 'ignored').length;

  return {
    success: errorEvent === undefined && failed === 0,
    events,
    discovered,
    tests,
    passed,
    failed,
    ignored,
    ...(errorEvent !== undefined ? { error: errorEvent.message } : {}),
  };
}

function buildErrorMessage(label: string, status: number, body: unknown): string {
  if (typeof body === 'string' && body.trim().length > 0) {
    return `${label} failed with ${status}: ${body}`;
  }
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if ('error' in record && typeof record.error === 'string') {
      return `${label} failed with ${status}: ${record.error}`;
    }
    if (record.event === 'error' && 'message' in record && typeof record.message === 'string') {
      return `${label} failed with ${status}: ${record.message}`;
    }
    if ('stderr' in record && typeof record.stderr === 'string') {
      const stderr = record.stderr.trim();
      if (stderr.length > 0) {
        return `${label} failed with ${status}: ${stderr}`;
      }
    }
    if ('compile_error' in record && typeof record.compile_error === 'string') {
      return `${label} failed with ${status}: ${record.compile_error}`;
    }
    if (status === 400 && 'id' in record && record.id === '') {
      return `${label} failed with ${status}: source exceeds the 64 KiB limit`;
    }
  }
  return `${label} failed with ${status}`;
}
