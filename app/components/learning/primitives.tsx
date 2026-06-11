/**
 * Shared primitives matching the napats.dev/learning design vocabulary.
 * Film-dot, tracked-caps labels, underline input, progress bar, etc.
 */
import { useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import type { ThemeTokens } from "~/lib/theme";

const MONO = "JetBrains Mono, ui-monospace, monospace";

// ── Tracked-caps label ─────────────────────────────────────

export function Tracked({
	children,
	size = 10,
	tracking = 0.25,
	style,
	className,
}: {
	children: ReactNode;
	size?: number;
	tracking?: number;
	style?: CSSProperties;
	className?: string;
}) {
	return (
		<span
			className={className}
			style={{
				fontFamily: MONO,
				fontSize: size,
				textTransform: "uppercase",
				letterSpacing: `${tracking}em`,
				...style,
			}}
		>
			{children}
		</span>
	);
}

// ── Film dot (sacred red punctuation) ──────────────────────

export function FilmDot({
	size = 6,
	breathe = false,
	style,
}: {
	size?: number;
	breathe?: boolean;
	style?: CSSProperties;
}) {
	return (
		<span
			className={breathe ? "learning-breathe" : ""}
			style={{
				display: "inline-block",
				width: size,
				height: size,
				borderRadius: "50%",
				background: "#cc0000",
				verticalAlign: "middle",
				...style,
			}}
		/>
	);
}

// ── Rule (short horizontal line) ───────────────────────────

export function Rule({
	width = 64,
	color,
}: {
	width?: number;
	color?: string;
}) {
	return (
		<span
			style={{
				display: "inline-block",
				height: 1,
				width,
				background: color || "currentColor",
				opacity: color ? 1 : 0.2,
				verticalAlign: "middle",
			}}
		/>
	);
}

// ── Hr ornament (centered divider with film-dot) ───────────

export function HrOrnament({ color }: { color?: string }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 16,
				color: color || "rgba(255,255,255,0.15)",
			}}
		>
			<div
				style={{
					flex: 1,
					height: 1,
					background: "linear-gradient(to right, transparent, currentColor, transparent)",
				}}
			/>
			<FilmDot />
			<div
				style={{
					flex: 1,
					height: 1,
					background: "linear-gradient(to right, transparent, currentColor, transparent)",
				}}
			/>
		</div>
	);
}

// ── Progress bar ───────────────────────────────────────────

export function ProgressBar({
	value = 0,
	t,
	height = 1,
}: {
	value?: number;
	t: ThemeTokens;
	height?: number;
}) {
	return (
		<div style={{ height, background: t.divider, position: "relative" }}>
			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					height: "100%",
					width: `${value}%`,
					background: t.accent,
					transition: "width .4s ease",
				}}
			/>
		</div>
	);
}

// ── Stat block ─────────────────────────────────────────────

export function Stat({
	value,
	label,
	t,
	size = 40,
}: {
	value: string | number;
	label: string;
	t: ThemeTokens;
	size?: number;
}) {
	return (
		<div>
			<div
				style={{
					fontFamily: "Playfair Display, serif",
					fontSize: size,
					color: t.inkStrong,
					fontWeight: 500,
					letterSpacing: "-0.01em",
				}}
			>
				{value}
			</div>
			<Tracked
				size={10}
				tracking={0.25}
				style={{ color: t.inkGhost, marginTop: 6, display: "inline-block" }}
			>
				{label}
			</Tracked>
		</div>
	);
}

// ── Chip ───────────────────────────────────────────────────

export function Chip({
	children,
	t,
	active,
	onClick,
}: {
	children: ReactNode;
	t: ThemeTokens;
	active?: boolean;
	onClick?: () => void;
}) {
	return (
		<button
			onClick={onClick}
			style={{
				fontFamily: MONO,
				fontSize: 9,
				textTransform: "uppercase",
				letterSpacing: "0.2em",
				padding: "6px 10px",
				minHeight: 36,
				border: `1px solid ${active ? t.dividerStrong : t.divider}`,
				color: active ? t.ink : t.inkGhost,
				whiteSpace: "nowrap",
				background: "transparent",
				cursor: "pointer",
			}}
		>
			{children}
		</button>
	);
}

// ── Tracked button ─────────────────────────────────────────

export function TrackedButton({
	children,
	primary,
	ghost,
	onClick,
	t,
	disabled,
}: {
	children: ReactNode;
	primary?: boolean;
	ghost?: boolean;
	onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
	t: ThemeTokens;
	disabled?: boolean;
}) {
	const [hover, setHover] = useState(false);
	return (
		<button
			onClick={onClick}
			disabled={disabled}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 10,
				fontFamily: MONO,
				fontSize: 11,
				textTransform: "uppercase",
				letterSpacing: "0.25em",
				padding: ghost ? "12px 0" : "12px 22px",
				border: ghost ? "none" : `1px solid ${hover ? t.dividerStrong : t.divider}`,
				background: "transparent",
				color: hover ? t.inkStrong : t.inkMuted,
				cursor: disabled ? "not-allowed" : "pointer",
				transition: "all .35s ease",
				opacity: disabled ? 0.4 : 1,
			}}
		>
			{children}
			{primary && (
				<span
					style={{
						display: "inline-block",
						width: 5,
						height: 5,
						borderRadius: "50%",
						background: "#cc0000",
						opacity: hover ? 1 : 0.5,
						transition: "opacity .3s",
					}}
				/>
			)}
		</button>
	);
}

// ── Underline input ────────────────────────────────────────

export function UnderlineInput({
	value,
	onChange,
	placeholder,
	t,
	multiline = false,
	rows = 1,
	disabled,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	t: ThemeTokens;
	multiline?: boolean;
	rows?: number;
	disabled?: boolean;
}) {
	const [focus, setFocus] = useState(false);
	const Tag = multiline ? "textarea" : "input";
	return (
		<div style={{ position: "relative" }}>
			<Tag
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				rows={multiline ? rows : undefined}
				disabled={disabled}
				onFocus={() => setFocus(true)}
				onBlur={() => setFocus(false)}
				style={{
					width: "100%",
					border: "none",
					outline: "none",
					background: "transparent",
					fontFamily: "Playfair Display, serif",
					fontSize: 28,
					fontWeight: 400,
					color: t.ink,
					padding: "14px 0",
					resize: multiline ? "vertical" : "none",
					lineHeight: multiline ? 1.45 : 1.2,
				}}
			/>
			<div
				style={{
					height: 1,
					background: focus ? t.accent : t.dividerStrong,
					transition: "background .25s",
				}}
			/>
		</div>
	);
}

// ── Theme toggle icon ──────────────────────────────────────

export function ThemeToggleIcon({
	theme,
	onClick,
	color,
}: {
	theme: "dark" | "light";
	onClick: () => void;
	color: string;
}) {
	return (
		<button
			onClick={onClick}
			style={{
				background: "transparent",
				border: "none",
				cursor: "pointer",
				padding: 0,
				color,
				display: "flex",
			}}
			title="Toggle theme"
		>
			{theme === "dark" ? (
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
					<path d="M11 7.5A4 4 0 016.5 3c0-.5.1-1 .2-1.4A5 5 0 1012 7.3c-.3.1-.6.2-1 .2z" />
				</svg>
			) : (
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
					<circle cx="7" cy="7" r="3" />
					<path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.5 2.5l1 1M10.5 10.5l1 1M2.5 11.5l1-1M10.5 3.5l1-1" />
				</svg>
			)}
		</button>
	);
}
