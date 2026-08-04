"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 只留五个高频入口。下面这些从别处进：
//   时光/纪念日/成就 → 任务页顶部    账本/猜拳 → 商店页
const TABS = [
  { href: "/tasks", label: "任务", icon: "📋" },
  { href: "/chat", label: "聊天", icon: "💬" },
  { href: "/daily", label: "每日", icon: "💭" },
  { href: "/store", label: "商店", icon: "🎁" },
  { href: "/me", label: "我的", icon: "🐻" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

// 移动端：底部 tab；md 及以上：左侧导航栏
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <>
      {/* 桌面左侧栏 */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-56 flex-col border-r border-border bg-card/80 backdrop-blur md:flex">
        {/* iPad 装成 PWA 时侧栏也要让开状态栏 */}
        <div className="flex items-center gap-2 px-6 pb-2 pt-[calc(2rem+env(safe-area-inset-top))]">
          <span className="text-2xl">🎀</span>
          <span className="text-lg font-bold text-foreground">
            Couple Quest
          </span>
        </div>
        <nav className="mt-4 flex flex-col gap-1 px-3">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-[15px] transition-colors ${
                  active
                    ? "bg-primary-soft font-semibold text-primary"
                    : "text-muted hover:bg-primary-soft/50 hover:text-foreground"
                }`}
              >
                <span className="text-xl leading-none">{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-6 pb-6 text-xs text-muted">
          为我们俩定制 🎀
        </div>
      </aside>

      {/* 移动端底部 tab：5 个均分，图标和字号收窄保证一行放得下 */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] leading-none ${
                  active ? "font-semibold text-primary" : "text-muted"
                }`}
              >
                <span className="text-lg leading-none">{tab.icon}</span>
                <span className="truncate">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
