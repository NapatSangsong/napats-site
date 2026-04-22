/**
 * Fetch-based Google Gemini client for Cloudflare Workers edge runtime.
 * No Node.js dependencies — uses Web Fetch API and ReadableStream.
 */

import type { ChatMessage, ChatOptions } from "./client";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

interface GeminiEnv {
  GEMINI_API_KEY: string;
}

interface GeminiContent {
  role: "user" | "model";
  parts: { text: string }[];
}

/**
 * Stream a chat completion via Gemini. Returns a ReadableStream of text-delta strings.
 */
export async function streamGeminiChat(
  env: GeminiEnv,
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<ReadableStream<string>> {
  const model = options.model;
  const url = `${GEMINI_API_URL}/${model}:streamGenerateContent?alt=sse&key=${env.GEMINI_API_KEY}`;

  // Convert messages to Gemini format
  const contents: GeminiContent[] = [];
  for (const msg of messages) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 1,
    },
  };

  // System instruction (Gemini uses a separate field)
  if (options.system) {
    body.systemInstruction = {
      parts: [{ text: options.system }],
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  if (!res.body) {
    throw new Error("Gemini API returned no body");
  }

  return parseGeminiSSE(res.body);
}

/**
 * Non-streaming chat completion via Gemini. Returns full text.
 */
export async function completeGeminiChat(
  env: GeminiEnv,
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<string> {
  const model = options.model;
  const url = `${GEMINI_API_URL}/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const contents: GeminiContent[] = [];
  for (const msg of messages) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    });
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 1,
    },
  };

  if (options.system) {
    body.systemInstruction = {
      parts: [{ text: options.system }],
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const json = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

/**
 * Parse Gemini SSE stream into text deltas.
 */
function parseGeminiSSE(raw: ReadableStream<Uint8Array>): ReadableStream<string> {
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
            if (data === "[DONE]") continue;

            try {
              const json = JSON.parse(data) as {
                candidates?: {
                  content?: { parts?: { text?: string }[] };
                  finishReason?: string;
                }[];
              };

              const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                controller.enqueue(text);
              }

              if (json.candidates?.[0]?.finishReason === "STOP") {
                controller.close();
                reader.cancel();
                return;
              }
            } catch {
              // skip malformed JSON
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
