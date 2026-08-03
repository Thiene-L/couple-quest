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
npm install
npm run db:migrate:local   # 建本地 D1 表（首次 & 每次 schema 变更后）
npm run dev                # http://localhost:3000
```

首次打开会进入 /setup（本地初始化口令见 `.dev.vars`）。注册是邀请制：
第一个人凭初始化口令注册自己，然后在「我的」页生成邀请链接发给另一半，
另一半打开链接自行注册、自设密码。两人满员后注册通道自动关闭。

改了 `db/schema.ts` 后：`npm run db:generate && npm run db:migrate:local`。

界面手机和电脑都适配：窄屏是底部四个 tab，宽屏自动换成左侧导航栏。

## 首次部署

先授权 Cloudflare（会开浏览器）：

```bash
npx wrangler login
```

然后一条命令跑完：建 D1、建 R2、生成并写入两个密钥、建表、部署、
回填 Passkey 域名、再部署。可重复执行，已建好的资源会跳过。

```bash
./scripts/first-deploy.sh
```

想用自己的域名就带上（推荐，见下方警告）：

```bash
./scripts/first-deploy.sh quest.example.com
```

跑完会打印访问地址和**初始化口令**，拿口令去 `/setup` 建两个人的账号。

> ⚠️ Passkey 永久绑定域名。用 workers.dev 之后再换成自己的域名，
> 两个人的面容登录都要重新绑一次。介意就一开始直接用自己的域名。

初始化口令（`BOOTSTRAP_SECRET`）只有第一个人注册时要填，否则部署完到你本人
打开之间，任何拿到网址的人都能先建号占领实例。另一半走邀请链接，不需要它。

## 日常发版

```bash
npm run deploy                 # 代码变更
npm run db:migrate:remote      # 仅当有新迁移
```

## 备份

D1 导出（建议偶尔跑一次存好）：

```bash
npx wrangler d1 export couple-quest --remote --output backup.sql
```
