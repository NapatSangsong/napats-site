/**
 * DiffPreview — shows before/after for block refinement.
 * Side-by-side comparison with ACCEPT / REJECT tracked-caps buttons.
 */
import { useState } from "react";
import type { ThemeTokens } from "~/lib/theme";
import type { Block } from "./BlockRenderer";
import { Tracked } from "./primitives";

const BODY = "Inter, system-ui, sans-serif";
const MONO = "JetBrains Mono, ui-monospace, monospace";

interface DiffPreviewProps {
	t: ThemeTokens;
	oldBlock: Block;
	newBlock: Block;
	onAccept: () => void;
	onReject: () => void;
}

// ── Diff column ───────────────────────────────────────────

function DiffColumn({
	label,
	block,
	t,
	highlightColor,
}: {
	label: string;
	block: Block;
	t: ThemeTokens;
	highlightColor: string;
}) {
	return (
		<div
			style={{
				flex: 1,
				minWidth: 0,
				border: `1px solid ${t.divider}`,
				borderTop: `2px solid ${highlightColor}`,
				display: "flex",
				flexDirection: "column",
			}}
		>
			{/* Column header */}
			<div
				style={{
					padding: "10px 16px",
					borderBottom: `1px solid ${t.divider}`,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<Tracked size={9} tracking={0.3} style={{ color: t.inkGhost }}>
					{label}
				</Tracked>
				<Tracked size={8} tracking={0.2} style={{ color: t.inkGhost }}>
					{block.kind.toUpperCase()}
				</Tracked>
			</div>

			{/* Content preview */}
			<div
				style={{
					flex: 1,
					padding: "16px",
					fontFamily: block.kind === "code" ? MONO : BODY,
					fontSize: block.kind === "code" ? 12 : 14,
					lineHeight: 1.6,
					color: t.ink,
					whiteSpace: "pre-wrap",
					wordBreak: "break-word",
					overflowY: "auto",
					maxHeight: 400,
				}}
			>
				{block.content}
			</div>
		</div>
	);
}

// ── Main component ────────────────────────────────────────

export function DiffPreview({
	t,
	oldBlock,
	newBlock,
	onAccept,
	onReject,
}: DiffPreviewProps) {
	const [acceptHover, setAcceptHover] = useState(false);
	const [rejectHover, setRejectHover] = useState(false);

	const acceptColor = "rgba(34, 197, 94, 0.6)";
	const acceptBg = "rgba(34, 197, 94, 0.06)";
	const rejectColor = "rgba(239, 68, 68, 0.6)";
	const rejectBg = "rgba(239, 68, 68, 0.06)";

	return (
		<div
			style={{
				border: `1px solid ${t.divider}`,
				background: t.bgCard,
				padding: 20,
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: 16,
				}}
			>
				<Tracked size={10} tracking={0.3} style={{ color: t.inkMuted }}>
					REFINEMENT PREVIEW
				</Tracked>
			</div>

			{/* Side-by-side columns */}
			<div
				style={{
					display: "flex",
					gap: 16,
					marginBottom: 20,
				}}
			>
				<DiffColumn
					label="BEFORE"
					block={oldBlock}
					t={t}
					highlightColor={rejectColor}
				/>
				<DiffColumn
					label="AFTER"
					block={newBlock}
					t={t}
					highlightColor={acceptColor}
				/>
			</div>

			{/* Action buttons */}
			<div
				style={{
					display: "flex",
					gap: 12,
					justifyContent: "flex-end",
				}}
			>
				<button
					onClick={onReject}
					onMouseEnter={() => setRejectHover(true)}
					onMouseLeave={() => setRejectHover(false)}
					style={{
						fontFamily: MONO,
						fontSize: 10,
						textTransform: "uppercase",
						letterSpacing: "0.25em",
						padding: "10px 20px",
						border: `1px solid ${rejectHover ? rejectColor : t.divider}`,
						background: rejectHover ? rejectBg : "transparent",
						color: rejectHover ? "rgba(239, 68, 68, 0.9)" : t.inkMuted,
						cursor: "pointer",
						transition: "all .25s ease",
					}}
				>
					REJECT
				</button>
				<button
					onClick={onAccept}
					onMouseEnter={() => setAcceptHover(true)}
					onMouseLeave={() => setAcceptHover(false)}
					style={{
						fontFamily: MONO,
						fontSize: 10,
						textTransform: "uppercase",
						letterSpacing: "0.25em",
						padding: "10px 20px",
						border: `1px solid ${acceptHover ? acceptColor : t.divider}`,
						background: acceptHover ? acceptBg : "transparent",
						color: acceptHover ? "rgba(34, 197, 94, 0.9)" : t.inkMuted,
						cursor: "pointer",
						transition: "all .25s ease",
					}}
				>
					ACCEPT
				</button>
			</div>
		</div>
	);
}
