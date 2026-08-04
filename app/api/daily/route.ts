import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { dailyAnswers, dailyQuestions } from "@/db/schema";
import { todayLocal } from "@/lib/dates";
import { getDb } from "@/lib/db";
import type { Db } from "@/lib/db";
import { notifyInBackground } from "@/lib/push";
import { questionForDay } from "@/lib/questions";
import { getSession, unauthorizedResponse } from "@/lib/session";
import { getPartner } from "@/lib/users";

type QuestionRow = typeof dailyQuestions.$inferSelect;

const HISTORY_DAYS = 30;
const MAX_ANSWER_LENGTH = 500;

/** dayKey 加减天数，仍返回 YYYY-MM-DD */
function shiftDays(dayKey: string, delta: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + delta * 86400_000)
    .toISOString()
    .slice(0, 10);
}

async function findQuestion(
  db: Db,
  dayKey: string,
): Promise<QuestionRow | null> {
  const rows = await db
    .select()
    .from(dailyQuestions)
    .where(eq(dailyQuestions.dayKey, dayKey))
    .limit(1);
  return rows[0] ?? null;
}

// 取当天的题：没有就现场建一条。两个人同时打开会并发插入，
// 靠 day_key 唯一索引 + onConflictDoNothing 让后到的那条被丢弃，
// 插完必须再查一次才能拿到真正落库的行
async function ensureQuestion(
  db: Db,
  dayKey: string,
): Promise<QuestionRow | null> {
  const existing = await findQuestion(db, dayKey);
  if (existing) return existing;

  await db
    .insert(dailyQuestions)
    .values({
      id: nanoid(),
      dayKey,
      question: questionForDay(dayKey),
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  return findQuestion(db, dayKey);
}

// GET /api/daily：今天的题 + 我的答案 + （双方都答完才给的）对方答案 + 往期回顾
export async function GET() {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  const db = await getDb();
  const today = todayLocal();

  const question = await ensureQuestion(db, today);
  if (!question) {
    return Response.json({ error: "题目加载失败，请稍后再试" }, { status: 500 });
  }

  const partner = await getPartner(db, session.userId);

  const todayAnswers = await db
    .select({ userId: dailyAnswers.userId, answer: dailyAnswers.answer })
    .from(dailyAnswers)
    .where(eq(dailyAnswers.questionId, question.id));

  const myAnswer =
    todayAnswers.find((a) => a.userId === session.userId)?.answer ?? null;
  const partnerAnswerRaw = partner
    ? (todayAnswers.find((a) => a.userId === partner.id)?.answer ?? null)
    : null;
  const bothAnswered = myAnswer !== null && partnerAnswerRaw !== null;

  // 玩法核心：没都答完就不能看到对方写了什么，答案根本不出接口
  const partnerAnswer = bothAnswered ? partnerAnswerRaw : null;

  // 往期回顾：过去 30 天里双方都答了的题
  const pastQuestions = await db
    .select()
    .from(dailyQuestions)
    .where(
      and(
        gte(dailyQuestions.dayKey, shiftDays(today, -HISTORY_DAYS)),
        lt(dailyQuestions.dayKey, today),
      ),
    )
    .orderBy(desc(dailyQuestions.dayKey));

  const pastIds = pastQuestions.map((q) => q.id);
  const pastAnswers =
    pastIds.length === 0 || !partner
      ? []
      : await db
          .select({
            questionId: dailyAnswers.questionId,
            userId: dailyAnswers.userId,
            answer: dailyAnswers.answer,
          })
          .from(dailyAnswers)
          .where(inArray(dailyAnswers.questionId, pastIds));

  const history = pastQuestions.flatMap((q) => {
    const mine = pastAnswers.find(
      (a) => a.questionId === q.id && a.userId === session.userId,
    );
    const theirs = partner
      ? pastAnswers.find(
          (a) => a.questionId === q.id && a.userId === partner.id,
        )
      : undefined;
    if (!mine || !theirs) return [];
    return [
      {
        dayKey: q.dayKey,
        question: q.question,
        myAnswer: mine.answer,
        partnerAnswer: theirs.answer,
      },
    ];
  });

  return Response.json({
    dayKey: question.dayKey,
    question: question.question,
    myAnswer,
    partnerAnswer,
    myName: session.displayName,
    partnerName: partner?.displayName ?? "",
    bothAnswered,
    history,
  });
}

// POST /api/daily：回答今天的问题，一人一题只能答一次
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return unauthorizedResponse();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "请求格式错误" }, { status: 400 });
  }

  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!answer) {
    return Response.json({ error: "答案不能为空" }, { status: 400 });
  }
  if (answer.length > MAX_ANSWER_LENGTH) {
    return Response.json(
      { error: `答案不能超过 ${MAX_ANSWER_LENGTH} 个字` },
      { status: 400 },
    );
  }

  const today = todayLocal();
  // 只能答今天的题：客户端若带了 dayKey，跨天后会对不上，直接挡掉让它重新拉题
  if (typeof body.dayKey === "string" && body.dayKey !== today) {
    return Response.json(
      { error: "只能回答今天的问题，刷新一下试试" },
      { status: 400 },
    );
  }

  const db = await getDb();
  const question = await ensureQuestion(db, today);
  if (!question) {
    return Response.json({ error: "题目加载失败，请稍后再试" }, { status: 500 });
  }

  // (question_id, user_id) 唯一索引兜底：重复提交插不进去，returning 为空
  const inserted = await db
    .insert(dailyAnswers)
    .values({
      id: nanoid(),
      questionId: question.id,
      userId: session.userId,
      answer,
      createdAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: dailyAnswers.id });

  if (inserted.length === 0) {
    return Response.json({ error: "今天已经答过啦" }, { status: 409 });
  }

  const partner = await getPartner(db, session.userId);
  let bothAnswered = false;

  if (partner) {
    const answers = await db
      .select({ userId: dailyAnswers.userId })
      .from(dailyAnswers)
      .where(eq(dailyAnswers.questionId, question.id));
    bothAnswered = answers.some((a) => a.userId === partner.id);

    const { ctx } = await getCloudflareContext({ async: true });
    await notifyInBackground(
      ctx,
      partner.id,
      bothAnswered
        ? {
            title: "你们都答完今天的问题了",
            body: "点开看看 TA 写了什么 💭",
            url: "/daily",
          }
        : {
            title: `${session.displayName} 答了今天的问题`,
            body: "该你了 💭",
            url: "/daily",
          },
    );
  }

  return Response.json({ ok: true, bothAnswered }, { status: 201 });
}
