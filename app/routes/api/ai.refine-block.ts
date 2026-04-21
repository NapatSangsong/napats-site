/**
 * POST /api/ai/refine-block
 * Stream a revised block + rationale based on user instruction.
 */
import type { Route } from "./+types/ai.refine-block";
import { RefineBlockBody } from "~/lib/ai/schemas";
import { streamChat } from "~/lib/ai/client";
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

	const model = requestedModel ?? selectModel("generateLesson");
	const systemPrompt = refineBlockSystem({
		blockType: block.kind,
		blockContent: JSON.stringify(block.content),
		instruction,
	});

	const stream = createSSEStream(async ({ send }) => {
		const textStream = await streamChat(
			{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
			[{ role: "user", content: instruction }],
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

		send("end", "done");
	});

	return sseResponse(stream);
}
