// 成就完全由现有数据推导，不额外落表：
// 少一张表就少一处要维护的一致性，重算成本对两个人可以忽略
export interface AchievementDef {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  // 达成需要的数量，用于显示进度条
  goal: number;
}

export interface AchievementStat {
  confirmedCompletions: number;
  photoCount: number;
  taskStreakBest: number;
  answerStreakBest: number;
  bothAnsweredDays: number;
  redemptionsFulfilled: number;
  duelsPlayed: number;
  pokesSent: number;
  daysTogether: number;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: "first_step",
    emoji: "👣",
    title: "第一步",
    desc: "完成第一个任务",
    goal: 1,
  },
  {
    id: "ten_tasks",
    emoji: "💪",
    title: "渐入佳境",
    desc: "累计完成 10 个任务",
    goal: 10,
  },
  {
    id: "fifty_tasks",
    emoji: "🏆",
    title: "老夫老妻",
    desc: "累计完成 50 个任务",
    goal: 50,
  },
  {
    id: "shutterbug",
    emoji: "📷",
    title: "留住瞬间",
    desc: "打卡时拍够 10 张照片",
    goal: 10,
  },
  {
    id: "streak_7",
    emoji: "🔥",
    title: "一周不断",
    desc: "任务连续打卡 7 天",
    goal: 7,
  },
  {
    id: "streak_30",
    emoji: "🌟",
    title: "习惯养成",
    desc: "任务连续打卡 30 天",
    goal: 30,
  },
  {
    id: "heart_talk",
    emoji: "💬",
    title: "无话不谈",
    desc: "一起答完 20 天的每日一问",
    goal: 20,
  },
  {
    id: "answer_streak_7",
    emoji: "🗓️",
    title: "默契周",
    desc: "每日一问连续答满 7 天",
    goal: 7,
  },
  {
    id: "spoiled",
    emoji: "🎁",
    title: "宠爱兑现",
    desc: "兑现 5 次奖励",
    goal: 5,
  },
  {
    id: "gamer",
    emoji: "🎮",
    title: "手下败将",
    desc: "玩 10 局猜拳",
    goal: 10,
  },
  {
    id: "clingy",
    emoji: "👉",
    title: "戳戳怪",
    desc: "戳对方 50 次",
    goal: 50,
  },
  {
    id: "hundred_days",
    emoji: "💞",
    title: "百日",
    desc: "在一起满 100 天",
    goal: 100,
  },
] as const;

function progressOf(id: string, s: AchievementStat): number {
  switch (id) {
    case "first_step":
    case "ten_tasks":
    case "fifty_tasks":
      return s.confirmedCompletions;
    case "shutterbug":
      return s.photoCount;
    case "streak_7":
    case "streak_30":
      return s.taskStreakBest;
    case "heart_talk":
      return s.bothAnsweredDays;
    case "answer_streak_7":
      return s.answerStreakBest;
    case "spoiled":
      return s.redemptionsFulfilled;
    case "gamer":
      return s.duelsPlayed;
    case "clingy":
      return s.pokesSent;
    case "hundred_days":
      return s.daysTogether;
    default:
      return 0;
  }
}

export interface AchievementView extends AchievementDef {
  progress: number;
  unlocked: boolean;
}

export function evaluate(stat: AchievementStat): AchievementView[] {
  return ACHIEVEMENTS.map((a) => {
    const progress = Math.max(0, progressOf(a.id, stat));
    return { ...a, progress: Math.min(progress, a.goal), unlocked: progress >= a.goal };
  });
}
