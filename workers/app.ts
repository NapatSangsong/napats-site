import { createRequestHandler } from "react-router";
import { runEnergyAlerts } from "../app/lib/energy-alerts.server";
import { rollupDaily, sampleGrid } from "../app/lib/energy-rollup.server";
import { syncEnergyReadings } from "../app/lib/energy-sync.server";

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
	scheduled(_controller, env, ctx) {
		// sequential: rollup must see the rows sync just wrote; each step is
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
