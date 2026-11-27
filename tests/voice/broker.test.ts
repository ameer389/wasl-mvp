/// <reference types="node" />
import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error This native Node module is outside the browser TypeScript project.
import { brokerConfig, createVoiceBroker } from '../../scripts/humain-broker.mjs';

const origin = 'http://127.0.0.1:5173';
const canary = 'fixture-key-that-must-stay-server-side';
const token = 'mock.header.signature';
const sessionId = `as_${'0'.repeat(26)}`;
const issued = {
  participant_token: token, server_url: 'wss://fixture.invalid',
  session_id: sessionId, expires_at: '2027-01-01T00:01:00Z',
  effective: { privateFixture: canary },
};
const valid = () => Response.json(issued, { status: 201 });
const liveServers: Server[] = [];

async function start(provider = vi.fn(async (_url: string, _init: RequestInit) => valid()), env = { HUMAIN_API_KEY: canary, HUMAIN_SESSION_BUDGET: '3' }) {
  const server: Server = createVoiceBroker(brokerConfig(env), { fetchProvider: provider, now: () => Date.parse('2027-01-01') });
  liveServers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No broker address');
  const url = `http://127.0.0.1:${address.port}`;
  const post = (body = '{}', caller = origin) => fetch(`${url}/api/voice/session`, {
    method: 'POST', headers: { origin: caller, 'Content-Type': 'application/json' }, body,
  });
  return { post, url, provider };
}

afterEach(async () => {
  await Promise.all(liveServers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))));
});

