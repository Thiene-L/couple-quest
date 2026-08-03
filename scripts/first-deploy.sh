#!/usr/bin/env bash
# 首次部署到 Cloudflare Workers，一条命令跑完。
# 可重复执行：已经建好的资源会跳过，不会重复创建。
#
#   ./scripts/first-deploy.sh                      # 用 workers.dev 域名
#   ./scripts/first-deploy.sh quest.example.com    # 用自己的域名
set -euo pipefail
cd "$(dirname "$0")/.."

CUSTOM_DOMAIN="${1:-}"

# 包管理器按可用性探测：pnpm 可能只装在某个 node 版本下而不在 PATH 上
if command -v pnpm > /dev/null 2>&1; then
  WRANGLER="pnpm exec wrangler"
  RUN="pnpm run"
else
  WRANGLER="npx wrangler"
  RUN="npm run"
fi

CFG=wrangler.jsonc
DB_NAME=couple-quest
BUCKET=couple-quest-photos

say() { printf '\n\033[1;35m▸ %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- 0. 前置检查
say "检查 Cloudflare 登录状态"
$WRANGLER whoami 2>&1 | grep -q "not authenticated" && \
  die "还没登录。先跑 $WRANGLER login，授权后再执行本脚本。"
echo "已登录。"

# ---------------------------------------------------------------- 1. D1
say "准备 D1 数据库"
if grep -q '"database_id": "00000000-0000-0000-0000-000000000000"' $CFG; then
  out=$($WRANGLER d1 create $DB_NAME 2>&1) || true
  # 已存在时复用，否则从创建输出里取 id
  id=$(printf '%s' "$out" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  if [ -z "$id" ]; then
    id=$($WRANGLER d1 list --json 2>/dev/null \
      | grep -B2 "\"name\": \"$DB_NAME\"" \
      | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  fi
  [ -n "$id" ] || die "拿不到 database_id，手动跑 wrangler d1 create $DB_NAME 并填进 $CFG"
  sed -i '' "s/00000000-0000-0000-0000-000000000000/$id/" $CFG
  echo "database_id = $id，已写入 $CFG"
else
  echo "$CFG 里已有 database_id，跳过。"
fi

# ---------------------------------------------------------------- 2. R2
say "准备 R2 存储桶（存打卡照片）"
$WRANGLER r2 bucket create $BUCKET 2>&1 | tail -2 || echo "已存在，跳过。"

# ---------------------------------------------------------------- 3. 密钥
say "设置密钥"
existing=$($WRANGLER secret list 2>/dev/null || echo "")

if printf '%s' "$existing" | grep -q SESSION_SECRET; then
  echo "SESSION_SECRET 已存在，跳过。"
else
  openssl rand -hex 32 | $WRANGLER secret put SESSION_SECRET
  echo "SESSION_SECRET 已随机生成并写入（不需要记，你用不到它）。"
fi

BOOTSTRAP=""
if printf '%s' "$existing" | grep -q BOOTSTRAP_SECRET; then
  echo "BOOTSTRAP_SECRET 已存在，跳过（忘了的话去 Cloudflare 面板重设）。"
else
  BOOTSTRAP=$(openssl rand -hex 8)
  printf '%s' "$BOOTSTRAP" | $WRANGLER secret put BOOTSTRAP_SECRET
  echo "BOOTSTRAP_SECRET 已生成，稍后在 /setup 页面填它。"
fi

# ---------------------------------------------------------------- 4. 建表
say "在线上数据库建表"
$WRANGLER d1 migrations apply $DB_NAME --remote

# ---------------------------------------------------------------- 5. 定域名
# Passkey 永久绑定 RP_ID。自定义域名的话现在就能定；
# 用 workers.dev 则要先部署一次拿到域名，再回填重部署。
if [ -n "$CUSTOM_DOMAIN" ]; then
  DOMAIN="$CUSTOM_DOMAIN"
  say "使用自定义域名 $DOMAIN"
else
  say "首次部署，拿 workers.dev 域名"
  out=$($RUN deploy 2>&1)
  printf '%s\n' "$out"
  DOMAIN=$(printf '%s' "$out" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1 | sed 's|https://||')
  [ -n "$DOMAIN" ] || die "没能从部署输出里识别出域名，手动把 RP_ID/RP_ORIGIN 填进 $CFG 后再跑 $RUN deploy"
fi

say "把 Passkey 域名固定为 $DOMAIN"
sed -i '' "s|\"RP_ID\": \".*\"|\"RP_ID\": \"$DOMAIN\"|" $CFG
sed -i '' "s|\"RP_ORIGIN\": \".*\"|\"RP_ORIGIN\": \"https://$DOMAIN\"|" $CFG
echo "已写入 $CFG。"

# ---------------------------------------------------------------- 6. 正式部署
say "部署"
$RUN deploy

# ---------------------------------------------------------------- 完成
printf '\n\033[1;32m════════════════ 部署完成 ════════════════\033[0m\n\n'
printf '  打开        https://%s/setup\n' "$DOMAIN"
if [ -n "$BOOTSTRAP" ]; then
  printf '  初始化口令  %s\n' "$BOOTSTRAP"
fi
cat <<EOF

  在 /setup 一次性创建你们两个人的账号，然后各自
  用 Safari 打开、分享菜单 →「添加到主屏幕」，
  再进「我的」开启面容登录。

  ⚠ RP_ID 已固定为 $DOMAIN。之后换域名的话，
    两个人的面容登录都要重新绑定一次。

  改完代码重新发版：$RUN deploy
EOF
