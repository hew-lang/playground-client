import {
  HewPlaygroundClient,
  type BrowserExampleCapability,
  type ExecutionMode,
  type PlaygroundFetch,
  type TestDiscoveredEvent,
  type TestEvent,
  type TestFinishedEvent,
  type TestRequest,
  type TestResponse,
  type WasiExampleCapability,
} from './dist/hew-playground-client.js';

const fetchImpl: PlaygroundFetch = async (url, init) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: {
    get(name: string) {
      if (name.toLowerCase() !== 'content-type') {
        return null;
      }
      return url.endsWith('/api/test') ? 'application/x-ndjson' : 'application/json';
    },
  },
  async text() {
    if (url.endsWith('/api/test')) {
      return `${JSON.stringify({ event: 'run_finished', passed: 1, failed: 0, ignored: 0 })}\n`;
    }
    return JSON.stringify({
      id: `${url}${init?.headers?.['content-type'] ?? ''}`,
    });
  },
});

const client = new HewPlaygroundClient({
  baseUrl: 'https://playground.example',
  headers: { 'x-sdk': 'consumer-check' },
  compilerVersion: null,
  fetch: fetchImpl,
});

const mode: ExecutionMode = 'native';
const runResult = await client.run({ source: 'fn main() {}', execution_mode: mode });
const executedMode: 'native' | undefined = runResult.execution_mode;

await client.createShare({ source: 'fn main() { println(1); }', compiler_version: '0.11.1' });

const [example] = await client.listExamples();
const browserCapability: BrowserExampleCapability = example.capabilities.browser;
const wasiCapability: WasiExampleCapability = example.capabilities.wasi;

const testRequest: TestRequest = {
  source: '#[test] fn ok() {}',
  compiler_version: '0.11.1',
  list_only: false,
  test: 'ok',
};
const testResponse: TestResponse = await client.test(testRequest);
const events: TestEvent[] = testResponse.events;
const discovered: TestDiscoveredEvent[] = testResponse.discovered;
const finished: TestFinishedEvent[] = testResponse.tests;

void executedMode;
void browserCapability;
void wasiCapability;
void events;
void discovered;
void finished;
