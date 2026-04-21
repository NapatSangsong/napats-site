/**
 * GET/PUT /learning/api/progress/:lessonId — Read/write lesson progress.
 */
import type { Route } from "./+types/progress.$lessonId";
import { verifySessionCookie } from "~/lib/session.server";
import { createServiceClient } from "~/lib/supabase.server";

export async function loader({ params, request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const session = await verifySessionCookie(request.headers.get("Cookie"), env.SESSION_HMAC_SECRET);
	if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

	const supabase = createServiceClient(env);
	const { data } = await supabase
		.from("lesson_progress")
		.select("*")
		.eq("lesson_id", params.lessonId)
		.single();

	return Response.json(data || { lesson_id: params.lessonId, status: "not_started", scroll_percent: 0 });
}

export async function action({ params, request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env;
	const session = await verifySessionCookie(request.headers.get("Cookie"), env.SESSION_HMAC_SECRET);
	if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });

	if (request.method !== "PUT") {
		return Response.json({ error: "method not allowed" }, { status: 405 });
	}

	const body = await request.json() as { scroll_percent?: number; status?: string };
	const supabase = createServiceClient(env);

	const now = new Date().toISOString();
	const update: Record<string, unknown> = {
		lesson_id: params.lessonId,
		last_accessed_at: now,
	};

	if (body.scroll_percent !== undefined) {
		update.scroll_percent = Math.min(100, Math.max(0, body.scroll_percent));
	}
	if (body.status === "in_progress" || body.status === "completed") {
		update.status = body.status;
		if (body.status === "in_progress" && !update.started_at) {
			update.started_at = now;
		}
		if (body.status === "completed") {
			update.completed_at = now;
		}
	}

	const { data, error } = await supabase
		.from("lesson_progress")
		.upsert(update, { onConflict: "lesson_id" })
		.select()
		.single();

	if (error) return Response.json({ error: error.message }, { status: 500 });
	return Response.json(data);
}
