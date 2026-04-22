import type { Route } from "./+types/journal";
import { requireAuth } from "~/lib/ai/helpers.server";
import { createServiceClient } from "~/lib/supabase.server";

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;
	const denied = await requireAuth(request, env);
	if (denied) return denied;
	const url = new URL(request.url);
	const lessonId = url.searchParams.get("lessonId");
	if (!lessonId) return Response.json({ entries: [] });
	const supabase = createServiceClient(env);
	const { data } = await supabase.from("lesson_journal").select("*").eq("lesson_id", lessonId).order("created_at", { ascending: false });
	return Response.json({ entries: data || [] });
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;
	const denied = await requireAuth(request, env);
	if (denied) return denied;
	const supabase = createServiceClient(env);
	const body = await request.json() as any;

	if (request.method === "POST") {
		const { lessonId, content, kind } = body;
		if (!lessonId || !content) return Response.json({ message: "required" }, { status: 400 });
		const { data, error } = await supabase.from("lesson_journal").insert({
			lesson_id: lessonId, content, kind: kind || "reflection",
		}).select("*").single();
		if (error) return Response.json({ message: error.message }, { status: 500 });
		return Response.json({ entry: data }, { status: 201 });
	}
	if (request.method === "DELETE") {
		await supabase.from("lesson_journal").delete().eq("id", body.entryId);
		return Response.json({ ok: true });
	}
	return Response.json({ message: "method not allowed" }, { status: 405 });
}
