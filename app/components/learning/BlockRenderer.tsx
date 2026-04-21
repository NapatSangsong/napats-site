/**
 * BlockRenderer — renders a single content block by kind.
 * Each block type follows the design-canvas typography and spacing rules.
 * A hover bullseye button enables "ask AI about this" on any block.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import type { ThemeTokens } from "~/lib/theme";
import { Tracked } from "./primitives";

const SERIF = "Playfair Display, serif";
const MONO = "JetBrains Mono, ui-monospace, monospace";
const BODY = "Inter, system-ui, sans-serif";

// ── Block type definition ─────────────────────────────────

export type BlockKind =
	| "prose"
	| "heading"
	| "mermaid"
	| "katex"
	| "code"
	| "interactive"
	| "callout"
	| "image"
	| "quote";

export interface Block {
	id: string;
	kind: BlockKind;
	/** Markdown text for prose, heading text, code string, etc. */
	content: string;
	/** Heading level (2 or 3) */
	level?: number;
	/** Caption for mermaid / image */
	caption?: string;
	/** Figure number for mermaid diagrams */
	figureNumber?: number;
	/** Filename for code blocks */
	filename?: string;
	/** Language hint for code blocks */
	language?: string;
	/** Callout variant */
	variant?: "note" | "warning" | "insight" | "aside";
	/** Image src */
	src?: string;
	/** Apply black-and-white filter to image */
	bw?: boolean;
	/** Attribution for quotes */
	attribution?: string;
	/** Interactive sandbox URL */
	sandboxUrl?: string;
	/** Whether the code block is runnable */
	runnable?: boolean;
}

interface BlockRendererProps {
	block: Block;
	t: ThemeTokens;
	onAsk?: (block: Block) => void;
}

// ── Bullseye hover button ─────────────────────────────────

function AskButton({
	t,
	onClick,
	visible,
}: {
	t: ThemeTokens;
	onClick: () => void;
	visible: boolean;
}) {
	return (
		<button
			onClick={(e) => {
				e.stopPropagation();
				onClick();
			}}
			aria-label="Ask AI about this block"
			style={{
				position: "absolute",
				right: -34,
				top: 16,
				width: 24,
				height: 24,
				borderRadius: "50%",
				border: `1px solid ${t.divider}`,
				background: "transparent",
				cursor: "pointer",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 0,
				opacity: visible ? 0.7 : 0,
				transition: "opacity .25s ease",
			}}
		>
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
				<circle cx="7" cy="7" r="5.5" stroke={t.inkMuted} strokeWidth="1" />
				<circle cx="7" cy="7" r="2" fill={t.inkMuted} />
			</svg>
		</button>
	);
}

// ── Block wrapper ─────────────────────────────────────────

function BlockWrap({
	children,
	t,
	block,
	onAsk,
	style,
}: {
	children: ReactNode;
	t: ThemeTokens;
	block: Block;
	onAsk?: (block: Block) => void;
	style?: CSSProperties;
}) {
	const [hover, setHover] = useState(false);
	return (
		<div
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				position: "relative",
				...style,
			}}
		>
			{children}
			{onAsk && (
				<AskButton
					t={t}
					onClick={() => onAsk(block)}
					visible={hover}
				/>
			)}
		</div>
	);
}

// ── Kind renderers ────────────────────────────────────────

function ProseBlock({ block, t }: { block: Block; t: ThemeTokens }) {
	return (
		<div
			style={{
				fontFamily: BODY,
				fontSize: 16,
				lineHeight: 1.75,
				fontWeight: 300,
				color: t.ink,
			}}
			dangerouslySetInnerHTML={{ __html: block.content }}
		/>
	);
}

function HeadingBlock({ block, t }: { block: Block; t: ThemeTokens }) {
	const level = block.level || 2;
	const fontSize = level === 2 ? 30 : 22;
	const Tag = level === 2 ? "h2" : "h3";
	return (
		<Tag
			style={{
				fontFamily: SERIF,
				fontSize,
				fontWeight: 500,
				color: t.inkStrong,
				margin: 0,
				lineHeight: 1.2,
				letterSpacing: "-0.01em",
			}}
		>
			{block.content}
		</Tag>
	);
}

function MermaidBlock({ block, t }: { block: Block; t: ThemeTokens }) {
	const figLabel = block.figureNumber != null
		? `FIG. ${String(block.figureNumber).padStart(2, "0")}`
		: "FIG.";
	return (
		<div>
			<div
				style={{
					border: `1px solid ${t.divider}`,
					padding: 32,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					minHeight: 200,
					background: t.bgCard,
				}}
			>
				<span
					style={{
						fontFamily: MONO,
						fontSize: 12,
						color: t.inkGhost,
						textTransform: "uppercase",
						letterSpacing: "0.15em",
					}}
				>
					[Mermaid diagram]
				</span>
			</div>
			<div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
				<Tracked size={9} tracking={0.3} style={{ color: t.inkGhost }}>
					{figLabel}
				</Tracked>
				{block.caption && (
					<span
						style={{
							fontFamily: BODY,
							fontSize: 13,
							color: t.inkMuted,
							fontStyle: "italic",
						}}
					>
						{block.caption}
					</span>
				)}
			</div>
		</div>
	);
}

function KatexBlock({ block, t }: { block: Block; t: ThemeTokens }) {
	return (
		<div
			style={{
				padding: "24px 0",
				textAlign: "center",
				fontFamily: SERIF,
				fontSize: 18,
				color: t.ink,
				fontStyle: "italic",
			}}
		>
			{/* Lazy-loaded KaTeX placeholder */}
			<span style={{ color: t.inkMuted, fontFamily: MONO, fontSize: 13 }}>
				{block.content}
			</span>
		</div>
	);
}

