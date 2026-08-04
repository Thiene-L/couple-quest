import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Couple Quest",
  description: "两个人的任务与积分小游戏",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Couple Quest",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // 必须是 cover，否则 iOS 上 env(safe-area-inset-*) 恒为 0，
  // 底部导航会被 Home 指示条压住
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1417" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      {/* body 不设背景：底色由 html 提供并传播到画布，
          body 保持透明才不会盖住 body::before 那层蝴蝶结底纹 */}
      <body className="min-h-full flex flex-col text-[var(--foreground)]">
        {children}
      </body>
    </html>
  );
}
