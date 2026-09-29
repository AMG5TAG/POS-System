/**
 * Provider selection under bring-your-own-key.
 *
 * KK POS holds no platform AI key: a merchant connects their own Anthropic
 * account and their own key pays for their own usage. That makes three things
 * worth pinning down.
 *
 * The first is tenancy — a merchant must be served by *their* key and never by
 * another merchant's, and a merchant with nothing connected must get an error
 * rather than somebody else's billing account.
 *
 * The second is that Claude is the only provider. An OpenAI fallback was
 * removed; a leftover OpenAI key in the vault must not bring it back.
 *
 * The third is that a stream fails *before* the route commits to SSE headers
 * when it can: an open failure surfaces from `aiStream` itself, while a failure
 * after the first delta is the caller's to report.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const anthropicCreate = vi.hoisted(() => vi.fn());
const anthropicStream = vi.hoisted(() => vi.fn());
const anthropicWithKey = vi.hoisted(() => vi.fn());
const readCredentialVault = vi.hoisted(() => vi.fn());

vi.mock("@workspace/integrations-anthropic-ai-server", () => ({
  claudeModel: () => "claude-opus-5",
  anthropicWithKey,
}));

vi.mock("../services/tokenVault", () => ({ readCredentialVault }));

import {
  aiText,
  aiStream,
  providersFor,
  isAiAvailable,
  NoAiProviderError,
} from "../services/ai";

const MERCHANT = 42;
const REQ = { system: "s", messages: [{ role: "user" as const, content: "hi" }] };

/** Stand in for a merchant's connected accounts. */
function connected(keys: { anthropic?: string; openai?: string }) {
  readCredentialVault.mockImplementation(async (_merchantId: number, provider: string) => {
    const apiKey = keys[provider as keyof typeof keys];
    return apiKey ? { apiKey } : null;
  });
}

function textReply(text: string) {
  return { stop_reason: "end_turn", content: [{ type: "text", text }] };
}

async function collect(deltas: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const d of deltas) out += d;
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NODE_ENV = "test"; // never take the dev env fallback by accident
  delete process.env.ANTHROPIC_API_KEY;
  anthropicWithKey.mockReturnValue({
    messages: { create: anthropicCreate, stream: anthropicStream },
  });
  connected({ anthropic: "sk-ant-merchant" });
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("providersFor", () => {
  it("serves a merchant from their own Claude key", async () => {
    const providers = await providersFor(MERCHANT);
    expect(providers.map((p) => p.provider)).toEqual(["claude"]);
    expect(providers[0]!.apiKey).toBe("sk-ant-merchant");
  });

  it("ignores a leftover OpenAI key — that provider has been removed", async () => {
    connected({ openai: "sk-oa-merchant" });
    expect(await providersFor(MERCHANT)).toEqual([]);
    expect(await isAiAvailable(MERCHANT)).toBe(false);
  });

  it("returns nothing for a merchant who has connected no account", async () => {
    connected({});
    expect(await providersFor(MERCHANT)).toEqual([]);
    expect(await isAiAvailable(MERCHANT)).toBe(false);
  });

  it("ignores a stored entry with a blank key", async () => {
    readCredentialVault.mockResolvedValue({ apiKey: "   " });
    expect(await providersFor(MERCHANT)).toEqual([]);
  });

  it("reads the credential for the merchant it was asked about", async () => {
    await providersFor(MERCHANT);
    for (const call of readCredentialVault.mock.calls) {
      expect(call[0]).toBe(MERCHANT);
    }
    expect(readCredentialVault).toHaveBeenCalledWith(MERCHANT, "anthropic");
    expect(readCredentialVault).not.toHaveBeenCalledWith(MERCHANT, "openai");
  });
});

describe("the ANTHROPIC_API_KEY development fallback", () => {
  it("stands in for an unconnected merchant in development", async () => {
    process.env.NODE_ENV = "development";
    process.env.ANTHROPIC_API_KEY = "sk-ant-platform";
    connected({});
    const providers = await providersFor(MERCHANT);
    expect(providers).toHaveLength(1);
    expect(providers[0]!.isDevFallback).toBe(true);
  });

  it("is ignored in production, so no merchant is billed to the platform", async () => {
    process.env.NODE_ENV = "production";
    process.env.ANTHROPIC_API_KEY = "sk-ant-platform";
    connected({});
    expect(await providersFor(MERCHANT)).toEqual([]);
  });

  it("never displaces a key the merchant actually connected", async () => {
    process.env.NODE_ENV = "development";
    process.env.ANTHROPIC_API_KEY = "sk-ant-platform";
    connected({ anthropic: "sk-ant-merchant" });
    const providers = await providersFor(MERCHANT);
    expect(providers[0]!.apiKey).toBe("sk-ant-merchant");
    expect(providers[0]!.isDevFallback).toBe(false);
  });
});

