# Couple Quest 💞

[中文](./README.md) · **English**

A tiny quest-and-points game for two people. Send each other tasks, check them off
(with a photo if you like), earn points once your partner confirms, then spend those
points in their reward shop — a home-cooked dinner, a half-hour massage, whatever
you two agree on.

## Features

| | |
|---|---|
| 📋 Tasks | One-off or daily, optional photo proof, points credited on partner's confirmation |
| 💬 Chat | Server relays only and keeps nothing; history lives in each device's IndexedDB |
| 💭 Daily question | One question a day, answers unlock for both only after both have answered |
| 📸 Moments | Confirmed check-ins grouped by day, with emoji reactions |
| 🎁 Shop | Spend points on rewards your partner offers; redemptions can be cancelled and refunded |
| ✊ Duel | Async rock-paper-scissors with optional stakes; your move never leaks before the reply |
| 🔥 Achievements | Check-in streaks plus 12 achievements |
| 💞 Milestones | Days together, birthdays, countdowns |
| 👉 Poke | Five one-tap nudges that ring your partner's phone right away |

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind 4, PWA (installs to the home screen)
- Cloudflare Workers via [@opennextjs/cloudflare](https://opennext.js.org/cloudflare)
- D1 (SQLite) + Drizzle ORM, R2 for check-in photos
- Auth: password (PBKDF2) plus Passkey / Face ID (SimpleWebAuthn)
- Notifications: Web Push (VAPID) on task assignment, check-in, confirmation, redemption

> ⚠️ On iOS, only a PWA installed to the Home Screen can receive push — a Safari tab
> cannot. The order matters: add to Home Screen → open from the icon → enable
> notifications on the "Me" page.

## Two design notes worth reading

**The points ledger is append-only.** Balance is derived with `SUM(delta)`; there is no
cached balance column. Every path that credits or debits carries an idempotency key and
uses a conditional write, so double taps, concurrent requests and replays can never
double-credit or push a balance negative.

**Chat is never stored on the server.** Send → row in a relay table → recipient pulls
(marked delivered, *not* deleted) → client persists it locally → client acks → only then
does the server delete. Deleting on pull would lose the message forever if the response
were dropped in flight. Un-acked messages get pulled again and the client overwrites by
id, so redelivery is safe.

## Local development

```bash
npm install
npm run db:migrate:local   # create local D1 tables (first run, and after schema changes)
npm run dev                # http://localhost:3000
```

The first visit lands on `/setup` (the local bootstrap secret is in `.dev.vars`).
Registration is invite-based: the first person signs up with the bootstrap secret, then
generates an invite link on the "Me" page for their partner, who signs up with their own
password. Once both seats are taken, registration closes for good.

After editing `db/schema.ts`: `npm run db:generate && npm run db:migrate:local`.

The UI adapts to both phone and desktop: five bottom tabs on narrow screens, a left
sidebar on wide ones.

## First deploy

Authorize Cloudflare (opens a browser):

```bash
npx wrangler login
```

Then one command does the rest — create D1 and R2, generate and store the secrets, run
migrations, deploy, write the Passkey domain back into the config, and deploy again.
It is safe to re-run; existing resources are skipped.

```bash
./scripts/first-deploy.sh
```

Pass your own domain to use it from the start (recommended, see the warning below):

```bash
./scripts/first-deploy.sh quest.example.com
```

The script prints the URL and the **bootstrap secret**; use that secret on `/setup` to
create the two accounts.

> ⚠️ Passkeys are permanently bound to the domain they were registered on. If you start
> on `workers.dev` and later move to your own domain, both of you must re-enrol Face ID.
> Use your own domain from the beginning if that matters to you.

`BOOTSTRAP_SECRET` is only required for the first person. Without it, anyone who finds
the URL between deployment and your first visit could claim the instance. The partner
joins through the invite link and never needs it.

## Shipping changes

```bash
npm run deploy                 # code changes
npm run db:migrate:remote      # only when there are new migrations
```

If a newly added route 404s after a deploy, the route manifest in the build output is
usually stale:

```bash
rm -rf .open-next .next && npm run deploy
```

## Backups

Export D1 (worth running occasionally):

```bash
npx wrangler d1 export couple-quest --remote --output backup.sql
```

Chat history is not on the server, so it is not in the export — it only exists on your
two phones.

## Brand assets

`public/logo.svg`, `public/logo-full.svg` and `public/icon-*.png` are **not** in version
control (see `.gitignore`). They are artwork supplied by the user, and this repository is
public, so they should not be distributed with the code. Wrangler uploads them from the
local disk at deploy time, so the live site is unaffected.

A fresh clone will not have them: the in-app brand mark falls back to a 🎀 emoji, and you
will need to supply your own PWA icons. To generate a plain bow icon set:

```bash
node scripts/gen-icons.mjs
```

The navigation and in-page feature icons are hand-drawn SVG
(`components/TabIcon.tsx`); they follow the theme colors and depend on no external assets.
