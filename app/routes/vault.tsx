import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { getBrowserSupabase, hexToBytes, type VaultSyncRow } from "~/lib/supabase";
import {
	decryptVaultFile,
	deriveKey,
	verifyMasterPassword,
	type VaultFile,
	type VaultItem,
} from "~/lib/vault-crypto";

type Phase =
	| { kind: "loadingSession" }
	| { kind: "needSignIn" }
	| { kind: "loadingBlob"; email: string }
	| { kind: "noVault"; email: string }
	| { kind: "needMasterPassword"; email: string; row: VaultSyncRow }
	| { kind: "unlocking"; email: string }
	| { kind: "ready"; email: string; file: VaultFile }
	| { kind: "error"; message: string };

export function meta() {
	return [{ title: "Napat Dev — Vault" }];
}

export default function VaultPage() {
	const navigate = useNavigate();
	const [phase, setPhase] = useState<Phase>({ kind: "loadingSession" });
	const [masterPw, setMasterPw] = useState("");
	const [pwError, setPwError] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [activeTag, setActiveTag] = useState<string | null>(null);

	// Boot: check session → fetch row.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const supabase = getBrowserSupabase();
				const {
					data: { session },
				} = await supabase.auth.getSession();
				if (!session) {
					if (!cancelled) navigate("/vault/signin");
					return;
				}
				const email = session.user.email ?? "signed in";
				if (!cancelled) setPhase({ kind: "loadingBlob", email });

				const { data, error } = await supabase
					.from("vault_sync")
					.select("*")
					.maybeSingle<VaultSyncRow>();
				if (error) throw error;
				if (cancelled) return;
				if (!data) {
					setPhase({ kind: "noVault", email });
					return;
				}
				setPhase({ kind: "needMasterPassword", email, row: data });
			} catch (e) {
				if (!cancelled) {
					setPhase({
						kind: "error",
						message: e instanceof Error ? e.message : String(e),
					});
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [navigate]);

	async function unlock() {
		if (phase.kind !== "needMasterPassword") return;
		setPwError(null);
		setPhase({ kind: "unlocking", email: phase.email });
		try {
			const salt = hexToBytes(phase.row.salt);
			const verifier = hexToBytes(phase.row.verifier);
			const ciphertext = hexToBytes(phase.row.ciphertext);
			const key = await deriveKey(masterPw, salt);
			if (!(await verifyMasterPassword(verifier, key))) {
				setPwError("Incorrect master password.");
				setPhase({ kind: "needMasterPassword", email: phase.email, row: phase.row });
				return;
			}
			const file = await decryptVaultFile(ciphertext, key);
			setMasterPw(""); // wipe from component state after use
			setPhase({ kind: "ready", email: phase.email, file });
		} catch (e) {
			setPwError(e instanceof Error ? e.message : String(e));
			setPhase({ kind: "needMasterPassword", email: phase.email, row: phase.row });
		}
	}

	async function signOut() {
		const supabase = getBrowserSupabase();
		await supabase.auth.signOut();
		navigate("/vault/signin");
	}

	// Derive filtered items from state + query + tag.
	const allTags: { tag: string; count: number }[] = useMemo(() => {
		if (phase.kind !== "ready") return [];
		const counts = new Map<string, number>();
		for (const item of phase.file.items) {
			for (const t of item.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
		}
		return [...counts.entries()]
			.map(([tag, count]) => ({ tag, count }))
			.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
	}, [phase]);

	const filtered: VaultItem[] = useMemo(() => {
		if (phase.kind !== "ready") return [];
		const items = [...phase.file.items].sort((a, b) =>
			a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
		);
		const tagScoped = activeTag
			? items.filter((i) =>
					i.tags.some((t) => t.toLowerCase() === activeTag.toLowerCase()),
				)
			: items;
		if (!query.trim()) return tagScoped;
		if (query.startsWith("#")) {
			const q = query.slice(1).toLowerCase();
			return tagScoped.filter((i) => i.tags.some((t) => t.toLowerCase().includes(q)));
		}
		const q = query.toLowerCase();
		return tagScoped.filter(
			(i) =>
				i.title.toLowerCase().includes(q) ||
				i.username.toLowerCase().includes(q) ||
				i.website.toLowerCase().includes(q) ||
				i.tags.some((t) => t.toLowerCase().includes(q)),
		);
	}, [phase, query, activeTag]);

	return (
		<main className="min-h-screen bg-neutral-950 text-neutral-100">
			<header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur px-4 py-3 flex items-center gap-3">
				<div className="size-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-300 flex items-center justify-center text-white">
					🔑
				</div>
				<div className="flex-1 min-w-0">
					<div className="text-sm font-semibold">Napat Dev — Vault</div>
					<div className="text-[11px] text-neutral-400 truncate">
						{"email" in phase && phase.email} · read-only web view
					</div>
				</div>
				{"email" in phase && (
					<button
						onClick={signOut}
						className="text-xs rounded-md px-2 py-1 bg-neutral-800 hover:bg-neutral-700"
					>
						Sign out
					</button>
				)}
			</header>

			<section className="px-4 py-6 max-w-3xl mx-auto">
				{phase.kind === "loadingSession" && <Loader text="Checking sign-in…" />}
				{phase.kind === "loadingBlob" && <Loader text="Fetching encrypted vault…" />}
				{phase.kind === "unlocking" && <Loader text="Decrypting…" />}
				{phase.kind === "noVault" && (
					<EmptyState>
						No vault has been synced yet. Sign in to the Mac app and enable Sync to
						push your vault to Supabase first.
					</EmptyState>
				)}
				{phase.kind === "error" && <EmptyState error>{phase.message}</EmptyState>}

				{phase.kind === "needMasterPassword" && (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							unlock();
						}}
						className="max-w-sm space-y-3 p-5 rounded-xl bg-neutral-900 border border-neutral-800"
					>
						<h2 className="text-sm font-semibold">Unlock your vault</h2>
						<p className="text-xs text-neutral-400">
							Enter the master password you use on the Mac app. It never leaves this
							browser tab.
						</p>
						<input
							type="password"
							autoFocus
							autoComplete="off"
							value={masterPw}
							onChange={(e) => setMasterPw(e.target.value)}
							placeholder="Master password"
							className="w-full rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
						/>
						{pwError && <p className="text-xs text-rose-400">{pwError}</p>}
						<button
							type="submit"
							disabled={!masterPw}
							className="w-full rounded-md bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold py-2 disabled:opacity-50"
						>
							Unlock
						</button>
					</form>
				)}

				{phase.kind === "ready" && (
					<>
						<div className="flex items-center gap-2 mb-3">
							<input
								placeholder="Search… (use #tag for tag-only)"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								className="flex-1 rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
							/>
						</div>

						{allTags.length > 0 && (
							<div className="flex flex-wrap gap-1.5 mb-4">
								<TagPill
									label="All"
									active={activeTag === null}
									onClick={() => setActiveTag(null)}
								/>
								{allTags.map(({ tag, count }) => (
									<TagPill
										key={tag}
										label={`${tag} · ${count}`}
										active={activeTag === tag}
										onClick={() =>
											setActiveTag(activeTag === tag ? null : tag)
										}
									/>
								))}
							</div>
						)}

						{filtered.length === 0 ? (
							<EmptyState>
								{query || activeTag
									? "No items match."
									: "Vault is empty. Add items on the Mac app."}
							</EmptyState>
						) : (
							<ul className="space-y-2">
								{filtered.map((item) => (
									<ItemCard key={item.id} item={item} />
								))}
							</ul>
						)}
					</>
				)}
			</section>
		</main>
	);
}

