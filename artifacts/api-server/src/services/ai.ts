/**
 * The one place KoaPOS decides which AI provider serves a request.
 *
 * KoaPOS is **bring-your-own-key**: a merchant connects their own Anthropic
 * account (and optionally their own OpenAI account) under Management ›
 * Integrations, the key is encrypted at rest in the OAuth token vault, and
 * their usage is billed to them. The platform holds no production key, so
 * every entry point here takes a `merchantId` — there is no such thing as an
 * AI request that is not on behalf of a merchant.
 *
 * **Claude is preferred.** A merchant with both keys connected is served by
 * Claude and falls back to their OpenAI key only if Claude fails.
 *
 * Four rules hold this together:
 *
 * 1. **Credentials are read per request, never cached across merchants.** The
 *    HTTP clients are pooled by key inside the integration libraries; the
 *    *mapping* from merchant to key is not, so disconnecting a key takes effect
 *    on the next request rather than whenever a cache happens to expire.
 *
 * 2. **Fallback happens before the first byte, never after.** A non-streaming
 *    call that fails on Claude is retried on OpenAI. A *stream* falls back only
 *    if it fails to open: once a delta has reached the client, switching
 *    provider mid-answer would splice two different completions together, so a
 *    mid-stream failure is surfaced to the caller instead.
 *
 * 3. **The model never decides what is safe.** `aiJson` returns `unknown` on
 *    purpose. Every caller validates with Zod before the value goes anywhere
 *    near the database — see `routes/ai-store.ts` for the pattern.
 *
 * 4. **`ANTHROPIC_API_KEY` is a development convenience only.** It stands in for
 *    a merchant's key when `NODE_ENV` is `development` or blank, so the feature
 *    can be exercised locally without connecting a real account. It is ignored
 *    outright in production, staging and test — the same rule the token vault's
 *    dev fallback follows, and for the same reason: a platform key silently
 *    serving production traffic is a bill nobody agreed to.
 */
import {
  anthropicWithKey,
  claudeModel,
} from "@workspace/integrations-anthropic-ai-server";
import { openaiWithKey } from "@workspace/integrations-openai-ai-server/factory";
import { readCredentialVault } from "./tokenVault";

export type AiProvider = "claude" | "openai";

/** How hard the model should work. Maps to Claude effort / OpenAI model choice. */
export type AiEffort = "low" | "medium" | "high";

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiRequest {
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
  /** Defaults to "high". Use "low" for latency-sensitive in-checkout calls. */
  effort?: AiEffort;
}

export class NoAiProviderError extends Error {
  constructor() {
    super(
      "This merchant has no AI account connected. Connect Claude under Management › Integrations.",
    );
    this.name = "NoAiProviderError";
  }
}

/* ─── Credentials ────────────────────────────────────────────────────────── */

/** Vault provider keys. These match the integration catalogue keys exactly. */
const ANTHROPIC_PROVIDER = "anthropic";
const OPENAI_PROVIDER = "openai";

interface StoredKey {
  apiKey?: unknown;
  baseUrl?: unknown;
}

export interface ResolvedProvider {
  provider: AiProvider;
  apiKey: string;
  baseURL?: string;
  /** True when this came from the dev env fallback rather than a merchant. */
  isDevFallback: boolean;
}

/** Only honoured outside production/staging/test — see rule 4 above. */
function devFallbackAllowed(): boolean {
  const env = process.env.NODE_ENV?.trim();
  return !env || env === "development";
}

async function readKey(
  merchantId: number,
  vaultProvider: string,
): Promise<{ apiKey: string; baseURL?: string } | null> {
  const stored = await readCredentialVault<StoredKey>(merchantId, vaultProvider);
  const apiKey = typeof stored?.apiKey === "string" ? stored.apiKey.trim() : "";
  if (!apiKey) return null;
  const baseURL = typeof stored?.baseUrl === "string" ? stored.baseUrl.trim() : "";
  return { apiKey, ...(baseURL ? { baseURL } : {}) };
}

/**
 * The providers that can serve this merchant, best first.
 *
 * Claude leads whenever the merchant has connected it. An unconnected merchant
 * gets an empty list rather than somebody else's key.
 */
