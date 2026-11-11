/**
 * ThinkPad LINE alerts + retention, run from the every-5-min cron (workers/app.ts).
 * Incident state lives in KV so each incident is pushed once on start and
 * once on recovery; it is saved only after every push succeeded, so a failed
 * LINE call is retried on the next tick instead of being lost.
 *
 * Pushes: offline (with a power-cut / home-internet hint from the house
 * meter), VPN or KBS QAS API down, Windows Update restart pending, ThinkPad
 * restarted, VPN session about to hit its usual length, and a weekday 08:00
 * digest.
 */
import { pushLine } from "./energy-alerts.server";
import {
	buildDigest,
	digestKey,
	evaluateAlerts,
	evaluateReboot,
	evaluateVpnExpiry,
	isDigestTime,
	willRaiseOffline,
} from "./thinkpad-alerts";
import { predictVpnEnd } from "./thinkpad-history";
import { INTERNET_CHECK_LABEL, type ThinkpadPayload } from "./thinkpad-schema";
import { getStore } from "./thinkpad-store.server";
import { ALERT_STATE_KEY, homeMeterOnline, loadStatusView, readAlertState, RUNS_WINDOW_MS } from "./thinkpad-view.server";

const RECENT_MS = 60 * 60_000;
const RETENTION_MS = 14 * 86400_000;

export async function runThinkpadAlerts(env: Env): Promise<{ messages: number }> {
	const store = getStore(env);
	const now = Date.now();
	const [latest, recent, prev, runs] = await Promise.all([
		store.latest("thinkpad"),
		store.history("thinkpad", now - RECENT_MS),
		readAlertState(env.RATE_LIMIT_KV),
		store.runs(now - RUNS_WINDOW_MS).catch(() => []),
	]);
	const lastSeen = latest?.received_at ?? null;
	const internet = latest ? (latest.payload as ThinkpadPayload).checks?.find((c) => c.label === INTERNET_CHECK_LABEL) : undefined;
	const ctx = {
		homeMeterOnline: willRaiseOffline(now, lastSeen, prev) ? await homeMeterOnline(env) : undefined,
		internetOk: internet ? internet.ok : null,
	};

	const a = evaluateAlerts(now, lastSeen, recent, prev, ctx);
	const b = evaluateReboot(a.state, latest, now);
	const c = evaluateVpnExpiry(b.state, predictVpnEnd(runs, now), now);
	const messages = [...a.messages, ...b.messages, ...c.messages];
	for (const m of messages) await pushLine(env, m);
	if (JSON.stringify(c.state) !== JSON.stringify(prev)) {
		await env.RATE_LIMIT_KV.put(ALERT_STATE_KEY, JSON.stringify(c.state));
	}

	// weekday 08:00 BKK digest, once a day
	let sent = messages.length;
	if (lastSeen != null && isDigestTime(now)) {
		const key = digestKey(now);
		if (!(await env.RATE_LIMIT_KV.get(key))) {
			await pushLine(env, buildDigest(await loadStatusView(env)));
			await env.RATE_LIMIT_KV.put(key, "1", { expirationTtl: 2 * 86400 });
			sent++;
		}
	}

	// retention: once an hour
	const purgeKey = `thinkpad:purge:${Math.floor(now / 3600_000)}`;
	if (!(await env.RATE_LIMIT_KV.get(purgeKey))) {
		await store.purge(now - RETENTION_MS);
		await env.RATE_LIMIT_KV.put(purgeKey, "1", { expirationTtl: 2 * 3600 });
	}
	return { messages: sent };
}
