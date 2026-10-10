"use client";

import { VisitBeacon } from "@/components/visit-beacon";

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}<VisitBeacon /></>;
}
