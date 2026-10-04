import type { ReactNode } from "react";
import { requireOnboardedUser } from "@/lib/current-user";
import BottomNav from "@/components/nav/BottomNav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireOnboardedUser();

  return (
    <div className="min-h-screen pb-20">
      <div className="mx-auto max-w-xl px-4 pt-6">{children}</div>
      <BottomNav />
    </div>
  );
}
