/**
 * Master password gate — the entrance to the learning platform.
 * Matches the design's editorial, "private library" aesthetic.
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/learning.gate";
import { verifySessionCookie } from "~/lib/session.server";

export function meta() {
	return [{ title: "Napat · Learning" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
	const env = context.cloudflare.env;

	// If already authenticated, redirect to command center
	const session = await verifySessionCookie(
		request.headers.get("Cookie"),
		env.SESSION_HMAC_SECRET,
	);

	if (session) {
		const url = new URL(request.url);
		const next = url.searchParams.get("next") || "/learning";
		return { authenticated: true, next };
	}

	return { authenticated: false, next: null };
}

export default function GatePage({ loaderData }: Route.ComponentProps) {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [shake, setShake] = useState(false);
	const [cooldown, setCooldown] = useState<number | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const next = searchParams.get("next") || "/learning";

	// Redirect if already authenticated
	useEffect(() => {
		if (loaderData.authenticated && loaderData.next) {
			navigate(loaderData.next, { replace: true });
		}
	}, [loaderData.authenticated, loaderData.next, navigate]);

	// Focus input on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Cooldown countdown
	useEffect(() => {
		if (cooldown === null || cooldown <= 0) return;
		const id = setInterval(() => {
			setCooldown((c) => (c !== null && c > 1 ? c - 1 : null));
		}, 1000);
		return () => clearInterval(id);
	}, [cooldown]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (loading || !password.trim() || cooldown) return;

		setLoading(true);
		setError(null);

		try {
			const res = await fetch("/learning/api/session", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: window.location.origin,
				},
				body: JSON.stringify({ password }),
			});

			if (res.ok) {
				navigate(next, { replace: true });
				return;
			}

			const data = (await res.json()) as { retry_after?: number; message?: string };

			if (res.status === 429) {
				const retryAfter = data.retry_after ?? 60;
				setCooldown(retryAfter);
				setError(null);
			} else {
				setError(data.message || "something went sideways.");
				setShake(true);
				setTimeout(() => setShake(false), 500);
			}
		} catch {
			setError("you've drifted offline. reconnect to continue.");
		} finally {
			setLoading(false);
			setPassword("");
		}
	};

	const formatCooldown = (seconds: number): string => {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return m > 0 ? `${m}m ${s}s` : `${s}s`;
	};

	return (
		<div className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] flex flex-col items-center justify-center px-8">
			{/* Film grain */}
			<div className="film-grain" />

			<div className="w-full max-w-md">
				{/* Logo */}
				<div className="flex items-center gap-2 mb-16">
					<span className="font-serif text-xl font-medium text-white tracking-tight">
						Napat
					</span>
					<span className="film-dot" />
					<span
						className="mono-accent text-[9px] uppercase tracking-[0.3em] text-white/20 ml-3 border-l border-white/[0.06] pl-3"
					>
						Learning
					</span>
				</div>

				{/* Title */}
				<h1 className="font-serif text-6xl sm:text-7xl font-medium text-white tracking-tight leading-[0.9] mb-2">
					Learning<span className="text-[#cc0000]">.</span>
				</h1>
				<p className="font-serif text-2xl text-white/20 italic mb-16">
					a private library.
				</p>

				{/* Gate label */}
				<div className="flex items-center gap-4 mb-6">
					<span className="inline-block h-px w-14 bg-white/20" />
					<span className="mono-accent text-[10px] uppercase tracking-[0.3em] text-white/20">
						Protected · Enter to continue
					</span>
				</div>

				{/* Password form */}
				<form onSubmit={handleSubmit}>
					<div className={shake ? "learning-shake" : ""}>
						<input
							ref={inputRef}
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="master password"
							disabled={loading || !!cooldown}
							className="w-full bg-transparent border-none outline-none font-serif text-[28px] text-[#e5e5e5] placeholder:text-white/15 pb-3.5 pt-3.5"
							autoComplete="current-password"
						/>
						<div
							className="h-px transition-colors duration-300"
							style={{
								background: error
									? "#cc0000"
									: loading
										? "#cc0000"
										: "rgba(255,255,255,0.12)",
							}}
						/>
					</div>

					{/* Error message */}
					{error && (
						<p className="font-serif text-sm text-[#cc0000] italic mt-4">
							{error}
						</p>
					)}

					{/* Cooldown message */}
					{cooldown !== null && cooldown > 0 && (
						<div className="mt-4 flex items-center gap-3">
							<span className="inline-block w-[5px] h-[5px] rounded-full bg-[#cc0000] learning-breathe" />
							<span className="mono-accent text-[10px] uppercase tracking-[0.25em] text-white/40">
								cooling down · retry in {formatCooldown(cooldown)}
							</span>
						</div>
					)}

					{/* Submit hint */}
					<div className="mt-8 flex items-center justify-between">
						<span className="mono-accent text-[9px] uppercase tracking-[0.25em] text-white/15">
							{loading ? "verifying…" : "press enter"}
						</span>
						{loading && (
							<span className="inline-block w-[5px] h-[5px] rounded-full bg-[#cc0000] learning-breathe" />
						)}
					</div>
				</form>
			</div>

			{/* Footer */}
			<div className="fixed bottom-8 left-0 right-0 flex justify-center">
				<span className="mono-accent text-[9px] uppercase tracking-[0.3em] text-white/10">
					built with code, studied in silence
				</span>
			</div>
		</div>
	);
}
