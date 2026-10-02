"use client";

import type { ReactNode } from "react";

import { CampusDialog } from "@/modules/campus/admin/campus-dialog";

export function AgentDialog({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return <CampusDialog onClose={onClose} title={title}>{children}</CampusDialog>;
}
