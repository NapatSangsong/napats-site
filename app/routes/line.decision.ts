import type { Route } from "./+types/line.decision";

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	const id = new URL(request.url).searchParams.get("id");

	if (!id) {
		return Response.json({ error: "Missing id" }, { status: 400 });
	}

	const decision = await env.RATE_LIMIT_KV.get(`line:${id}`);
	return Response.json({ decision: decision ?? "pending" });
}
