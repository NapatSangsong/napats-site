/**
 * LINE Messaging API helpers for the inbound webhook (/api/line/webhook).
 * Pushes still go through pushLine (energy-alerts.server.ts).
 */
import { safeEqual } from "./energy-gate.server";

export const LINE_WEBHOOK_PATH = "/api/line/webhook";
export const LINE_WEBHOOK_URL = `https://ai.napats.dev${LINE_WEBHOOK_PATH}`;

const enc = new TextEncoder();

/** X-Line-Signature = base64(HMAC-SHA256(channel secret, raw body)) */
export async function verifyLineSignature(secret: string, body: string, signature: string | null): Promise<boolean> {
	if (!secret || !signature) return false;
	const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
	let bin = "";
	for (const b of mac) bin += String.fromCharCode(b);
	return safeEqual(btoa(bin), signature);
}

export async function replyLine(env: Env, replyToken: string, text: string): Promise<void> {
	const res = await fetch("https://api.line.me/v2/bot/message/reply", {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
		body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
	});
	if (!res.ok) throw new Error(`LINE reply failed: ${res.status}`);
}

/**
 * Point the channel's webhook at this site — but only when it is unset or
 * already on ai.napats.dev, never over some other service's endpoint.
 * Checked at most once a day (KV marker); the outcome is kept in KV
 * "line:webhook:status" (host only, no secrets).
 */
export async function ensureLineWebhook(env: Env): Promise<void> {
	if (!env.LINE_CHANNEL_ACCESS_TOKEN) return;
	const kv = env.RATE_LIMIT_KV;
	if (await kv.get("line:webhook:checked")) return;
	const auth = { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` };
	const cur = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", { headers: auth });
	if (!cur.ok) throw new Error(`LINE get webhook failed: ${cur.status}`);
	const info = (await cur.json()) as { endpoint?: string; active?: boolean };
	const host = info.endpoint ? new URL(info.endpoint).host : "";
	let action = "kept";
	if (info.endpoint !== LINE_WEBHOOK_URL && (host === "" || host === "ai.napats.dev")) {
		const put = await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint", {
			method: "PUT",
			headers: { ...auth, "Content-Type": "application/json" },
			body: JSON.stringify({ endpoint: LINE_WEBHOOK_URL }),
		});
		action = put.ok ? "set" : `set failed ${put.status}`;
	} else if (info.endpoint !== LINE_WEBHOOK_URL) {
		action = "other endpoint in use — left alone";
	}
	await kv.put("line:webhook:status", JSON.stringify({ host: host || null, active: info.active ?? null, action, at: new Date().toISOString() }));
	await kv.put("line:webhook:checked", "1", { expirationTtl: 86400 });
}
