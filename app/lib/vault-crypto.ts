// Web Crypto port of the Mac app's PBKDF2 + AES-GCM scheme. Parameters must
// exactly match the Swift implementation (see NapatDevPWD
// NapatDev/Security/KeyDerivation.swift + Crypto.swift).
//
//   - PBKDF2-HMAC-SHA256, 600_000 iterations, 32-byte output.
//   - AES-GCM with a 12-byte nonce, 16-byte tag.
//
// On the Swift side CryptoKit's AES.GCM.SealedBox.combined concatenates
// nonce (12) + ciphertext + tag (16). We decode that layout here.

const PBKDF2_ITERATIONS = 600_000;
const KEY_LENGTH_BITS = 256;
const VERIFIER_PLAINTEXT = "NapatDev-v1";

export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
	const enc = new TextEncoder();
	const baseKey = await crypto.subtle.importKey(
		"raw",
		enc.encode(password) as BufferSource,
		{ name: "PBKDF2" },
		false,
		["deriveKey"],
	);
	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			salt: salt as BufferSource,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		baseKey,
		{ name: "AES-GCM", length: KEY_LENGTH_BITS },
		false,
		["encrypt", "decrypt"],
	);
}

export async function openSealed(combined: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
	if (combined.length < 12 + 16) {
		throw new Error("Ciphertext too short to contain a nonce and tag");
	}
	const nonce = combined.slice(0, 12);
	const ciphertextAndTag = combined.slice(12);
	const plaintext = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 },
		key,
		ciphertextAndTag as BufferSource,
	);
	return new Uint8Array(plaintext);
}

export async function verifyMasterPassword(verifier: Uint8Array, key: CryptoKey): Promise<boolean> {
	try {
		const bytes = await openSealed(verifier, key);
		const text = new TextDecoder().decode(bytes);
		return text === VERIFIER_PLAINTEXT;
	} catch {
		return false;
	}
}

/// Matches the VaultFile schema written by NapatDev (Models/Vault.swift).
export type EnvironmentURL = {
	id: string;
	label: string;
	url: string;
};

export type VaultItem = {
	id: string;
	title: string;
	username: string;
	website: string;
	brandSeed: string;
	isFavorite: boolean;
	passkeyNote?: string | null;
	password: string;
	notes: string;
	environments: EnvironmentURL[];
	tags: string[];
	createdAt: string;
	updatedAt: string;
};

export type VaultFile = {
	schemaVersion: number;
	vaults: Array<{ id: string; name: string; iconSeed: string; createdAt: string }>;
	items: VaultItem[];
	updatedAt: string;
};

export async function decryptVaultFile(
	ciphertext: Uint8Array,
	key: CryptoKey,
): Promise<VaultFile> {
	const jsonBytes = await openSealed(ciphertext, key);
	const text = new TextDecoder().decode(jsonBytes);
	const raw = JSON.parse(text);
	// Tolerate missing optional fields (matches Swift's backward-compat decoder).
	return {
		schemaVersion: raw.schemaVersion ?? 1,
		vaults: raw.vaults ?? [],
		items: (raw.items ?? []).map((item: Partial<VaultItem>) => ({
			id: item.id ?? crypto.randomUUID(),
			title: item.title ?? "",
			username: item.username ?? "",
			website: item.website ?? "",
			brandSeed: item.brandSeed ?? "default",
			isFavorite: item.isFavorite ?? false,
			passkeyNote: item.passkeyNote ?? null,
			password: item.password ?? "",
			notes: item.notes ?? "",
			environments: item.environments ?? [],
			tags: item.tags ?? [],
			createdAt: item.createdAt ?? "",
			updatedAt: item.updatedAt ?? "",
		})),
		updatedAt: raw.updatedAt ?? "",
	};
}