function TagPill({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			onClick={onClick}
			className={`text-xs font-semibold rounded-full px-2.5 py-1 border transition-colors ${
				active
					? "bg-indigo-500 border-indigo-500 text-white"
					: "bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700"
			}`}
		>
			#{label}
		</button>
	);
}

function ItemCard({ item }: { item: VaultItem }) {
	const [revealed, setRevealed] = useState(false);
	const [copied, setCopied] = useState<string | null>(null);

	async function copy(text: string, label: string) {
		await navigator.clipboard.writeText(text);
		setCopied(label);
		setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
	}

	const dotsOrReal = revealed ? item.password : "•".repeat(Math.min(item.password.length || 8, 12));

	return (
		<li className="rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden">
			<div className="p-3 flex items-center gap-3">
				<div className="size-8 rounded-md bg-indigo-500/30 border border-indigo-500/50 flex items-center justify-center text-sm">
					{item.title.slice(0, 1).toUpperCase() || "·"}
				</div>
				<div className="flex-1 min-w-0">
					<div className="text-sm font-semibold truncate flex items-center gap-1">
						{item.title || "Untitled"}
						{item.isFavorite && <span className="text-amber-400">★</span>}
					</div>
					{item.username && (
						<div className="text-[11px] text-neutral-400 truncate">{item.username}</div>
					)}
				</div>
				{item.tags.length > 0 && (
					<div className="flex gap-1 flex-wrap justify-end">
						{item.tags.slice(0, 3).map((t) => (
							<span
								key={t}
								className="text-[10px] bg-indigo-500/15 text-indigo-300 px-1.5 py-0.5 rounded-full"
							>
								#{t}
							</span>
						))}
					</div>
				)}
			</div>

			<dl className="px-3 pb-3 space-y-1.5 text-[12px]">
				<FieldRow
					label="username"
					value={item.username || "—"}
					onCopy={() => copy(item.username, `${item.id}-user`)}
					copied={copied === `${item.id}-user`}
				/>
				<div className="flex items-center gap-2 py-1 border-b border-neutral-800">
					<dt className="w-20 text-[10px] uppercase tracking-wide text-indigo-400">
						password
					</dt>
					<dd className="flex-1 font-mono text-neutral-200">{dotsOrReal}</dd>
					<button
						className="text-neutral-400 hover:text-neutral-200 text-xs"
						onClick={() => setRevealed((v) => !v)}
					>
						{revealed ? "hide" : "show"}
					</button>
					<button
						className="text-neutral-400 hover:text-neutral-200 text-xs"
						onClick={() => copy(item.password, `${item.id}-pw`)}
					>
						{copied === `${item.id}-pw` ? "✓" : "copy"}
					</button>
				</div>
				{item.website && (
					<FieldRow
						label="website"
						value={item.website}
						link
						onCopy={() => copy(item.website, `${item.id}-site`)}
						copied={copied === `${item.id}-site`}
					/>
				)}
				{item.environments.map((env) => (
					<FieldRow
						key={env.id}
						label={env.label.toLowerCase() || "url"}
						value={env.url}
						link
						onCopy={() => copy(env.url, `${item.id}-${env.id}`)}
						copied={copied === `${item.id}-${env.id}`}
					/>
				))}
				{item.notes && (
					<FieldRow label="notes" value={item.notes} onCopy={() => copy(item.notes, `${item.id}-notes`)} copied={copied === `${item.id}-notes`} />
				)}
			</dl>
		</li>
	);
}