describe('local HUMAIN broker', () => {
  it('rejects remote origins, unsupported API URLs, aliases and invalid local limits', () => {
    for (const config of [{ HUMAIN_APP_ORIGIN: 'https://example.org' }, { HUMAIN_API_URL: 'https://other.example' },
      { HUMAIN_VOICE_ID: 'mul_nourah' }, { HUMAIN_SESSION_SECONDS: '60' }, { HUMAIN_SESSION_BUDGET: '0' }]) {
      expect(() => brokerConfig(config)).toThrow();
    }
    expect(brokerConfig({}).seconds).toBe(50);
    expect(brokerConfig({}).budget).toBe(1);
  });

  it('rejects missing credentials, foreign preflights, unexpected routes, methods and payloads without fetching upstream', async () => {
    const { post, url, provider } = await start(undefined, { HUMAIN_API_KEY: '', HUMAIN_SESSION_BUDGET: '1' });
    expect((await post('{}', 'https://example.org')).status).toBe(403);
    const foreign = await fetch(`${url}/api/voice/session`, {
      method: 'OPTIONS', headers: { origin: 'https://example.org', 'Access-Control-Request-Method': 'POST' },
    });
    expect(foreign.status).toBe(403);
    expect(foreign.headers.has('access-control-allow-origin')).toBe(false);
    expect((await fetch(`${url}/api/voice/session`, { headers: { origin } })).status).toBe(405);
    expect((await fetch(`${url}/api/voice/other`, { headers: { origin } })).status).toBe(404);
    expect((await post('{"patientId":"x"}')).status).toBe(400);
    expect((await post(`{${' '.repeat(40)}}`)).status).toBe(400);
    expect((await fetch(`${url}/api/voice/session`, {
      method: 'OPTIONS', headers: { origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    })).status).toBe(204);
    expect(await (await post()).json()).toEqual({ error: 'missing_key' });
    expect(provider).not.toHaveBeenCalled();
  });

  it('builds a server-controlled request and returns only temporary credentials and limits', async () => {
    const { post, provider } = await start();
    const response = await post();
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.text();
    expect(body).not.toContain(canary);
    expect(JSON.parse(body)).toEqual({
      participant_token: token, server_url: issued.server_url, expires_at: issued.expires_at, duration_seconds: 50,
    });
    const [url, init] = provider.mock.calls[0]!;
    expect(url).toBe('https://api.voice.humain.com/agent/sessions');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: { 'x-api-key': canary } });
    const { participant, agent } = JSON.parse(String(init.body));
    expect(participant.identity).toMatch(/^wasl-demo-/);
    expect(agent).toMatchObject({ web_search: false, prompt: expect.any(String) });
    expect(agent.voice_id).toBeUndefined();
    expect(agent.client_tools.map((tool: { name: string }) => tool.name)).toEqual(['get_demo_context', 'get_demo_question']);
    for (const tool of agent.client_tools) {
      expect(tool.parameters).toMatchObject({
        required: ['scope'], additionalProperties: false,
        properties: { scope: { enum: ['current_demo'] } },
      });
    }
  });

  it('selects the fixed hybrid profile without forwarding client-controlled context', async () => {
    const { post, provider } = await start();
    expect((await post('{"workflow":"other"}')).status).toBe(400);
    expect((await post('{"workflow":"checkin","task":1}')).status).toBe(400);
    expect((await post('{"workflow":"checkin"}')).status).toBe(201);
    expect(provider).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(provider.mock.calls[0]![1].body));
    expect(sent.agent.web_search).toBe(false);
    expect(sent.agent.client_tools.map((tool: { name: string }) => tool.name)).toEqual([
      'get_current_question', 'propose_patient_answer', 'get_answer_status',
    ]);
    expect(sent.agent.prompt).toContain('recorded');
    expect(sent).not.toHaveProperty('workflow');
  });

  it.each([
    [401, 'AUTH_UNAUTHORIZED', 'invalid_key'], [403, 'AUTH_SCOPE_MISSING', 'agent_scope'],
    [403, 'AUTH_FORBIDDEN', 'agent_forbidden'], [402, 'CREDITS_EXHAUSTED', 'credits'],
    [429, 'CONCURRENCY_LIMIT_EXCEEDED', 'provider_busy'], [429, 'RATE_LIMIT_EXCEEDED', 'rate_limit'],
  ])('sanitizes provider %s %s', async (status, code, expected) => {
    const provider = vi.fn(async () => Response.json({ code, error: canary }, { status }));
    const { post } = await start(provider);
    expect(await (await post()).json()).toEqual({ error: expected });
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it.each([
    { expires_at: '2026-12-31T23:59:59Z' }, { server_url: 'http://fixture.invalid' },
    { participant_token: `mock.${canary}.signature` }, { session_id: '../../other' },
  ])('rejects a malformed or expired upstream response', async (fields) => {
    const { post } = await start(vi.fn(async () => Response.json({ ...issued, ...fields }, { status: 201 })));
    expect(await (await post()).json()).toEqual({ error: 'invalid_response' });
  });

  it('serializes requests and releases a valid lease only after the provider reports ended', async () => {
    let release!: () => void;
    let entered!: () => void;
    const beforeRelease = new Promise<void>((resolve) => { release = resolve; });
    const providerEntered = new Promise<void>((resolve) => { entered = resolve; });
    let previousStatus = 'live';
    const provider = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'GET') return Response.json({ status: previousStatus });
      entered();
      await beforeRelease;
      return valid();
    });
    const { post } = await start(provider);
    const pending = post();
    await providerEntered;
    expect(await (await post()).json()).toEqual({ error: 'local_busy' });
    release();
    expect((await pending).status).toBe(201);
    expect(await (await post()).json()).toEqual({ error: 'local_busy' });
    previousStatus = 'ended';
    expect((await post()).status).toBe(201);
    expect(provider.mock.calls.map((call) => call[1].method)).toEqual(['POST', 'GET', 'GET', 'POST']);
  });

  it('caps attempts and does not retry network failures', async () => {
    const provider = vi.fn(async () => { throw new Error(canary); });
    const { post } = await start(provider);
    expect(await (await post()).json()).toEqual({ error: 'provider_unavailable' });
    expect(await (await post()).json()).toEqual({ error: 'local_busy' });
    expect(provider).toHaveBeenCalledTimes(1);
    const limited = await start(undefined, { HUMAIN_API_KEY: canary, HUMAIN_SESSION_BUDGET: '1' });
    expect((await limited.post()).status).toBe(201);
    expect(await (await limited.post()).json()).toEqual({ error: 'local_budget' });
  });
});
