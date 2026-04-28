/**
 * Unified AI client — all requests go through OpenRouter.
 */

import type { ChatMessage, ChatOptions } from "./client";
import { streamOpenRouter, completeOpenRouter, type ModelRoute } from "./openrouter-client";

export interface AIEnv {
  OPENROUTER_API_KEY: string;
  RATE_LIMIT_KV?: KVNamespace;
}

/**
 * Stream a chat completion via OpenRouter.
 */
export async function streamUnified(
  env: AIEnv,
  messages: ChatMessage[],
  options: ChatOptions & { route?: ModelRoute },
): Promise<ReadableStream<string>> {
  const result = await streamOpenRouter(
    { OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, RATE_LIMIT_KV: env.RATE_LIMIT_KV },
    messages,
    { ...options, route: options.route },
  );
  return result.stream;
}

/**
 * Non-streaming chat completion via OpenRouter.
 */
export async function completeUnified(
  env: AIEnv,
  messages: ChatMessage[],
  options: ChatOptions & { route?: ModelRoute },
): Promise<string> {
  const result = await completeOpenRouter(
    { OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, RATE_LIMIT_KV: env.RATE_LIMIT_KV },
    messages,
    { ...options, route: options.route },
  );
  return result.text;
}
