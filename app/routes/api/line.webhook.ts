/**
 * POST /api/line/webhook — LINE Messaging API webhook.
 * Signature-checked (LINE_CHANNEL_SECRET); only messages from LINE_USER_ID
 * (the owner) are answered. Commands:
 *   status | สถานะ   → ThinkPad / VPN / Mac status now
 *   crd              → Chrome Remote Desktop link
 *   help | ?         → this list
 * Never logs message text.
 */
import type { Route } from "./+types/line.webhook";
import { replyLine, verifyLineSignature } from "~/lib/line.server";
import { buildDigest } from "~/lib/thinkpad-alerts";
import { CRD_DEFAULT_URL } from "~/lib/thinkpad-status";
import { loadStatusView } from "~/lib/thinkpad-view.server";

interface LineEvent {
	type: string;
	replyToken?: string;
	source?: { type?: string; userId?: string };
	message?: { type?: string; text?: string };
}

const HELP = ["คำสั่งที่ใช้ได้:", "· status — สถานะ ThinkPad / VPN / Mac ตอนนี้", "· crd — ลิงก์ Chrome Remote Desktop", "· help — รายการนี้"].join("\n");

export async function loader() {
	return new Response("ok", { status: 200 });
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env;
	const body = await request.text();
	if (!(await verifyLineSignature(env.LINE_CHANNEL_SECRET, body, request.headers.get("x-line-signature")))) {
		return new Response("bad signature", { status: 401 });
	}
	let events: LineEvent[] = [];
	try {
		events = ((JSON.parse(body) as { events?: LineEvent[] }).events ?? []) as LineEvent[];
	} catch {
		return new Response("bad json", { status: 400 });
	}

	const work = (async () => {
		for (const ev of events) {
			if (ev.type !== "message" || ev.message?.type !== "text" || !ev.replyToken) continue;
			if (!env.LINE_USER_ID || ev.source?.userId !== env.LINE_USER_ID) continue; // owner only
			const cmd = (ev.message.text ?? "").trim().toLowerCase();
			let text: string;
			if (["status", "สถานะ", "st", "s"].includes(cmd)) text = buildDigest(await loadStatusView(env), "status");
			else if (cmd === "crd") text = `Chrome Remote Desktop: ${env.THINKPAD_CRD_URL || CRD_DEFAULT_URL}`;
			else text = HELP;
			await replyLine(env, ev.replyToken, text);
		}
	})().catch((e) => console.error("[line-webhook]", e instanceof Error ? e.message : String(e)));
	context.cloudflare.ctx.waitUntil(work);
	return new Response("ok", { status: 200 });
}
