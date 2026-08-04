"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  clearAll,
  countAll,
  loadAll,
  removeOne,
  saveMany,
  saveOne,
  supportsLocalChat,
  type ChatMessage,
} from "@/lib/chatdb";
import BrandMark from "@/components/BrandMark";

const POLL_MS = 4000;

// IndexedDB 只有浏览器里有，服务端渲染时一律当作不支持。
// 用 useSyncExternalStore 而不是 effect + setState，避免级联渲染
const subscribeNoop = () => () => {};
const getSupport = () => supportsLocalChat();
const getServerSupport = () => true;

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return "今天";
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// 相邻消息跨天时插一条日期分隔
function needsDivider(
  prev: ChatMessage | undefined,
  cur: ChatMessage,
): boolean {
  if (!prev) return true;
  return dayLabel(prev.createdAt) !== dayLabel(cur.createdAt);
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const supported = useSyncExternalStore(
    subscribeNoop,
    getSupport,
    getServerSupport,
  );
  const [localCount, setLocalCount] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // 拉取正在进行时不重入，避免轮询和手动触发打架
  const pulling = useRef(false);

  const scrollToBottom = useCallback((smooth: boolean) => {
    bottomRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "end",
    });
  }, []);

  // 拉 → 存本地 → 回执删服务器。回执失败不要紧，下次重拉按 id 覆盖
  const pull = useCallback(async () => {
    if (pulling.current) return;
    pulling.current = true;
    try {
      const res = await fetch("/api/chat/pull");
      if (!res.ok) return;
      const j = (await res.json()) as { messages?: ChatMessage[] };
      const incoming = j.messages ?? [];
      if (incoming.length === 0) return;

      await saveMany(incoming);
      setMessages(await loadAll());
      setLocalCount(await countAll());

      await fetch("/api/chat/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: incoming.map((m) => m.id) }),
      }).catch(() => {
        // 回执没送到就让它留在服务器上，下次重拉，不算错误
      });
    } catch {
      // 网络抖动交给下一次轮询
    } finally {
      pulling.current = false;
    }
  }, []);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void (async () => {
      try {
        const local = await loadAll();
        if (cancelled) return;
        setMessages(local);
        setLocalCount(local.length);
      } catch {
        if (!cancelled) setError("本地聊天记录读不出来了");
      } finally {
        if (!cancelled) setLoading(false);
      }
      await pull();
    })();
    return () => {
      cancelled = true;
    };
  }, [pull, supported]);

  // 页面可见时才轮询，切走就停，省电也省请求
  useEffect(() => {
    if (!supported) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => void pull(), POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void pull();
        start();
      } else {
        stop();
      }
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [pull, supported]);

  useEffect(() => {
    scrollToBottom(false);
  }, [messages.length, scrollToBottom]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");

    // 先本地上屏，网络慢也不卡手
    const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimistic: ChatMessage = {
      id: tempId,
      body: text,
      createdAt: new Date().toISOString(),
      mine: true,
    };
    await saveOne(optimistic);
    setMessages(await loadAll());
    setDraft("");

    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, clientId: tempId }),
      });
      const j = (await res.json().catch(() => null)) as {
        message?: ChatMessage;
        error?: string;
      } | null;
      if (!res.ok || !j?.message) {
        // 发失败就把乐观气泡撤掉，把草稿还给用户
        await removeOne(tempId);
        setMessages(await loadAll());
        setDraft(text);
        setError(j?.error ?? "没发出去，再试一次");
        return;
      }
      // 换成服务器返回的正式 id，避免同一条消息留下两份
      await removeOne(tempId);
      await saveOne({ ...j.message, mine: true });
      setMessages(await loadAll());
      setLocalCount(await countAll());
    } catch {
      await removeOne(tempId);
      setMessages(await loadAll());
      setDraft(text);
      setError("网络出了点问题，再试一次");
    } finally {
      setSending(false);
    }
  }

  async function wipe() {
    if (
      !window.confirm(
        "确定清空这台设备上的聊天记录吗？服务器上没有备份，清了就找不回来了。",
      )
    ) {
      return;
    }
    await clearAll();
    setMessages([]);
    setLocalCount(0);
  }

  if (!supported) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-6 md:max-w-2xl md:px-6">
        <h1 className="text-2xl font-bold text-foreground">聊天</h1>
        <div className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted">
            这个浏览器不支持本地存储，聊天记录没地方放。换 Safari 或 Chrome
            试试。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] w-full max-w-md flex-col px-4 md:h-[calc(100dvh-5rem)] md:max-w-2xl md:px-6">
      <div className="flex items-baseline justify-between pt-6">
        <h1 className="text-2xl font-bold text-foreground">聊天</h1>
        {localCount > 0 && (
          <button
            onClick={wipe}
            className="text-xs text-muted underline-offset-2 active:opacity-70"
          >
            清空本机记录
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        记录只存在你们各自的手机上，服务器不留底
      </p>

      {error && (
        <div className="mt-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-500">
          {error}
        </div>
      )}

      <div ref={listRef} className="mt-3 flex-1 space-y-2 overflow-y-auto pb-2">
        {loading ? (
          <div className="space-y-3">
            <div className="h-10 w-40 animate-pulse rounded-2xl bg-card" />
            <div className="ml-auto h-10 w-32 animate-pulse rounded-2xl bg-card" />
            <div className="h-10 w-48 animate-pulse rounded-2xl bg-card" />
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            <BrandMark size={92} variant="full" className="mx-auto opacity-80" />
            <p className="mt-2 text-sm text-muted">
              还没有聊天记录，说句话开始吧
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={m.id}>
              {needsDivider(messages[i - 1], m) && (
                <div className="my-3 text-center text-xs text-muted">
                  {dayLabel(m.createdAt)}
                </div>
              )}
              <div
                className={`flex ${m.mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[78%] rounded-2xl px-3 py-2 text-[15px] leading-relaxed shadow-sm ${
                    m.mine
                      ? "rounded-br-md bg-primary text-white"
                      : "rounded-bl-md border border-border bg-card text-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <span
                    className={`mt-0.5 block text-right text-[10px] ${
                      m.mine ? "text-white/70" : "text-muted"
                    }`}
                  >
                    {timeOf(m.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border bg-background py-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // 电脑上回车直接发，手机上回车还是换行
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !("ontouchstart" in window)
            ) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="说点什么…"
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-border bg-card px-3 py-2.5 text-[15px] text-foreground outline-none focus:border-primary"
        />
        <button
          onClick={() => void send()}
          disabled={sending || !draft.trim()}
          className="shrink-0 rounded-full bg-primary px-5 py-2.5 font-semibold text-white active:opacity-80 disabled:opacity-40"
        >
          发送
        </button>
      </div>
    </div>
  );
}
