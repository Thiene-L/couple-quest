import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import { taskCompletions, tasks, users } from "@/db/schema";
import { getDb, todayKey } from "@/lib/db";
import { notifyInBackground } from "@/lib/push";
import { getSession, unauthorizedResponse } from "@/lib/session";
import { getPartner } from "@/lib/users";

// GET /api/tasks：所有 open 任务（附 doneToday/hasPendingCompletion/mine）+ 等我确认的完成记录
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  const today = todayKey();

  const creator = alias(users, "creator");
  const assignee = alias(users, "assignee");

  const taskRows = await db
    .select({
      id: tasks.id,
      creatorId: tasks.creatorId,
      assigneeId: tasks.assigneeId,
      title: tasks.title,
      description: tasks.description,
      points: tasks.points,
      repeat: tasks.repeat,
      dueAt: tasks.dueAt,
      createdAt: tasks.createdAt,
      creatorName: creator.displayName,
      assigneeName: assignee.displayName,
    })
    .from(tasks)
    .innerJoin(creator, eq(tasks.creatorId, creator.id))
    .innerJoin(assignee, eq(tasks.assigneeId, assignee.id))
    .where(eq(tasks.status, "open"))
    .orderBy(desc(tasks.createdAt));

  // 一次查出计算 doneToday / hasPendingCompletion 所需的完成记录
  const taskIds = taskRows.map((t) => t.id);
  const flagRows =
    taskIds.length === 0
      ? []
      : await db
          .select({
            taskId: taskCompletions.taskId,
            dayKey: taskCompletions.dayKey,
            status: taskCompletions.status,
          })
          .from(taskCompletions)
          .where(
            and(
              inArray(taskCompletions.taskId, taskIds),
              or(
                eq(taskCompletions.status, "pending"),
                and(
                  eq(taskCompletions.dayKey, today),
                  ne(taskCompletions.status, "rejected"),
                ),
              ),
            ),
          );

  const tasksOut = taskRows.map((t) => ({
    ...t,
    doneToday:
      t.repeat === "daily" &&
      flagRows.some(
        (r) =>
          r.taskId === t.id && r.dayKey === today && r.status !== "rejected",
      ),
    hasPendingCompletion: flagRows.some(
      (r) => r.taskId === t.id && r.status === "pending",
    ),
    mine: t.assigneeId === session.userId,
  }));

  // 对方提交、等我确认的完成记录
  const completer = alias(users, "completer");
  const pendingConfirmations = await db
    .select({
      id: taskCompletions.id,
      taskId: taskCompletions.taskId,
      taskTitle: tasks.title,
      points: tasks.points,
      completedByName: completer.displayName,
      note: taskCompletions.note,
      proofKey: taskCompletions.proofKey,
      createdAt: taskCompletions.createdAt,
    })
    .from(taskCompletions)
    .innerJoin(tasks, eq(taskCompletions.taskId, tasks.id))
    .innerJoin(completer, eq(taskCompletions.completedBy, completer.id))
    .where(
      and(
        eq(taskCompletions.status, "pending"),
        ne(taskCompletions.completedBy, session.userId),
      ),
    )
    .orderBy(desc(taskCompletions.createdAt));

  return Response.json({ tasks: tasksOut, pendingConfirmations });
}

// POST /api/tasks：创建任务（执行人只能是自己或对方）
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return Response.json({ error: "标题不能为空" }, { status: 400 });
  }
  if (title.length > 100) {
    return Response.json({ error: "标题不能超过 100 个字" }, { status: 400 });
  }

  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  const points = body.points;
  if (
    typeof points !== "number" ||
    !Number.isInteger(points) ||
    points < 1 ||
    points > 9999
  ) {
    return Response.json(
      { error: "积分需为 1-9999 的整数" },
      { status: 400 },
    );
  }

  const repeat = body.repeat;
  if (repeat !== "once" && repeat !== "daily") {
    return Response.json({ error: "任务类型不正确" }, { status: 400 });
  }

  const db = await getDb();
  const assigneeId = typeof body.assigneeId === "string" ? body.assigneeId : "";
  const partner = await getPartner(db, session.userId);
  if (assigneeId !== session.userId && assigneeId !== partner?.id) {
    return Response.json(
      { error: "执行人只能是你自己或对方" },
      { status: 400 },
    );
  }

  let dueAt: Date | null = null;
  if (body.dueAt !== undefined && body.dueAt !== null && body.dueAt !== "") {
    if (typeof body.dueAt !== "number" && typeof body.dueAt !== "string") {
      return Response.json({ error: "截止时间格式不正确" }, { status: 400 });
    }
    const d = new Date(body.dueAt);
    if (Number.isNaN(d.getTime())) {
      return Response.json({ error: "截止时间格式不正确" }, { status: 400 });
    }
    dueAt = d;
  }

  const task = {
    id: nanoid(),
    creatorId: session.userId,
    assigneeId,
    title,
    description,
    points,
    repeat: repeat as "once" | "daily",
    status: "open" as const,
    dueAt,
    createdAt: new Date(),
  };
  await db.insert(tasks).values(task);

  // 只有派给对方的任务才推通知，派给自己的不用打扰
  if (assigneeId !== session.userId) {
    const { ctx } = await getCloudflareContext({ async: true });
    await notifyInBackground(ctx, assigneeId, {
      title: `${session.displayName} 给你派了个任务`,
      body: `${title} · ${points} 分`,
      url: "/tasks",
    });
  }

  return Response.json({ task }, { status: 201 });
}
