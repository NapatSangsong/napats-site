import type { ReactNode } from "react";

/** Card frame — glassy panel with a title row and optional legend chips */
export function RptPanel({
	title,
	legend,
	children,
	className = "",
}: {
	title: string;
	legend?: { color: string; label: string }[];
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className={`ereport-panel ${className}`}>
			<header className="ereport-panel-head">
				<h2>{title}</h2>
				{legend && legend.length > 0 && (
					<div className="ereport-legend">
						{legend.map((l) => (
							<span key={l.label} className="ereport-legend-item">
								<i style={{ background: l.color }} />
								{l.label}
							</span>
						))}
					</div>
				)}
			</header>
			<div className="ereport-panel-body">{children}</div>
		</section>
	);
}

/** Tooltip card used by every Recharts chart on the page */
export function RptTipBox({
	title,
	rows,
	bg,
	ink,
}: {
	title: string;
	rows: { dot?: string; text: string }[];
	bg: string;
	ink: string;
}) {
	return (
		<div className="ereport-tooltip" style={{ background: bg, color: ink }}>
			<div className="ereport-tooltip-title">{title}</div>
			{rows.map((r) => (
				<div key={r.text} className="ereport-tooltip-row">
					{r.dot && <i style={{ background: r.dot }} />}
					<span>{r.text}</span>
				</div>
			))}
		</div>
	);
}
