/**
 * POST /learning/api/ai/suggest-courses
 * Generate personalized course suggestions based on user's library and progress.
 */
import type { Route } from "./+types/ai.suggest-courses";
import { completeUnified } from "~/lib/ai/unified-client";
import { selectModel } from "~/lib/ai/router";
import { suggestCoursesPrompt } from "~/lib/ai/prompts/suggestCourses";
import { requireAuth } from "~/lib/ai/helpers.server";
import { createServiceClient } from "~/lib/supabase.server";

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	if (request.method !== "POST") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	const supabase = createServiceClient(env);

	// Load courses with progress
	const { data: courses } = await supabase
		.from("courses")
		.select("title, tags, difficulty, lessons(id, lesson_progress(status))")
		.eq("archived", false);

	const courseData = (courses || []).map((c: any) => {
		const total = c.lessons?.length || 0;
		const completed = c.lessons?.filter(
			(l: any) => l.lesson_progress?.some((p: any) => p.status === "completed"),
		).length || 0;
		return {
			title: c.title,
			tags: c.tags || [],
			difficulty: c.difficulty || "beginner",
			progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
		};
	});

	// Load learning style
	const { data: styleSetting } = await supabase
		.from("settings")
		.select("value")
		.eq("key", "learning_style")
		.single();

	const system = suggestCoursesPrompt({
		courses: courseData,
		learningStyle: styleSetting?.value as any,
	});

	const selection = selectModel("summarise"); // Use Haiku for speed
	const response = await completeUnified(
		{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, GEMINI_API_KEY: env.GEMINI_API_KEY, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, RATE_LIMIT_KV: env.RATE_LIMIT_KV },
		[{ role: "user", content: "Generate course suggestions for me." }],
		{ model: selection.model, provider: selection.provider, route: selection.route, system, maxTokens: 2048 },
	);

	try {
		const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) || [null, response];
		const suggestions = JSON.parse(jsonMatch[1]?.trim() || response.trim());
		return Response.json({ suggestions });
	} catch {
		return Response.json({ suggestions: [], raw: response });
	}
}
