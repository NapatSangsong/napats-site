/**
 * Fetch-based Anthropic client for Cloudflare Workers edge runtime.
 * No Node.js dependencies — uses Web Fetch API and ReadableStream.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

interface AnthropicRequestBody {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  stream?: boolean;
  system?: string;
  temperature?: number;
}

interface AnthropicEnv {
  ANTHROPIC_API_KEY: string;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  };
}

function buildBody(
  messages: ChatMessage[],
  options: ChatOptions,
  stream: boolean,
): AnthropicRequestBody {
  const body: AnthropicRequestBody = {
    model: options.model,
    messages,
    max_tokens: options.maxTokens ?? 4096,
    stream,
  };
  if (options.system) body.system = options.system;
  if (options.temperature !== undefined) body.temperature = options.temperature;
  return body;
}

// ---------------------------------------------------------------------------
// SSE line parser — extracts text deltas from the Anthropic streaming format
// ---------------------------------------------------------------------------

interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Transform a raw byte stream from the Anthropic SSE endpoint into a
 * ReadableStream of text-delta strings.
 */
function parseSSEStream(raw: ReadableStream<Uint8Array>): ReadableStream<string> {
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<string>({
    async start(controller) {
      const reader = raw.getReader();

      function parseLine(line: string): SSEEvent | null {
        if (line.startsWith("event: ")) {
          return { event: line.slice(7).trim(), data: "" };
        }
        if (line.startsWith("data: ")) {
          return { event: "", data: line.slice(6) };
        }
        return null;
      }

      let currentEvent = "";

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last partial line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === "") continue;

            const parsed = parseLine(trimmed);
            if (!parsed) continue;

            if (parsed.event) {
              currentEvent = parsed.event;
              continue;
            }

            // parsed.data is set
            if (currentEvent === "content_block_delta") {
              try {
                const json = JSON.parse(parsed.data) as {
                  type: string;
                  delta?: { type: string; text?: string };
                };
                if (json.delta?.type === "text_delta" && json.delta.text) {
                  controller.enqueue(json.delta.text);
                }
              } catch {
                // skip malformed JSON
              }
            }

            if (currentEvent === "message_stop") {
              controller.close();
              reader.cancel();
              return;
            }

            if (currentEvent === "error") {
              try {
                const json = JSON.parse(parsed.data) as { error?: { message?: string } };
                controller.error(
                  new Error(json.error?.message ?? "Anthropic streaming error"),
                );
              } catch {
                controller.error(new Error("Anthropic streaming error"));
              }
              reader.cancel();
              return;
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Stream a chat completion. Returns a ReadableStream of text-delta strings.
 */
export async function streamChat(
  env: AnthropicEnv,
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<ReadableStream<string>> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: buildHeaders(env.ANTHROPIC_API_KEY),
    body: JSON.stringify(buildBody(messages, options, true)),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  if (!res.body) {
    throw new Error("Anthropic API returned no body");
  }

  return parseSSEStream(res.body);
}

/**
 * Non-streaming chat completion. Returns the full text response.
 */
export async function completeChat(
  env: AnthropicEnv,
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<string> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: buildHeaders(env.ANTHROPIC_API_KEY),
    body: JSON.stringify(buildBody(messages, options, false)),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as {
    content: { type: string; text?: string }[];
  };

  const textBlocks = json.content.filter((b) => b.type === "text");
  return textBlocks.map((b) => b.text ?? "").join("");
}
