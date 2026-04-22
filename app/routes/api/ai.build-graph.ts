/**
 * POST /learning/api/ai/build-graph
 * Extract relationships between courses for the knowledge graph.
 * Caches results in course_relationships table.
 */
import type { Route } from "./+types/ai.build-graph";
import { completeUnified } from "~/lib/ai/unified-client";
import { selectModel } from "~/lib/ai/router";
import { buildGraphPrompt } from "~/lib/ai/prompts/buildGraph";
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

	// Load all courses
	const { data: courses } = await supabase
		.from("courses")
		.select("id, title, tags, description, difficulty")
		.eq("archived", false);

	if (!courses || courses.length < 2) {
		return Response.json({ edges: [], message: "Need at least 2 courses" });
	}

	const system = buildGraphPrompt({ courses });
	const selection = selectModel("summarise");
	const response = await completeUnified(
		{ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, GEMINI_API_KEY: env.GEMINI_API_KEY, OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, RATE_LIMIT_KV: env.RATE_LIMIT_KV },
		[{ role: "user", content: "Analyze the relationships between these courses." }],
		{ model: selection.model, provider: selection.provider, route: selection.route, system, maxTokens: 4096 },
	);

	let edges: any[] = [];
	try {
		const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) || [null, response];
		edges = JSON.parse(jsonMatch[1]?.trim() || response.trim());
	} catch {
		return Response.json({ edges: [], raw: response });
	}

	// Cache in database
	for (const edge of edges) {
		if (edge.from && edge.to) {
			await supabase.from("course_relationships").upsert(
				{
					from_course_id: edge.from,
					to_course_id: edge.to,
					relationship: edge.relationship || "relates",
					strength: edge.strength ?? 0.5,
					generated_by_model: selection.model,
				},
				{ onConflict: "from_course_id,to_course_id" },
			);
		}
	}

	return Response.json({ edges, count: edges.length });
}
