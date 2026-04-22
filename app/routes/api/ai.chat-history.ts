/**
 * GET /learning/api/ai/chat-history?scope=lesson&scopeId=xxx
 * Returns the latest chat thread and its messages for a given scope.
 */
import type { Route } from "./+types/ai.chat-history";
import { requireAuth } from "~/lib/ai/helpers.server";
import { createServiceClient } from "~/lib/supabase.server";

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;
	const denied = await requireAuth(request, env);
	if (denied) return denied;

	const url = new URL(request.url);
	const scope = url.searchParams.get("scope");
	const scopeId = url.searchParams.get("scopeId");

	if (!scope || !scopeId) {
		return Response.json({ threadId: null, messages: [] });
	}

	const supabase = createServiceClient(env);

	const { data: thread } = await supabase
		.from("chat_threads")
		.select("id")
		.eq("scope", scope)
		.eq("scope_id", scopeId)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	if (!thread) {
		return Response.json({ threadId: null, messages: [] });
	}

	const { data: messages } = await supabase
		.from("chat_messages")
		.select("role, content")
		.eq("thread_id", thread.id)
		.order("created_at", { ascending: true });

	return Response.json({
		threadId: thread.id,
		messages: messages || [],
	});
}
