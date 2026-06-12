/**
 * Proactive LINE alerts, run from the same every-15-min cron after sync + rollup:
 *
 *  1. Voltage out-of-range — latest grid sample beyond 220V ±10% (198–242V).
 *     Throttled to one alert per 6 h via KV so a long sag doesn't spam.
 *  2. Daily digest at ≥22:00 BKK (after evening peak ends) — today's kWh/฿
 *     vs yesterday, plus a baseload-creep warning when yesterday's overnight
 *     minimum jumped ≥1.5× above the prior-week average (fridge dying,
 *     something left on, …). Sent once per day via KV marker.
 *
 * Requires the LINE_USER_ID secret (the owner's LINE userId) — without it
 * every push is a logged no-op, so the cron stays healthy before setup:
 *   npx wrangler secret put LINE_USER_ID
 */
import { ENERGY_CONST as C, dayNum, hourOf } from "./energy-calc";
import { createServiceClient } from "./supabase.server";

const VOLT_LO = 198; // 220V −10%
const VOLT_HI = 242; // 220V +10%
const VOLT_THROTTLE_S = 6 * 3600;
const DIGEST_HOUR = 22; // BKK

async function pushLine(env: Env, text: string): Promise<void> {
	const to = (env as { LINE_USER_ID?: string }).LINE_USER_ID;
	if (!to || !env.LINE_CHANNEL_ACCESS_TOKEN) {
		console.log("[alerts] LINE_USER_ID not set — skipping push:", text.slice(0, 80));
		return;
	}
	const res = await fetch("https://api.line.me/v2/bot/message/push", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
		},
		body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
	});
	if (!res.ok) throw new Error(`LINE push failed: ${res.status} ${await res.text()}`);
}

const baht = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 0 });

export async function runEnergyAlerts(env: Env): Promise<void> {
	const supabase = createServiceClient(env);
	const now = Date.now();

	// ---- 1) voltage out-of-range (latest sample) ----
	const { data: latest } = await supabase
		.from("grid_samples")
		.select("ts,voltage_v")
		.order("ts", { ascending: false })
		.limit(1);
	const v = latest?.[0] ? Number(latest[0].voltage_v) : null;
	if (v != null && (v < VOLT_LO || v > VOLT_HI)) {
		if (!(await env.RATE_LIMIT_KV.get("alert:volt"))) {
			await pushLine(
				env,
				`⚡⚠️ แรงดันไฟผิดปกติ: ${v.toFixed(1)}V (เกณฑ์ ${VOLT_LO}–${VOLT_HI}V)\nตรวจสอบได้ที่ https://ai.napats.dev/energy`,
			);
			await env.RATE_LIMIT_KV.put("alert:volt", "1", { expirationTtl: VOLT_THROTTLE_S });
		}
	}

	// ---- 2) daily digest (once, at ≥22:00 BKK) ----
	const today = dayNum(now);
	if (hourOf(now) < DIGEST_HOUR) return;
	const digestKey = `alert:digest:${today}`;
	if (await env.RATE_LIMIT_KV.get(digestKey)) return;

	const { data: days } = await supabase
		.from("energy_daily")
		.select("day,total_kwh,on_kwh,off_kwh,baseload_kwh_min")
		.order("day", { ascending: false })
		.limit(9);
	const byDay = new Map((days ?? []).map((d) => [Number(d.day), d]));
	const t = byDay.get(today);
	if (!t) return; // no data yet — try again next tick

	const cost = (r: { on_kwh: unknown; off_kwh: unknown }) =>
		Number(r.on_kwh) * C.TOU_ON + Number(r.off_kwh) * C.TOU_OFF;
	const y = byDay.get(today - 1);
	const costT = cost(t);
	const lines = [
		`🏠 สรุปไฟวันนี้: ${Number(t.total_kwh).toFixed(2)} kWh ≈ ฿${baht(costT)} (TOU)`,
		`· On-Peak ${Number(t.on_kwh).toFixed(2)} · Off-Peak ${Number(t.off_kwh).toFixed(2)} kWh`,
	];
	if (y) {
		const costY = cost(y);
		const d = costY > 0 ? ((costT - costY) / costY) * 100 : 0;
		lines.push(`· เทียบเมื่อวาน (${Number(y.total_kwh).toFixed(2)} kWh ฿${baht(costY)}): ${d >= 0 ? "+" : ""}${d.toFixed(0)}%`);
	}

	// baseload creep: yesterday's overnight minimum vs prior-7-day average
	const yBase = y?.baseload_kwh_min != null ? Number(y.baseload_kwh_min) : null;
	if (yBase != null) {
		const prior = (days ?? [])
			.filter((d) => Number(d.day) < today - 1 && d.baseload_kwh_min != null)
			.map((d) => Number(d.baseload_kwh_min));
		if (prior.length >= 3) {
			const avg = prior.reduce((s, x) => s + x, 0) / prior.length;
			if (yBase > avg * 1.5 && yBase - avg > 0.05) {
				lines.push(
					`⚠️ Baseload เมื่อวานสูงผิดปกติ: ${yBase.toFixed(2)} kWh/ชม. (เฉลี่ยก่อนหน้า ${avg.toFixed(2)}) — มีอะไรเปิดทิ้งไว้หรือเปล่า?`,
				);
			}
		}
	}

	await pushLine(env, lines.join("\n"));
	await env.RATE_LIMIT_KV.put(digestKey, "1", { expirationTtl: 2 * 86400 });
}
