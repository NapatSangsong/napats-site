/**
 * ChatPanel — right-side AI chat pane for the lesson reader.
 * Collapsible: closed state shows vertical "MINSU" label with FilmDot.
 * Open state shows full chat UI with messages, context bar, and input.
 */
import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import type { ThemeTokens } from "~/lib/theme";
import type { Block, BlockKind } from "./BlockRenderer";
import { FilmDot, Tracked } from "./primitives";

const SERIF = "Playfair Display, serif";
const MONO = "JetBrains Mono, ui-monospace, monospace";
const BODY = "Inter, system-ui, sans-serif";

// ── Types ─────────────────────────────────────────────────

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp?: number;
}

interface ChatPanelProps {
	t: ThemeTokens;
	chatOpen: boolean;
	setChatOpen: (open: boolean) => void;
	messages: ChatMessage[];
	refineBlock?: Block | null;
	chatInput: string;
	setChatInput: (value: string) => void;
	sendMessage: () => void;
	sending: boolean;
}

// ── Collapsed rail ────────────────────────────────────────

function CollapsedRail({
	t,
	onOpen,
}: {
	t: ThemeTokens;
	onOpen: () => void;
}) {
	const [hover, setHover] = useState(false);
	return (
		<div
			onClick={onOpen}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			style={{
				width: 44,
				minHeight: "100vh",
				borderLeft: `1px solid ${t.divider}`,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				paddingTop: 28,
				gap: 14,
				cursor: "pointer",
				background: hover ? t.bgCard : "transparent",
				transition: "background .25s",
				flexShrink: 0,
			}}
		>
			<FilmDot size={5} />
			<div
				style={{
					writingMode: "vertical-rl",
					fontFamily: MONO,
					fontSize: 9,
					textTransform: "uppercase",
					letterSpacing: "0.3em",
					color: t.inkGhost,
				}}
			>
				MINSU
			</div>
		</div>
	);
}

// ── Typing indicator ──────────────────────────────────────

function TypingIndicator({ t }: { t: ThemeTokens }) {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 2, padding: "8px 0" }}>
			{[0, 1, 2].map((i) => (
				<span
					key={i}
					className="learning-breathe"
					style={{
						fontFamily: SERIF,
						fontSize: 18,
						color: t.inkMuted,
						animationDelay: `${i * 0.25}s`,
					}}
				>
					.
				</span>
			))}
		</div>
	);
}

// ── Context quote bar ─────────────────────────────────────

function ContextBar({
	t,
	block,
}: {
	t: ThemeTokens;
	block: Block;
}) {
	const kindLabel = block.kind.toUpperCase() as string;
	return (
		<div
			style={{
				borderLeft: `2px solid ${t.accent}`,
				padding: "8px 12px",
				marginBottom: 12,
				background: t.bgCard,
			}}
		>
			<Tracked size={8} tracking={0.25} style={{ color: t.inkGhost }}>
				ABOUT THIS {kindLabel}
			</Tracked>
			<div
				style={{
					fontFamily: BODY,
					fontSize: 12,
					color: t.inkMuted,
					marginTop: 4,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
				}}
			>
				{block.content.slice(0, 120)}
				{block.content.length > 120 ? "..." : ""}
			</div>
		</div>
	);
}

// ── Main component ────────────────────────────────────────

