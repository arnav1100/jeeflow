import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.profile?.onboardingCompleted) redirect("/dashboard");

  return <OnboardingWizard initialName={current.profile?.name || current.user.name} />;
}
