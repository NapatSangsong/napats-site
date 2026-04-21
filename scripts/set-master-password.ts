#!/usr/bin/env npx tsx
/**
 * Derive a PBKDF2-SHA-256 hash from a master password.
 * Prints the MASTER_PASSWORD_HASH value for .dev.vars or `wrangler secret put`.
 *
 * Usage:
 *   echo "my-password" | npx tsx scripts/set-master-password.ts
 *   npx tsx scripts/set-master-password.ts   # then type password + Enter + Ctrl-D
 */

import { webcrypto } from "node:crypto";

const PBKDF2_ITERATIONS = 100_000;

async function main() {
	// Read password from stdin
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk);
	}
	const password = Buffer.concat(chunks).toString("utf-8").trim();

	if (!password) {
		console.error("Error: no password provided on stdin.");
		console.error("Usage: echo 'my-password' | npx tsx scripts/set-master-password.ts");
		process.exit(1);
	}

	// Generate random salt (16 bytes)
	const salt = new Uint8Array(16);
	webcrypto.getRandomValues(salt);

	// Derive hash
	const enc = new TextEncoder();
	const baseKey = await webcrypto.subtle.importKey(
		"raw",
		enc.encode(password),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);
	const bits = await webcrypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		baseKey,
		256,
	);

	const saltB64 = Buffer.from(salt).toString("base64");
	const hashB64 = Buffer.from(bits).toString("base64");
	const result = `${saltB64}:${hashB64}`;

	console.log("\n── MASTER_PASSWORD_HASH ──");
	console.log(result);
	console.log("\nPaste this into .dev.vars or run:");
	console.log(`  echo "${result}" | wrangler secret put MASTER_PASSWORD_HASH`);
	console.log("\nAlso generate a session HMAC secret:");
	console.log(`  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
