/**
 * Payloads the /thinkpad reporters POST to /api/thinkpad/report.
 *
 * The repo is public and the page must never show internal host names, so the
 * schema itself is the guard: every object is strict (unknown keys → 400) and
 * labels may not contain "." / ":" / "/" — a host name, IP or URL cannot be
 * smuggled in as a label. Reporters map hosts to labels on their own machine.
 */
import { z } from "zod";

/** Short human label, e.g. "KBS QAS API". No dots/colons/slashes on purpose. */
export const labelSchema = z
	.string()
	.min(1)
	.max(40)
	.regex(/^[A-Za-z0-9฀-๿ _()\-]+$/, "label must not look like a host, IP or URL");

const isoTime = z.iso.datetime({ offset: true });
const ms = z.number().int().min(0).max(600_000);
const httpStatus = z.number().int().min(100).max(599);

export const thinkpadCheckSchema = z.strictObject({
	label: labelSchema,
	kind: z.enum(["https", "tcp"]),
	ok: z.boolean(),
	dns_ok: z.boolean(),
	tcp_ok: z.boolean(),
	latency_ms: ms.nullable(),
	http_status: httpStatus.nullable(),
});

export const thinkpadPayloadSchema = z.strictObject({
	v: z.literal(1),
	reported_at: isoTime,
	uptime_s: z.number().int().min(0),
	power: z.strictObject({
		on_ac: z.boolean().nullable(),
		battery_present: z.boolean(),
		battery_pct: z.number().int().min(0).max(100).nullable(),
		/** STANDBYIDLE on AC in seconds; 0 = Never */
		sleep_ac_s: z.number().int().min(0).nullable(),
		/** HIBERNATEIDLE on AC in seconds; 0 = Never */
		hibernate_ac_s: z.number().int().min(0).nullable(),
	}),
	vpn: z.strictObject({
		adapter_found: z.boolean(),
		up: z.boolean(),
		has_ipv4: z.boolean(),
	}),
	checks: z.array(thinkpadCheckSchema).max(20),
	/** Windows Update restart state (read from the registry); optional for older reporters */
	windows_update: z
		.strictObject({
			reboot_required: z.boolean(),
			active_hours: z.strictObject({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) }).nullable(),
		})
		.optional(),
	/** Wi-Fi link (no SSID); optional for older reporters */
	wifi: z
		.strictObject({
			connected: z.boolean(),
			signal_pct: z.number().int().min(0).max(100).nullable(),
			rx_mbps: z.number().int().min(0).max(100_000).nullable(),
		})
		.optional(),
	duration_ms: ms,
});

export const macPayloadSchema = z.strictObject({
	v: z.literal(1),
	reported_at: isoTime,
	tailscale: z.strictObject({
		running: z.boolean(),
		peer_online: z.boolean().nullable(),
	}),
	ssh: z
		.array(
			z.strictObject({
				label: labelSchema,
				ok: z.boolean(),
				latency_ms: ms.nullable(),
			}),
		)
		.max(5),
	ports: z
		.array(
			z.strictObject({
				port: z.number().int().min(1).max(65535),
				listening: z.boolean(),
				/** the listener is an ssh process whose target is the ThinkPad */
				via_thinkpad: z.boolean(),
			}),
		)
		.max(10),
	socks: z
		.array(
			z.strictObject({
				label: labelSchema,
				ok: z.boolean(),
				http_status: httpStatus.nullable(),
				latency_ms: ms.nullable(),
			}),
		)
		.max(10),
	duration_ms: ms,
});

export type ThinkpadPayload = z.infer<typeof thinkpadPayloadSchema>;
export type MacPayload = z.infer<typeof macPayloadSchema>;
export type DeviceSource = "thinkpad" | "mac";

/** Label of the check whose failure counts toward the "VPN/KBS down" alert. */
export const KEY_CHECK_LABEL = "KBS QAS API";
/** Optional public-internet check; tells "home internet down" from "VPN down". */
export const INTERNET_CHECK_LABEL = "Internet";

/** Max accepted request body (bytes). A real payload is well under 2 KB. */
export const MAX_BODY_BYTES = 16 * 1024;

export function parsePayload(
	source: DeviceSource,
	body: unknown,
): { ok: true; payload: ThinkpadPayload | MacPayload } | { ok: false; error: string } {
	const r = (source === "thinkpad" ? thinkpadPayloadSchema : macPayloadSchema).safeParse(body);
	if (r.success) return { ok: true, payload: r.data };
	// path + message only — never echo the offending value back
	const issue = r.error.issues[0];
	return { ok: false, error: `${issue.path.join(".") || "(root)"}: ${issue.message}` };
}

/** Columns copied out of a thinkpad payload for history/alerts. */
export function summarize(p: ThinkpadPayload): { vpn_up: boolean; kbs_ok: boolean | null } {
	const key = p.checks.find((c) => c.label === KEY_CHECK_LABEL);
	return { vpn_up: p.vpn.up && p.vpn.has_ipv4, kbs_ok: key ? key.ok : null };
}
