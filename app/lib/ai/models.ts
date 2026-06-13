/**
 * Shared AI model catalog for the learning platform UI.
 * Single source of truth — every model picker derives from this list,
 * so adding/removing a model happens here only.
 */
export interface AiModelOption {
	id: string;
	label: string;
	desc: string;
	badge: string;
	cost: string;
}

export const AI_MODELS: AiModelOption[] = [
	{ id: "auto", label: "AUTO", desc: "ระบบเลือกให้อัตโนมัติ", badge: "RECOMMENDED", cost: "" },
	// Premium
	{ id: "google/gemini-2.5-pro-preview", label: "GEMINI PRO", desc: "เก่งสุด · วิเคราะห์ลึก · ไทยดีมาก", badge: "BEST", cost: "$" },
	{ id: "anthropic/claude-sonnet-4-5", label: "CLAUDE SONNET 4.5", desc: "เก่งภาษา · เนื้อหาดี · โค้ดเก่ง", badge: "PREMIUM", cost: "$$" },
	{ id: "google/gemini-2.0-flash-001", label: "GEMINI FLASH", desc: "เร็ว · คุณภาพดี · ประหยัด", badge: "FAST", cost: "$" },
	// Mid-tier
	{ id: "qwen/qwen3.5-122b-a10b", label: "QWEN 3.5 122B", desc: "วิเคราะห์เชิงลึก · Multimodal · MoE", badge: "SMART", cost: "$" },
	{ id: "mistralai/mistral-small-2603", label: "MISTRAL SMALL 4", desc: "เก่งหลายภาษา · 262K context", badge: "MULTILINGUAL", cost: "$" },
	{ id: "google/gemini-3-flash-preview", label: "GEMINI 3 FLASH", desc: "ใหม่สุด · เร็ว · Agent-ready", badge: "NEW", cost: "$" },
	// Free
	{ id: "google/gemma-4-31b-it:free", label: "GEMMA 4 31B", desc: "ฟรี · วิเคราะห์ได้ · ไทยพอใช้", badge: "FREE", cost: "" },
	{ id: "google/gemma-4-26b-a4b-it:free", label: "GEMMA 4 26B", desc: "ฟรี · เร็ว · MoE", badge: "FREE", cost: "" },
	{ id: "nvidia/nemotron-3-super-120b-a12b:free", label: "NEMOTRON 120B", desc: "ฟรี · 120B params · Hybrid MoE", badge: "FREE", cost: "" },
	{ id: "inclusionai/ling-2.6-flash:free", label: "LING 2.6 FLASH", desc: "ฟรี · 104B · เร็ว", badge: "FREE", cost: "" },
];

const COMPACT_MODEL_IDS = [
	"auto",
	"google/gemini-2.5-pro-preview",
	"google/gemini-2.0-flash-001",
	"anthropic/claude-sonnet-4-5",
	"google/gemma-4-31b-it:free",
	"google/gemma-4-26b-a4b-it:free",
];

/** Compact subset for the course/lesson regeneration pickers. */
export const COMPACT_MODELS: AiModelOption[] = AI_MODELS.filter((m) =>
	COMPACT_MODEL_IDS.includes(m.id),
);
