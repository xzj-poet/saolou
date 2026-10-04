"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { type EditorStatus, useRecordEditor } from "@/modules/sweep/agent/use-record-editor";

type QuickNote = { content: string; id: string; status: EditorStatus };
type Dormitory = { id: string; roomNo: string };

type Props = {
  backHref: string;
  buildingId: string;
  dormitories: Dormitory[];
  floor: string;
  initialNote?: string | null;
  initialStatus?: EditorStatus;
  mode: "create" | "edit" | "batch";
  quickNotes: QuickNote[];
  title: string;
};

export function RecordEditor({ backHref, buildingId, dormitories, floor, initialNote = null, initialStatus = "PENDING", mode, quickNotes, title }: Props) {
  const router = useRouter();
  const editor = useRecordEditor(initialStatus, initialNote);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const availableNotes = quickNotes.filter((note) => note.status === editor.status);

  async function save() {
    setSaving(true);
    setMessage("");
    const noteInput = editor.noteMode === "quick"
      ? { quickNoteId: editor.quickNoteId }
      : { customNote: editor.noteMode === "custom" && editor.customNote.trim() ? editor.customNote.trim() : null };
    const isBatch = mode === "batch";
    const body = isBatch
      ? { buildingId, dormitoryIds: dormitories.map(({ id }) => id), ...noteInput, status: editor.status }
      : { ...noteInput, status: editor.status };
    try {
      const response = await fetch(isBatch ? "/api/sweep-records/batch" : `/api/dormitories/${dormitories[0]?.id}/my-record`, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: isBatch ? "POST" : "PUT",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(result?.error?.message ?? "保存失败，请稍后重试");
      }
      editor.actions.markSaved();
      setMessage("保存成功");
      sessionStorage.removeItem(`sweep-batch:${buildingId}:${floor}`);
      router.replace(`/app/buildings/${buildingId}?floor=${encodeURIComponent(floor)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  }

  return <main className="agent-page record-editor">
    <Link className="mobile-back-button" href={backHref}>‹ 返回</Link>
    <h1>{title}</h1>
    <div aria-label="扫楼状态" className="record-status-tabs" role="group">
      <button aria-pressed={editor.status === "PENDING"} onClick={() => editor.actions.changeStatus("PENDING")} type="button">待补扫</button>
      <button aria-pressed={editor.status === "COVERED"} onClick={() => editor.actions.changeStatus("COVERED")} type="button">已覆盖</button>
    </div>
    <section className="record-note-panel">
      <h2>备注</h2>
      <div className="quick-note-picker">
        {availableNotes.map((note) => <button aria-pressed={editor.quickNoteId === note.id} key={note.id} onClick={() => editor.actions.chooseQuick(note.id)} type="button">{note.content}</button>)}
      </div>
      <div className="note-mode-actions">
        <button aria-pressed={editor.noteMode === "none"} onClick={editor.actions.chooseNone} type="button">无备注</button>
        <button aria-pressed={editor.noteMode === "custom"} onClick={editor.actions.chooseCustom} type="button">自定义备注</button>
      </div>
      {editor.noteMode === "custom" ? <label className="field-label" htmlFor="record-note">备注<textarea aria-label="备注" id="record-note" maxLength={60} onChange={(event) => editor.actions.changeCustom(event.target.value)} value={editor.customNote} /></label> : null}
    </section>
    <p aria-live="polite" className={message.includes("成功") ? "save-message" : "form-error"}>{message}</p>
    <button className="primary-button full-button" disabled={saving || !dormitories.length} onClick={save} type="button">{saving ? "保存中…" : mode === "batch" ? `保存${dormitories.length}间宿舍` : "保存记录"}</button>
  </main>;
}
