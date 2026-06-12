/**
 * Proactive LINE alerts, run from the same every-15-min cron after
 * sync + rollup. (The old LINE approve/deny "Claude noti" webhook flow was
 * removed — this push-only path is the sole remaining LINE integration.)
 *
 *  1. Voltage out-of-range — latest grid sample beyond 220V ±10% (198–242V).
 *     Throttled to one alert per 6 h via KV so a long sag doesn't spam.
 *  2. Daily digest at ≥22:00 BKK (after evening peak ends) — today's kWh/฿
 *     vs yesterday, plus a baseload-creep warning when yesterday's overnight
 *     minimum jumped ≥1.5× above the prior-week average (fridge dying,
 *     something left on, …). Sent once per day via KV marker.
 *  3. TOU period summary — when a TOU block ends (weekday 09:00 = overnight/
 *     weekend off-peak done; 22:00 = on-peak done), push that block's kWh + ฿,
 *     week-over-week same-window compare, the flat-ladder equivalent, and
 *     what the next block costs. One KV marker per block per day.
 *
 * LINE_CHANNEL_ACCESS_TOKEN already exists on the worker; pushes also need
 * LINE_USER_ID (the owner's userId) — until it's set every push is a logged
 * no-op, so the cron stays healthy before setup:
 *   npx wrangler secret put LINE_USER_ID
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ENERGY_CONST as C, dayNum, flatAvgRate, hourOf, weekdayOf } from "./energy-calc";
import { createServiceClient } from "./supabase.server";

const VOLT_LO = 198; // 220V −10%
const VOLT_HI = 242; // 220V +10%
const VOLT_THROTTLE_S = 6 * 3600;
const DIGEST_HOUR = 22; // BKK

async function pushLine(env: Env, text: string): Promise<void> {
	const to = env.LINE_USER_ID;
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

/** epoch ms of BKK day `d` at hour `h` (mirrors rollupOne's midnight math) */
const bkkMs = (d: number, h: number) => (d * 24 + h) * 3600_000 - 7 * 3600_000;

/** kWh attributed inside [startMs, endMs) from the cumulative counter — same
 *  rules as rollupOne: positive diffs, gap ≤ 2 h, attributed to the LATER
 *  point. Returns null when the window has no usable readings (sync outage)
 *  so the caller can retry on a later tick instead of reporting a false 0. */
async function windowKwh(
	supabase: SupabaseClient,
	startMs: number,
	endMs: number,
): Promise<number | null> {
	const { data, error } = await supabase
		.from("energy_readings")
		.select("event_time,value")
		.gte("event_time", startMs - C.MAX_GAP_MS) // prior context for the first diff
		.lt("event_time", endMs)
		.order("event_time", { ascending: true });
	if (error || !data || data.length < 2) return null;
	let kwh = 0;
	let inWindow = false;
	for (let i = 1; i < data.length; i++) {
		const tPrev = Number(data[i - 1].event_time);
		const t = Number(data[i].event_time);
		if (t < startMs) continue;
		inWindow = true;
		const d = (Number(data[i].value) - Number(data[i - 1].value)) * C.SCALE;
		if (d <= 0 || t - tPrev > C.MAX_GAP_MS) continue;
		kwh += d;
	}
	return inWindow ? kwh : null;
}

/** TOU block boundaries (weekdays only): 09:00 closes the off-peak block that
 *  started at the previous weekday's 22:00 (Friday's for Monday — the whole
 *  weekend is one off-peak block); 22:00 closes the day's on-peak block. */
async function touPeriodSummary(env: Env, supabase: SupabaseClient, now: number): Promise<void> {
	const today = dayNum(now);
	const wd = weekdayOf(today);
	const h = hourOf(now);
	if (wd >= 5) return; // Sat/Sun: inside the weekend off-peak block — no boundary

	let key: string;
	let label: string;
	let rate: number;
	let start: number;
	let end: number;
	let next: string;
	if (h >= 9 && h < 22) {
		let prevWd = today - 1;
		while (weekdayOf(prevWd) >= 5) prevWd -= 1;
		start = bkkMs(prevWd, 22);
		end = bkkMs(today, 9);
		key = `alert:tou:${today}:off`;
		label = wd === 0 ? "Off-Peak สุดสัปดาห์ (ศ. 22:00 → จ. 09:00)" : "Off-Peak กลางคืน (22:00–09:00)";
		rate = C.TOU_OFF;
		next = `ตอนนี้ On-Peak ฿${C.TOU_ON}/kWh ถึง 22:00 — โหลดหนักเลื่อนได้ให้เลื่อน`;
	} else if (h >= 22) {
		start = bkkMs(today, 9);
		end = bkkMs(today, 22);
		key = `alert:tou:${today}:on`;
		label = "On-Peak (จ–ศ 09:00–22:00)";
		rate = C.TOU_ON;
		next = `ตอนนี้ Off-Peak ฿${C.TOU_OFF}/kWh ถึง ${wd === 4 ? "จ." : "พรุ่งนี้"} 09:00 — เหมาะรันเครื่องซักผ้า/ชาร์จ`;
	} else {
		return; // 00:00–08:59 — ยังอยู่ในบล็อก off-peak เดิม
	}

	if (await env.RATE_LIMIT_KV.get(key)) return;
	const kwh = await windowKwh(supabase, start, end);
	if (kwh == null) return; // ข้อมูลยังไม่เข้า — ลองใหม่ tick หน้า (marker ยังไม่ถูกตั้ง)

	// flat-ladder equivalent uses the same avg-at-monthly-volume convention as savingsTrack
	const flatRate = flatAvgRate(C.MEA_MONTHLY_KWH);
	const lines = [
		`⏱ จบช่วง ${label}`,
		`· ใช้ไป ${kwh.toFixed(2)} kWh ≈ ฿${baht(kwh * rate)} (TOU ฿${rate}/kWh)`,
		`· ถ้าคิดแบบ Flat ขั้นบันได ≈ ฿${baht(kwh * flatRate)} (เฉลี่ย ฿${flatRate.toFixed(2)}/kWh)`,
	];
	// same window one week earlier = identical weekday shape → fair compare
	const prevKwh = await windowKwh(supabase, start - 7 * 86400_000, end - 7 * 86400_000);
	if (prevKwh != null && prevKwh > 0) {
		const d = ((kwh - prevKwh) / prevKwh) * 100;
		lines.push(`· เทียบสัปดาห์ก่อนช่วงเดียวกัน (${prevKwh.toFixed(2)} kWh): ${d >= 0 ? "+" : ""}${d.toFixed(0)}%`);
	}
	lines.push(`→ ${next}`);
	await pushLine(env, lines.join("\n"));
	await env.RATE_LIMIT_KV.put(key, "1", { expirationTtl: 2 * 86400 });
}

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

	// ---- 2) TOU period summary (weekday 09:00 / 22:00 boundaries) ----
	await touPeriodSummary(env, supabase, now);

	// ---- 3) daily digest (once, at ≥22:00 BKK) ----
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
