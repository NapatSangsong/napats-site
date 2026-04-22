/**
 * POST /api/ai/grade
 * Grade a short-answer quiz response using AI.
 */
import type { Route } from "./+types/ai.grade";
import { GradeBody } from "~/lib/ai/schemas";
import { completeUnified } from "~/lib/ai/unified-client";
import { selectModel } from "~/lib/ai/router";
import { gradeShortAnswerPrompt } from "~/lib/ai/prompts/gradeShortAnswer";
import { createServiceClient } from "~/lib/supabase.server";
import { requireAuth } from "~/lib/ai/helpers.server";

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	if (request.method !== "POST") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	let body: ReturnType<typeof GradeBody.safeParse>;
	try {
		body = GradeBody.safeParse(await request.json());
	} catch {
		return Response.json({ message: "invalid json" }, { status: 400 });
	}
	if (!body.success) {
		return Response.json(
			{ message: "invalid request", errors: body.error.flatten() },
			{ status: 400 },
		);
	}

	const { quizId, questionId, answer } = body.data;
	const supabase = createServiceClient(env as unknown as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

	// Fetch quiz and question data
	const { data: quiz, error: quizError } = await supabase
		.from("quizzes")
		.select("id, questions")
		.eq("id", quizId)
		.single();

	if (quizError || !quiz) {
		return Response.json({ message: "quiz not found" }, { status: 404 });
	}

	// Find the specific question
	const questions = quiz.questions as Array<{
		id: string;
		type: string;
		question: string;
		rubric?: string;
		sample_answer?: string;
	}>;

	const question = questions.find((q) => q.id === questionId);
	if (!question) {
		return Response.json({ message: "question not found" }, { status: 404 });
	}

	if (question.type !== "short_answer") {
		return Response.json(
			{ message: "only short_answer questions support AI grading" },
			{ status: 400 },
		);
	}

	const selection = selectModel("gradeShortAnswer");
	const systemPrompt = gradeShortAnswerPrompt({
		question: question.question,
		rubric: question.rubric ?? "",
		sampleAnswer: question.sample_answer,
		studentAnswer: answer,
	});

	try {
		const raw = await completeUnified(
			{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, GEMINI_API_KEY: env.GEMINI_API_KEY },
			[{ role: "user", content: `Grade this answer: "${answer}"` }],
			{ model: selection.model, provider: selection.provider, system: systemPrompt, maxTokens: 1024, temperature: 0.2 },
		);

		const result = JSON.parse(raw) as { score: number; feedback: string };
		return Response.json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : "grading failed";
		return Response.json({ message }, { status: 500 });
	}
}
