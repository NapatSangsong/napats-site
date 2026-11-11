import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/thinkpad";
import "~/styles/thinkpad.css";
import { thinkpadGate } from "~/lib/thinkpad-auth.server";
import type { StatusView } from "~/lib/thinkpad-status";
import { loadStatusView } from "~/lib/thinkpad-view.server";

export const meta: Route.MetaFunction = () => [
	{ title: "ThinkPad · VPN" },
	{ name: "robots", content: "noindex, nofollow" },
];

export const links: Route.LinksFunction = () => [
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Anuphan:wght@400;600;700&family=IBM+Plex+Mono:wght@500&display=swap",
	},
];

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	await thinkpadGate.pageGate(request, env.THINKPAD_PAGE_KEY, "/thinkpad");
	try {
		return { view: await loadStatusView(env), error: null as string | null };
	} catch (e) {
		console.error("[thinkpad-page]", e instanceof Error ? e.message : String(e));
		return { view: null, error: "อ่านข้อมูลไม่ได้" };
	}
}

const POLL_MS = 30_000;

// ---------- formatting ----------
const TZ = "Asia/Bangkok";
const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayKey = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
const when = (ms: number, now: number) =>
	dayKey(ms) === dayKey(now)
		? clock(ms)
		: `${new Date(ms).toLocaleDateString("th-TH", { timeZone: TZ, day: "numeric", month: "short" })} ${clock(ms)}`;

function dur(totalS: number): string {
	const s = Math.max(0, Math.floor(totalS));
	const d = Math.floor(s / 86400);
	const h = Math.floor((s % 86400) / 3600);
	const m = Math.floor((s % 3600) / 60);
	if (d > 0) return `${d} วัน ${h} ชม.`;
	if (h > 0) return `${h} ชม. ${m} นาที`;
	if (m > 0) return `${m} นาที`;
	return `${s} วินาที`;
}
const ago = (ms: number) => (ms < 60_000 ? "เมื่อสักครู่" : `${dur(ms / 1000)}ที่แล้ว`);

type Tone = "ok" | "warn" | "bad" | "off";
const Dot = ({ tone }: { tone: Tone }) => <span className={`tp-dot c-${tone}`} />;
const Pill = ({ tone, children }: { tone: Tone; children: React.ReactNode }) => (
	<span className={`tp-pill ${tone}`}>{children}</span>
);
function Row({ k, children }: { k: React.ReactNode; children: React.ReactNode }) {
	return (
		<div className="tp-row">
			<span className="k">{k}</span>
			<span className="v">{children}</span>
		</div>
	);
}
const Ms = ({ v }: { v: number | null }) => (v == null ? null : <span className="tp-mono">{v} ms</span>);

const PORT_LABEL: Record<number, string> = { 1080: "SOCKS 1080", 1433: "SQL QAS 1433", 1434: "SQL PRD 1434" };

