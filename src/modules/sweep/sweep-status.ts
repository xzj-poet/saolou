import type { SweepStatus } from "@/generated/prisma/client";

export type OverallSweepStatus = "UNVISITED" | SweepStatus;

export function deriveOverallStatus(statuses: SweepStatus[]): OverallSweepStatus {
  if (statuses.includes("COVERED")) return "COVERED";
  if (statuses.includes("PENDING")) return "PENDING";
  return "UNVISITED";
}
