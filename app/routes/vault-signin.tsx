import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { getBrowserSupabase } from "~/lib/supabase";

export function meta() {
	return [{ title: "Napat Dev — Sign in" }];
}

export default function VaultSignIn() {
	const navigate = useNavigate();
	const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const supabase = getBrowserSupabase();
				const {
					data: { session },
				} = await supabase.auth.getSession();
				if (!cancelled && session) navigate("/vault");
			} catch {
				/* Supabase env not configured — leave form visible */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [navigate]);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setBusy(true);
		try {
			const supabase = getBrowserSupabase();
			const { error } =
				mode === "signIn"
					? await supabase.auth.signInWithPassword({ email, password })
					: await supabase.auth.signUp({ email, password });
			if (error) throw error;
			navigate("/vault");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	return (
		<main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-100 px-4">
			<form
				onSubmit={submit}
				className="w-full max-w-sm space-y-4 p-6 rounded-2xl bg-neutral-900 border border-neutral-800"
			>
				<header className="flex items-center gap-3 mb-2">
					<div className="size-9 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-300 flex items-center justify-center text-white text-lg">
						🔑
					</div>
					<div>
						<h1 className="text-base font-semibold">Napat Dev</h1>
						<p className="text-xs text-neutral-400">Vault · web access (read-only)</p>
					</div>
				</header>

				<div className="flex rounded-lg bg-neutral-800 p-0.5 text-xs font-semibold">
					{(["signIn", "signUp"] as const).map((m) => (
						<button
							key={m}
							type="button"
							className={`flex-1 rounded-md py-1.5 ${
								mode === m
									? "bg-neutral-700 text-white"
									: "text-neutral-400"
							}`}
							onClick={() => setMode(m)}
						>
							{m === "signIn" ? "Sign in" : "Create account"}
						</button>
					))}
				</div>

				<label className="block text-xs text-neutral-400">
					Email
					<input
						type="email"
						autoComplete="email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="mt-1 w-full rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
					/>
				</label>
				<label className="block text-xs text-neutral-400">
					Password (your Supabase account password)
					<input
						type="password"
						autoComplete={mode === "signIn" ? "current-password" : "new-password"}
						required
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="mt-1 w-full rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
					/>
				</label>

				{error && <p className="text-xs text-rose-400">{error}</p>}

				<button
					type="submit"
					disabled={busy || !email || !password}
					className="w-full rounded-md bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-semibold py-2 disabled:opacity-50"
				>
					{busy ? "…" : mode === "signIn" ? "Sign in" : "Create account"}
				</button>

				<p className="text-[11px] text-neutral-500 leading-relaxed">
					Your vault contents stay encrypted end-to-end. Signing in only gets the
					encrypted blob — you'll type your master password on the next screen to
					decrypt locally. Close this tab and the master key is gone from memory.
				</p>
			</form>
		</main>
	);
}
