/**
 * Remote "connect the VPN" for the ThinkPad, driven from LINE (owner decision
 * 2026-11-11: the VPN username/password are sent in the LINE chat).
 *
 *   LINE "vpn <user> <password>"  (or "vpn <password>" → ThinkPad reuses the last user)
 *     → webhook encrypts {u,p} at once with the ThinkPad's RSA-OAEP public key
 *       (THINKPAD_CMD_PUBLIC_JWK) — only ciphertext is queued (KV, 5 min TTL)
 *     → the next heartbeat response hands the command to the ThinkPad and
 *       deletes it from KV
 *     → Connect-Vpn.ps1 decrypts with its non-exportable key, connects, and
 *       POSTs each stage to /api/thinkpad/command-status → LINE push
 *       (incl. the Authenticator number to tap).
 * Nothing here logs or stores the plaintext.
 */
import { z } from "zod";

export const CMD_KEY = "thinkpad:cmd";
export const CMD_TTL_S = 300;

export interface QueuedCommand {
	id: string;
	type: "vpn_connect";
	/** base64 RSA-OAEP-256 ciphertext of {"u":..,"p":..} (u may be "") */
	enc: string;
	at: string;
}

/** "vpn" commands: null = not a vpn command; {usage} = vpn without a password */
export function parseVpnCommand(text: string): null | { usage: true } | { user: string; password: string } {
	const m = text.trim().match(/^vpn(?:\s+([\s\S]+))?$/i);
	if (!m) return null;
	const rest = (m[1] ?? "").trim();
	if (!rest) return { usage: true };
	const parts = rest.split(/\s+/);
	if (parts.length === 1) return { user: "", password: parts[0] };
	// first token = user, the rest (spaces kept) = password
	const user = parts[0];
	return { user, password: rest.slice(user.length).trim() };
}

function b64(bytes: Uint8Array): string {
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s);
}

export async function encryptForThinkpad(jwkJson: string, data: { u: string; p: string }): Promise<string> {
	const jwk = JSON.parse(jwkJson) as JsonWebKey;
	const key = await crypto.subtle.importKey("jwk", { ...jwk, key_ops: ["encrypt"], ext: true }, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
	const ct = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, new TextEncoder().encode(JSON.stringify(data)));
	return b64(new Uint8Array(ct));
}

export async function queueVpnCommand(env: Env, user: string, password: string): Promise<QueuedCommand> {
	if (!env.THINKPAD_CMD_PUBLIC_JWK) throw new Error("THINKPAD_CMD_PUBLIC_JWK not set");
	const cmd: QueuedCommand = {
		id: crypto.randomUUID().slice(0, 8),
		type: "vpn_connect",
		enc: await encryptForThinkpad(env.THINKPAD_CMD_PUBLIC_JWK, { u: user, p: password }),
		at: new Date().toISOString(),
	};
	await env.RATE_LIMIT_KV.put(CMD_KEY, JSON.stringify(cmd), { expirationTtl: CMD_TTL_S });
	return cmd;
}

/** hand the pending command (if any) to the ThinkPad, exactly once */
export async function takeCommand(kv: KVNamespace): Promise<QueuedCommand | null> {
	const raw = await kv.get(CMD_KEY);
	if (!raw) return null;
	await kv.delete(CMD_KEY);
	try {
		return JSON.parse(raw) as QueuedCommand;
	} catch {
		return null;
	}
}

// ---------- progress reports from Connect-Vpn.ps1 ----------

export const commandStatusSchema = z.strictObject({
	id: z.string().regex(/^[A-Za-z0-9-]{1,40}$/),
	stage: z.enum(["started", "already_connected", "need_number", "connected", "failed", "info"]),
	number: z.string().regex(/^\d{2,3}$/).optional(),
	/** short reason; no dots/slashes so no host names or paths can ride along */
	detail: z
		.string()
		.max(160)
		.regex(/^[A-Za-z0-9฀-๿ _:()'\-,]*$/)
		.optional(),
});
export type CommandStatus = z.infer<typeof commandStatusSchema>;

export function commandStatusText(s: CommandStatus, crdUrl: string): string {
	switch (s.stage) {
		case "started":
			return "🔌 ThinkPad เริ่มต่อ VPN แล้ว… รอเลขยืนยันสักครู่";
		case "already_connected":
			return "ℹ️ VPN บน ThinkPad ต่ออยู่แล้ว — ไม่ได้ทำอะไร";
		case "need_number":
			return `🔢 เปิด Microsoft Authenticator แล้วกดเลข\n\n${s.number ?? "?"}\n\n(ต้องกดภายในไม่กี่นาที)`;
		case "connected":
			return "✅ VPN บน ThinkPad ต่อสำเร็จแล้ว";
		case "failed":
			return `❌ ต่อ VPN ไม่สำเร็จ${s.detail ? `: ${s.detail}` : ""}\nเปิด Chrome Remote Desktop: ${crdUrl}`;
		case "info":
			return `ℹ️ ${s.detail ?? ""}`;
	}
}

export const VPN_USAGE = [
	"ต่อ VPN บน ThinkPad:",
	"· vpn <user> <password>",
	"· vpn <password>  (ใช้ user ล่าสุด)",
	"ThinkPad จะเริ่มภายใน ~1 นาที แล้วส่งเลขให้กดใน Authenticator",
	"หลังส่งแล้ว กดค้างที่ข้อความรหัส → Unsend เพื่อลบออกจากแชท",
].join("\n");