export async function providersFor(merchantId: number): Promise<ResolvedProvider[]> {
  const [claude, openai] = await Promise.all([
    readKey(merchantId, ANTHROPIC_PROVIDER),
    readKey(merchantId, OPENAI_PROVIDER),
  ]);

  const resolved: ResolvedProvider[] = [];

  if (claude) {
    resolved.push({ provider: "claude", ...claude, isDevFallback: false });
  } else if (devFallbackAllowed() && process.env.ANTHROPIC_API_KEY?.trim()) {
    resolved.push({
      provider: "claude",
      apiKey: process.env.ANTHROPIC_API_KEY.trim(),
      ...(process.env.ANTHROPIC_BASE_URL?.trim()
        ? { baseURL: process.env.ANTHROPIC_BASE_URL.trim() }
        : {}),
      isDevFallback: true,
    });
  }

  if (openai) {
    resolved.push({ provider: "openai", ...openai, isDevFallback: false });
  }

  return resolved;
}

/** Whether this merchant can use AI features at all. */
export async function isAiAvailable(merchantId: number): Promise<boolean> {
  return (await providersFor(merchantId)).length > 0;
}

/* ─── Per-provider calls ─────────────────────────────────────────────────── */

/** OpenAI has no effort dial, so effort picks the model instead. */
function openAiModel(effort: AiEffort): string {
  return effort === "low" ? "gpt-5-mini" : "gpt-5.4";
}

