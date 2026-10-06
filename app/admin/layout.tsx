import type { ReactNode } from "react";
import { AdminSessionKeeper } from "@/components/admin/admin-session-keeper";

export default function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <><AdminSessionKeeper />{children}</>;
}
