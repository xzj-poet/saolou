"use client";

import { AgentPageError } from "@/components/agent-page-state";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <AgentPageError retry={retry} />;
}
