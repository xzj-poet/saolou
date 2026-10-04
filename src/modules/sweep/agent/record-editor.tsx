"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useUnsavedChanges } from "@/components/unsaved-changes-provider";
import { type EditorStatus, useRecordEditor } from "@/modules/sweep/agent/use-record-editor";

type QuickNote = { content: string; id: string; status: EditorStatus };
type Dormitory = { expectedRecordId: string | null; expectedVersion: number | null; id: string; roomNo: string };

type Props = {
  backHref: string;
  buildingId: string;
  dormitories: Dormitory[];
  floor: string;
  initialNote?: string | null;
  initialStatus?: EditorStatus | null;
  mode: "create" | "edit" | "batch";
  quickNotes: QuickNote[];
  title: string;
};

type CurrentRecord = {
  id: string;
  note: string | null;
  status: EditorStatus;
  updatedAt: string;
  version: number;
};

type RecordConflict = {
  currentRecord?: CurrentRecord | null;
  dormitoryId: string;
  reason: "UPDATED" | "DELETED" | "CREATED";
  roomNo?: string;
};

export function RecordEditor({ backHref, buildingId, dormitories, floor, initialNote = null, initialStatus = null, mode, quickNotes, title }: Props) {
  const router = useRouter();
  const editor = useRecordEditor(initialStatus, initialNote);
  const confirmNavigation = useUnsavedChanges(editor.dirty);
  const [targetOverrides, setTargetOverrides] = useState<Record<string, Dormitory>>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState("");
  const [conflicts, setConflicts] = useState<RecordConflict[]>([]);
  const targets = dormitories.map((target) => targetOverrides[target.id] ?? target);
  const availableNotes = quickNotes.filter((note) => note.status === editor.status);

  async function save() {
    if (!editor.status) return;
    setSaving(true);
    setFailed(false);
    setMessage("");
    setConflicts([]);
    const noteInput = editor.noteMode === "quick"
      ? { quickNoteId: editor.quickNoteId }
      : { customNote: editor.noteMode === "custom" && editor.customNote.trim() ? editor.customNote.trim() : null };
    const isBatch = mode === "batch";
    const body = isBatch
      ? { buildingId, targets: targets.map(({ expectedRecordId, expectedVersion, id }) => ({ dormitoryId: id, expectedRecordId, expectedVersion })), ...noteInput, status: editor.status }
      : { expectedRecordId: targets[0]?.expectedRecordId ?? null, expectedVersion: targets[0]?.expectedVersion ?? null, ...noteInput, status: editor.status };
    try {
      const response = await fetch(isBatch ? "/api/sweep-records/batch" : `/api/dormitories/${targets[0]?.id}/my-record`, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: isBatch ? "POST" : "PUT",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: { code?: string; fields?: { conflicts?: RecordConflict[] }; message?: string } } | null;
        if (response.status === 409 && result?.error?.code === "RECORD_CONFLICT") {
          setConflicts(result.error.fields?.conflicts ?? []);
          setMessage("记录已被其他操作更新，请加载最新内容后确认");
          return;
        }
        throw new Error(result?.error?.message ?? "保存失败，请稍后重试");
      }
      editor.actions.markSaved();
      setMessage("已保存");
      sessionStorage.removeItem(`sweep-batch:${buildingId}:${floor}`);
      window.setTimeout(() => router.replace(`/app/buildings/${buildingId}?floor=${encodeURIComponent(floor)}`), 800);
    } catch (error) {
      if (error instanceof TypeError) {
        setFailed(true);
        setMessage("尚未保存，请检查网络后重新保存");
      } else {
        setMessage(error instanceof Error ? error.message : "保存失败，请稍后重试");
      }
    } finally {
      setSaving(false);
    }
  }

  function loadLatest() {
    const conflict = conflicts[0];
    if (!conflict || mode === "batch") return;
    const current = conflict.currentRecord ?? null;
    const target = targets.find((candidate) => candidate.id === conflict.dormitoryId);
    if (target) setTargetOverrides((currentOverrides) => ({
      ...currentOverrides,
      [target.id]: { ...target, expectedRecordId: current?.id ?? null, expectedVersion: current?.version ?? null },
    }));
    editor.actions.loadLatest({ note: current?.note ?? null, status: current?.status ?? null });
    setConflicts([]);
    setMessage("已加载最新记录，请确认后重新保存");
  }

  function refreshBatch() {
    setTargetOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      for (const conflict of conflicts) {
        const target = targets.find((candidate) => candidate.id === conflict.dormitoryId);
        if (target) nextOverrides[target.id] = {
          ...target,
          expectedRecordId: conflict.currentRecord?.id ?? null,
          expectedVersion: conflict.currentRecord?.version ?? null,
        };
      }
      return nextOverrides;
    });
    setConflicts([]);
    setMessage("正在刷新最新记录，请确认后重新保存");
    router.refresh();
  }

  return <main className="agent-page record-editor">
    <button aria-label="返回" className="mobile-back-button" onClick={() => confirmNavigation(() => router.push(backHref))} type="button">‹ 返回</button>
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
    {conflicts.length ? <section className="record-conflict-panel">
      {conflicts.map((conflict) => <div key={conflict.dormitoryId}>
        <strong>{conflict.roomNo ? `${conflict.roomNo} 最新记录` : "最新记录"}</strong>
        {conflict.currentRecord
          ? <p>{conflict.currentRecord.status === "COVERED" ? "已覆盖" : "待补扫"} · {conflict.currentRecord.note || "无备注"} · 版本 {conflict.currentRecord.version}</p>
          : <p>该记录已被删除</p>}
      </div>)}
      {mode !== "batch"
        ? <button className="quiet-button" onClick={loadLatest} type="button">加载最新记录</button>
        : <button className="quiet-button" onClick={refreshBatch} type="button">刷新最新记录</button>}
    </section> : null}
    <p aria-live="polite" className={message === "已保存" || message.startsWith("已加载") ? "save-message" : "form-error"}>{message}</p>
    <button className="primary-button full-button" disabled={saving || !targets.length || !editor.status} onClick={save} type="button">{saving ? "保存中…" : failed ? "重新保存" : mode === "batch" ? `保存${targets.length}间宿舍` : "保存记录"}</button>
  </main>;
}
