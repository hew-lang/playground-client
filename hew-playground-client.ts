export type ExecutionMode = 'native' | 'wasm';

export interface RunRequest {
  source: string;
  /** Request a specific compiler version (e.g. `"0.11.2"`). Overrides the
   *  client-wide `compilerVersion` and the `X-Hew-Version` header. Pass `null`
   *  to explicitly select the server default even when the client pins a version. */
  compiler_version?: string | null;
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
  /** Admitted server-side runs (HTTP 200) are always native. Absent when
   *  validation or control-plane admission rejected the request, and on older servers. */
  execution_mode?: 'native';
}

export interface TestRequest {
  source: string;
  /** Request a specific compiler version (e.g. `"0.11.2"`). Overrides the
   *  client-wide `compilerVersion` and the `X-Hew-Version` header. Pass `null`
   *  to explicitly select the server default even when the client pins a version. */
  compiler_version?: string | null;
  /** Emit `test_discovered` events without executing tests. */
  list_only?: boolean;
  /** Run only this single bare test identifier (e.g. from `entry.identity.split('::').pop()`
   *  on a discovery result; disallowed when `list_only` is true). */
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
  compiler_version?: string | null;
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

interface GlobalRuntime {
  fetch?: PlaygroundFetch;
  URL?: new (url: string, base?: string) => { toString(): string };
}

export class HewPlaygroundClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: PlaygroundFetch;
  private readonly defaultHeaders: Record<string, string> | undefined;
  private readonly compilerVersion: string | undefined;

