import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { milestones } from "@/db/schema";
import {
  anniversaryOrdinal,
  daysBetween,
  daysUntil,
  isValidDate,
  todayLocal,
} from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";

const KINDS = ["together", "anniversary", "countdown"] as const;
type Kind = (typeof KINDS)[number];

function isKind(v: unknown): v is Kind {
  return typeof v === "string" && (KINDS as readonly string[]).includes(v);
}

// 表情最多留 4 个码点，避免有人往里塞一整段文字
function normalizeEmoji(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return [...trimmed].slice(0, 4).join("");
}

// GET /api/milestones：
// together = 「在一起」那条（最多一条），附在一起第几天；
// upcoming = 其余全部，附距离下一次还有几天，按 daysLeft 升序，过期的倒数日沉底
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  const rows = await db.select().from(milestones);
  const today = todayLocal();

  const togetherRow = rows.find((r) => r.kind === "together");
  const together = togetherRow
    ? {
        id: togetherRow.id,
        title: togetherRow.title,
        date: togetherRow.date,
        emoji: togetherRow.emoji,
        days: daysBetween(togetherRow.date, today),
      }
    : null;

  const upcoming = rows
    .filter((r) => r.kind !== "together")
    .map((r) => {
      const kind = r.kind as "anniversary" | "countdown";
      const daysLeft = daysUntil(r.date, kind, today);
      return {
        id: r.id,
        title: r.title,
        date: r.date,
        kind,
        emoji: r.emoji,
        daysLeft,
        expired: kind === "countdown" && daysLeft < 0,
        ordinal:
          kind === "anniversary" ? anniversaryOrdinal(r.date, today) : null,
      };
    })
    .sort((a, b) => {
      if (a.expired !== b.expired) return a.expired ? 1 : -1;
      // 过期的之间：刚过去的排前面
      if (a.expired && b.expired) return b.daysLeft - a.daysLeft;
      if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
      return a.date.localeCompare(b.date);
    });

  return Response.json({ together, upcoming });
}

// POST /api/milestones：新增纪念日。
// kind=together 全局只允许一条，已存在则改为更新那一条
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const { title, date, kind, emoji } = (body ?? {}) as {
    title?: unknown;
    date?: unknown;
    kind?: unknown;
    emoji?: unknown;
  };

  if (typeof title !== "string" || !title.trim()) {
    return Response.json({ error: "请填写纪念日名称" }, { status: 400 });
  }
  const name = title.trim();
  if ([...name].length > 20) {
    return Response.json(
      { error: "名称太长啦（最多 20 字）" },
      { status: 400 },
    );
  }
  if (typeof date !== "string" || !isValidDate(date)) {
    return Response.json({ error: "请选择正确的日期" }, { status: 400 });
  }
  if (!isKind(kind)) {
    return Response.json({ error: "纪念日类型不正确" }, { status: 400 });
  }
  if (kind === "countdown" && daysUntil(date, "countdown") < 0) {
    return Response.json(
      { error: "倒数日不能选过去的日期" },
      { status: 400 },
    );
  }

  const emojiValue = normalizeEmoji(emoji);
  const db = await getDb();

  if (kind === "together") {
    const existing = (
      await db
        .select()
        .from(milestones)
        .where(eq(milestones.kind, "together"))
        .limit(1)
    )[0];
    if (existing) {
      await db
        .update(milestones)
        .set({ title: name, date, emoji: emojiValue })
        .where(eq(milestones.id, existing.id));
      return Response.json({
        milestone: {
          id: existing.id,
          title: name,
          date,
          kind,
          emoji: emojiValue,
          days: daysBetween(date, todayLocal()),
        },
      });
    }
  }

  const row = {
    id: nanoid(),
    createdBy: session.userId,
    title: name,
    date,
    kind,
    emoji: emojiValue,
    createdAt: new Date(),
  };
  await db.insert(milestones).values(row);

  return Response.json({
    milestone: {
      id: row.id,
      title: row.title,
      date: row.date,
      kind: row.kind,
      emoji: row.emoji,
      ...(kind === "together"
        ? { days: daysBetween(date, todayLocal()) }
        : { daysLeft: daysUntil(date, kind, todayLocal()) }),
    },
  });
}
