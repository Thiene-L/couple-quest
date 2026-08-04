"use client";

import { useCallback, useEffect, useState } from "react";

// 和后端白名单保持一致
const EMOJIS = ["❤️", "😍", "😂", "👏", "🔥", "🥺"] as const;

export interface ReactionItem {
  userId: string;
  emoji: string;
  userName: string;
}

interface Props {
  targetType: "completion" | "answer";
  targetId: string;
  /** 目标是谁的：等于我自己时只读，不给贴 */
  ownerId: string;
  myUserId: string;
  /** 父级批量拉过就传进来，省一次请求；不传则自己拉 */
  initial?: ReactionItem[];
}

interface EmojiGroup {
  emoji: string;
  names: string[];
  /** 这枚里有没有我贴的 */
  mine: boolean;
}

// 同一个 emoji 合成一枚，后面跟贴的人；一人一目标只有一个表情，不会重复
function groupByEmoji(items: ReactionItem[], myUserId: string): EmojiGroup[] {
  const groups: EmojiGroup[] = [];
  for (const item of items) {
    const found = groups.find((g) => g.emoji === item.emoji);
    if (found) {
      found.names.push(item.userName);
      if (item.userId === myUserId) found.mine = true;
    } else {
      groups.push({
        emoji: item.emoji,
        names: [item.userName],
        mine: item.userId === myUserId,
      });
    }
  }
  return groups;
}

function chipClass(mine: boolean, interactive: boolean): string {
  return [
    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
    interactive ? "active:opacity-80" : "",
    mine
      ? "border-primary bg-primary-soft text-primary"
      : "border-border bg-background text-muted",
  ].join(" ");
}

function ChipBody({ group }: { group: EmojiGroup }) {
  return (
    <>
      <span className="text-sm leading-none">{group.emoji}</span>
      <span className="max-w-24 truncate">{group.names.join("、")}</span>
    </>
  );
}

// 贴在打卡记录 / 每日答案下面的表情条
export default function ReactionBar({
  targetType,
  targetId,
  ownerId,
  myUserId,
  initial,
}: Props) {
  const hasInitial = initial !== undefined;
  const [items, setItems] = useState<ReactionItem[]>(initial ?? []);
  const [loading, setLoading] = useState(!hasInitial);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const readOnly = ownerId === myUserId;

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/reactions?targetType=${targetType}&targetIds=${encodeURIComponent(targetId)}`,
      );
      if (!res.ok) return;
      const j = (await res.json()) as {
        reactions?: Record<string, ReactionItem[] | undefined>;
      };
      setItems(j.reactions?.[targetId] ?? []);
    } catch {
      // 表情是锦上添花，拉不到就空着
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId]);

  // 父级给了初始数据就不再自己拉；之后以组件内状态为准（乐观更新不能被覆盖）
  useEffect(() => {
    if (hasInitial) return;
    // load 的第一条语句就是 await，setState 全发生在其后；规则看不穿 useCallback
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [hasInitial, load]);

  // emoji 传 null 表示撤掉我贴的那个
  async function apply(emoji: string | null) {
    const prev = items;
    const rest = items.filter((i) => i.userId !== myUserId);
    // 换表情时沿用已经拿到的显示名，第一次贴还没有就先写「我」
    const myName = items.find((i) => i.userId === myUserId)?.userName ?? "我";
    const next =
      emoji === null
        ? rest
        : [...rest, { userId: myUserId, emoji, userName: myName }];

    // 先动 UI，请求失败再回滚
    setItems(next);
    setOpen(false);
    setError("");

    try {
      const res = await fetch("/api/reactions", {
        method: emoji === null ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          emoji === null
            ? { targetType, targetId }
            : { targetType, targetId, emoji },
        ),
      });
      if (!res.ok) {
        setItems(prev);
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "没贴上，再试一次");
      }
    } catch {
      setItems(prev);
      setError("网络不太好，再试一次");
    }
  }

  const mine = items.find((i) => i.userId === myUserId) ?? null;
  const groups = groupByEmoji(items, myUserId);

  if (loading) return null;
  // 自己的东西又没人贴过：不占地方
  if (readOnly && groups.length === 0) return null;

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {groups.map((g) =>
          readOnly ? (
            <span
              key={g.emoji}
              title={g.names.join("、")}
              className={chipClass(g.mine, false)}
            >
              <ChipBody group={g} />
            </span>
          ) : (
            <button
              key={g.emoji}
              type="button"
              // 点自己贴的那枚 = 撤掉；点对方贴的 = 换成同款
              onClick={() => void apply(g.mine ? null : g.emoji)}
              title={g.names.join("、")}
              className={chipClass(g.mine, true)}
            >
              <ChipBody group={g} />
            </button>
          ),
        )}

        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              setError("");
              setOpen((v) => !v);
            }}
            aria-expanded={open}
            aria-label={mine ? "换个表情" : "贴个表情"}
            className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted active:opacity-80"
          >
            {mine ? "换" : "+"}
          </button>
        )}
      </div>

      {open && !readOnly && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-background p-2">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => void apply(mine?.emoji === e ? null : e)}
              className={`rounded-full px-2 py-1 text-lg leading-none active:opacity-80 ${
                mine?.emoji === e ? "bg-primary-soft" : ""
              }`}
            >
              {e}
            </button>
          ))}
          {mine && (
            <button
              type="button"
              onClick={() => void apply(null)}
              className="ml-auto rounded-full px-2 py-1 text-xs text-muted active:opacity-80"
            >
              撤掉
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-accent">{error}</p>}
    </div>
  );
}
