/**
 * GET/PUT /learning/api/settings — User preferences (key-value store).
 */
import type { Route } from "./+types/settings";
import { requireAuth } from "~/lib/ai/helpers.server";
import { createServiceClient } from "~/lib/supabase.server";

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;
	const denied = await requireAuth(request, env);
	if (denied) return denied;

	const supabase = createServiceClient(env);
	const { data } = await supabase.from("settings").select("key, value");

	const settings: Record<string, unknown> = {};
	for (const row of data || []) {
		settings[row.key] = row.value;
	}

	return Response.json(settings);
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;
	if (request.method !== "PUT") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	const denied = await requireAuth(request, env);
	if (denied) return denied;

	const body = await request.json() as { key: string; value: unknown };
	if (!body.key) {
		return Response.json({ message: "key is required" }, { status: 400 });
	}

	const supabase = createServiceClient(env);
	const { error } = await supabase
		.from("settings")
		.upsert(
			{ key: body.key, value: body.value, updated_at: new Date().toISOString() },
			{ onConflict: "key" },
		);

	if (error) return Response.json({ message: error.message }, { status: 500 });
	return Response.json({ ok: true });
}
