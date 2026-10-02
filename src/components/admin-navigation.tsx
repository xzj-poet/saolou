"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin/campus", label: "基础数据" },
  { href: "/admin/agents", label: "代理账号" },
  { href: "/admin/quick-notes", label: "快捷备注" },
  { href: "/admin/sweep-data", label: "扫楼数据" },
];

export function AdminNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="后台导航" className="admin-nav">
      {items.map((item) => (
        <Link
          aria-current={pathname.startsWith(item.href) ? "page" : undefined}
          href={item.href}
          key={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
