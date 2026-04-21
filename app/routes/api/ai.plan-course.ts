/**
 * POST /api/ai/plan-course
 * Stream a course outline from a user prompt via SSE.
 * Supports multi-turn conversation with context-awareness:
 * - Loads user's learning style preferences
 * - Loads existing course library for smart prerequisites
 */
import type { Route } from "./+types/ai.plan-course";
import { PlanCourseBody } from "~/lib/ai/schemas";
import { streamChat } from "~/lib/ai/client";
import { selectModel } from "~/lib/ai/router";
import { planCoursePrompt } from "~/lib/ai/prompts/planCourse";
import { requireAuth, sseResponse, createSSEStream } from "~/lib/ai/helpers.server";
import { createServiceClient } from "~/lib/supabase.server";

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	if (request.method !== "POST") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

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

	const { prompt, model: requestedModel, messages: history } = body.data;
	const model = requestedModel ?? selectModel("planCourse");

	// Load context from database
	const supabase = createServiceClient(env);

	// Learning style preference
	let learningStyle: { reading: boolean; watching: boolean; doing: boolean } | undefined;
	try {
		const { data: styleSetting } = await supabase
			.from("settings")
			.select("value")
			.eq("key", "learning_style")
			.single();
		if (styleSetting?.value) {
			learningStyle = styleSetting.value as any;
		}
	} catch {
		// Settings not available yet
	}

	// Existing courses for smart prerequisites
	let existingCourses: { title: string; tags: string[]; difficulty: string }[] | undefined;
	try {
		const { data: courses } = await supabase
			.from("courses")
			.select("title, tags, difficulty")
			.eq("archived", false)
			.limit(20);
		if (courses && courses.length > 0) {
			existingCourses = courses;
		}
	} catch {
		// DB not available
	}

	const systemPrompt = planCoursePrompt({
		topic: prompt,
		learningStyle,
		existingCourses,
	});

	const messages = history && history.length > 0
		? history
		: [{ role: "user" as const, content: prompt }];

	const stream = createSSEStream(async ({ send }) => {
		const textStream = await streamChat(
			{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
			messages,
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
