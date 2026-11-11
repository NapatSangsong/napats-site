// Minimal service worker for the /thinkpad PWA: network only (status must be live),
// with an offline fallback page so the installed app opens even without signal.
const FALLBACK = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>ThinkPad</title><body style='font-family:system-ui;background:#0f1520;color:#e6ebf2;padding:24px'><h1 style='font-size:20px'>ThinkPad · VPN</h1><p>ออฟไลน์ — ต่อเน็ตแล้วลองใหม่</p></body>";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
	if (e.request.mode !== "navigate") return;
	e.respondWith(fetch(e.request).catch(() => new Response(FALLBACK, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
