import Link from "next/link";

// 下钻页面左上角的返回。给固定的父页面地址而不是 history.back()：
// 从推送通知直接点进来时没有历史可退，固定地址永远有得可去
export default function BackLink({
  href,
  label = "返回",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className="-ml-1 inline-flex items-center gap-0.5 rounded-lg py-1 pr-2 text-sm text-muted active:opacity-70"
    >
      <span aria-hidden className="text-lg leading-none">
        ‹
      </span>
      {label}
    </Link>
  );
}
