/**
 * POST /api/ai/refine-block
 * Stream a revised block + rationale based on user instruction.
 */
import type { Route } from "./+types/ai.refine-block";
import { RefineBlockBody } from "~/lib/ai/schemas";
import { streamUnified } from "~/lib/ai/unified-client";
import { selectModel } from "~/lib/ai/router";
import { refineBlockSystem } from "~/lib/ai/prompts/refineBlock";
import { createServiceClient } from "~/lib/supabase.server";
import { requireAuth, sseResponse, createSSEStream } from "~/lib/ai/helpers.server";

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	if (request.method !== "POST") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	let body: ReturnType<typeof RefineBlockBody.safeParse>;
	try {
		body = RefineBlockBody.safeParse(await request.json());
	} catch {
		return Response.json({ message: "invalid json" }, { status: 400 });
	}
	if (!body.success) {
		return Response.json(
			{ message: "invalid request", errors: body.error.flatten() },
			{ status: 400 },
		);
	}

	const { blockId, instruction, model: requestedModel } = body.data;
	const supabase = createServiceClient(env as unknown as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

	// Fetch current block
	const { data: block, error: blockError } = await supabase
		.from("lesson_blocks")
		.select("id, kind, content")
		.eq("id", blockId)
		.single();

	if (blockError || !block) {
		return Response.json({ message: "block not found" }, { status: 404 });
	}

	const selection = selectModel("generateLesson");
	const model = requestedModel ?? selection.model;
	const provider = requestedModel
		? requestedModel.includes("/") ? "openrouter" as const : requestedModel.startsWith("gemini") ? "gemini" as const : "anthropic" as const
		: selection.provider;
	const systemPrompt = refineBlockSystem({
		blockType: block.kind,
		blockContent: JSON.stringify(block.content),
		instruction,
	});

	const stream = createSSEStream(async ({ send }) => {
		const textStream = await streamUnified(
			{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, GEMINI_API_KEY: env.GEMINI_API_KEY, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, RATE_LIMIT_KV: env.RATE_LIMIT_KV },
			[{ role: "user", content: instruction }],
			{ model, provider, route: selection.route, system: systemPrompt, maxTokens: 4096 },
		);

		let fullText = "";
		const reader = textStream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			fullText += value;
			send("delta", value);
		}

		send("end", "done");
	});

	return sseResponse(stream);
}
