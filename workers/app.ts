import { createRequestHandler } from "react-router";
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
		ctx.waitUntil(
			syncEnergyReadings(env)
				.then((r) => console.log(`[energy-sync] ${r.fetched} rows (${new Date(r.start).toISOString()} → ${new Date(r.end).toISOString()})`))
				.catch((e) => console.error("[energy-sync]", e)),
		);
	},
} satisfies ExportedHandler<Env>;
