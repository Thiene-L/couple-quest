import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import BottomNav from "@/components/BottomNav";

// 登录后的页面统一走这个布局：鉴权 + 底部导航
export default async function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col">
      {/* 底部留出导航栏高度 + Home 指示条，最后一张卡片不会被挡 */}
      <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-10 md:pl-56">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