  constructor(options: string | PlaygroundClientOptions) {
    const resolved = typeof options === 'string' ? { baseUrl: options } : options;
    this.baseUrl = resolved.baseUrl;
    this.fetchImpl = resolved.fetch ?? resolveFetch();
    this.defaultHeaders = resolved.headers !== undefined ? mergeHeaders(resolved.headers) : undefined;
    this.compilerVersion =
      resolved.compilerVersion !== undefined && resolved.compilerVersion !== null
        ? resolved.compilerVersion
        : undefined;
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
    return buildTestResponse(events, Boolean(body.list_only));
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
    if (!response.ok) {
      const errorBody = parseErrorBody(response, raw);
      throw new PlaygroundApiError(response, errorBody, buildErrorMessage(label, response.status, errorBody));
    }
    const body = parseBody(response, raw);
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
    const mediaType = contentType.split(';', 1)[0]?.trim() ?? '';
    const isNdjsonMediaType =
      mediaType === 'application/x-ndjson' ||
      mediaType === 'application/ndjson' ||
      mediaType.endsWith('+ndjson');
    if (!isNdjsonMediaType) {
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
    const RuntimeUrl = (globalThis as unknown as GlobalRuntime).URL;
    if (typeof RuntimeUrl !== 'function') {
      throw new Error('No global URL constructor is available in this runtime.');
    }
    return new RuntimeUrl(path, this.baseUrl).toString();
  }
}

export function createHewPlaygroundClient(options: string | PlaygroundClientOptions): HewPlaygroundClient {
  return new HewPlaygroundClient(options);
}

function resolveFetch(): PlaygroundFetch {
  const globalFetch = (globalThis as unknown as GlobalRuntime).fetch;
  if (typeof globalFetch !== 'function') {
    throw new Error(
      'No fetch implementation is available. Pass one in the client options when using an older runtime.',
    );
  }
  return (input, init) => globalFetch(input, init);
}

function normalizeSource(request: ShareRequest | string): { source: string; compiler_version?: string } {
  if (typeof request === 'string') {
    return { source: request };
  }
  const body: { source: string; compiler_version?: string } = { source: request.source };
  if (request.compiler_version !== undefined && request.compiler_version !== null) {
    body.compiler_version = request.compiler_version;
  }
  return body;
}

function normalizeRunRequest(
  request: RunRequest | string,
  clientVersion: string | undefined,
): { source: string; compiler_version?: string; execution_mode?: ExecutionMode } {
  if (typeof request === 'string') {
    return clientVersion !== undefined ? { source: request, compiler_version: clientVersion } : { source: request };
  }
  const body: { source: string; compiler_version?: string; execution_mode?: ExecutionMode } = {
    source: request.source,
  };
  if (request.compiler_version === null) {
    // Explicit per-request null selects the server default over any pinned client version.
  } else if (request.compiler_version !== undefined) {
    body.compiler_version = request.compiler_version;
  } else if (clientVersion !== undefined) {
    body.compiler_version = clientVersion;
  }
  if (request.execution_mode !== undefined) {
    body.execution_mode = request.execution_mode;
  }
  return body;
}

function normalizeTestRequest(
  request: TestRequest | string,
  clientVersion: string | undefined,
): { source: string; compiler_version?: string; list_only?: boolean; test?: string } {
  if (typeof request === 'string') {
    return clientVersion !== undefined ? { source: request, compiler_version: clientVersion } : { source: request };
  }
  const body: { source: string; compiler_version?: string; list_only?: boolean; test?: string } = {
    source: request.source,
  };
  if (request.compiler_version === null) {
    // Explicit per-request null selects the server default over any pinned client version.
  } else if (request.compiler_version !== undefined) {
    body.compiler_version = request.compiler_version;
  } else if (clientVersion !== undefined) {
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
    if (isIterableHeaders(headerSet)) {
      for (const pair of headerSet) {
        if (!Array.isArray(pair) || pair.length < 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') {
          throw new TypeError('Iterable header entries must be [name, value] string pairs.');
        }
        headers[pair[0].toLowerCase()] = pair[1];
      }
      continue;
    }
    if (isHeadersLike(headerSet)) {
      headerSet.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      continue;
    }
    for (const [key, value] of Object.entries(headerSet)) {
      headers[key.toLowerCase()] = value;
    }
  }
  return headers;
}

function isIterableHeaders(
  headerSet: PlaygroundHeadersInit | Record<string, string>,
): headerSet is Iterable<readonly [string, string]> {
  return typeof (headerSet as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function';
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
      return events;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isValidTestEvent(value: unknown): value is TestEvent {
  if (!isPlainObject(value) || typeof value.event !== 'string') {
    return false;
  }
  switch (value.event) {
    case 'test_discovered':
      return (
        typeof value.identity === 'string' &&
        typeof value.selector === 'string' &&
        typeof value.ignored === 'boolean' &&
        isNullableString(value.ignore_reason)
      );
    case 'run_started':
      return typeof value.tests === 'number' && Number.isFinite(value.tests);
    case 'file_compiled':
      return (
        typeof value.file === 'string' &&
        isStringArray(value.tests) &&
        typeof value.ok === 'boolean' &&
        isNullableString(value.diagnostics)
      );
    case 'test_started':
      return typeof value.identity === 'string' && typeof value.selector === 'string';
    case 'test_finished':
      return (
        typeof value.identity === 'string' &&
        typeof value.selector === 'string' &&
        (value.outcome === 'passed' || value.outcome === 'failed' || value.outcome === 'ignored') &&
        isNullableString(value.kind) &&
        isNullableString(value.message) &&
        isNullableString(value.reason) &&
        typeof value.duration_ms === 'number' &&
        Number.isFinite(value.duration_ms) &&
        typeof value.output === 'string' &&
        (value.report === null || isPlainObject(value.report))
      );
    case 'run_finished':
      return (
        typeof value.passed === 'number' &&
        Number.isFinite(value.passed) &&
        typeof value.failed === 'number' &&
        Number.isFinite(value.failed) &&
        typeof value.ignored === 'number' &&
        Number.isFinite(value.ignored)
      );
    case 'error':
      return typeof value.message === 'string';
    default:
      return false;
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
    if (!isValidTestEvent(parsed)) {
      throw new Error('Response returned an invalid or unrecognized test event in NDJSON stream.');
    }
    events.push(parsed);
  }
  if (events.length === 0) {
    throw new Error('Response returned an empty NDJSON stream.');
  }
  return events;
}

function buildTestResponse(events: TestEvent[], listOnly: boolean): TestResponse {
  const discovered: TestDiscoveredEvent[] = [];
  const tests: TestFinishedEvent[] = [];
  let runFinished: TestRunFinishedEvent | undefined;
  let errorEvent: TestErrorEvent | undefined;
  let hasCompileFailure = false;
  let hasExecutionEvents = false;

  for (const event of events) {
    switch (event.event) {
      case 'test_discovered':
        discovered.push(event);
        break;
      case 'run_started':
      case 'test_started':
        hasExecutionEvents = true;
        break;
      case 'file_compiled':
        hasExecutionEvents = true;
        if (!event.ok) {
          hasCompileFailure = true;
        }
        break;
      case 'test_finished':
        hasExecutionEvents = true;
        tests.push(event);
        break;
      case 'run_finished':
        hasExecutionEvents = true;
        runFinished = event;
        break;
      case 'error':
        errorEvent = event;
        break;
      default:
        break;
    }
  }

  if (errorEvent === undefined) {
    if (!listOnly && runFinished === undefined) {
      throw new Error('Response stream ended before receiving run_finished or error.');
    }
    if (listOnly && hasExecutionEvents && discovered.length === 0) {
      throw new Error('Response stream returned execution events without test discovery.');
    }
  }

  const passed = runFinished ? runFinished.passed : tests.filter((t) => t.outcome === 'passed').length;
  const failed = runFinished ? runFinished.failed : tests.filter((t) => t.outcome === 'failed').length;
  const ignored = runFinished ? runFinished.ignored : tests.filter((t) => t.outcome === 'ignored').length;

  return {
    success: errorEvent === undefined && failed === 0 && !hasCompileFailure,
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
  if (Array.isArray(body)) {
    for (let i = body.length - 1; i >= 0; i -= 1) {
      const entry = body[i];
      if (isPlainObject(entry) && entry.event === 'error' && typeof entry.message === 'string') {
        return `${label} failed with ${status}: ${entry.message}`;
      }
    }
  }
  if (isPlainObject(body)) {
    const record = body;
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
    if (record.id === '') {
      if (status === 400) {
        return `${label} failed with ${status}: source exceeds the 64 KiB limit`;
      }
      if (label === 'POST /api/share' && status === 429) {
        return `${label} failed with ${status}: rate limit exceeded`;
      }
      if (label === 'POST /api/share' && status === 503) {
        return `${label} failed with ${status}: share store unavailable`;
      }
    }
  }
  return `${label} failed with ${status}`;
}
