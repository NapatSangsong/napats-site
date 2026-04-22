/**
 * POST /learning/api/ai/translate
 * Translate lesson blocks to a target language.
 * Returns translated blocks as JSON (non-streaming for speed).
 */
import type { Route } from "./+types/ai.translate";
import { completeUnified } from "~/lib/ai/unified-client";
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

	let rawBody: any;
	try {
		rawBody = await request.json();
	} catch {
		return Response.json({ message: "invalid json" }, { status: 400 });
	}

	const blocks = rawBody.blocks;
	const targetLang = rawBody.targetLang;

	if (!Array.isArray(blocks) || blocks.length === 0) {
		return Response.json({ message: "no blocks to translate" }, { status: 400 });
	}
	if (targetLang !== "en" && targetLang !== "th") {
		return Response.json({ message: "invalid target language" }, { status: 400 });
	}
	const langName = targetLang === "th" ? "Thai" : "English";

	const system = `You are a precise translator. Translate the following JSON array of lesson content blocks to ${langName}.

Rules:
- Translate ALL text fields: "text", "markdown", "caption", "attribution", "title"
- Do NOT translate: "type", "kind", "language", "code" (in code blocks), "src", "expression" (in katex blocks), "code" (in mermaid blocks)
- Preserve the exact same JSON structure — same keys, same array order
- Maintain any HTML tags like <hyper> in the text
- Return ONLY the translated JSON array, no other text`;

	const selection = selectModel("translate");
	const response = await completeUnified(
		{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, GEMINI_API_KEY: env.GEMINI_API_KEY, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, RATE_LIMIT_KV: env.RATE_LIMIT_KV },
		[{ role: "user", content: JSON.stringify(blocks) }],
		{ model: selection.model, provider: selection.provider, route: selection.route, system, maxTokens: 16384 },
	);

	try {
		let jsonStr = response.trim();
		// Strip markdown fences
		const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (fenceMatch) jsonStr = fenceMatch[1].trim();
		const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
		const translated = JSON.parse(jsonMatch ? jsonMatch[0] : jsonStr);
		return Response.json({ blocks: Array.isArray(translated) ? translated : [] });
	} catch (err) {
		return Response.json({ message: "failed to parse translation", preview: response.slice(0, 200) }, { status: 500 });
	}
}