function FieldRow({
	label,
	value,
	link,
	onCopy,
	copied,
}: {
	label: string;
	value: string;
	link?: boolean;
	onCopy: () => void;
	copied: boolean;
}) {
	return (
		<div className="flex items-center gap-2 py-1 border-b border-neutral-800 last:border-b-0">
			<dt className="w-20 text-[10px] uppercase tracking-wide text-indigo-400">{label}</dt>
			<dd className="flex-1 min-w-0 truncate">
				{link ? (
					<a
						href={value}
						target="_blank"
						rel="noreferrer"
						className="text-indigo-300 underline underline-offset-2 hover:text-indigo-200"
					>
						{value}
					</a>
				) : (
					value
				)}
			</dd>
			<button className="text-neutral-400 hover:text-neutral-200 text-xs" onClick={onCopy}>
				{copied ? "✓" : "copy"}
			</button>
		</div>
	);
}

function Loader({ text }: { text: string }) {
	return (
		<div className="flex items-center gap-2 text-sm text-neutral-400 py-8">
			<span className="inline-block size-3 rounded-full border-2 border-neutral-700 border-t-indigo-500 animate-spin" />
			{text}
		</div>
	);
}

function EmptyState({
	children,
	error,
}: {
	children: React.ReactNode;
	error?: boolean;
}) {
	return (
		<div
			className={`rounded-xl p-6 text-sm ${
				error ? "bg-rose-500/10 text-rose-200" : "bg-neutral-900 text-neutral-400"
			} border ${error ? "border-rose-500/30" : "border-neutral-800"}`}
		>
			{children}
		</div>
	);
}
