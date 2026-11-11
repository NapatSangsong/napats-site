import { readAlertState } from "./thinkpad-alerts.server";
import { buildView, timelineStart, type StatusView } from "./thinkpad-status";
import { getStore } from "./thinkpad-store.server";

/** Everything the /thinkpad page shows, read in parallel. */
export async function loadStatusView(env: Env): Promise<StatusView> {
	const store = getStore(env);
	const now = Date.now();
	const [thinkpad, mac, history, alerts] = await Promise.all([
		store.latest("thinkpad"),
		store.latest("mac"),
		store.history("thinkpad", timelineStart(now)),
		readAlertState(env.RATE_LIMIT_KV),
	]);
	return buildView({ now, thinkpad, mac, history, alerts });
}
