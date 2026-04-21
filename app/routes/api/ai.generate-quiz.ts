/**
 * POST /api/ai/generate-quiz
 * Non-streaming endpoint that generates quiz questions for a lesson.
 */
import type { Route } from "./+types/ai.generate-quiz";
import { GenerateQuizBody } from "~/lib/ai/schemas";
import { completeChat } from "~/lib/ai/client";
import { selectModel } from "~/lib/ai/router";
import { generateQuizSystem } from "~/lib/ai/prompts/generateQuiz";
import { createServiceClient } from "~/lib/supabase.server";
import { requireAuth } from "~/lib/ai/helpers.server";

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	if (request.method !== "POST") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	let body: ReturnType<typeof GenerateQuizBody.safeParse>;
	try {
		body = GenerateQuizBody.safeParse(await request.json());
	} catch {
		return Response.json({ message: "invalid json" }, { status: 400 });
	}
	if (!body.success) {
		return Response.json(
			{ message: "invalid request", errors: body.error.flatten() },
			{ status: 400 },
		);
	}

	const { lessonId, count, model: requestedModel } = body.data;
	const supabase = createServiceClient(env as unknown as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

	// Fetch lesson and its blocks for content context
	const { data: lesson, error: lessonError } = await supabase
		.from("lessons")
		.select("id, title")
		.eq("id", lessonId)
		.single();

	if (lessonError || !lesson) {
		return Response.json({ message: "lesson not found" }, { status: 404 });
	}

	const { data: blocks } = await supabase
		.from("lesson_blocks")
		.select("kind, content")
		.eq("lesson_id", lessonId)
		.order("order_index", { ascending: true });

	const lessonContent = (blocks ?? [])
		.map((b) => JSON.stringify(b.content))
		.join("\n\n");

	if (!lessonContent) {
		return Response.json(
			{ message: "lesson has no content blocks — generate lesson content first" },
			{ status: 400 },
		);
	}

	const model = requestedModel ?? selectModel("generateQuiz");
	const systemPrompt = generateQuizSystem({
		lessonTitle: lesson.title,
		lessonContent,
		count,
	});

	try {
		const raw = await completeChat(
			{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
			[{ role: "user", content: `Generate ${count} quiz questions for the lesson "${lesson.title}".` }],
			{ model, system: systemPrompt, maxTokens: 8192, temperature: 0.3 },
		);

		const quiz = JSON.parse(raw);
		return Response.json({ quiz });
	} catch (err) {
		const message = err instanceof Error ? err.message : "quiz generation failed";
		return Response.json({ message }, { status: 500 });
	}
}