describe("aiText", () => {
  it("serves from Claude on the merchant's own key", async () => {
    anthropicCreate.mockResolvedValue(textReply("from claude"));
    const result = await aiText(MERCHANT, REQ);
    expect(result).toEqual({ text: "from claude", provider: "claude" });
    expect(anthropicWithKey).toHaveBeenCalledWith("sk-ant-merchant", undefined);
  });

  it("asks Claude for adaptive thinking rather than a token budget", async () => {
    anthropicCreate.mockResolvedValue(textReply("ok"));
    await aiText(MERCHANT, REQ);
    const params = anthropicCreate.mock.calls[0]![0];
    expect(params.thinking).toEqual({ type: "adaptive" });
    expect(params).not.toHaveProperty("budget_tokens");
    expect(params.model).toBe("claude-opus-5");
  });

  it("surfaces a Claude failure instead of trying anyone else's key", async () => {
    anthropicCreate.mockRejectedValue(new Error("claude down"));
    const onFallback = vi.fn();
    await expect(aiText(MERCHANT, REQ, onFallback)).rejects.toThrow("claude down");
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("treats a Claude refusal as a failure", async () => {
    anthropicCreate.mockResolvedValue({ stop_reason: "refusal", content: [] });
    await expect(aiText(MERCHANT, REQ)).rejects.toThrow("Claude declined");
  });

  it("throws NoAiProviderError rather than guessing when nothing is connected", async () => {
    connected({});
    await expect(aiText(MERCHANT, REQ)).rejects.toBeInstanceOf(NoAiProviderError);
  });
});

describe("aiStream", () => {
  function claudeEvents(chunks: string[]) {
    return {
      async *[Symbol.asyncIterator]() {
        for (const text of chunks) {
          yield { type: "content_block_delta", delta: { type: "text_delta", text } };
        }
      },
    };
  }

  it("streams text deltas from Claude", async () => {
    anthropicStream.mockReturnValue(claudeEvents(["Hel", "lo"]));
    const stream = await aiStream(MERCHANT, REQ);
    expect(stream.provider).toBe("claude");
    expect(await collect(stream.deltas)).toBe("Hello");
  });

  it("never forwards thinking blocks to the client", async () => {
    anthropicStream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "hmm" } };
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "answer" } };
      },
    });
    const stream = await aiStream(MERCHANT, REQ);
    expect(await collect(stream.deltas)).toBe("answer");
  });

  it("rejects from aiStream itself when Claude cannot open the stream", async () => {
    anthropicStream.mockImplementation(() => { throw new Error("rate limited"); });
    await expect(aiStream(MERCHANT, REQ)).rejects.toThrow("rate limited");
  });

  // The SDK's `messages.stream()` returns synchronously and does not touch the
  // network until it is read, so a revoked key does NOT throw from the call
  // itself — it surfaces on the first read. aiStream primes that read, so the
  // route still sees the failure before it has written SSE headers.
  it("rejects from aiStream itself when the stream fails on the first read", async () => {
    anthropicStream.mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error("401 invalid x-api-key")),
      }),
    });
    await expect(aiStream(MERCHANT, REQ)).rejects.toThrow("401 invalid x-api-key");
  });

  it("opens on the first event rather than waiting for the first text delta", async () => {
    let read = 0;
    anthropicStream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        read++;
        yield { type: "message_start" };
        read++;
        yield { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "hmm" } };
        read++;
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } };
      },
    });
    const stream = await aiStream(MERCHANT, REQ);
    // The route holds SSE headers until this resolves. Under adaptive thinking
    // the first text delta can be seconds away, so priming must stop at the
    // first raw event — `message_start` already proves the stream opened.
    expect(read).toBe(1);
    expect(await collect(stream.deltas)).toBe("hi");
  });

  it("reports a failure after the stream has started producing to the caller", async () => {
    anthropicStream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "half " } };
        throw new Error("connection dropped");
      },
    });
    const stream = await aiStream(MERCHANT, REQ);
    expect(stream.provider).toBe("claude");
    await expect(collect(stream.deltas)).rejects.toThrow("connection dropped");
  });
});
