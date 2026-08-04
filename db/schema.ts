import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// 只有两行：两个人的账号
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  displayName: text("display_name").notNull(),
  avatarKey: text("avatar_key"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

// Passkey 凭证，一人可绑多台设备
export const credentials = sqliteTable(
  "credentials",
  {
    id: text("id").primaryKey(), // base64url credential ID
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    publicKey: text("public_key").notNull(), // base64url COSE public key
    counter: integer("counter").notNull(),
    transports: text("transports"), // JSON array
    deviceName: text("device_name"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("credentials_user_idx").on(t.userId)],
);

// 任务：repeat=once 完成确认后关闭；repeat=daily 每天可做一次
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    creatorId: text("creator_id")
      .notNull()
      .references(() => users.id),
    assigneeId: text("assignee_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description"),
    points: integer("points").notNull(),
    repeat: text("repeat", { enum: ["once", "daily"] }).notNull(),
    status: text("status", { enum: ["open", "done", "archived"] })
      .notNull()
      .default("open"),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("tasks_assignee_idx").on(t.assigneeId, t.status)],
);

// 完成记录：提交后待对方确认，确认才记分
export const taskCompletions = sqliteTable(
  "task_completions",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    completedBy: text("completed_by")
      .notNull()
      .references(() => users.id),
    dayKey: text("day_key").notNull(), // Asia/Shanghai 的 YYYY-MM-DD，daily 任务当天唯一
    note: text("note"),
    proofKey: text("proof_key"), // R2 object key
    status: text("status", { enum: ["pending", "confirmed", "rejected"] })
      .notNull()
      .default("pending"),
    confirmedBy: text("confirmed_by"),
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("completions_task_day_idx").on(t.taskId, t.dayKey),
    index("completions_status_idx").on(t.status),
    // 同一任务同一天只允许一条生效记录；rejected 不占坑，被打回后当天可重交
    uniqueIndex("completions_active_uniq")
      .on(t.taskId, t.dayKey)
      .where(sql`status in ('pending', 'confirmed')`),
  ],
);

// 积分账本：只增不改，余额 = SUM(delta)
export const pointLedger = sqliteTable(
  "point_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    refType: text("ref_type", {
      enum: ["task", "redemption", "adjust"],
    }).notNull(),
    refId: text("ref_id"),
    // 幂等键，形如 task:{completionId} / redeem:{id} / refund:{id}；
    // 手工调整为 null。唯一索引保证同一笔账永远只入账一次
    dedupeKey: text("dedupe_key"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("ledger_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("ledger_dedupe_uniq").on(t.dedupeKey),
  ],
);

