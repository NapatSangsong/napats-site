import { defineConfig } from "vitest/config";

// Standalone vitest config: keeps the Cloudflare/React Router plugins in
// vite.config.ts out of the test pipeline (pure unit tests only).
export default defineConfig({
	test: {
		include: ["app/**/__tests__/**/*.test.ts"],
	},
});
