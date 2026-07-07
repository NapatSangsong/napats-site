import type { ReactNode } from "react";

interface LegendItem {
	color: string;
	label: string;
	dash?: boolean;
}

interface PanelProps {
	title: string;
	legend?: LegendItem[];
	children: ReactNode;
	noPad?: boolean;
}

export function Panel({ title, legend, children, noPad }: PanelProps) {
	return (
		<div className="edash-panel">
			<div className="edash-panel-head">
				<span className="edash-panel-title">{title}</span>
				{legend && (
					<div className="edash-panel-legend">
						{legend.map((l) => (
							<span key={l.label} className="edash-legend-item">
								{l.dash ? (
									<span
										className="edash-legend-line"
										style={{ background: l.color, opacity: 0.9 }}
									/>
								) : (
									<span className="edash-legend-dot" style={{ background: l.color }} />
								)}
								{l.label}
							</span>
						))}
					</div>
				)}
			</div>
			<div className={noPad ? "" : "edash-panel-body"}>{children}</div>
		</div>
	);
}
