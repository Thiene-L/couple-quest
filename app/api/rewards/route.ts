import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { rewards, users } from "@/db/schema";
import { getDb } from "@/lib/db";
import { getSession, unauthorizedResponse } from "@/lib/session";

// GET /api/rewards：全部上架中的奖励，mine=我提供的（对方来兑换）
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  const rows = await db
    .select({
      id: rewards.id,
      ownerId: rewards.ownerId,
      title: rewards.title,
      description: rewards.description,
      cost: rewards.cost,
      createdAt: rewards.createdAt,
      ownerName: users.displayName,
    })
    .from(rewards)
    .innerJoin(users, eq(rewards.ownerId, users.id))
    .where(eq(rewards.active, true))
    .orderBy(desc(rewards.createdAt));

  return Response.json({
    rewards: rows.map((r) => ({ ...r, mine: r.ownerId === session.userId })),
  });
}

// POST /api/rewards：创建奖励，我是提供者（ownerId=我），对方花积分兑换
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const { title, description, cost } = (body ?? {}) as {
    title?: unknown;
    description?: unknown;
    cost?: unknown;
  };

  if (typeof title !== "string" || !title.trim()) {
    return Response.json({ error: "请填写奖励名称" }, { status: 400 });
  }
  if (title.trim().length > 50) {
    return Response.json({ error: "奖励名称太长啦（最多 50 字）" }, { status: 400 });
  }
  if (
    typeof cost !== "number" ||
    !Number.isInteger(cost) ||
    cost < 1 ||
    cost > 99999
  ) {
    return Response.json(
      { error: "所需积分需为 1-99999 的整数" },
      { status: 400 },
    );
  }
  const desc_ =
    typeof description === "string" && description.trim()
      ? description.trim()
      : null;

  const db = await getDb();
  const reward = {
    id: nanoid(),
    ownerId: session.userId,
    title: title.trim(),
    description: desc_,
    cost,
    imageKey: null,
    active: true,
    createdAt: new Date(),
  };
  await db.insert(rewards).values(reward);

  return Response.json({ reward: { ...reward, mine: true } });
}
