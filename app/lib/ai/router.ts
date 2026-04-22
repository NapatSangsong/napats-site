/**
 * Automatic model selection based on task type and input characteristics.
 * Default provider: Gemini (cost-effective). Falls back to Claude for specific tasks.
 */

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

export type Provider = "gemini" | "anthropic";

export interface ModelSelection {
  model: string;
  provider: Provider;
}

// Gemini models
const GEMINI_PRO = "gemini-2.5-pro-preview-06-05";
const GEMINI_FLASH = "gemini-2.5-flash-preview-05-20";

// Claude models (fallback)
const CLAUDE_OPUS = "claude-opus-4-7";
const CLAUDE_SONNET = "claude-sonnet-4-6";

export function selectModel(action: AIAction, inputLength?: number): ModelSelection {
  switch (action) {
    // High-quality tasks → Gemini Pro (was Claude Opus)
    case "planCourse":
      return { model: GEMINI_PRO, provider: "gemini" };

    // Medium tasks → Gemini Flash (was Claude Sonnet)
    case "generateLesson":
    case "generateQuiz":
    case "gradeShortAnswer":
    case "socraticRecall":
    case "deepDive":
    case "perspectiveLesson":
      return { model: GEMINI_FLASH, provider: "gemini" };

    // Chat — flash for short, pro for long
    case "chat":
      return inputLength !== undefined && inputLength < 200
        ? { model: GEMINI_FLASH, provider: "gemini" }
        : { model: GEMINI_FLASH, provider: "gemini" };

    // Light tasks → Gemini Flash (was Claude Haiku)
    case "suggestTitle":
    case "summarise":
    case "buildGraph":
    case "translate":
      return { model: GEMINI_FLASH, provider: "gemini" };
  }
}

/**
 * Legacy helper — returns just the model string for backward compat.
 * @deprecated Use selectModel() which returns { model, provider }
 */
export function selectModelString(action: AIAction, inputLength?: number): string {
  return selectModel(action, inputLength).model;
}
