# Couple Quest 💞

**中文** · [English](./README.en.md)

两个人的任务与积分小游戏。互相发任务、完成打卡（可拍照）、对方确认后拿积分、积分去对方的商店兑换奖励（做一顿饭、按摩半小时……）。

## 功能

| | |
|---|---|
| 📋 任务 | 一次性 / 每日任务，打卡可拍照，对方确认后记分 |
| 💬 聊天 | 服务器只中转不留底，记录存在各自设备的 IndexedDB |
| 💭 每日一问 | 每天一题，两人都答完才互相解锁 |
| 📸 时光 | 确认过的打卡按日期成册，可贴表情回应 |
| 🎁 商店 | 用积分兑换对方提供的奖励，可取消退分 |
| ✊ 猜拳 | 异步对战、可押积分，出招在应战前不会泄露 |
| 🔥 成就 | 连续打卡天数 + 12 个成就 |
| 💞 纪念日 | 在一起第几天、生日、倒数日 |
| 👉 戳一下 | 五种轻互动，对方手机立刻响 |

## 技术栈

- Next.js 16 (App Router) + TypeScript + Tailwind 4，PWA（手机加到主屏当 App 用）
- Cloudflare Workers（经 [@opennextjs/cloudflare](https://opennext.js.org/cloudflare)）
- D1 (SQLite) + Drizzle ORM / R2（打卡照片）
- 登录：账号密码（PBKDF2）+ Passkey 面容/指纹登录（SimpleWebAuthn）
- 通知：Web Push（VAPID），派任务 / 打卡 / 确认 / 兑换等事件推给对方

> ⚠️ iOS 只有「添加到主屏幕」后的 PWA 能收推送，Safari 标签页里收不到。
> 顺序是：加主屏 → 从主屏图标打开 →「我的」页开启通知。

## 两条值得一提的设计

**积分账本只增不改**，余额由 `SUM(delta)` 求出，不存冗余字段。所有记分路径带幂等键并走条件写——双击、并发、重放都不会重复记分或把积分透支成负数。

**聊天不在服务器留底**：发送 → 落中转表 → 收件方拉取（只标记已投递，不删）→ 客户端存进本地 → 回执 → 服务器才删除。拉取即删的话，响应在路上丢一次消息就永远没了。没等到回执的下次会重复拉到，客户端按 id 覆盖，所以重复投递是安全的。

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

界面手机和电脑都适配：窄屏是底部五个标签，宽屏自动换成左侧导航栏。

## 首次部署

先授权 Cloudflare（会开浏览器）：

```bash
npx wrangler login
```

然后一条命令跑完：建 D1、建 R2、生成并写入密钥、建表、部署、
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

发完新功能却 404，多半是构建产物里的路由清单陈旧了：

```bash
rm -rf .open-next .next && npm run deploy
```

## 备份

D1 导出（建议偶尔跑一次存好）：

```bash
npx wrangler d1 export couple-quest --remote --output backup.sql
```

聊天记录不在服务器上，导出里没有——那部分只存在你们各自的手机里。

## 品牌素材

`public/logo.svg`、`public/logo-full.svg` 和 `public/icon-*.png` 不在版本库里
（见 `.gitignore`）——它们是使用者自备的美术资源，仓库公开，不适合随代码分发。
部署时 wrangler 从本地磁盘上传，照常生效。

新克隆一份代码时这些文件不存在：页面里的品牌图会自动回落到 🎀 emoji，
PWA 图标则需要自己放一份。想生成一套自制的蝴蝶结图标：

```bash
node scripts/gen-icons.mjs
```

底部导航和页内的功能图标是自绘 SVG（`components/TabIcon.tsx`），跟着主题变色，
不依赖任何外部素材。
