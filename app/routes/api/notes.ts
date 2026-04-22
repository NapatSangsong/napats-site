/**
 * GET/POST/PATCH/DELETE /learning/api/notes
 * Personal notes attached to lesson blocks.
 */
import type { Route } from "./+types/notes";
import { requireAuth } from "~/lib/ai/helpers.server";
import { createServiceClient } from "~/lib/supabase.server";

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;
	const denied = await requireAuth(request, env);
	if (denied) return denied;

	const url = new URL(request.url);
	const lessonId = url.searchParams.get("lessonId");
	if (!lessonId) return Response.json({ notes: [] });

	const supabase = createServiceClient(env);
	const { data } = await supabase
		.from("lesson_notes")
		.select("*")
		.eq("lesson_id", lessonId)
		.order("block_index", { ascending: true });

	return Response.json({ notes: data || [] });
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;
	const denied = await requireAuth(request, env);
	if (denied) return denied;

	const supabase = createServiceClient(env);
	const body = await request.json() as any;

	if (request.method === "POST") {
		const { lessonId, blockIndex, content, color } = body;
		if (!lessonId || !content) {
			return Response.json({ message: "lessonId and content required" }, { status: 400 });
		}
		const { data, error } = await supabase
			.from("lesson_notes")
			.insert({ lesson_id: lessonId, block_index: blockIndex ?? null, content, color: color || "default" })
			.select("*")
			.single();
		if (error) return Response.json({ message: error.message }, { status: 500 });
		return Response.json({ note: data }, { status: 201 });
	}

	if (request.method === "PATCH") {
		const { noteId, content, color } = body;
		if (!noteId) return Response.json({ message: "noteId required" }, { status: 400 });
		const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
		if (content !== undefined) update.content = content;
		if (color !== undefined) update.color = color;
		const { error } = await supabase.from("lesson_notes").update(update).eq("id", noteId);
		if (error) return Response.json({ message: error.message }, { status: 500 });
		return Response.json({ ok: true });
	}

	if (request.method === "DELETE") {
		const { noteId } = body;
		if (!noteId) return Response.json({ message: "noteId required" }, { status: 400 });
		const { error } = await supabase.from("lesson_notes").delete().eq("id", noteId);
		if (error) return Response.json({ message: error.message }, { status: 500 });
		return Response.json({ ok: true });
	}

	return Response.json({ message: "method not allowed" }, { status: 405 });
}
