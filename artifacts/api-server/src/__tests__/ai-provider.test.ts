/**
 * Provider selection and fallback under bring-your-own-key.
 *
 * KoaPOS holds no platform AI key: a merchant connects their own Anthropic
 * account and their own key pays for their own usage. That makes three things
 * worth pinning down.
 *
 * The first is tenancy — a merchant must be served by *their* key and never by
 * another merchant's, and a merchant with nothing connected must get an error
 * rather than somebody else's billing account.
 *
 * The second is preference: Claude is tried first, and a merchant's OpenAI key
 * is only a fallback for their own Claude key.
 *
 * The third is that fallback never fires at a moment where switching provider
 * would corrupt the answer. A stream that has already written a delta is
 * committed — resuming it on the other provider would splice two different
 * completions together and the merchant would read the seam.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const anthropicCreate = vi.hoisted(() => vi.fn());
const anthropicStream = vi.hoisted(() => vi.fn());
const openAiCreate = vi.hoisted(() => vi.fn());
const anthropicWithKey = vi.hoisted(() => vi.fn());
const openaiWithKey = vi.hoisted(() => vi.fn());
const readCredentialVault = vi.hoisted(() => vi.fn());

vi.mock("@workspace/integrations-anthropic-ai-server", () => ({
  claudeModel: () => "claude-opus-5",
  anthropicWithKey,
}));

vi.mock("@workspace/integrations-openai-ai-server/factory", () => ({ openaiWithKey }));

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
    const apiKey = keys[provider as "anthropic" | "openai"];
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
  openaiWithKey.mockReturnValue({ chat: { completions: { create: openAiCreate } } });
  connected({ anthropic: "sk-ant-merchant", openai: "sk-oa-merchant" });
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("providersFor", () => {
  it("puts Claude first when the merchant has connected both accounts", async () => {
    const providers = await providersFor(MERCHANT);
    expect(providers.map((p) => p.provider)).toEqual(["claude", "openai"]);
  });

  it("serves a merchant with only OpenAI connected", async () => {
    connected({ openai: "sk-oa-merchant" });
    const providers = await providersFor(MERCHANT);
    expect(providers.map((p) => p.provider)).toEqual(["openai"]);
    expect(await isAiAvailable(MERCHANT)).toBe(true);
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
    expect(readCredentialVault).toHaveBeenCalledWith(MERCHANT, "openai");
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
  it("serves from Claude on the merchant's own key and never touches OpenAI", async () => {
    anthropicCreate.mockResolvedValue(textReply("from claude"));
    const result = await aiText(MERCHANT, REQ);
    expect(result).toEqual({ text: "from claude", provider: "claude" });
    expect(anthropicWithKey).toHaveBeenCalledWith("sk-ant-merchant", undefined);
    expect(openAiCreate).not.toHaveBeenCalled();
  });

  it("asks Claude for adaptive thinking rather than a token budget", async () => {
    anthropicCreate.mockResolvedValue(textReply("ok"));
    await aiText(MERCHANT, REQ);
    const params = anthropicCreate.mock.calls[0]![0];
    expect(params.thinking).toEqual({ type: "adaptive" });
    expect(params).not.toHaveProperty("budget_tokens");
    expect(params.model).toBe("claude-opus-5");
  });

  it("falls back to the merchant's own OpenAI key when Claude fails", async () => {
    anthropicCreate.mockRejectedValue(new Error("503"));
    openAiCreate.mockResolvedValue({ choices: [{ message: { content: "from openai" } }] });
    const onFallback = vi.fn();
    const result = await aiText(MERCHANT, REQ, onFallback);
    expect(result).toEqual({ text: "from openai", provider: "openai" });
    expect(openaiWithKey).toHaveBeenCalledWith("sk-oa-merchant", undefined);
    expect(onFallback).toHaveBeenCalledWith(expect.any(Error), "claude");
  });

  it("does not fall back to another merchant when this one has only Claude", async () => {
    connected({ anthropic: "sk-ant-merchant" });
    anthropicCreate.mockRejectedValue(new Error("claude down"));
    await expect(aiText(MERCHANT, REQ)).rejects.toThrow("claude down");
    expect(openAiCreate).not.toHaveBeenCalled();
  });

  it("treats a Claude refusal as a failure worth falling back from", async () => {
    anthropicCreate.mockResolvedValue({ stop_reason: "refusal", content: [] });
    openAiCreate.mockResolvedValue({ choices: [{ message: { content: "second opinion" } }] });
    expect((await aiText(MERCHANT, REQ)).provider).toBe("openai");
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

  it("falls back when Claude cannot open the stream", async () => {
    anthropicStream.mockImplementation(() => { throw new Error("rate limited"); });
    openAiCreate.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: "backup" } }] };
      },
    });
    const stream = await aiStream(MERCHANT, REQ);
    expect(stream.provider).toBe("openai");
    expect(await collect(stream.deltas)).toBe("backup");
  });

  // The SDK's `messages.stream()` returns synchronously and does not touch the
  // network until it is read, so a revoked key does NOT throw from the call
  // itself — it surfaces on the first read. That is the shape a real auth
  // failure takes, and it must still fall back: the route has not written SSE
  // headers yet, so switching provider here splices nothing.
  it("falls back when Claude's stream fails on the first read", async () => {
    anthropicStream.mockReturnValue({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error("401 invalid x-api-key")),
      }),
    });
    openAiCreate.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: "backup" } }] };
      },
    });
    const stream = await aiStream(MERCHANT, REQ);
    expect(stream.provider).toBe("openai");
    expect(await collect(stream.deltas)).toBe("backup");
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

  it("does NOT switch provider once the stream has started producing", async () => {
    anthropicStream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "half " } };
        throw new Error("connection dropped");
      },
    });
    const stream = await aiStream(MERCHANT, REQ);
    expect(stream.provider).toBe("claude");
    await expect(collect(stream.deltas)).rejects.toThrow("connection dropped");
    // Splicing a second provider's completion onto a partial answer would be
    // worse than the error the route already reports.
    expect(openAiCreate).not.toHaveBeenCalled();
  });
});
