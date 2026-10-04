"use client";

import { useMemo, useState } from "react";

export type EditorStatus = "PENDING" | "COVERED";
export type NoteMode = "none" | "quick" | "custom";

export function useRecordEditor(initialStatus: EditorStatus | null, initialNote: string | null) {
  const [status, setStatus] = useState<EditorStatus | null>(initialStatus);
  const [noteMode, setNoteMode] = useState<NoteMode>(initialNote ? "custom" : "none");
  const [quickNoteId, setQuickNoteId] = useState<string | null>(null);
  const [customNote, setCustomNote] = useState(initialNote ?? "");
  const [dirty, setDirty] = useState(false);

  const actions = useMemo(() => ({
    chooseCustom() { setNoteMode("custom"); setQuickNoteId(null); setDirty(true); },
    chooseNone() { setNoteMode("none"); setQuickNoteId(null); setCustomNote(""); setDirty(true); },
    chooseQuick(id: string) { setNoteMode("quick"); setQuickNoteId(id); setCustomNote(""); setDirty(true); },
    changeCustom(value: string) { setCustomNote(value); setDirty(true); },
    changeStatus(value: EditorStatus) { setStatus(value); setNoteMode("none"); setQuickNoteId(null); setCustomNote(""); setDirty(true); },
    loadLatest(value: { note: string | null; status: EditorStatus | null }) {
      setStatus(value.status);
      setNoteMode(value.note ? "custom" : "none");
      setQuickNoteId(null);
      setCustomNote(value.note ?? "");
      setDirty(false);
    },
    markSaved() { setDirty(false); },
  }), []);

  return { actions, customNote, dirty, noteMode, quickNoteId, status };
}
