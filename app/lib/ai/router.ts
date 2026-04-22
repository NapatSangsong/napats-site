/**
 * Automatic model selection — routes tasks to the best free model.
 * Default: OpenRouter free tier ($0/month).
 * Fallback: Claude (when user explicitly selects it).
 */

import { FREE_MODELS, type ModelRoute } from "./openrouter-client";

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

export type Provider = "openrouter" | "gemini" | "anthropic";

export interface ModelSelection {
  model: string;
  provider: Provider;
  route?: ModelRoute; // OpenRouter: ordered list of models to try
}

// Task → model routing with fallback chain
const TASK_ROUTES: Record<AIAction, ModelRoute> = {
  // Complex tasks → Gemma 31B primary (dense, higher quality)
  planCourse: {
    primary: FREE_MODELS.GEMMA_31B,
    fallbacks: [FREE_MODELS.NEMOTRON, FREE_MODELS.GEMMA_26B],
  },
  generateQuiz: {
    primary: FREE_MODELS.GEMMA_31B,
    fallbacks: [FREE_MODELS.GEMMA_26B, FREE_MODELS.NEMOTRON],
  },
  gradeShortAnswer: {
    primary: FREE_MODELS.GEMMA_31B,
    fallbacks: [FREE_MODELS.NEMOTRON, FREE_MODELS.GEMMA_26B],
  },

  // Content generation → Gemma 26B primary (fast, good at teaching)
  generateLesson: {
    primary: FREE_MODELS.GEMMA_26B,
    fallbacks: [FREE_MODELS.GEMMA_31B, FREE_MODELS.NEMOTRON],
  },
  perspectiveLesson: {
    primary: FREE_MODELS.GEMMA_26B,
    fallbacks: [FREE_MODELS.GEMMA_31B, FREE_MODELS.NEMOTRON],
  },
  deepDive: {
    primary: FREE_MODELS.GEMMA_26B,
    fallbacks: [FREE_MODELS.GEMMA_31B, FREE_MODELS.INCLUSION],
  },
  socraticRecall: {
    primary: FREE_MODELS.GEMMA_26B,
    fallbacks: [FREE_MODELS.GEMMA_31B, FREE_MODELS.NEMOTRON],
  },

  // Chat → Gemma 26B (fast, good at Thai)
  chat: {
    primary: FREE_MODELS.GEMMA_26B,
    fallbacks: [FREE_MODELS.GEMMA_31B, FREE_MODELS.MINIMAX],
  },

  // Light tasks → Gemma 26B (fast)
  suggestTitle: {
    primary: FREE_MODELS.GEMMA_26B,
    fallbacks: [FREE_MODELS.MINIMAX, FREE_MODELS.INCLUSION],
  },
  summarise: {
    primary: FREE_MODELS.GEMMA_26B,
    fallbacks: [FREE_MODELS.MINIMAX, FREE_MODELS.INCLUSION],
  },
  buildGraph: {
    primary: FREE_MODELS.GEMMA_26B,
    fallbacks: [FREE_MODELS.GEMMA_31B, FREE_MODELS.MINIMAX],
  },
  translate: {
    primary: FREE_MODELS.GEMMA_26B,
    fallbacks: [FREE_MODELS.GEMMA_31B, FREE_MODELS.MINIMAX],
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
