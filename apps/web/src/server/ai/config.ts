import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";

/**
 * 現在のAIプロバイダーを取得
 */
export function getProvider(): "anthropic" | "google" | "openai" {
  return (process.env.AI_PROVIDER ?? "anthropic") as
    | "anthropic"
    | "google"
    | "openai";
}

/**
 * 使用するAIモデルを選択
 * 環境変数 AI_PROVIDER で切り替え可能
 * - "anthropic" → Claude (デフォルト)
 * - "google" → Gemini
 * - "openai" → GPT-4o-mini
 */
export function getModel() {
  const provider = getProvider();
  if (provider === "openai") {
    return openai("gpt-4o-mini");
  }
  if (provider === "google") {
    return google("gemini-2.0-flash");
  }
  return anthropic("claude-sonnet-4-20250514");
}

/**
 * Claude用のextended thinking設定を取得
 */
export function getProviderOptions() {
  const provider = getProvider();
  if (provider === "anthropic") {
    return {
      anthropic: {
        thinking: {
          type: "enabled" as const,
          budgetTokens: 10000, // 思考に使うトークン数
        },
      },
    };
  }
  return undefined;
}