// 奖励商店：ownerId 是提供者（兑现的人）
export const rewards = sqliteTable("rewards", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  cost: integer("cost").notNull(),
  imageKey: text("image_key"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

// 兑换记录：下单即扣分，取消退回，对方兑现后完结
export const redemptions = sqliteTable(
  "redemptions",
  {
    id: text("id").primaryKey(),
    rewardId: text("reward_id")
      .notNull()
      .references(() => rewards.id),
    redeemedBy: text("redeemed_by")
      .notNull()
      .references(() => users.id),
    cost: integer("cost").notNull(), // 下单时快照，商店改价不影响历史
    status: text("status", { enum: ["pending", "fulfilled", "cancelled"] })
      .notNull()
      .default("pending"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    fulfilledAt: integer("fulfilled_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("redemptions_status_idx").on(t.status)],
);

// WebAuthn challenge。放 D1 而非 KV：消费用条件删除保证单次使用，
// 且不受 KV 免费版 1000 次/天写配额限制
export const challenges = sqliteTable(
  "challenges",
  {
    challenge: text("challenge").primaryKey(),
    kind: text("kind", { enum: ["registration", "authentication"] }).notNull(),
    userId: text("user_id"), // 注册时绑定用户，登录时为 null
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("challenges_expires_idx").on(t.expiresAt)],
);

// Web Push 订阅。一人可有多台设备，退订或推送失效时删行
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    deviceName: text("device_name"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("push_user_idx").on(t.userId)],
);

// 邀请另一半注册用的一次性码。满两人后不再有效
export const invites = sqliteTable("invites", {
  code: text("code").primaryKey(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
  usedBy: text("used_by"),
});

// 纪念日。kind=together 是「在一起」那天，全局唯一，用于算在一起第几天；
// anniversary 每年重复（生日、纪念日），countdown 是一次性倒数（旅行、考试）
export const milestones = sqliteTable(
  "milestones",
  {
    id: text("id").primaryKey(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    // 本地日期 YYYY-MM-DD，不存时间戳：纪念日是「哪一天」而非「哪一刻」，
    // 存时间戳会因时区把日期算偏
    date: text("date").notNull(),
    kind: text("kind", {
      enum: ["together", "anniversary", "countdown"],
    }).notNull(),
    emoji: text("emoji"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("milestones_kind_idx").on(t.kind)],
);

// 每日一问：题目 + 两人各自的回答。都答完才互相可见
export const dailyQuestions = sqliteTable(
  "daily_questions",
  {
    id: text("id").primaryKey(),
    dayKey: text("day_key").notNull().unique(), // Asia/Shanghai YYYY-MM-DD
    question: text("question").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("daily_questions_day_idx").on(t.dayKey)],
);

export const dailyAnswers = sqliteTable(
  "daily_answers",
  {
    id: text("id").primaryKey(),
    questionId: text("question_id")
      .notNull()
      .references(() => dailyQuestions.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    answer: text("answer").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  // 一人一题只能答一次
  (t) => [uniqueIndex("daily_answers_uniq").on(t.questionId, t.userId)],
);

// 定时任务的发送去重：同一天同一类提醒只发一次
// 戳一下：轻互动，只保留最近的，不做历史
export const pokes = sqliteTable(
  "pokes",
  {
    id: text("id").primaryKey(),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => users.id),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(), // miss / hug / what / kiss / cheer
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    seenAt: integer("seen_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("pokes_to_idx").on(t.toUserId, t.createdAt)],
);

// 表情回应：贴在打卡记录或每日答案上
export const reactions = sqliteTable(
  "reactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    targetType: text("target_type", {
      enum: ["completion", "answer"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("reactions_target_idx").on(t.targetType, t.targetId),
    // 同一个人对同一目标只留一个表情，再点是换不是叠
    uniqueIndex("reactions_one_per_user").on(
      t.userId,
      t.targetType,
      t.targetId,
    ),
  ],
);

// 双人对战：发起方出招后等对方应战，都出招才结算
export const duels = sqliteTable(
  "duels",
  {
    id: text("id").primaryKey(),
    challengerId: text("challenger_id")
      .notNull()
      .references(() => users.id),
    opponentId: text("opponent_id")
      .notNull()
      .references(() => users.id),
    game: text("game", { enum: ["rps"] }).notNull(),
    stake: integer("stake").notNull(), // 赌注积分，0 表示只玩不赌
    challengerMove: text("challenger_move").notNull(),
    opponentMove: text("opponent_move"),
    // pending=等应战 settled=已结算 cancelled=发起方撤回
    status: text("status", { enum: ["pending", "settled", "cancelled"] })
      .notNull()
      .default("pending"),
    // challenger / opponent / draw
    winner: text("winner"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    settledAt: integer("settled_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("duels_status_idx").on(t.status, t.createdAt)],
);

export const reminderLog = sqliteTable("reminder_log", {
  key: text("key").primaryKey(), // 形如 daily-task:{userId}:{dayKey}
  sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull(),
});

// 登录失败计数，用于限流
export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(), // 用户名或来源 IP
  failures: integer("failures").notNull().default(0),
  windowStartedAt: integer("window_started_at", {
    mode: "timestamp_ms",
  }).notNull(),
});
