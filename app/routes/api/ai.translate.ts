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
	const textToTranslate = rawBody.text; // Simple text mode

	if (targetLang !== "en" && targetLang !== "th") {
		return Response.json({ message: "invalid target language" }, { status: 400 });
	}

	// Simple text translation mode
	if (typeof textToTranslate === "string" && textToTranslate.trim()) {
		const langName = targetLang === "th" ? "Thai" : "English";
		const selection = selectModel("translate");
		try {
			const translated = await completeUnified(
				{ OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, RATE_LIMIT_KV: env.RATE_LIMIT_KV },
				[{ role: "user", content: textToTranslate.trim() }],
				{ model: selection.model, route: selection.route, system: `Translate the following text to ${langName}. Return ONLY the translation, nothing else.`, maxTokens: 1024 },
			);
			return Response.json({ translated: translated.trim() });
		} catch (err) {
			return Response.json({ message: `Translation failed: ${(err as Error).message?.slice(0, 100)}` }, { status: 502 });
		}
	}

	if (!Array.isArray(blocks) || blocks.length === 0) {
		return Response.json({ message: "no blocks to translate" }, { status: 400 });
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

	let response: string;
	try {
		response = await completeUnified(
			{ OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, RATE_LIMIT_KV: env.RATE_LIMIT_KV },
			[{ role: "user", content: JSON.stringify(blocks) }],
			{ model: selection.model, route: selection.route, system, maxTokens: 16384 },
		);
	} catch (err) {
		return Response.json({ message: `AI error: ${(err as Error).message?.slice(0, 100)}` }, { status: 502 });
	}

	try {
		let jsonStr = response.trim();
		const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (fenceMatch) jsonStr = fenceMatch[1].trim();
		const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
		const translated = JSON.parse(jsonMatch ? jsonMatch[0] : jsonStr);
		return Response.json({ blocks: Array.isArray(translated) ? translated : [] });
	} catch {
		return Response.json({ message: "translation returned invalid format", preview: response.slice(0, 200) }, { status: 500 });
	}
}
