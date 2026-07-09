"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 시민 질의응답 챗봇 위젯 — 플로팅 버튼 + 패널.
 * 답변은 /api/chat (RAG: 물리 엔진 계산값에 근거 고정, 판단 미개입).
 */

interface Msg {
  role: "user" | "assistant";
  text: string;
}

const SUGGESTS = ["우리 동네 지금 괜찮아요?", "어느 동네가 영향권인가요?", "이 예측은 어떻게 계산하나요?"];

export function CitizenChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, open]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: question }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: msgs.slice(-6) }),
      });
      const d = (await res.json()) as { ok: boolean; text?: string };
      setMsgs((m) => [
        ...m,
        { role: "assistant", text: d.ok && d.text ? d.text : "응답에 실패했습니다. 잠시 후 다시 시도해 주세요." },
      ]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", text: "네트워크 오류가 발생했습니다." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "시민 문의 챗봇 닫기" : "시민 문의 챗봇 열기"}
        className="fixed bottom-6 right-6 z-[90] flex h-13 w-13 items-center justify-center rounded-full bg-gradient-to-br from-brand to-[#00b8d4] p-3.5 text-white shadow-lg transition-transform hover:scale-105"
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>

      {/* 패널 */}
      {open && (
        <div
          role="dialog"
          aria-label="시민 문의 챗봇"
          className="fixed bottom-22 right-6 z-[90] flex max-h-[70vh] w-[22rem] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
          style={{ bottom: "5.5rem" }}
        >
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-bold">무엇이든 물어보세요</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              답변은 물리 모델 계산값에 근거 · 시뮬레이션 기준
            </p>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">예시 질문:</p>
                {SUGGESTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="block w-full rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:border-brand/50 hover:text-brand"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                {m.text}
              </div>
            ))}
            {busy && <p className="text-xs text-muted-foreground">답변 작성 중…</p>}
          </div>

          <form
            className="flex items-center gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="질문을 입력하세요"
              className="flex-1 rounded-full border border-input px-4 py-2 text-sm outline-none focus:border-brand"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="질문 보내기"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
