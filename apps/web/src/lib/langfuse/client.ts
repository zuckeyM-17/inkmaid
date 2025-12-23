import { Langfuse } from "langfuse";

/**
 * Langfuseクライアントのシングルトンインスタンス
 * LLM呼び出しのトレーシングとオブザーバビリティに使用
 */
let langfuseInstance: Langfuse | null = null;

/**
 * Langfuseが有効かどうかを判定
 */
export function isLangfuseEnabled(): boolean {
  return !!(
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
  );
}

/**
 * Langfuseクライアントを取得
 * 環境変数が設定されていない場合はnullを返す
 */
export function getLangfuse(): Langfuse | null {
  if (!isLangfuseEnabled()) {
    return null;
  }

  if (!langfuseInstance) {
    langfuseInstance = new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      baseUrl: process.env.LANGFUSE_HOST ?? "http://localhost:3001",
      // フラッシュ間隔（ミリ秒）
      flushInterval: 1000,
    });
  }

  return langfuseInstance;
}

/**
 * Langfuseの保留中のイベントをフラッシュ
 * アプリケーション終了時やリクエスト完了時に呼び出す
 */
export async function flushLangfuse(): Promise<void> {
  if (langfuseInstance) {
    await langfuseInstance.flushAsync();
  }
}

/**
 * Langfuseクライアントをシャットダウン
 */
export async function shutdownLangfuse(): Promise<void> {
  if (langfuseInstance) {
    await langfuseInstance.shutdownAsync();
    langfuseInstance = null;
  }
}

