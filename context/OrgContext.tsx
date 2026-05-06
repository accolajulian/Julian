"use client";

import { createContext, useContext } from "react";
import type { Organization } from "@/lib/types";

// ─── Context ──────────────────────────────────────────────────────────────────

interface OrgContextValue {
  org: Organization | null;
}

const OrgContext = createContext<OrgContextValue>({ org: null });

export function OrgProvider({
  org,
  children,
}: {
  org: Organization | null;
  children: React.ReactNode;
}) {
  return (
    <OrgContext.Provider value={{ org }}>{children}</OrgContext.Provider>
  );
}

export function useOrg(): OrgContextValue {
  return useContext(OrgContext);
}
