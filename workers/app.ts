import { createRequestHandler } from "react-router";
import { runEnergyAlerts } from "../app/lib/energy-alerts.server";
import { rollupDaily, sampleGrid } from "../app/lib/energy-rollup.server";
import { syncEnergyReadings } from "../app/lib/energy-sync.server";
import { runThinkpadAlerts } from "../app/lib/thinkpad-alerts.server";

const THINKPAD_CRON = "*/5 * * * *"; // must match wrangler.json triggers.crons

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

export default {
	fetch(request, env, ctx) {
		return requestHandler(request, {
			cloudflare: { env, ctx },
		});
	},
	scheduled(controller, env, ctx) {
		// */5: ThinkPad heartbeat/VPN alerts only (needs faster detection than 15 min)
		if (controller.cron === THINKPAD_CRON) {
			ctx.waitUntil(
				runThinkpadAlerts(env)
					.then((r) => r.messages && console.log(`[thinkpad-alerts] pushed ${r.messages}`))
					.catch((e) => console.error("[thinkpad-alerts]", e instanceof Error ? e.message : String(e))),
			);
			return;
		}
		// */15: energy. sequential: rollup must see the rows sync just wrote; each step is
		// isolated so one failure doesn't stop the others
		ctx.waitUntil(
			(async () => {
				await syncEnergyReadings(env)
					.then((r) => console.log(`[energy-sync] ${r.fetched} rows (${new Date(r.start).toISOString()} → ${new Date(r.end).toISOString()})`))
					.catch((e) => console.error("[energy-sync]", e));
				await sampleGrid(env)
					.then(() => console.log("[grid-sample] ok"))
					.catch((e) => console.error("[grid-sample]", e));
				await rollupDaily(env)
					.then((r) => console.log(`[rollup] ${r.days} day(s)`))
					.catch((e) => console.error("[rollup]", e));
				await runEnergyAlerts(env).catch((e) => console.error("[alerts]", e));
			})(),
		);
	},
} satisfies ExportedHandler<Env>;
