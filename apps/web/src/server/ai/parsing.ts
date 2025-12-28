/**
 * AIの応答からMermaidコードと理由を抽出
 */
export function parseAiResponse(text: string): {
  mermaidCode: string | null;
  reason: string | null;
} {
  const mermaidMatch = text.match(
    /---MERMAID_START---\s*([\s\S]*?)\s*---MERMAID_END---/,
  );
  const reasonMatch = text.match(
    /---REASON_START---\s*([\s\S]*?)\s*---REASON_END---/,
  );

  return {
    mermaidCode: mermaidMatch?.[1]?.trim() ?? null,
    reason: reasonMatch?.[1]?.trim() ?? null,
  };
}
