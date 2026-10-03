import { QuickNoteManager } from "@/modules/quick-notes/admin/quick-note-manager";
import { listQuickNotesForAdmin } from "@/modules/quick-notes/quick-note-service";

export default async function QuickNotesPage() {
  return <QuickNoteManager quickNotes={await listQuickNotesForAdmin()} />;
}
