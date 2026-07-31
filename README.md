# Couple Quest 💞

两个人的任务与积分小游戏。互相发任务、完成打卡（可拍照）、对方确认后拿积分、积分去对方的商店兑换奖励（做一顿饭、按摩半小时……）。

## 技术栈

- Next.js 16 (App Router) + TypeScript + Tailwind 4，PWA（手机加到主屏当 App 用）
- Cloudflare Workers（经 [@opennextjs/cloudflare](https://opennext.js.org/cloudflare)）
- D1 (SQLite) + Drizzle ORM / R2（打卡照片）
- 登录：账号密码（PBKDF2）+ Passkey 面容/指纹登录（SimpleWebAuthn）

积分账本只增不改，余额由 `SUM(delta)` 求出；所有记分路径带幂等键并走条件写，
双击、并发、重放都不会重复记分或透支。

## 本地开发

```bash
pnpm install
pnpm db:migrate:local   # 建本地 D1 表（首次 & 每次 schema 变更后）
pnpm dev                # http://localhost:3000
```

首次打开会进入 /setup，一次性创建两个人的账号（本地初始化口令见 `.dev.vars`）。

改了 `db/schema.ts` 后：`pnpm db:generate && pnpm db:migrate:local`。

界面手机和电脑都适配：窄屏是底部四个 tab，宽屏自动换成左侧导航栏。

## 首次部署（一次性）

1. 登录：`pnpm wrangler login`
2. 创建资源，并把返回的 id 填进 `wrangler.jsonc`：

```bash
pnpm wrangler d1 create couple-quest        # database_id 填到 d1_databases
pnpm wrangler r2 bucket create couple-quest-photos
```

3. 设置两个密钥（都用随机长字符串）：

```bash
pnpm wrangler secret put SESSION_SECRET
pnpm wrangler secret put BOOTSTRAP_SECRET
```

> `BOOTSTRAP_SECRET` 是初始化口令。`/setup` 页要求填对它才能创建账号——
> 否则部署后到你本人打开之间，任何拿到网址的人都能先建号占领实例。

4. 建表并部署：

```bash
pnpm db:migrate:remote
pnpm deploy
```

5. 部署后拿到 `https://couple-quest.<你的子域>.workers.dev`，回来把
   `wrangler.jsonc` 里的 `RP_ID` 改成该域名（不带 https://）、
   `RP_ORIGIN` 改成完整 https URL，再 `pnpm deploy` 一次。

> ⚠️ Passkey 永久绑定 RP_ID 域名。域名一旦定了就别改，改了两个人的
> 面容登录都要重新绑定。想用自定义域名的话，第 5 步直接填自定义域名。

## 日常发版

```bash
pnpm deploy                 # 代码变更
pnpm db:migrate:remote      # 仅当有新迁移
```

## 备份

D1 导出（建议偶尔跑一次存好）：

```bash
pnpm wrangler d1 export couple-quest --remote --output backup.sql
```
