/**
 * Unified AI client — automatically routes to Gemini or Claude
 * based on the model/provider selection from the router.
 */

import type { ChatMessage, ChatOptions } from "./client";
import { streamChat as streamAnthropic, completeChat as completeAnthropic } from "./client";
import { streamGeminiChat, completeGeminiChat } from "./gemini-client";
import type { Provider } from "./router";

export interface AIEnv {
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

/**
 * Stream a chat completion using the appropriate provider.
 */
export async function streamUnified(
  env: AIEnv,
  messages: ChatMessage[],
  options: ChatOptions & { provider?: Provider },
): Promise<ReadableStream<string>> {
  const provider = options.provider ?? detectProvider(options.model);

  if (provider === "gemini" && env.GEMINI_API_KEY) {
    return streamGeminiChat(
      { GEMINI_API_KEY: env.GEMINI_API_KEY },
      messages,
      options,
    );
  }

  // Fallback to Claude
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("No API key available (neither Gemini nor Anthropic)");
  }
  return streamAnthropic(
    { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
    messages,
    options,
  );
}

/**
 * Non-streaming chat completion using the appropriate provider.
 */
export async function completeUnified(
  env: AIEnv,
  messages: ChatMessage[],
  options: ChatOptions & { provider?: Provider },
): Promise<string> {
  const provider = options.provider ?? detectProvider(options.model);

  if (provider === "gemini" && env.GEMINI_API_KEY) {
    return completeGeminiChat(
      { GEMINI_API_KEY: env.GEMINI_API_KEY },
      messages,
      options,
    );
  }

  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("No API key available");
  }
  return completeAnthropic(
    { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
    messages,
    options,
  );
}

/** Detect provider from model name */
function detectProvider(model: string): Provider {
  if (model.startsWith("gemini")) return "gemini";
  if (model.startsWith("claude")) return "anthropic";
  return "gemini"; // default to gemini
}
