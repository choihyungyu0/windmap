import Anthropic from "@anthropic-ai/sdk";

/**
 * LLM 전달 계층 공용 헬퍼 (서버 전용) — 판단·계산 금지, 설명·문안 생성 전용.
 *
 * 키 우선순위: OPENAI_API_KEY → ANTHROPIC_API_KEY → null(호출측 템플릿 폴백).
 * 어떤 실패든 null 반환 — 재난 정보 화면이 LLM 장애로 죽지 않는다.
 */

export async function generateText(
  system: string,
  prompt: string
): Promise<{ text: string; provider: string } | null> {
  if (process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 300,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return { text, provider: "openai" };
      } else {
        console.warn(`llm openai HTTP ${res.status}`);
      }
    } catch (e) {
      console.warn("llm openai 실패", e);
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic();
      const msg = await client.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content
        .find((b): b is Anthropic.TextBlock => b.type === "text")
        ?.text.trim();
      if (text) return { text, provider: "anthropic" };
    } catch (e) {
      console.warn("llm anthropic 실패", e);
    }
  }

  return null;
}
