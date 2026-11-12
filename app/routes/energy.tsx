import { BatteryCharging, CalendarClock, Cloud, CloudSun, Info, Sun, TriangleAlert, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { data, redirect, useRevalidator } from "react-router";
import type { Route } from "./+types/energy";
import "~/styles/energy-v2.css";
import { BacktestChart, HistoryChart, TodayChart, useChartColors } from "~/components/energy-v2/Charts";
import { Flow } from "~/components/energy-v2/Flow";
import { ago, baht, hhmm, kwh, n0, n1, n2, thDate, thMonth, thShort } from "~/components/energy-v2/format";
import type { LiveReading } from "~/lib/bluering.server";
import { BlueringAuthError } from "~/lib/bluering.server";
import { ENERGY_PUBLIC, gateCookie, keyHash, requireEnergyAuth, safeEqual } from "~/lib/energy-gate.server";
import { type EnergyView, getView } from "~/lib/energy-model.server";

export const meta: Route.MetaFunction = () => [
	{ title: "พลังงานบ้าน" },
	{ name: "robots", content: "noindex, nofollow" },
	{ name: "theme-color", media: "(prefers-color-scheme: light)", content: "#f4f4f1" },
	{ name: "theme-color", media: "(prefers-color-scheme: dark)", content: "#0d0d0d" },
	{ name: "apple-mobile-web-app-capable", content: "yes" },
	{ name: "mobile-web-app-capable", content: "yes" },
	{ name: "apple-mobile-web-app-title", content: "พลังงาน" },
	{ name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
];

export const links: Route.LinksFunction = () => [
	{ rel: "manifest", href: "/energy.webmanifest" },
	{ rel: "apple-touch-icon", href: "/energy-icon-180.png" },
	{ rel: "icon", type: "image/svg+xml", href: "/energy-icon.svg" },
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Anuphan:wght@400;500;600;700&display=swap" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;
	if (!ENERGY_PUBLIC) {
		const key = new URL(request.url).searchParams.get("key");
		if (key !== null) {
			// correct key → set cookie and drop ?key= from the URL; wrong key → 404
			if (env.ENERGY_PAGE_KEY && safeEqual(key, env.ENERGY_PAGE_KEY)) {
				throw redirect("/energy", { headers: { "Set-Cookie": gateCookie(await keyHash(env)) } });
			}
			throw data(null, { status: 404 });
		}
		await requireEnergyAuth(request, env);
	}
	try {
		return { view: await getView(env, env.RATE_LIMIT_KV), error: null as null | "token_expired" | "error" };
	} catch (e) {
		console.error("[energy-page]", e instanceof Error ? e.message : String(e));
		return { view: null, error: e instanceof BlueringAuthError ? ("token_expired" as const) : ("error" as const) };
	}
}

const LIVE_POLL_MS = 60_000;
const VIEW_REFRESH_MS = 10 * 60_000;
const SLOT_MS = 15 * 60_000;

export default function EnergyPage({ loaderData }: Route.ComponentProps) {
	const { view, error } = loaderData;
	const root = useRef<HTMLDivElement>(null);
	const colors = useChartColors(root);
	const revalidator = useRevalidator();
	const [live, setLive] = useState<LiveReading | null>(view?.live ?? null);
	const [now, setNow] = useState(() => view?.generatedAt ?? 0);

	useEffect(() => setLive(view?.live ?? null), [view]);

	// live reading every minute while visible; the full model every 10 min
	useEffect(() => {
		let stopped = false;
		const pollLive = async () => {
			if (document.hidden) return;
			try {
				const res = await fetch("/api/energy/bluering", { cache: "no-store" });
				const j = (await res.json()) as { ok: boolean; live?: LiveReading | null };
				if (!stopped && j.ok && j.live) setLive(j.live);
			} catch {
				/* keep the last reading */
			}
		};
		setNow(Date.now());
		const tick = setInterval(() => setNow(Date.now()), 30_000);
		const liveId = setInterval(pollLive, LIVE_POLL_MS);
		const viewId = setInterval(() => !document.hidden && revalidator.revalidate(), VIEW_REFRESH_MS);
		const onVisible = () => {
			if (document.hidden) return;
			setNow(Date.now());
			pollLive();
			revalidator.revalidate();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			stopped = true;
			clearInterval(tick);
			clearInterval(liveId);
			clearInterval(viewId);
			document.removeEventListener("visibilitychange", onVisible);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (!view) {
		return (
			<div className="ev" ref={root}>
				<div className="ev-wrap">
					<header className="ev-top">
						<h1>พลังงานบ้าน</h1>
					</header>
					<div className="ev-banner bad">
						<TriangleAlert size={18} />
						<div>
							{error === "token_expired" ? (
								<>
									token ของ BlueRing หมดอายุ รัน <code>node tools/bluering/bluering.mjs login</code> แล้ว
									<code>wrangler secret put BLUERING_TOKEN</code>
								</>
							) : (
								"ดึงข้อมูลจาก BlueRing ไม่ได้ตอนนี้ ลองใหม่อีกครั้ง"
							)}
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="ev" ref={root}>
			<div className="ev-wrap">
				<Header view={view} live={live} now={now} refreshing={revalidator.state === "loading"} />
				<TokenWarning expiresAt={view.tokenExpiresAt} now={now} />
				<div className="ev-grid">
					<NowCard view={view} live={live} />
					<TodayCard view={view} colors={colors} />
					<CycleCard view={view} />
					<WeekCard view={view} />
					<InsightsCard view={view} />
					<HistoryCard view={view} colors={colors} />
					<MonthlyCard view={view} />
					<ModelCard view={view} colors={colors} />
				</div>
				<footer className="ev-foot">
					ข้อมูลวัดจริงจาก BlueRing · พยากรณ์อากาศจาก Open-Meteo · อัตรา TOU ตามที่ตั้งไว้ใน BlueRing ({n2(view.tariff.peak)}/
					{n2(view.tariff.offPeak)} ฿) + ค่าบริการ {n2(view.tariff.serviceThb)} ฿ · <a href="/energy/legacy">หน้าเดิม</a>
				</footer>
			</div>
		</div>
	);
}

// ---------------- header ----------------

function Header({ view, live, now, refreshing }: { view: EnergyView; live: LiveReading | null; now: number; refreshing: boolean }) {
	const end = live ? Date.parse(live.at) + SLOT_MS : null;
	const ageSec = end ? Math.max(0, (now - end) / 1000) : null;
	const stale = ageSec === null || ageSec > 40 * 60;
	return (
		<header className="ev-top">
			<div>
				<h1>พลังงานบ้าน</h1>
				<p className="ev-sub">
					โซลาร์ {n0(view.plant.capKw)} kW · {view.plant.inverters.length} ไมโครอินเวอร์เตอร์ · {view.plant.eaType.toUpperCase()}{" "}
					{view.plant.meterType === "tou" ? "TOU" : "ปกติ"}
				</p>
			</div>
			<span className={`ev-pill ${stale ? "stale" : ""} ${refreshing ? "busy" : ""}`} title="ข้อมูลมาเป็นช่วง 15 นาที ขึ้นระบบหลังจบช่วงราว 5 นาที">
				<span className="dot" />
				{live && end ? `${hhmm(Date.parse(live.at))}–${hhmm(end)} · ${ago(ageSec ?? 0)}` : "ยังไม่มีข้อมูลวันนี้"}
			</span>
		</header>
	);
}

function TokenWarning({ expiresAt, now }: { expiresAt: number | null; now: number }) {
	if (!expiresAt || !now) return null;
	const days = (expiresAt - now) / 86_400_000;
	if (days > 7) return null;
	return (
		<div className="ev-banner warn">
			<TriangleAlert size={18} />
			<div>
				token ของ BlueRing จะหมดอายุใน {Math.max(0, Math.ceil(days))} วัน ({thShort(new Date(expiresAt + 7 * 3600_000).toISOString().slice(0, 10))}) ·
				รัน <code>node tools/bluering/bluering.mjs login</code>
			</div>
		</div>
	);
}

// ---------------- cards ----------------

function Card({ title, aside, className = "", children }: { title: string; aside?: React.ReactNode; className?: string; children: React.ReactNode }) {
	return (
		<section className={`ev-card ${className}`}>
			<div className="ev-card-head">
				<h2>{title}</h2>
				{aside}
			</div>
			{children}
		</section>
	);
}

function Stat({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
	return (
		<div className="ev-stat">
			<div className="ev-stat-label">{label}</div>
			<div className="ev-stat-value">
				{value}
				{unit && <small>{unit}</small>}
			</div>
			{note && <div className="ev-stat-note">{note}</div>}
		</div>
	);
}

function NowCard({ view, live }: { view: EnergyView; live: LiveReading | null }) {
	const t = live?.today;
	return (
		<Card title="ตอนนี้" className="ev-now ev-o1">
			{live ? <Flow solarW={live.solarW} gridW={live.gridW} homeW={live.homeW} /> : <p className="ev-empty">รอข้อมูลช่วงแรกของวัน</p>}
			<div className="ev-stats three">
				<Stat label="โซลาร์วันนี้" value={n1(t?.solarKwh ?? view.today.actual.solarKwh)} unit="kWh" />
				<Stat label="บ้านใช้วันนี้" value={n1(t?.consumptionKwh ?? view.today.actual.loadKwh)} unit="kWh" />
				<Stat label="พึ่งโซลาร์" value={n0(t?.selfPoweredPct ?? view.today.actual.selfPoweredPct)} unit="%" />
			</div>
			{live && (
				<p className="ev-meta">
					ไฟบ้าน {n1(live.gridVoltageV)} V · {n1(live.gridCurrentA)} A
				</p>
			)}
		</Card>
	);
}

function Legend({ items }: { items: { color: string; label: string; kind?: "swatch" | "line" | "dashed" }[] }) {
	return (
		<div className="ev-legend">
			{items.map((i) => (
				<span key={i.label}>
					<span className={`ev-key ${i.kind ?? "swatch"}`} style={{ borderColor: i.color, background: i.kind === "dashed" ? "transparent" : i.color }} />
					{i.label}
				</span>
			))}
		</div>
	);
}

function TodayCard({ view, colors }: { view: EnergyView; colors: ReturnType<typeof useChartColors> }) {
	const p = view.today.projected;
	const w = view.week[0]?.window;
	const dayStartT = Date.parse(`${view.today.date}T00:00:00+07:00`);
	return (
		<Card title="วันนี้ · จริง + คาดการณ์" className="ev-span-2 ev-o3" aside={<span className="ev-chip">kW</span>}>
			<Legend
				items={[
					{ color: "var(--c-solar)", label: "โซลาร์" },
					{ color: "var(--c-home)", label: "บ้านใช้", kind: "line" },
					{ color: "var(--muted)", label: "คาดการณ์", kind: "dashed" },
				]}
			/>
			<div className="ev-chart tall">{colors && <TodayChart points={view.today.points} nowT={view.today.nowT} dayStartT={dayStartT} c={colors} />}</div>
			<div className="ev-stats four">
				<Stat label="คาดโซลาร์ทั้งวัน" value={n1(p.solarKwh)} unit="kWh" />
				<Stat label="คาดใช้ไฟทั้งวัน" value={n1(p.loadKwh)} unit="kWh" />
				<Stat label="คาดค่าไฟวันนี้" value={n0(p.costThb)} unit="฿" note={`peak ${n1(p.peakImportKwh)} · off ${n1(p.offPeakImportKwh)} kWh`} />
				<Stat label="แดดดีสุดที่เหลือ" value={w ? `${hhmm(w.from)}–${hhmm(w.to)}` : "—"} note={w ? `≈${n2(w.avgSolarKw)} kW` : "หมดแดดแล้ว"} />
			</div>
		</Card>
	);
}

function CycleCard({ view }: { view: EnergyView }) {
	const c = view.cycle;
	const p = c.projected;
	const peakThb = p.peakImportKwh * view.tariff.peak;
	const offThb = p.offPeakImportKwh * view.tariff.offPeak;
	const total = peakThb + offThb + view.tariff.serviceThb;
	const elapsedPct = Math.min(100, (c.elapsedDays / c.days) * 100);
	const lastDay = new Date(Date.parse(`${c.end}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
	const net = c.netThb;
	const segs = [
		{ key: "peak", label: "On-peak", thb: peakThb, cls: "peak" },
		{ key: "off", label: "Off-peak", thb: offThb, cls: "off" },
		{ key: "svc", label: "ค่าบริการ", thb: view.tariff.serviceThb, cls: "svc" },
	];
	return (
		<Card title="รอบบิลนี้" className="ev-o2" aside={<span className="ev-chip">{`${thShort(c.start)} – ${thShort(lastDay)}`}</span>}>
			<div className="ev-hero">
				<div className="ev-hero-label">คาดว่าจะจ่าย</div>
				<div className="ev-hero-value">
					{n0(c.projectedBillThb)}
					<small>฿</small>
				</div>
				<div className="ev-hero-note">
					ถึงตอนนี้ {baht(c.billSoFarThb)} · ใช้ไฟ {kwh(p.loadKwh)} · ซื้อ {kwh(p.importKwh)}
				</div>
			</div>
			<div className="ev-meter" aria-label={`ผ่านไป ${n1(c.elapsedDays)} จาก ${c.days} วัน`}>
				<span style={{ width: `${elapsedPct}%` }} />
			</div>
			<div className="ev-meter-label">
				ผ่านไป {n1(c.elapsedDays)} / {c.days} วัน
				{c.coveragePct < 98 && ` · มีข้อมูลจริง ${c.coveragePct}%`}
			</div>
			<div className="ev-seg" role="img" aria-label={segs.map((s) => `${s.label} ${n0(s.thb)} บาท`).join(", ")}>
				{segs.map((s) => {
					const pct = (s.thb / total) * 100;
					return (
						<span key={s.key} className={s.cls} style={{ width: `${pct}%` }} title={`${s.label} ${baht(s.thb)}`}>
							{pct >= 16 ? `${Math.round(pct)}%` : ""}
						</span>
					);
				})}
			</div>
			<div className="ev-seg-legend">
				{segs.map((s) => (
					<span key={s.key}>
						<span className={`ev-key swatch ${s.cls}`} />
						{s.label} {baht(s.thb)}
					</span>
				))}
			</div>
			{c.packageThb !== null && net !== null && (
				<div className={`ev-verdict ${net >= 0 ? "good" : "serious"}`}>
					{net >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
					<div>
						<strong>
							โซลาร์ช่วยประหยัด ≈{baht(p.savingsThb)} vs ค่าเช่า {baht(c.packageThb)}
						</strong>
						<span>{net >= 0 ? `คุ้มกว่าค่าเช่า ${baht(net)} รอบนี้` : `ยังขาดอีก ${baht(-net)} ถึงจะคุ้มค่าเช่ารอบนี้`}</span>
					</div>
				</div>
			)}
		</Card>
	);
}

function WeatherIcon({ cloud }: { cloud: number | null }) {
	if (cloud === null) return <CloudSun size={22} aria-hidden="true" />;
	if (cloud < 35) return <Sun size={22} aria-hidden="true" />;
	if (cloud < 75) return <CloudSun size={22} aria-hidden="true" />;
	return <Cloud size={22} aria-hidden="true" />;
}

function WeekCard({ view }: { view: EnergyView }) {
	const max = Math.max(1, ...view.week.map((d) => d.solarKwh));
	return (
		<Card title="7 วันข้างหน้า" className="ev-span-2 ev-o4" aside={<span className="ev-chip">ตามพยากรณ์อากาศ</span>}>
			<div className="ev-week" role="list">
				{view.week.map((d) => {
					const t = thDate(d.date);
					return (
						<div className="ev-day" role="listitem" key={d.date}>
							<div className="ev-day-head">
								<span className="ev-day-name">{d.partial ? "วันนี้" : t.dow}</span>
								<span className="ev-day-date">{t.day}</span>
							</div>
							<div className="ev-day-icon" title={d.cloudPct !== null ? `เมฆ ${d.cloudPct}%` : undefined}>
								<WeatherIcon cloud={d.cloudPct} />
								{d.maxTempC !== null && <span>{d.maxTempC}°</span>}
							</div>
							<div className="ev-day-solar">
								{n1(d.solarKwh)}
								<small>kWh</small>
							</div>
							<div className="ev-day-bar">
								<span style={{ width: `${(d.solarKwh / max) * 100}%` }} />
							</div>
							<div className="ev-day-row">
								<span>ค่าไฟ</span>
								<b>≈{n0(d.costThb)} ฿</b>
							</div>
							<div className="ev-day-row">
								<span>พึ่งโซลาร์</span>
								<b>{d.selfPoweredPct}%</b>
							</div>
							<div className="ev-day-win">{d.window ? `☀ ${hhmm(d.window.from)}–${hhmm(d.window.to)}` : "—"}</div>
						</div>
					);
				})}
			</div>
		</Card>
	);
}

function InsightsCard({ view }: { view: EnergyView }) {
	const tomorrow = view.week[1];
	const b = view.insights.battery;
	const peakShare = view.cycle.projected.importKwh > 0 ? (view.cycle.projected.peakImportKwh / view.cycle.projected.importKwh) * 100 : 0;
	return (
		<Card title="แนะนำ" className="ev-o5">
			<ul className="ev-insights">
				{tomorrow?.window && (
					<li>
						<CalendarClock size={20} aria-hidden="true" />
						<div>
							<strong>
								พรุ่งนี้แดดดีสุด {hhmm(tomorrow.window.from)}–{hhmm(tomorrow.window.to)}
							</strong>
							<span>
								โซลาร์ ≈{n2(tomorrow.window.avgSolarKw)} kW พอสำหรับไฟบ้านช่วงนั้น ~{tomorrow.window.coverPct}% เหมาะเปิดเครื่องซักผ้า รีดผ้า หรือแอร์
							</span>
						</div>
					</li>
				)}
				<li>
					<Info size={20} aria-hidden="true" />
					<div>
						<strong>ซื้อไฟช่วง On-peak {n0(peakShare)}% ของรอบนี้</strong>
						<span>
							On-peak (จ–ศ 09:00–22:00) {n2(view.tariff.peak)} ฿ vs Off-peak {n2(view.tariff.offPeak)} ฿ ย้ายงานหนักไปหลัง 22:00 หรือเสาร์–อาทิตย์ถูกลงเกินครึ่ง
						</span>
					</div>
				</li>
				{b && (
					<li>
						<BatteryCharging size={20} aria-hidden="true" />
						<div>
							<strong>
								แบตเตอรี่ ~{n0(Math.ceil(b.kwhPerWeekday))} kWh จะประหยัดได้ ≈{baht(b.thbPerMonth)}/เดือน
							</strong>
							<span>คิดจากไฟ On-peak ที่ซื้อหลังหักโซลาร์ในวันธรรมดา (ค่ากลาง 30 วัน) ชาร์จช่วง Off-peak ประสิทธิภาพ 90%</span>
						</div>
					</li>
				)}
			</ul>
		</Card>
	);
}

function HistoryCard({ view, colors }: { view: EnergyView; colors: ReturnType<typeof useChartColors> }) {
	// finished days only: today's partial bar would read as a low-usage day
	const days = view.history.daily.filter((d) => d.date < view.today.date).slice(-30);
	const avg = (k: "solar" | "consumption" | "gridPurchased") => (days.length ? days.reduce((t, d) => t + d[k], 0) / days.length : 0);
	return (
		<Card title="30 วันที่ผ่านมา" className="ev-span-2 ev-o7" aside={<span className="ev-chip">kWh/วัน</span>}>
			<Legend
				items={[
					{ color: "var(--c-solar)", label: "โซลาร์ใช้เอง" },
					{ color: "var(--c-import)", label: "ซื้อจากการไฟฟ้า" },
				]}
			/>
			<div className="ev-chart">{colors && <HistoryChart daily={days} c={colors} />}</div>
			<div className="ev-stats three">
				<Stat label="เฉลี่ยใช้ไฟ/วัน" value={n1(avg("consumption"))} unit="kWh" />
				<Stat label="เฉลี่ยโซลาร์/วัน" value={n1(avg("solar"))} unit="kWh" />
				<Stat label="เฉลี่ยซื้อไฟ/วัน" value={n1(avg("gridPurchased"))} unit="kWh" />
			</div>
		</Card>
	);
}

function MonthlyCard({ view }: { view: EnergyView }) {
	return (
		<Card title="รายเดือน" className="ev-o6">
			<div className="ev-table-wrap">
				<table className="ev-table">
					<thead>
						<tr>
							<th>เดือน</th>
							<th>ใช้ไฟ</th>
							<th>โซลาร์</th>
							<th>ซื้อ</th>
							<th>พึ่งโซลาร์</th>
						</tr>
					</thead>
					<tbody>
						{[...view.history.monthly].reverse().map((m) => (
							<tr key={m.month}>
								<td>{thMonth(m.month)}</td>
								<td>{n0(m.consumption)}</td>
								<td>{n0(m.solar)}</td>
								<td>{n0(m.gridPurchased)}</td>
								<td>{m.consumption > 0 ? `${Math.round(((m.solar - m.gridSold) / m.consumption) * 100)}%` : "—"}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<p className="ev-meta">หน่วย kWh · เดือนแรกนับจากวันติดตั้ง</p>
		</Card>
	);
}

function ModelCard({ view, colors }: { view: EnergyView; colors: ReturnType<typeof useChartColors> }) {
	const m = view.model;
	return (
		<Card title="โมเดลแม่นแค่ไหน" className="ev-span-2 ev-o8" aside={<span className="ev-chip">โซลาร์ kWh/วัน</span>}>
			<Legend
				items={[
					{ color: "var(--c-solar)", label: "โซลาร์ผลิตจริง" },
					{ color: "var(--ink-2)", label: "โมเดลทาย (ไม่เห็นวันนั้นตอนเรียน)", kind: "line" },
				]}
			/>
			<div className="ev-chart">{colors && <BacktestChart backtest={m.backtest} c={colors} />}</div>
			<div className="ev-stats four">
				<Stat label="คลาดเคลื่อนเฉลี่ย" value={m.mapePct === null ? "—" : `±${m.mapePct}`} unit={m.mapePct === null ? undefined : "%/วัน"} />
				<Stat label="เรียนจาก" value={n0(m.days)} unit="วัน" />
				<Stat label="PR ของแผงจริง" value={n2(m.learnedPr)} note="kWh ต่อ kWp ที่แดด 1000 W/m²" />
				<Stat label="ปรับเทียบมิเตอร์" value={`×${n2(m.importFactor)}`} note="ไฟที่ซื้อ เทียบยอดรายวัน" />
			</div>
		</Card>
	);
}
