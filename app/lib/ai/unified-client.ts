/**
 * Unified AI client — routes to OpenRouter (free), Gemini, or Claude
 * based on the provider selection from the router.
 */

import type { ChatMessage, ChatOptions } from "./client";
import { streamChat as streamAnthropic, completeChat as completeAnthropic } from "./client";
import { streamGeminiChat, completeGeminiChat } from "./gemini-client";
import { streamOpenRouter, completeOpenRouter, type ModelRoute } from "./openrouter-client";
import type { Provider } from "./router";

export interface AIEnv {
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  RATE_LIMIT_KV?: KVNamespace;
}

/**
 * Stream a chat completion using the appropriate provider.
 */
export async function streamUnified(
  env: AIEnv,
  messages: ChatMessage[],
  options: ChatOptions & { provider?: Provider; route?: ModelRoute },
): Promise<ReadableStream<string>> {
  const provider = options.provider ?? detectProvider(options.model);

  // OpenRouter (default — free tier)
  if (provider === "openrouter" && env.OPENROUTER_API_KEY) {
    const result = await streamOpenRouter(
      { OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, RATE_LIMIT_KV: env.RATE_LIMIT_KV },
      messages,
      { ...options, route: options.route },
    );
    return result.stream;
  }

  // Gemini
  if (provider === "gemini" && env.GEMINI_API_KEY) {
    return streamGeminiChat(
      { GEMINI_API_KEY: env.GEMINI_API_KEY },
      messages,
      options,
    );
  }

  // Claude (fallback)
  if (env.ANTHROPIC_API_KEY) {
    return streamAnthropic(
      { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
      messages,
      options,
    );
  }

  throw new Error("No API key available");
}

/**
 * Non-streaming chat completion using the appropriate provider.
 */
export async function completeUnified(
  env: AIEnv,
  messages: ChatMessage[],
  options: ChatOptions & { provider?: Provider; route?: ModelRoute },
): Promise<string> {
  const provider = options.provider ?? detectProvider(options.model);

  if (provider === "openrouter" && env.OPENROUTER_API_KEY) {
    const result = await completeOpenRouter(
      { OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, RATE_LIMIT_KV: env.RATE_LIMIT_KV },
      messages,
      { ...options, route: options.route },
    );
    return result.text;
  }

  if (provider === "gemini" && env.GEMINI_API_KEY) {
    return completeGeminiChat(
      { GEMINI_API_KEY: env.GEMINI_API_KEY },
      messages,
      options,
    );
  }

  if (env.ANTHROPIC_API_KEY) {
    return completeAnthropic(
      { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
      messages,
      options,
    );
  }

  throw new Error("No API key available");
}

function detectProvider(model: string): Provider {
  if (model.includes("/") && model.includes(":free")) return "openrouter";
  if (model.startsWith("gemini")) return "gemini";
  if (model.startsWith("claude")) return "anthropic";
  return "openrouter";
}