// ---------- page ----------
export default function ThinkpadPage({ loaderData }: Route.ComponentProps) {
	const [view, setView] = useState<StatusView | null>(loaderData.view);
	const [error, setError] = useState<string | null>(loaderData.error);
	// "now" on the server clock: view.now + time since that view arrived
	const fetchedAt = useRef<number | null>(null);
	const viewNow = useRef<number | null>(loaderData.view?.now ?? null);
	const [now, setNow] = useState<number>(loaderData.view?.now ?? 0);

	useEffect(() => {
		fetchedAt.current = Date.now();
		let alive = true;
		const poll = async () => {
			try {
				const res = await fetch("/api/thinkpad/status", { cache: "no-store" });
				const body = (await res.json()) as { ok: boolean; view?: StatusView };
				if (!alive) return;
				if (!res.ok || !body.ok || !body.view) throw new Error(String(res.status));
				fetchedAt.current = Date.now();
				viewNow.current = body.view.now;
				setView(body.view);
				setNow(body.view.now);
				setError(null);
			} catch {
				if (alive) setError("รีเฟรชไม่สำเร็จ — แสดงข้อมูลล่าสุดที่มี");
			}
		};
		const pollId = setInterval(poll, POLL_MS);
		const tickId = setInterval(() => {
			if (viewNow.current != null && fetchedAt.current != null) setNow(viewNow.current + (Date.now() - fetchedAt.current));
		}, 5_000);
		const onVisible = () => document.visibilityState === "visible" && poll();
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			alive = false;
			clearInterval(pollId);
			clearInterval(tickId);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, []);

	return (
		<div className="tp">
			<div className="tp-wrap">
				<div className="tp-head">
					<h1>ThinkPad · VPN</h1>
					<span className="tp-sub">{view ? `อัปเดต ${clock(view.now)} · รีเฟรชทุก 30 วินาที` : ""}</span>
				</div>
				{error && <div className="tp-banner warn">{error}</div>}
				{view && <Body view={view} now={now} />}
			</div>
		</div>
	);
}

function Body({ view, now }: { view: StatusView; now: number }) {
	const tp = view.thinkpad;
	const a = view.alerts;
	return (
		<>
			{a.offline_since != null && (
				<div className="tp-banner bad">แจ้ง LINE แล้ว: ThinkPad หายไปตั้งแต่ {when(a.offline_since, now)}</div>
			)}
			{a.degraded_since != null && (
				<div className="tp-banner bad">
					แจ้ง LINE แล้ว: {a.degraded_kind === "vpn" ? "VPN หลุด" : "KBS QAS API เข้าไม่ได้"} ตั้งแต่{" "}
					{when(a.degraded_since, now)}
				</div>
			)}
			<Hero view={view} now={now} />
			<div className="tp-grid">
				{tp && <ThinkpadCard tp={tp} now={now} />}
				{tp && <VpnCard tp={tp} now={now} />}
				{tp && <ReachCard tp={tp} now={now} />}
				<MacCard mac={view.mac} now={now} />
			</div>
			<Timeline view={view} />
		</>
	);
}

function Hero({ view, now }: { view: StatusView; now: number }) {
	const tp = view.thinkpad;
	let tone: Tone = "off";
	let title = "ThinkPad ยังไม่เคยรายงาน";
	let sub = "ยังไม่ได้ติดตั้ง reporter บน ThinkPad";
	if (tp) {
		const age = now - tp.last_seen;
		if (!tp.online) {
			tone = "bad";
			title = "ThinkPad ออฟไลน์";
			sub = `heartbeat ล่าสุด ${when(tp.last_seen, now)} (${ago(age)})`;
		} else {
			const vpnOk = tp.data.vpn.up && tp.data.vpn.has_ipv4;
			const failing = tp.data.checks.filter((c) => !c.ok);
			tone = !vpnOk ? "bad" : failing.length ? "warn" : "ok";
			title = !vpnOk
				? "ออนไลน์ · VPN หลุด"
				: failing.length
					? `ออนไลน์ · VPN ต่ออยู่ · เข้าไม่ได้ ${failing.length} ระบบ`
					: "ออนไลน์ · VPN ต่ออยู่ · ทุกระบบเข้าได้";
			sub = `heartbeat ล่าสุด ${ago(age)}`;
		}
	}
	return (
		<div className="tp-hero">
			<span className={`tp-hero-dot c-${tone}`} />
			<div>
				<div className="tp-hero-title">{title}</div>
				<div className="tp-hero-sub">{sub}</div>
			</div>
		</div>
	);
}

type Tp = NonNullable<StatusView["thinkpad"]>;

function staleNote(tp: Tp, now: number) {
	return tp.online ? null : <p className="tp-note">ค่าล่าสุดก่อนออฟไลน์ ({when(tp.last_seen, now)})</p>;
}

function ThinkpadCard({ tp, now }: { tp: Tp; now: number }) {
	const p = tp.data.power;
	const sleep =
		p.sleep_ac_s === 0 ? (
			<Pill tone="ok">Never</Pill>
		) : p.sleep_ac_s == null ? (
			<Pill tone="warn">อ่านค่าไม่ได้</Pill>
		) : (
			<Pill tone="warn">{dur(p.sleep_ac_s)} · ควรเป็น Never</Pill>
		);
	const uptimeNow = tp.data.uptime_s + (tp.online ? (now - tp.last_seen) / 1000 : 0);
	return (
		<div className={`tp-card${tp.online ? "" : " dim"}`}>
			<h2>
				ThinkPad <Pill tone={tp.online ? "ok" : "bad"}>{tp.online ? "online" : "offline"}</Pill>
			</h2>
			{staleNote(tp, now)}
			<div className="tp-rows">
				<Row k="เห็นล่าสุด">
					{when(tp.last_seen, now)} <span className="tp-mono">{ago(now - tp.last_seen)}</span>
				</Row>
				<Row k="Uptime">{dur(uptimeNow)}</Row>
				<Row k="ไฟ">{p.on_ac == null ? "—" : p.on_ac ? "เสียบไฟอยู่" : <Pill tone="warn">ใช้แบตเตอรี่</Pill>}</Row>
				<Row k="แบตเตอรี่">
					{p.battery_present ? (
						`${p.battery_pct ?? "—"}%${p.on_ac ? " · ชาร์จอยู่" : ""}`
					) : (
						<span className="tp-mono">ไม่พบแบตเตอรี่</span>
					)}
				</Row>
				<Row k="Sleep เมื่อเสียบไฟ">{sleep}</Row>
				{p.hibernate_ac_s != null && p.hibernate_ac_s !== 0 && (
					<Row k="Hibernate เมื่อเสียบไฟ">
						<Pill tone="warn">{dur(p.hibernate_ac_s)} · ควรเป็น Never</Pill>
					</Row>
				)}
			</div>
		</div>
	);
}

function VpnCard({ tp, now }: { tp: Tp; now: number }) {
	const v = tp.data.vpn;
	const up = v.up && v.has_ipv4;
	return (
		<div className={`tp-card${tp.online ? "" : " dim"}`}>
			<h2>
				VPN (Cisco) <Pill tone={up ? "ok" : "bad"}>{up ? "ต่ออยู่" : "ไม่ได้ต่อ"}</Pill>
			</h2>
			{staleNote(tp, now)}
			<div className="tp-rows">
				<Row k="Adapter">{!v.adapter_found ? <Pill tone="bad">ไม่พบ</Pill> : v.up ? "Up" : <Pill tone="bad">Down</Pill>}</Row>
				<Row k="มี IPv4">{v.has_ipv4 ? "มี" : <Pill tone="bad">ไม่มี</Pill>}</Row>
				<Row k="ต่อมาตั้งแต่">
					{tp.vpn_since
						? `${tp.vpn_since.truncated ? "ก่อน " : ""}${when(tp.vpn_since.since, now)} (${dur((now - tp.vpn_since.since) / 1000)}${tp.vpn_since.truncated ? "+" : ""})`
						: "—"}
				</Row>
			</div>
		</div>
	);
}

function ReachCard({ tp, now }: { tp: Tp; now: number }) {
	const checks = tp.data.checks;
	return (
		<div className={`tp-card${tp.online ? "" : " dim"}`}>
			<h2>
				เข้าถึงระบบภายใน (จาก ThinkPad)
				<span className="tp-mono">{tp.data.duration_ms} ms</span>
			</h2>
			{staleNote(tp, now)}
			<div className="tp-rows">
				{checks.length === 0 && <Row k="—">ไม่มีเป้าหมาย</Row>}
				{checks.map((c) => (
					<Row
						key={c.label}
						k={
							<>
								<Dot tone={c.ok ? "ok" : "bad"} /> {c.label}
							</>
						}
					>
						{!c.ok && <Pill tone="bad">{!c.dns_ok ? "DNS" : !c.tcp_ok ? "TCP" : (c.http_status ?? "HTTP")}</Pill>}
						{c.ok && c.http_status != null && <span className="tp-mono">{c.http_status}</span>}
						<Ms v={c.latency_ms} />
					</Row>
				))}
			</div>
		</div>
	);
}

function MacCard({ mac, now }: { mac: StatusView["mac"]; now: number }) {
	if (!mac) {
		return (
			<div className="tp-card">
				<h2>
					Mac <Pill tone="off">ไม่มีข้อมูล</Pill>
				</h2>
				<p className="tp-note">ยังไม่เคยรายงาน (ยังไม่ได้ติดตั้ง Mac reporter)</p>
			</div>
		);
	}
	const d = mac.data;
	return (
		<div className={`tp-card${mac.reporting ? "" : " dim"}`}>
			<h2>
				Mac{" "}
				<Pill tone={mac.reporting ? "ok" : "off"}>{mac.reporting ? "รายงานอยู่" : "Mac ไม่ได้รายงาน"}</Pill>
			</h2>
			{!mac.reporting && (
				<p className="tp-note">
					ล่าสุด {when(mac.last_seen, now)} ({ago(now - mac.last_seen)}) — ปิดหรือหลับอยู่ ค่าด้านล่างเป็นค่าเก่า
				</p>
			)}
			<div className="tp-rows">
				<Row k="Tailscale">{d.tailscale.running ? "ทำงาน" : <Pill tone="bad">ไม่ทำงาน</Pill>}</Row>
				<Row k="ThinkPad peer">
					{d.tailscale.peer_online == null ? "—" : d.tailscale.peer_online ? "online" : <Pill tone="bad">offline</Pill>}
				</Row>
				{d.ssh.map((s) => (
					<Row
						key={`ssh-${s.label}`}
						k={
							<>
								<Dot tone={s.ok ? "ok" : "bad"} /> ssh {s.label}
							</>
						}
					>
						{s.ok ? "เข้าได้" : <Pill tone="bad">เข้าไม่ได้</Pill>}
						<Ms v={s.latency_ms} />
					</Row>
				))}
				{d.ports.map((p) => {
					const tone: Tone = p.listening && p.via_thinkpad ? "ok" : p.listening ? "warn" : "off";
					return (
						<Row
							key={`port-${p.port}`}
							k={
								<>
									<Dot tone={tone} /> tunnel {PORT_LABEL[p.port] ?? p.port}
								</>
							}
						>
							{p.listening ? (p.via_thinkpad ? "เปิดอยู่" : <Pill tone="warn">ไม่ใช่ ssh ไป ThinkPad</Pill>) : <Pill tone="off">ปิด</Pill>}
						</Row>
					);
				})}
				{d.socks.map((s) => (
					<Row
						key={`socks-${s.label}`}
						k={
							<>
								<Dot tone={s.ok ? "ok" : "bad"} /> SOCKS → {s.label}
							</>
						}
					>
						{s.http_status != null ? <span className="tp-mono">{s.http_status}</span> : !s.ok && <Pill tone="bad">fail</Pill>}
						<Ms v={s.latency_ms} />
					</Row>
				))}
			</div>
		</div>
	);
}

const BUCKET_TONE = { ok: "ok", mixed: "warn", novpn: "bad", off: "off" } as const;

function Timeline({ view }: { view: StatusView }) {
	const { start, bucketMs, states } = view.timeline;
	const span = bucketMs * states.length;
	// a tick every 6 h on the BKK clock
	const ticks: number[] = [];
	const sixH = 6 * 3600_000;
	const bkkOffset = 7 * 3600_000;
	for (let t = Math.ceil((start + bkkOffset) / sixH) * sixH - bkkOffset; t <= start + span; t += sixH) {
		const pos = (t - start) / span;
		if (pos > 0.04 && pos < 0.96) ticks.push(t); // keep labels inside the card on phones
	}
	return (
		<div className="tp-card tp-tl">
			<h2>24 ชั่วโมงที่ผ่านมา (ช่องละ 5 นาที)</h2>
			<div className="tp-bar" role="img" aria-label="ประวัติ online/VPN 24 ชั่วโมง">
				{states.map((s, i) => (
					<span
						key={i}
						className={`c-${BUCKET_TONE[s]}`}
						title={`${clock(start + i * bucketMs)} — ${s === "ok" ? "VPN ต่ออยู่" : s === "mixed" ? "VPN ขาดบางช่วง" : s === "novpn" ? "online แต่ VPN หลุด" : "ไม่มี heartbeat"}`}
					/>
				))}
			</div>
			<div className="tp-ticks">
				{ticks.map((t) => (
					<span key={t} style={{ left: `${((t - start) / span) * 100}%` }}>
						{clock(t)}
					</span>
				))}
			</div>
			<div className="tp-legend">
				<span>
					<Dot tone="ok" /> online + VPN
				</span>
				<span>
					<Dot tone="warn" /> VPN ขาดบางช่วง
				</span>
				<span>
					<Dot tone="bad" /> online แต่ VPN หลุด
				</span>
				<span>
					<Dot tone="off" /> ไม่มี heartbeat
				</span>
			</div>
		</div>
	);
}
