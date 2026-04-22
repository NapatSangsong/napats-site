/**
 * POST /learning/api/ai/related-courses
 * Generate related course suggestions after completing a course.
 */
import type { Route } from "./+types/ai.related-courses";
import { completeUnified } from "~/lib/ai/unified-client";
import { selectModel } from "~/lib/ai/router";
import { relatedCoursesPrompt } from "~/lib/ai/prompts/relatedCourses";
import { requireAuth } from "~/lib/ai/helpers.server";
import { createServiceClient } from "~/lib/supabase.server";

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	if (request.method !== "POST") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	const body = await request.json() as { courseId: string };
	if (!body.courseId) {
		return Response.json({ message: "courseId required" }, { status: 400 });
	}

	const supabase = createServiceClient(env);

	// Load the completed course
	const { data: course } = await supabase
		.from("courses")
		.select("title, tags, description")
		.eq("id", body.courseId)
		.single();

	if (!course) {
		return Response.json({ message: "course not found" }, { status: 404 });
	}

	// Load existing library
	const { data: library } = await supabase
		.from("courses")
		.select("title, tags")
		.eq("archived", false)
		.neq("id", body.courseId);

	const system = relatedCoursesPrompt({
		completedCourse: course,
		existingCourses: library || [],
	});

	const selection = selectModel("summarise");
	const response = await completeUnified(
		{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, GEMINI_API_KEY: env.GEMINI_API_KEY },
		[{ role: "user", content: "What should I learn next?" }],
		{ model: selection.model, provider: selection.provider, system, maxTokens: 2048 },
	);

	try {
		const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) || [null, response];
		const suggestions = JSON.parse(jsonMatch[1]?.trim() || response.trim());
		return Response.json({ suggestions });
	} catch {
		return Response.json({ suggestions: [], raw: response });
	}
}
