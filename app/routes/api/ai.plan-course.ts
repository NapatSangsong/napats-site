/**
 * POST /api/ai/plan-course
 * Stream a course outline from a user prompt via SSE.
 */
import type { Route } from "./+types/ai.plan-course";
import { PlanCourseBody } from "~/lib/ai/schemas";
import { streamChat } from "~/lib/ai/client";
import { selectModel } from "~/lib/ai/router";
import { planCoursePrompt } from "~/lib/ai/prompts/planCourse";
import { requireAuth, sseResponse, createSSEStream } from "~/lib/ai/helpers.server";

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	if (request.method !== "POST") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	// Parse and validate body
	let body: ReturnType<typeof PlanCourseBody.safeParse>;
	try {
		body = PlanCourseBody.safeParse(await request.json());
	} catch {
		return Response.json({ message: "invalid json" }, { status: 400 });
	}
	if (!body.success) {
		return Response.json(
			{ message: "invalid request", errors: body.error.flatten() },
			{ status: 400 },
		);
	}

	const { prompt, model: requestedModel } = body.data;
	const model = requestedModel ?? selectModel("planCourse");
	const systemPrompt = planCoursePrompt({ topic: prompt });

	const stream = createSSEStream(async ({ send }) => {
		const textStream = await streamChat(
			{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
			[{ role: "user", content: prompt }],
			{ model, system: systemPrompt, maxTokens: 8192 },
		);

		const reader = textStream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			send("delta", value);
		}
		send("end", "done");
	});

	return sseResponse(stream);
}