export function ChatPanel({
	t,
	chatOpen,
	setChatOpen,
	messages,
	refineBlock,
	chatInput,
	setChatInput,
	sendMessage,
	sending,
}: ChatPanelProps) {
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Auto-scroll to bottom on new messages
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages.length, sending]);

	// Handle Enter to send (Shift+Enter for newline)
	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (chatInput.trim() && !sending) {
				sendMessage();
			}
		}
	}

	if (!chatOpen) {
		return <CollapsedRail t={t} onOpen={() => setChatOpen(true)} />;
	}

	return (
		<div
			style={{
				width: 380,
				minHeight: "100vh",
				borderLeft: `1px solid ${t.divider}`,
				display: "flex",
				flexDirection: "column",
				background: t.bg,
				flexShrink: 0,
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "20px 20px 16px",
					borderBottom: `1px solid ${t.divider}`,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<FilmDot size={5} />
					<Tracked size={10} tracking={0.3} style={{ color: t.inkStrong }}>
						MINSU
					</Tracked>
					<span
						style={{
							fontFamily: MONO,
							fontSize: 9,
							color: t.inkGhost,
							marginLeft: 4,
						}}
					>
						claude-opus
					</span>
				</div>
				<button
					onClick={() => setChatOpen(false)}
					style={{
						background: "transparent",
						border: "none",
						cursor: "pointer",
						padding: 4,
						color: t.inkMuted,
						fontSize: 16,
						lineHeight: 1,
					}}
					aria-label="Close chat"
				>
					×
				</button>
			</div>

			{/* Messages */}
			<div
				style={{
					flex: 1,
					overflowY: "auto",
					padding: "20px 20px 0",
				}}
			>
				{messages.map((msg) => (
					<MessageBubble key={msg.id} message={msg} t={t} />
				))}
				{sending && <TypingIndicator t={t} />}
				<div ref={messagesEndRef} />
			</div>

			{/* Input area */}
			<div
				style={{
					padding: "12px 20px 20px",
					borderTop: `1px solid ${t.divider}`,
				}}
			>
				{/* Context bar when refining a block */}
				{refineBlock && <ContextBar t={t} block={refineBlock} />}

				<div style={{ position: "relative" }}>
					<textarea
						ref={textareaRef}
						value={chatInput}
						onChange={(e) => setChatInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Ask about this lesson..."
						rows={2}
						style={{
							width: "100%",
							border: `1px solid ${t.divider}`,
							background: t.bgCard,
							color: t.ink,
							fontFamily: BODY,
							fontSize: 14,
							lineHeight: 1.5,
							padding: "12px 14px",
							paddingRight: 80,
							resize: "none",
							outline: "none",
							boxSizing: "border-box",
						}}
					/>
					<button
						onClick={sendMessage}
						disabled={sending || !chatInput.trim()}
						style={{
							position: "absolute",
							right: 10,
							bottom: 10,
							background: "transparent",
							border: "none",
							cursor: sending || !chatInput.trim() ? "default" : "pointer",
							padding: "4px 8px",
							opacity: sending || !chatInput.trim() ? 0.3 : 1,
							transition: "opacity .2s",
						}}
					>
						<Tracked size={9} tracking={0.25} style={{ color: t.inkMuted }}>
							SEND ↵
						</Tracked>
					</button>
				</div>
			</div>
		</div>
	);
}

// ── Message bubble ────────────────────────────────────────

function MessageBubble({
	message,
	t,
}: {
	message: ChatMessage;
	t: ThemeTokens;
}) {
	const isUser = message.role === "user";
	return (
		<div
			style={{
				marginBottom: 20,
				display: "flex",
				flexDirection: "column",
				alignItems: isUser ? "flex-end" : "flex-start",
			}}
		>
			{/* Role label */}
			<Tracked
				size={8}
				tracking={0.3}
				style={{
					color: t.inkGhost,
					marginBottom: 6,
					display: "block",
				}}
			>
				{isUser ? "YOU" : "MINSU"}
			</Tracked>

			{/* Message content */}
			<div
				style={{
					fontFamily: BODY,
					fontSize: 14,
					lineHeight: 1.6,
					color: t.ink,
					maxWidth: "85%",
					padding: "10px 14px",
					background: isUser ? t.bgCard : "transparent",
					border: isUser ? "none" : `1px solid ${t.divider}`,
					whiteSpace: "pre-wrap",
					wordBreak: "break-word",
				}}
			>
				{message.content}
			</div>
		</div>
	);
}
