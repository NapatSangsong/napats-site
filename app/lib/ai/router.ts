/**
 * Automatic model selection — smart routing across OpenRouter models.
 * Uses paid models for quality tasks, free models for light tasks.
 * $10 budget — optimize for quality + cost efficiency.
 */

import type { ModelRoute } from "./openrouter-client";

export type AIAction =
  | "planCourse"
  | "generateLesson"
  | "generateQuiz"
  | "gradeShortAnswer"
  | "chat"
  | "socraticRecall"
  | "deepDive"
  | "perspectiveLesson"
  | "suggestTitle"
  | "summarise"
  | "buildGraph"
  | "translate";

export type Provider = "openrouter";

export interface ModelSelection {
  model: string;
  provider: Provider;
  route?: ModelRoute;
}

// ── Model roster ────────────────────────────────────────────
// Paid (best quality/cost ratio on OpenRouter)
const GEMINI_FLASH = "google/gemini-2.0-flash-001";  // fast, great quality
const GEMINI_PRO = "google/gemini-2.5-pro-preview";  // highest quality

// Free fallbacks
const GEMMA_26B = "google/gemma-4-26b-a4b-it:free";
const GEMMA_31B = "google/gemma-4-31b-it:free";
const NEMOTRON = "nvidia/nemotron-3-super-120b-a12b:free";

// Task → model routing with fallback chain
const TASK_ROUTES: Record<AIAction, ModelRoute> = {
  // High quality → Gemini Pro (best reasoning)
  planCourse: {
    primary: GEMINI_PRO,
    fallbacks: [GEMINI_FLASH, GEMMA_31B],
  },

  // Content generation → Gemini Flash (fast + good quality, cheap)
  generateLesson: {
    primary: GEMINI_FLASH,
    fallbacks: [GEMMA_26B, GEMMA_31B],
  },
  perspectiveLesson: {
    primary: GEMINI_FLASH,
    fallbacks: [GEMMA_26B, GEMMA_31B],
  },
  deepDive: {
    primary: GEMINI_FLASH,
    fallbacks: [GEMMA_26B, GEMMA_31B],
  },
  socraticRecall: {
    primary: GEMINI_FLASH,
    fallbacks: [GEMMA_26B, GEMMA_31B],
  },

  // Quizzes & grading → Gemini Flash
  generateQuiz: {
    primary: GEMINI_FLASH,
    fallbacks: [GEMMA_31B, GEMMA_26B],
  },
  gradeShortAnswer: {
    primary: GEMINI_FLASH,
    fallbacks: [GEMMA_31B, NEMOTRON],
  },

  // Chat → Gemini Flash (fast, conversational)
  chat: {
    primary: GEMINI_FLASH,
    fallbacks: [GEMMA_26B, GEMMA_31B],
  },

  // Light tasks → free models (save budget)
  suggestTitle: {
    primary: GEMMA_26B,
    fallbacks: [GEMMA_31B, GEMINI_FLASH],
  },
  summarise: {
    primary: GEMMA_26B,
    fallbacks: [GEMMA_31B, GEMINI_FLASH],
  },
  buildGraph: {
    primary: GEMMA_26B,
    fallbacks: [GEMMA_31B, GEMINI_FLASH],
  },
  translate: {
    primary: GEMINI_FLASH,
    fallbacks: [GEMMA_26B, GEMMA_31B],
  },
};

export function selectModel(action: AIAction, _inputLength?: number): ModelSelection {
  const route = TASK_ROUTES[action];
  return {
    model: route.primary,
    provider: "openrouter",
    route,
  };
}
