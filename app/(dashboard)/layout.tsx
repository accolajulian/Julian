import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase";
import { OrgProvider } from "@/context/OrgContext";
import DashboardShell from "./DashboardShell";
import type { Organization } from "@/lib/types";

// Detect whether real Clerk keys are present
const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const clerkConfigured =
  (clerkKey.startsWith("pk_test_") || clerkKey.startsWith("pk_live_")) &&
  !clerkKey.includes("REPLACE_ME");

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userId: string | null = null;
  let org: Organization | null = null;

  if (clerkConfigured) {
    // Real auth path — import Clerk lazily so module load doesn't fail without keys
    const { auth } = await import("@clerk/nextjs/server");
    const session = await auth();
    userId = session.userId ?? null;
    if (!userId) redirect("/login");

    try {
      const supabase = createServerClient();
      const { data: userRecord } = await supabase
        .from("users")
        .select("organization_id")
        .eq("clerk_id", userId)
        .single() as { data: { organization_id: string } | null };

      if (userRecord?.organization_id) {
        const { data: orgRecord } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", userRecord.organization_id)
          .single();
        if (orgRecord) org = orgRecord as unknown as Organization;
      }
    } catch {
      // Supabase not reachable — fall through to demo mode
    }
  }
  // When Clerk is not configured, render in demo mode (no auth, no DB)

  const plan = org?.plan ?? "growth";

  return (
    <OrgProvider org={org}>
      <DashboardShell plan={plan}>
        {children}
      </DashboardShell>
    </OrgProvider>
  );
}
