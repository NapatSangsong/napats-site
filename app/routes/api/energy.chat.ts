/**
 * POST /api/energy/chat
 * Streaming AI chat for the energy dashboard. Stateless (no DB) — the client
 * sends the conversation plus a compact snapshot of the current dashboard data
 * as `context`, and the model analyses the user's actual numbers.
 */
import type { Route } from "./+types/energy.chat";
import { streamUnified } from "~/lib/ai/unified-client";
import type { ChatMessage } from "~/lib/ai/client";
import { sseResponse, createSSEStream } from "~/lib/ai/helpers.server";
import { requireEnergyAuth } from "~/lib/energy-gate.server";

// Models the picker is allowed to request (must match current openrouter ids).
const ALLOWED_MODELS = new Set([
	"google/gemini-2.5-flash",
	"google/gemini-2.5-pro",
	"anthropic/claude-sonnet-4.5",
]);
const DEFAULT_MODEL = "google/gemini-2.5-flash";

interface ChatRequestBody {
	messages?: { role?: string; content?: string }[];
	model?: string;
	context?: string;
}

function systemPrompt(context: string): string {
	return [
		"คุณคือผู้ช่วยนักวิเคราะห์พลังงานที่ฝังอยู่ในแดชบอร์ดค่าไฟบ้าน (TOU + โซลาร์, การไฟฟ้านครหลวง MEA, กรุงเทพฯ)",
		"ผู้ใช้คือเจ้าของบ้าน ตอบเป็นภาษาเดียวกับที่ผู้ใช้พิมพ์ (ถ้าพิมพ์ไทยให้ตอบไทย) กระชับ ตรงประเด็น",
		"อ้างอิงตัวเลขจริงจากข้อมูลแดชบอร์ดด้านล่างเสมอ ใช้หน่วย ฿ และ kWh",
		"เมื่อเกี่ยวข้อง ให้วิเคราะห์เรื่องการย้ายโหลด on/off-peak, ความคุ้มของโซลาร์, และค่าไฟต่อเดือน",
		"ถ้าข้อมูลที่ให้มาไม่มีสิ่งที่ถูกถาม ให้บอกตรง ๆ ว่าไม่มีข้อมูล อย่าเดาตัวเลขขึ้นเอง",
		"",
		"=== ข้อมูลแดชบอร์ด (snapshot ปัจจุบัน) ===",
		context || "(ยังไม่มีข้อมูล — แดชบอร์ดอาจกำลังโหลด)",
		"=== จบข้อมูล ===",
	].join("\n");
}

export async function action({ request, context }: Route.ActionArgs) {
	const env = context.cloudflare.env as Record<string, string> & Env;

	if (request.method !== "POST") {
		return Response.json({ message: "method not allowed" }, { status: 405 });
	}

	// CSRF: same-origin only
	const origin = request.headers.get("Origin");
	const url = new URL(request.url);
	if (origin && new URL(origin).host !== url.host) {
		return Response.json({ message: "origin mismatch" }, { status: 403 });
	}

	// Respect the energy key gate (no-op while ENERGY_PUBLIC is true)
	await requireEnergyAuth(request, env);

	let body: ChatRequestBody;
	try {
		body = (await request.json()) as ChatRequestBody;
	} catch {
		return Response.json({ message: "invalid json" }, { status: 400 });
	}

	const messages: ChatMessage[] = (Array.isArray(body.messages) ? body.messages : [])
		.filter(
			(m): m is { role: "user" | "assistant"; content: string } =>
				(m.role === "user" || m.role === "assistant") &&
				typeof m.content === "string" &&
				m.content.trim().length > 0,
		)
		.slice(-20) // cap history to keep the prompt bounded
		.map((m) => ({ role: m.role, content: m.content }));

	if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
		return Response.json({ message: "no user message" }, { status: 400 });
	}

	const model = body.model && ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
	const ctx = typeof body.context === "string" ? body.context.slice(0, 6000) : "";

	const stream = createSSEStream(async ({ send }) => {
		const textStream = await streamUnified(
			{ OPENROUTER_API_KEY: env.OPENROUTER_API_KEY, RATE_LIMIT_KV: env.RATE_LIMIT_KV },
			messages,
			{ model, system: systemPrompt(ctx), maxTokens: 2048, temperature: 0.4 },
		);

		const reader = textStream.getReader();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			send("delta", value);
		}
		send("end", "done");
	});

	return sseResponse(stream);
}
