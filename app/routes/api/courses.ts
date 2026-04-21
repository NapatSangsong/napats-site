/**
 * /api/courses — CRUD for courses.
 * GET: list non-archived courses
 * POST: create course from approved outline (CourseDraft)
 */
import type { Route } from "./+types/courses";
import { CourseDraftSchema } from "~/lib/ai/schemas";
import { createServiceClient } from "~/lib/supabase.server";
import { requireAuth, slugify } from "~/lib/ai/helpers.server";

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	const supabase = createServiceClient(env as unknown as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

	const { data: courses, error } = await supabase
		.from("courses")
		.select("id, title, slug, subtitle, description, language, difficulty, estimated_minutes, tags, cover_monogram, status, created_at, updated_at")
		.neq("status", "archived")
		.order("created_at", { ascending: false });

	if (error) {
		return Response.json({ message: "failed to fetch courses" }, { status: 500 });
	}

	return Response.json({ courses });
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	if (request.method !== "POST") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	let body: ReturnType<typeof CourseDraftSchema.safeParse>;
	try {
		body = CourseDraftSchema.safeParse(await request.json());
	} catch {
		return Response.json({ message: "invalid json" }, { status: 400 });
	}
	if (!body.success) {
		return Response.json(
			{ message: "invalid request", errors: body.error.flatten() },
			{ status: 400 },
		);
	}

	const draft = body.data;
	const supabase = createServiceClient(env as unknown as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string });

	// Generate unique slug
	let slug = slugify(draft.title);
	const { data: existing } = await supabase
		.from("courses")
		.select("id")
		.eq("slug", slug)
		.maybeSingle();

	if (existing) {
		slug = `${slug}-${Date.now().toString(36)}`;
	}

	// Insert course
	const { data: course, error: courseError } = await supabase
		.from("courses")
		.insert({
			title: draft.title,
			slug,
			subtitle: draft.subtitle ?? null,
			description: draft.description ?? null,
			language: draft.language,
			difficulty: draft.difficulty,
			estimated_minutes: draft.estimated_minutes ?? null,
			tags: draft.tags,
			cover_monogram: draft.cover_monogram ?? null,
			status: "draft",
		})
		.select("id, slug")
		.single();

	if (courseError || !course) {
		return Response.json({ message: "failed to create course" }, { status: 500 });
	}

	// Insert lessons from the outline
	const lessonRows = draft.lessons.map((lesson, idx) => ({
		course_id: course.id,
		title: lesson.title,
		summary: lesson.summary ?? null,
		outcomes: lesson.outcomes,
		order: idx,
		status: "pending",
	}));

	const { error: lessonsError } = await supabase
		.from("lessons")
		.insert(lessonRows);

	if (lessonsError) {
		// Best-effort cleanup
		await supabase.from("courses").delete().eq("id", course.id);
		return Response.json({ message: "failed to create lessons" }, { status: 500 });
	}

	return Response.json({ course }, { status: 201 });
}
