"use client";

import { useState } from "react";

import type { NoteMode } from "@/modules/sweep/agent/use-record-editor";

type QuickNoteOption = {
  content: string;
  id: string;
};

type Props = {
  noteMode: NoteMode;
  notes: QuickNoteOption[];
  onChooseCustom: () => void;
  onChooseNone: () => void;
  onChooseQuick: (id: string) => void;
  selectedId: string | null;
};

export function QuickNotePicker({ noteMode, notes, onChooseCustom, onChooseNone, onChooseQuick, selectedId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const selectedNote = notes.find((note) => note.id === selectedId);
  const label = noteMode === "custom"
    ? "自定义备注"
    : noteMode === "quick" && selectedNote
      ? selectedNote.content
      : "选择快捷备注（可选）";

  function choose(action: () => void) {
    action();
    setExpanded(false);
  }

  return (
    <div className="quick-note-dropdown" onKeyDown={(event) => event.key === "Escape" && setExpanded(false)}>
      <button
        aria-expanded={expanded}
        aria-label={`快捷备注：${label}`}
        className="quick-note-trigger"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span>{label}</span><span aria-hidden="true">⌄</span>
      </button>
      {expanded ? (
        <div aria-label="快捷备注选项" className="quick-note-options" role="listbox">
          {notes.map((note) => (
            <button
              aria-selected={noteMode === "quick" && selectedId === note.id}
              key={note.id}
              onClick={() => choose(() => onChooseQuick(note.id))}
              role="option"
              type="button"
            >
              {note.content}
            </button>
          ))}
          <button aria-selected={noteMode === "none"} onClick={() => choose(onChooseNone)} role="option" type="button">无备注</button>
          <button aria-selected={noteMode === "custom"} onClick={() => choose(onChooseCustom)} role="option" type="button">自定义备注</button>
        </div>
      ) : null}
    </div>
  );
}
