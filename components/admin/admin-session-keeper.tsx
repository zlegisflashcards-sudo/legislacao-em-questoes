"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const REFRESH_EVERY_MS = 20 * 60 * 1000;

export function AdminSessionKeeper() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/admin/login") return;
    let active = true;
    const renew = () => {
      if (!active) return;
      void fetch("/api/admin/sessao", { cache: "no-store", credentials: "same-origin" });
    };
    renew();
    const interval = window.setInterval(renew, REFRESH_EVERY_MS);
    const onVisible = () => { if (document.visibilityState === "visible") renew(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return null;
}
