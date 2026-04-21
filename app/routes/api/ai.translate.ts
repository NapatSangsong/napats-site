/**
 * POST /learning/api/ai/translate
 * Translate lesson blocks to a target language.
 * Returns translated blocks as JSON (non-streaming for speed).
 */
import type { Route } from "./+types/ai.translate";
import { completeChat } from "~/lib/ai/client";
import { selectModel } from "~/lib/ai/router";
import { requireAuth } from "~/lib/ai/helpers.server";
import { z } from "zod";

const TranslateBody = z.object({
	blocks: z.array(z.record(z.unknown())),
	targetLang: z.enum(["en", "th"]),
	sourceLang: z.string().optional(),
});

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	if (request.method !== "POST") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	let body: ReturnType<typeof TranslateBody.safeParse>;
	try {
		body = TranslateBody.safeParse(await request.json());
	} catch {
		return Response.json({ message: "invalid json" }, { status: 400 });
	}
	if (!body.success) {
		return Response.json({ message: "invalid request" }, { status: 400 });
	}

	const { blocks, targetLang } = body.data;
	const langName = targetLang === "th" ? "Thai" : "English";

	const system = `You are a precise translator. Translate the following JSON array of lesson content blocks to ${langName}.

Rules:
- Translate ALL text fields: "text", "markdown", "caption", "attribution", "title"
- Do NOT translate: "type", "kind", "language", "code" (in code blocks), "src", "expression" (in katex blocks), "code" (in mermaid blocks)
- Preserve the exact same JSON structure — same keys, same array order
- Maintain any HTML tags like <hyper> in the text
- Return ONLY the translated JSON array, no other text`;

	const model = selectModel("summarise"); // Haiku for speed
	const response = await completeChat(
		{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
		[{ role: "user", content: JSON.stringify(blocks) }],
		{ model, system, maxTokens: 16384 },
	);

	try {
		const jsonMatch = response.match(/\[[\s\S]*\]/);
		const translated = JSON.parse(jsonMatch ? jsonMatch[0] : response);
		return Response.json({ blocks: translated });
	} catch {
		return Response.json({ message: "failed to parse translation" }, { status: 500 });
	}
}
