/**
 * Floating AI chat for the energy dashboard. Stateless on the client side —
 * each send posts the running conversation plus a `context` snapshot of the
 * current dashboard numbers to /api/energy/chat and streams the reply.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface Msg {
	role: "user" | "assistant";
	content: string;
}

const MODELS = [
	{ id: "google/gemini-2.5-flash", label: "Gemini Flash", note: "เร็ว" },
	{ id: "google/gemini-2.5-pro", label: "Gemini Pro", note: "ลึก" },
	{ id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet", note: "ภาษา" },
];

const GREETING =
	"ถามได้เลยครับ — ผมเห็นข้อมูลค่าไฟ/โซลาร์/TOU บนหน้านี้ทั้งหมด เช่น “ถ้าย้ายโหลดไป off-peak จะประหยัดเท่าไร” หรือ “โซลาร์คุ้มไหม”";

export function EnergyChat({ context }: { context: string }) {
	const [open, setOpen] = useState(false);
	const [messages, setMessages] = useState<Msg[]>([]);
	const [input, setInput] = useState("");
	const [streaming, setStreaming] = useState(false);
	const [model, setModel] = useState(MODELS[0].id);
	const endRef = useRef<HTMLDivElement>(null);

	// Read the latest context at send time without re-creating the handler
	const contextRef = useRef(context);
	useEffect(() => {
		contextRef.current = context;
	}, [context]);

	useEffect(() => {
		if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, open, streaming]);

	const send = useCallback(
		async (text: string) => {
			if (!text.trim() || streaming) return;
			const history = [...messages, { role: "user" as const, content: text }];
			setMessages([...history, { role: "assistant", content: "" }]);
			setInput("");
			setStreaming(true);

			try {
				const res = await fetch("/api/energy/chat", {
					method: "POST",
					headers: { "Content-Type": "application/json", Origin: window.location.origin },
					body: JSON.stringify({ messages: history, model, context: contextRef.current }),
				});
				if (!res.ok || !res.body) {
					const err = (await res.json().catch(() => ({ message: "เชื่อมต่อไม่สำเร็จ" }))) as { message?: string };
					throw new Error(err.message || "เชื่อมต่อไม่สำเร็จ");
				}

				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				let full = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const events = buffer.split("\n\n");
					buffer = events.pop() || "";

					for (const evt of events) {
						let type = "";
						const dataLines: string[] = [];
						for (const line of evt.split("\n")) {
							if (line.startsWith("event: ")) type = line.slice(7);
							else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
						}
						const data = dataLines.join("\n");
						if (type === "end") continue;
						if (type === "error") {
							let m = "ขออภัย เกิดข้อผิดพลาด ลองใหม่อีกครั้ง";
							try { m = JSON.parse(data).message || m; } catch { /* keep default */ }
							throw new Error(m);
						}
						if (data) {
							full += data;
							setMessages((prev) => {
								const next = [...prev];
								next[next.length - 1] = { role: "assistant", content: full };
								return next;
							});
						}
					}
				}
			} catch (err) {
				const m = (err as Error).message || "ขออภัย เกิดข้อผิดพลาด";
				setMessages((prev) => {
					const next = [...prev];
					next[next.length - 1] = { role: "assistant", content: `⚠️ ${m}\n(ข้อความถูกเก็บไว้ — กดส่งเพื่อลองใหม่)` };
					return next;
				});
				setInput(text); // preserve the question for a one-click retry
			} finally {
				setStreaming(false);
			}
		},
		[messages, model, streaming],
	);

	// ── Floating launcher ──────────────────────────────────
	if (!open) {
		return (
			<button
				type="button"
				aria-label="ถาม AI เรื่องค่าไฟ"
				onClick={() => setOpen(true)}
				style={{
					position: "fixed",
					right: 18,
					bottom: 18,
					zIndex: 50,
					display: "inline-flex",
					alignItems: "center",
					gap: 8,
					padding: "12px 18px",
					borderRadius: 99,
					border: "1px solid var(--line)",
					background: "var(--panel)",
					color: "var(--ink)",
					font: "inherit",
					fontWeight: 600,
					fontSize: "0.9rem",
					cursor: "pointer",
					boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
				}}
			>
				<span aria-hidden style={{ fontSize: "1.05rem" }}>✦</span>
				ถาม AI
			</button>
		);
	}

	// ── Panel ──────────────────────────────────────────────
	return (
		<div
			role="dialog"
			aria-label="AI chat ค่าไฟ"
			style={{
				position: "fixed",
				right: "max(12px, env(safe-area-inset-right))",
				bottom: "max(12px, env(safe-area-inset-bottom))",
				zIndex: 50,
				width: "min(420px, calc(100vw - 24px))",
				height: "min(560px, calc(100vh - 90px))",
				display: "flex",
				flexDirection: "column",
				background: "var(--night-2)",
				border: "1px solid var(--line)",
				borderRadius: 16,
				boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
				overflow: "hidden",
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 10,
					padding: "10px 12px",
					borderBottom: "1px solid var(--line)",
					background: "var(--panel)",
				}}
			>
				<span style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--ink)" }}>ถาม AI เรื่องค่าไฟ</span>
				<select
					value={model}
					onChange={(e) => setModel(e.target.value)}
					aria-label="เลือกโมเดล"
					style={{
						marginLeft: "auto",
						appearance: "none",
						background: "rgba(16,23,42,0.6)",
						color: "var(--ink-dim)",
						border: "1px solid var(--line)",
						borderRadius: 8,
						padding: "4px 8px",
						font: "inherit",
						fontSize: "0.74rem",
						cursor: "pointer",
					}}
				>
					{MODELS.map((m) => (
						<option key={m.id} value={m.id}>
							{m.label} · {m.note}
						</option>
					))}
				</select>
				<button
					type="button"
					aria-label="ปิด"
					onClick={() => setOpen(false)}
					style={{
						appearance: "none",
						border: "1px solid var(--line)",
						background: "transparent",
						color: "var(--ink-dim)",
						borderRadius: 8,
						width: 28,
						height: 28,
						cursor: "pointer",
						fontSize: "1rem",
						lineHeight: 1,
					}}
				>
					×
				</button>
			</div>

			{/* Messages */}
			<div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: 10 }}>
				{messages.length === 0 && (
					<div style={{ color: "var(--ink-dim)", fontSize: "0.84rem", lineHeight: 1.6 }}>{GREETING}</div>
				)}
				{messages.map((m, i) => (
					<div
						key={i}
						style={{
							alignSelf: m.role === "user" ? "flex-end" : "flex-start",
							maxWidth: "88%",
							padding: "8px 12px",
							borderRadius: 12,
							background: m.role === "user" ? "var(--panel)" : "rgba(16,23,42,0.55)",
							border: "1px solid var(--line)",
							color: "var(--ink)",
							fontSize: "0.86rem",
							lineHeight: 1.55,
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
						}}
					>
						{m.content || (streaming && i === messages.length - 1 ? "…" : "")}
					</div>
				))}
				<div ref={endRef} />
			</div>

			{/* Input */}
			<div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid var(--line)", background: "var(--panel)" }}>
				<textarea
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							send(input);
						}
					}}
					placeholder="พิมพ์คำถามเรื่องค่าไฟ / โซลาร์…"
					rows={1}
					style={{
						flex: 1,
						resize: "none",
						background: "rgba(16,23,42,0.6)",
						border: "1px solid var(--line)",
						borderRadius: 10,
						color: "var(--ink)",
						font: "inherit",
						fontSize: "0.86rem",
						padding: "8px 10px",
						outline: "none",
						maxHeight: 120,
					}}
				/>
				<button
					type="button"
					onClick={() => send(input)}
					disabled={streaming || !input.trim()}
					style={{
						appearance: "none",
						border: 0,
						borderRadius: 10,
						padding: "0 16px",
						background: streaming || !input.trim() ? "var(--line)" : "#4da3ff",
						color: streaming || !input.trim() ? "var(--ink-dim)" : "#08111f",
						fontWeight: 700,
						fontSize: "0.84rem",
						cursor: streaming || !input.trim() ? "default" : "pointer",
					}}
				>
					{streaming ? "…" : "ส่ง"}
				</button>
			</div>
		</div>
	);
}