function CodeBlock({ block, t }: { block: Block; t: ThemeTokens }) {
	return (
		<div
			style={{
				background: "#0d0d0d",
				border: `1px solid ${t.divider}`,
				overflow: "hidden",
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "10px 16px",
					borderBottom: `1px solid ${t.divider}`,
				}}
			>
				<Tracked size={9} tracking={0.25} style={{ color: t.inkGhost }}>
					{block.filename || block.language || "CODE"}
				</Tracked>
				{block.runnable !== false && (
					<button
						style={{
							background: "transparent",
							border: "none",
							cursor: "pointer",
							padding: 0,
						}}
					>
						<Tracked size={9} tracking={0.25} style={{ color: t.inkMuted }}>
							RUN →
						</Tracked>
					</button>
				)}
			</div>
			{/* Code content */}
			<pre
				style={{
					margin: 0,
					padding: "18px 16px",
					fontFamily: MONO,
					fontSize: 13,
					lineHeight: 1.6,
					color: t.ink,
					overflowX: "auto",
					whiteSpace: "pre",
					tabSize: 2,
				}}
			>
				<code>{block.content}</code>
			</pre>
		</div>
	);
}

function InteractiveBlock({ block, t }: { block: Block; t: ThemeTokens }) {
	return (
		<div
			style={{
				border: `1px solid ${t.divider}`,
				minHeight: 300,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: t.bgCard,
			}}
		>
			{block.sandboxUrl ? (
				<iframe
					src={block.sandboxUrl}
					title="Interactive sandbox"
					sandbox="allow-scripts"
					style={{
						width: "100%",
						height: 400,
						border: "none",
						background: "transparent",
					}}
				/>
			) : (
				<span
					style={{
						fontFamily: MONO,
						fontSize: 12,
						color: t.inkGhost,
						textTransform: "uppercase",
						letterSpacing: "0.15em",
					}}
				>
					[Interactive sandbox]
				</span>
			)}
		</div>
	);
}

const CALLOUT_INDICATORS: Record<string, { label: string; borderColor?: string }> = {
	note: { label: "NOTE" },
	warning: { label: "WARNING", borderColor: "#b8860b" },
	insight: { label: "INSIGHT", borderColor: "#cc0000" },
	aside: { label: "ASIDE" },
};

function CalloutBlock({ block, t }: { block: Block; t: ThemeTokens }) {
	const variant = block.variant || "note";
	const indicator = CALLOUT_INDICATORS[variant] || CALLOUT_INDICATORS.note;
	const borderColor = indicator.borderColor || t.dividerStrong;

	return (
		<div
			style={{
				border: `1px solid ${t.divider}`,
				borderLeft: `2px solid ${borderColor}`,
				padding: "18px 20px",
				background: t.bgCard,
			}}
		>
			<Tracked
				size={9}
				tracking={0.3}
				style={{
					color: indicator.borderColor || t.inkGhost,
					display: "block",
					marginBottom: 10,
				}}
			>
				{indicator.label}
			</Tracked>
			<div
				style={{
					fontFamily: BODY,
					fontSize: 14,
					lineHeight: 1.65,
					fontWeight: 300,
					color: t.ink,
				}}
				dangerouslySetInnerHTML={{ __html: block.content }}
			/>
		</div>
	);
}

function ImageBlock({ block, t }: { block: Block; t: ThemeTokens }) {
	return (
		<figure style={{ margin: 0 }}>
			{block.src && (
				<img
					src={block.src}
					alt={block.caption || ""}
					style={{
						width: "100%",
						display: "block",
						filter: block.bw ? "grayscale(1)" : undefined,
					}}
				/>
			)}
			{block.caption && (
				<figcaption
					style={{
						marginTop: 10,
						fontFamily: BODY,
						fontSize: 13,
						color: t.inkMuted,
						fontStyle: "italic",
					}}
				>
					{block.caption}
				</figcaption>
			)}
		</figure>
	);
}

function QuoteBlock({ block, t }: { block: Block; t: ThemeTokens }) {
	return (
		<blockquote
			style={{
				margin: 0,
				padding: "4px 0 4px 24px",
				borderLeft: `2px solid ${t.accent}`,
			}}
		>
			<div
				style={{
					fontFamily: SERIF,
					fontSize: 22,
					fontStyle: "italic",
					lineHeight: 1.45,
					color: t.ink,
				}}
			>
				{block.content}
			</div>
			{block.attribution && (
				<div style={{ marginTop: 12 }}>
					<Tracked size={9} tracking={0.25} style={{ color: t.inkGhost }}>
						— {block.attribution}
					</Tracked>
				</div>
			)}
		</blockquote>
	);
}

// ── Main renderer ─────────────────────────────────────────

const KIND_MAP: Record<BlockKind, React.ComponentType<{ block: Block; t: ThemeTokens }>> = {
	prose: ProseBlock,
	heading: HeadingBlock,
	mermaid: MermaidBlock,
	katex: KatexBlock,
	code: CodeBlock,
	interactive: InteractiveBlock,
	callout: CalloutBlock,
	image: ImageBlock,
	quote: QuoteBlock,
};

export function BlockRenderer({ block, t, onAsk }: BlockRendererProps) {
	const Renderer = KIND_MAP[block.kind];
	if (!Renderer) return null;

	return (
		<BlockWrap t={t} block={block} onAsk={onAsk} style={{ marginBottom: 28 }}>
			<Renderer block={block} t={t} />
		</BlockWrap>
	);
}
