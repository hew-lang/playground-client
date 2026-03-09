import { HewPlaygroundClient, type PlaygroundFetch } from './dist/hew-playground-client.js';

const fetchImpl: PlaygroundFetch = async (url, init) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: {
    get(name: string) {
      return name.toLowerCase() === 'content-type' ? 'application/json' : null;
    },
  },
  async text() {
    return JSON.stringify({
      id: `${url}${init?.headers?.['content-type'] ?? ''}`,
    });
  },
});

const client = new HewPlaygroundClient({
  baseUrl: 'https://playground.example',
  headers: { 'x-sdk': 'consumer-check' },
  fetch: fetchImpl,
});

await client.createShare('fn main() { println(1); }');
