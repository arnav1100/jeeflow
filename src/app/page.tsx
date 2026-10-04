import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (!current.profile?.onboardingCompleted) redirect("/onboarding");
  redirect("/dashboard");
}
