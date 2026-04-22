/**
 * POST /api/ai/deep-dive
 * Generate a focused mini sub-lesson for a hyper-node term.
 * Streams SSE response with the generated blocks.
 */
import type { Route } from "./+types/ai.deep-dive";
import { BlockSchema, DeepDiveBody } from "~/lib/ai/schemas";
import { streamUnified } from "~/lib/ai/unified-client";
import { selectModel } from "~/lib/ai/router";
import { deepDivePrompt } from "~/lib/ai/prompts/deepDive";
import { requireAuth, sseResponse, createSSEStream } from "~/lib/ai/helpers.server";
import { z } from "zod";

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	if (request.method !== "POST") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	let body: ReturnType<typeof DeepDiveBody.safeParse>;
	try {
		body = DeepDiveBody.safeParse(await request.json());
	} catch {
		return Response.json({ message: "invalid json" }, { status: 400 });
	}
	if (!body.success) {
		return Response.json(
			{ message: "invalid request", errors: body.error.flatten() },
			{ status: 400 },
		);
	}

	const { term, context: termContext, lessonTitle, courseTitle, depth } = body.data;

	const selection = selectModel("deepDive");
	const model = selection.model;
	const provider = selection.provider;
	const systemPrompt = deepDivePrompt({
		term,
		context: termContext,
		lessonTitle,
		courseTitle,
		depth,
	});

	const stream = createSSEStream(async ({ send }) => {
		const textStream = await streamUnified(
			{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, GEMINI_API_KEY: env.GEMINI_API_KEY },
			[{ role: "user", content: `Explain "${term}" in depth. Generate the deep-dive sub-lesson.` }],
			{ model, provider, system: systemPrompt, maxTokens: 4096 },
		);

		let fullText = "";
		const reader = textStream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			fullText += value;
			send("delta", value);
		}

		// Parse the response
		try {
			let jsonStr = fullText.trim();
			const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (fenceMatch) jsonStr = fenceMatch[1].trim();
			if (!jsonStr.startsWith("{") && !jsonStr.startsWith("[")) {
				const objMatch = jsonStr.match(/\{[\s\S]*\}/);
				if (objMatch) jsonStr = objMatch[0];
			}
			const parsed = JSON.parse(jsonStr);
			const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : Array.isArray(parsed) ? parsed : [];
			const hyperNodes = Array.isArray(parsed.hyperNodes)
				? parsed.hyperNodes.filter((n: unknown) => typeof n === "string")
				: [];

			send("result", JSON.stringify({ blocks, hyperNodes }));
		} catch {
			send("error", JSON.stringify({ message: "failed to parse deep-dive blocks" }));
			return;
		}

		send("end", "done");
	});

	return sseResponse(stream);
}
