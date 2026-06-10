import type { Route } from "./+types/line.webhook";

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
	const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
	return computed === signature;
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env;
	const body = await request.text();
	const signature = request.headers.get("x-line-signature") ?? "";

	if (!env.LINE_CHANNEL_SECRET || !(await verifySignature(body, signature, env.LINE_CHANNEL_SECRET))) {
		return new Response("Unauthorized", { status: 401 });
	}

	const data = JSON.parse(body) as { events: LineEvent[] };

	for (const event of data.events) {
		if (event.type === "postback") {
			const [action, requestId] = event.postback.data.split(":");
			if ((action === "approve" || action === "deny") && requestId) {
				await env.RATE_LIMIT_KV.put(`line:${requestId}`, action, { expirationTtl: 600 });

				const replyText =
					action === "approve"
						? "✅ Approved — Claude Code ดำเนินการต่อ"
						: "❌ Denied — Claude Code หยุดการดำเนินการ";

				await fetch("https://api.line.me/v2/bot/message/reply", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
					},
					body: JSON.stringify({
						replyToken: event.replyToken,
						messages: [{ type: "text", text: replyText }],
					}),
				});
			}
		}
	}

	return new Response("OK", { status: 200 });
}

interface LineEvent {
	type: string;
	replyToken: string;
	postback: { data: string };
}
