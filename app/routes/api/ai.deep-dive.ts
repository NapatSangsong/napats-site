/**
 * POST /api/ai/deep-dive
 * Generate a focused mini sub-lesson for a hyper-node term.
 * Streams SSE response with the generated blocks.
 */
import type { Route } from "./+types/ai.deep-dive";
import { BlockSchema } from "~/lib/ai/schemas";
import { streamChat } from "~/lib/ai/client";
import { selectModel } from "~/lib/ai/router";
import { deepDivePrompt } from "~/lib/ai/prompts/deepDive";
import { requireAuth, sseResponse, createSSEStream } from "~/lib/ai/helpers.server";
import { z } from "zod";

const MAX_DEPTH = 3;

const DeepDiveBody = z.object({
	term: z.string().min(1).max(500),
	context: z.string().min(1).max(5000),
	lessonTitle: z.string().min(1).max(500),
	courseTitle: z.string().min(1).max(500),
	depth: z.number().int().min(1).max(MAX_DEPTH),
});

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

	const model = selectModel("deepDive");
	const systemPrompt = deepDivePrompt({
		term,
		context: termContext,
		lessonTitle,
		courseTitle,
		depth,
	});

	const stream = createSSEStream(async ({ send }) => {
		const textStream = await streamChat(
			{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
			[{ role: "user", content: `Explain "${term}" in depth. Generate the deep-dive sub-lesson.` }],
			{ model, system: systemPrompt, maxTokens: 4096 },
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
			const parsed = JSON.parse(fullText);
			const blocks = z.array(BlockSchema).parse(
				Array.isArray(parsed.blocks) ? parsed.blocks : [],
			);
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
