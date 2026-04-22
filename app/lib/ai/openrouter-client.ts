/**
 * OpenRouter AI client for Cloudflare Workers edge runtime.
 * Supports free-tier models with automatic rate-limit rotation.
 * OpenAI-compatible API format with SSE streaming.
 */

import type { ChatMessage, ChatOptions } from "./client";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterEnv {
  OPENROUTER_API_KEY: string;
  RATE_LIMIT_KV?: KVNamespace;
}

// ── Cooldown tracking via KV ────────────────────────────────

const COOLDOWN_PREFIX = "ai:cooldown:";
const DEFAULT_COOLDOWN_S = 60;

interface CooldownEntry {
  until: number;
  reason: string;
  failures: number;
}

async function getCooldown(kv: KVNamespace | undefined, modelId: string): Promise<CooldownEntry | null> {
  if (!kv) return null;
  const val = await kv.get(COOLDOWN_PREFIX + modelId);
  if (!val) return null;
  const entry = JSON.parse(val) as CooldownEntry;
  if (Date.now() > entry.until) {
    await kv.delete(COOLDOWN_PREFIX + modelId);
    return null;
  }
  return entry;
}

async function setCooldown(kv: KVNamespace | undefined, modelId: string, retryAfterS: number, reason: string): Promise<void> {
  if (!kv) return;
  const existing = await getCooldown(kv, modelId);
  const failures = (existing?.failures ?? 0) + 1;
  // Escalate: 3+ consecutive failures → 5 min cooldown
  const cooldownS = failures >= 3 ? 300 : Math.max(10, Math.min(600, retryAfterS || DEFAULT_COOLDOWN_S));
  const entry: CooldownEntry = {
    until: Date.now() + cooldownS * 1000,
    reason,
    failures,
  };
  await kv.put(COOLDOWN_PREFIX + modelId, JSON.stringify(entry), { expirationTtl: cooldownS + 10 });
}

async function clearCooldown(kv: KVNamespace | undefined, modelId: string): Promise<void> {
  if (!kv) return;
  await kv.delete(COOLDOWN_PREFIX + modelId);
}

// ── Model roster ────────────────────────────────────────────

export const FREE_MODELS = {
  GEMMA_26B: "google/gemma-4-26b-a4b-it:free",
  GEMMA_31B: "google/gemma-4-31b-it:free",
  MINIMAX: "minimax/minimax-m2.5:free",
  NEMOTRON: "nvidia/nemotron-3-super-120b-a12b:free",
  INCLUSION: "inclusionai/ling-2.6-flash:free",
} as const;

export type FreeModelKey = keyof typeof FREE_MODELS;

/** Task → ordered list of models to try */
export interface ModelRoute {
  primary: string;
  fallbacks: string[];
}

// ── Streaming ───────────────────────────────────────────────

/**
 * Stream a chat completion via OpenRouter with automatic model rotation.
 * If primary model returns 429, tries fallbacks in order.
 */
export async function streamOpenRouter(
  env: OpenRouterEnv,
  messages: ChatMessage[],
  options: ChatOptions & { route?: ModelRoute },
): Promise<{ stream: ReadableStream<string>; model: string }> {
  const modelsToTry = options.route
    ? [options.route.primary, ...options.route.fallbacks]
    : [options.model];

  for (const modelId of modelsToTry) {
    // Skip models in cooldown
    const cooldown = await getCooldown(env.RATE_LIMIT_KV, modelId);
    if (cooldown) continue;

    try {
      const stream = await callOpenRouter(env, messages, { ...options, model: modelId }, true);
      // Success — clear any previous cooldown
      await clearCooldown(env.RATE_LIMIT_KV, modelId);
      return { stream: stream as ReadableStream<string>, model: modelId };
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("429") || msg.includes("rate")) {
        // Extract retry-after if available
        const retryMatch = msg.match(/retry.after.*?(\d+)/i);
        const retryAfterS = retryMatch ? parseInt(retryMatch[1]) : DEFAULT_COOLDOWN_S;
        await setCooldown(env.RATE_LIMIT_KV, modelId, retryAfterS, "rate_limited");
        continue; // try next model
      }
      // Non-rate-limit error — still try next model
      await setCooldown(env.RATE_LIMIT_KV, modelId, 30, "error");
      continue;
    }
  }

  throw new Error("All models are cooling down — try again in a minute");
}

/**
 * Non-streaming completion via OpenRouter with rotation.
 */
export async function completeOpenRouter(
  env: OpenRouterEnv,
  messages: ChatMessage[],
  options: ChatOptions & { route?: ModelRoute },
): Promise<{ text: string; model: string }> {
  const modelsToTry = options.route
    ? [options.route.primary, ...options.route.fallbacks]
    : [options.model];

  for (const modelId of modelsToTry) {
    const cooldown = await getCooldown(env.RATE_LIMIT_KV, modelId);
    if (cooldown) continue;

    try {
      const text = await callOpenRouter(env, messages, { ...options, model: modelId }, false) as string;
      await clearCooldown(env.RATE_LIMIT_KV, modelId);
      return { text, model: modelId };
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes("429") || msg.includes("rate")) {
        await setCooldown(env.RATE_LIMIT_KV, modelId, DEFAULT_COOLDOWN_S, "rate_limited");
        continue;
      }
      await setCooldown(env.RATE_LIMIT_KV, modelId, 30, "error");
      continue;
    }
  }

  throw new Error("All models are cooling down — try again in a minute");
}

// ── Core API call ───────────────────────────────────────────

async function callOpenRouter(
  env: OpenRouterEnv,
  messages: ChatMessage[],
  options: ChatOptions,
  stream: boolean,
): Promise<ReadableStream<string> | string> {
  // Build OpenAI-compatible messages
  const apiMessages: { role: string; content: string }[] = [];
  if (options.system) {
    apiMessages.push({ role: "system", content: options.system });
  }
  for (const msg of messages) {
    apiMessages.push({ role: msg.role, content: msg.content });
  }

  const body: Record<string, unknown> = {
    model: options.model,
    messages: apiMessages,
    max_tokens: options.maxTokens ?? 4096,
    stream,
  };
  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://napats.dev",
      "X-Title": "napats.dev Learning",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text}`);
  }

  if (stream) {
    if (!res.body) throw new Error("OpenRouter returned no body");
    return parseOpenRouterSSE(res.body);
  }

  // Non-streaming
  const json = await res.json() as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  return stripReasoning(content);
}

// ── SSE parser ──────────────────────────────────────────────

function parseOpenRouterSSE(raw: ReadableStream<Uint8Array>): ReadableStream<string> {
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<string>({
    async start(controller) {
      const reader = raw.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") {
              controller.close();
              reader.cancel();
              return;
            }

            try {
              const json = JSON.parse(data) as {
                choices?: { delta?: { content?: string; reasoning_content?: string } }[];
              };
              const text = json.choices?.[0]?.delta?.content;
              if (text) {
                controller.enqueue(stripReasoning(text));
              }
              // Skip reasoning_content — don't show to user
            } catch {
              // skip malformed
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

// ── Reasoning stripper ──────────────────────────────────────

function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || text;
}
