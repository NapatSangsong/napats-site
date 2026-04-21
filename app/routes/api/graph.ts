/**
 * GET /learning/api/graph
 * Return cached knowledge graph (nodes + edges) for visualization.
 */
import type { Route } from "./+types/graph";
import { requireAuth } from "~/lib/ai/helpers.server";
import { createServiceClient } from "~/lib/supabase.server";

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;
	const denied = await requireAuth(request, env);
	if (denied) return denied;

	const supabase = createServiceClient(env);

	// Load nodes (courses)
	const { data: courses } = await supabase
		.from("courses")
		.select("id, title, slug, tags, difficulty, cover_monogram, lessons(id, lesson_progress(status))")
		.eq("archived", false);

	const nodes = (courses || []).map((c: any) => {
		const total = c.lessons?.length || 0;
		const completed = c.lessons?.filter(
			(l: any) => l.lesson_progress?.some((p: any) => p.status === "completed"),
		).length || 0;
		return {
			id: c.id,
			title: c.title,
			slug: c.slug,
			monogram: c.cover_monogram || c.title[0],
			difficulty: c.difficulty,
			tags: c.tags || [],
			progress: total > 0 ? Math.round((completed / total) * 100) : 0,
		};
	});

	// Load edges
	const { data: edges } = await supabase
		.from("course_relationships")
		.select("from_course_id, to_course_id, relationship, strength");

	return Response.json({
		nodes,
		edges: (edges || []).map((e: any) => ({
			from: e.from_course_id,
			to: e.to_course_id,
			relationship: e.relationship,
			strength: e.strength,
		})),
	});
}