function toOpenAiMessages(req: AiRequest) {
  return [
    { role: "system" as const, content: req.system },
    ...req.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
}

function claudeTextOf(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

/* ─── Provider selection ─────────────────────────────────────────────────── */

/**
 * Try each of the merchant's providers in preference order, Claude first.
 * `onFallback` fires when one failed and another will be tried, so the caller
 * can log the reason without this module owning a logger.
 */
async function withFallback<T>(
  merchantId: number,
  run: (p: ResolvedProvider) => Promise<T>,
  onFallback?: (err: unknown, provider: AiProvider) => void,
): Promise<{ value: T; provider: AiProvider }> {
  const providers = await providersFor(merchantId);
  if (providers.length === 0) throw new NoAiProviderError();

  for (let i = 0; i < providers.length; i++) {
    const p = providers[i]!;
    try {
      return { value: await run(p), provider: p.provider };
    } catch (err) {
      if (i === providers.length - 1) throw err;
      onFallback?.(err, p.provider);
    }
  }
  throw new NoAiProviderError();
}

/* ─── Text completion ────────────────────────────────────────────────────── */

export interface AiTextResult {
  text: string;
  provider: AiProvider;
}

async function claudeText(p: ResolvedProvider, req: AiRequest): Promise<string> {
  const res = await anthropicWithKey(p.apiKey, p.baseURL).messages.create({
    model: claudeModel(),
    max_tokens: req.maxTokens ?? 16000,
    system: req.system,
    thinking: { type: "adaptive" },
    output_config: { effort: req.effort ?? "high" },
    messages: req.messages,
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined the request.");
  return claudeTextOf(res.content);
}

async function openAiText(p: ResolvedProvider, req: AiRequest): Promise<string> {
  const completion = await openaiWithKey(p.apiKey, p.baseURL).chat.completions.create({
    model: openAiModel(req.effort ?? "high"),
    max_completion_tokens: req.maxTokens ?? 16000,
    messages: toOpenAiMessages(req),
  });
  return completion.choices[0]?.message?.content ?? "";
}

export async function aiText(
  merchantId: number,
  req: AiRequest,
  onFallback?: (err: unknown, provider: AiProvider) => void,
): Promise<AiTextResult> {
  const { value, provider } = await withFallback(
    merchantId,
    (p) => (p.provider === "claude" ? claudeText(p, req) : openAiText(p, req)),
    onFallback,
  );
  return { text: value, provider };
}

/* ─── Streaming ──────────────────────────────────────────────────────────── */

export interface AiStream {
  provider: AiProvider;
  /** Text deltas only — thinking blocks are never forwarded to the client. */
  deltas: AsyncIterable<string>;
}

async function claudeStream(p: ResolvedProvider, req: AiRequest): Promise<AsyncIterable<string>> {
  const stream = anthropicWithKey(p.apiKey, p.baseURL).messages.stream({
    model: claudeModel(),
    max_tokens: req.maxTokens ?? 32000,
    system: req.system,
    thinking: { type: "adaptive" },
    output_config: { effort: req.effort ?? "high" },
    messages: req.messages,
  });
  // `messages.stream()` returns synchronously and does not touch the network
  // until it is iterated, so returning the generator unstarted would defer an
  // open failure (revoked key, rate limit) to the caller's first `for await` —
  // by which point SSE headers are written and falling back is impossible.
  // Awaiting the first event here is what actually makes rule 2 hold.
  //
  // It has to be the first *raw* event, not the first text delta: `message_start`
  // arrives as soon as the response opens, whereas under adaptive thinking the
  // first text delta can be many seconds later, and blocking headers on that
  // would trade one bug for a proxy timeout.
  const events = stream[Symbol.asyncIterator]();
  const opened = await events.next();

  return (async function* () {
    for (let step = opened; !step.done; step = await events.next()) {
      const event = step.value;
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  })();
}

async function openAiStream(p: ResolvedProvider, req: AiRequest): Promise<AsyncIterable<string>> {
  const stream = await openaiWithKey(p.apiKey, p.baseURL).chat.completions.create({
    model: openAiModel(req.effort ?? "high"),
    max_completion_tokens: req.maxTokens ?? 32000,
    messages: toOpenAiMessages(req),
    stream: true,
  });
  return (async function* () {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  })();
}

/**
 * Open a streaming completion.
 *
 * Falls back only if Claude fails to *open* the stream. A failure after the
 * first delta has been written cannot be retried on another provider without
 * splicing two answers together, so it propagates to the caller.
 */
export async function aiStream(
  merchantId: number,
  req: AiRequest,
  onFallback?: (err: unknown, provider: AiProvider) => void,
): Promise<AiStream> {
  const { value, provider } = await withFallback(
    merchantId,
    (p) => (p.provider === "claude" ? claudeStream(p, req) : openAiStream(p, req)),
    onFallback,
  );
  return { provider, deltas: value };
}

/* ─── JSON completion ────────────────────────────────────────────────────── */

export interface AiJsonRequest extends AiRequest {
  /** JSON Schema the response must satisfy. Enforced by Claude, prompted on OpenAI. */
  schema: Record<string, unknown>;
}

export interface AiJsonResult {
  /** Unvalidated. Callers MUST parse this with Zod before trusting it. */
  data: unknown;
  provider: AiProvider;
}

async function claudeJson(p: ResolvedProvider, req: AiJsonRequest): Promise<unknown> {
  const res = await anthropicWithKey(p.apiKey, p.baseURL).messages.create({
    model: claudeModel(),
    max_tokens: req.maxTokens ?? 16000,
    system: req.system,
    thinking: { type: "adaptive" },
    output_config: {
      effort: req.effort ?? "high",
      format: { type: "json_schema", schema: req.schema },
    },
    messages: req.messages,
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined the request.");
  return JSON.parse(claudeTextOf(res.content));
}

async function openAiJson(p: ResolvedProvider, req: AiJsonRequest): Promise<unknown> {
  // OpenAI is the fallback path, so the schema is described rather than
  // enforced — the Zod validation every caller runs is what actually protects
  // the database, and it runs identically for both providers.
  const completion = await openaiWithKey(p.apiKey, p.baseURL).chat.completions.create({
    model: openAiModel(req.effort ?? "high"),
    max_completion_tokens: req.maxTokens ?? 16000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system" as const, content: req.system },
      {
        role: "system" as const,
        content: `Reply with a single JSON object matching this JSON Schema exactly:\n${JSON.stringify(req.schema)}`,
      },
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  return JSON.parse(completion.choices[0]?.message?.content ?? "null");
}

export async function aiJson(
  merchantId: number,
  req: AiJsonRequest,
  onFallback?: (err: unknown, provider: AiProvider) => void,
): Promise<AiJsonResult> {
  const { value, provider } = await withFallback(
    merchantId,
    (p) => (p.provider === "claude" ? claudeJson(p, req) : openAiJson(p, req)),
    onFallback,
  );
  return { data: value, provider };
}
