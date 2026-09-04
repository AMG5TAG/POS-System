import OpenAI from "openai";

/**
 * OpenAI clients, one per API key.
 *
 * Separate from `./client`, which builds a single platform client from env vars
 * and throws at module scope when they are absent. KoaPOS is bring-your-own-key:
 * merchants supply their own OpenAI key as a fallback for their own Claude key,
 * so clients are per-credential and importing this module must never throw.
 *
 * Bounded cache, least-recently-used eviction — see the Anthropic sibling for
 * why an unbounded map keyed by merchant credential is the wrong shape.
 */

const MAX_CACHED_CLIENTS = 50;

const clients = new Map<string, OpenAI>();

function cacheKey(apiKey: string, baseURL?: string): string {
  return `${apiKey} ${baseURL ?? ""}`;
}

export function openaiWithKey(apiKey: string, baseURL?: string): OpenAI {
  const key = cacheKey(apiKey, baseURL);
  const existing = clients.get(key);
  if (existing) {
    clients.delete(key);
    clients.set(key, existing);
    return existing;
  }

  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  clients.set(key, client);

  if (clients.size > MAX_CACHED_CLIENTS) {
    const oldest = clients.keys().next();
    if (!oldest.done) clients.delete(oldest.value);
  }
  return client;
}

export function forgetOpenAiClient(apiKey: string, baseURL?: string): void {
  clients.delete(cacheKey(apiKey, baseURL));
}
