"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { AgentDialog } from "@/modules/agents/admin/agent-dialog";

export type QuickNoteRow = {
  content: string;
  id: string;
  isActive: boolean;
  sortOrder: number;
  status: "PENDING" | "COVERED";
};

type Dialog = { kind: "create" } | { kind: "edit" | "delete"; note: QuickNoteRow } | null;

async function requestJson(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    method,
  });
  const payload = await response.json() as { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? "操作失败，请重试");
  return payload;
}

export function QuickNoteManager({ quickNotes }: { quickNotes: QuickNoteRow[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<"PENDING" | "COVERED">("PENDING");
  const [menu, setMenu] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const grouped = useMemo(() => ({
    COVERED: quickNotes.filter((note) => note.status === "COVERED").sort((a, b) => a.sortOrder - b.sortOrder),
    PENDING: quickNotes.filter((note) => note.status === "PENDING").sort((a, b) => a.sortOrder - b.sortOrder),
  }), [quickNotes]);
  const visible = grouped[status];

  function finish(message: string) {
    setAnnouncement(message);
    setDialog(null);
    setMenu(null);
    setError("");
    router.refresh();
  }

  async function submitContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = String(new FormData(event.currentTarget).get("content") ?? "");
    try {
      if (dialog?.kind === "edit") {
        await requestJson(`/api/admin/quick-notes/${dialog.note.id}`, "PATCH", { content });
        finish("快捷备注已更新，历史记录保持不变");
      } else {
        await requestJson("/api/admin/quick-notes", "POST", { content, status });
        finish("快捷备注已新增");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "保存失败"); }
  }

  async function toggle(note: QuickNoteRow) {
    try {
      await requestJson(`/api/admin/quick-notes/${note.id}`, "PATCH", { isActive: !note.isActive });
      finish(note.isActive ? "快捷备注已停用" : "快捷备注已启用");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "操作失败"); }
  }

  async function move(note: QuickNoteRow, direction: -1 | 1) {
    const index = visible.findIndex(({ id }) => id === note.id);
    const target = index + direction;
    if (target < 0 || target >= visible.length) return;
    const orderedIds = visible.map(({ id }) => id);
    [orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]];
    try {
      await requestJson("/api/admin/quick-notes/reorder", "PUT", { orderedIds, status });
      finish("快捷备注顺序已更新");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "排序失败"); }
  }

  async function remove(note: QuickNoteRow) {
    try {
      await requestJson(`/api/admin/quick-notes/${note.id}`, "DELETE");
      finish("快捷备注已删除，历史记录保持不变");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "删除失败"); }
  }

  const label = status === "PENDING" ? "待补扫" : "已覆盖";
  return (
    <div className="quick-note-manager" onClick={() => menu && setMenu(null)}>
      <div className="manager-toolbar"><div><p className="page-kicker">快捷备注</p><h1>快捷备注管理</h1></div><button aria-label={`新增${label}快捷备注`} className="primary-button" onClick={() => { setDialog({ kind: "create" }); setError(""); }} type="button">＋ 新增备注</button></div>
      <p className="page-copy">配置只影响以后可选内容；已经保存到扫楼记录和审计中的文字快照不会改变。</p>
      <p aria-live="polite" className="sr-announcement">{announcement}</p>
      <div aria-label="快捷备注分组" className="quick-note-tabs" role="tablist">
        {(["PENDING", "COVERED"] as const).map((value) => <button aria-selected={status === value} key={value} onClick={() => { setStatus(value); setMenu(null); }} role="tab" type="button">{value === "PENDING" ? "待补扫" : "已覆盖"}（{grouped[value].length}）</button>)}
      </div>
      <div className="quick-note-list" role="tabpanel">
        {visible.map((note, index) => <article className={`quick-note-row${note.isActive ? "" : " is-disabled"}`} key={note.id}>
          <span className="note-order">{index + 1}</span><strong>{note.content}</strong><span className="status-pill">{note.isActive ? "启用中" : "已停用"}</span>
          <div className="note-move-buttons"><button aria-label={`上移${note.content}`} disabled={index === 0} onClick={() => move(note, -1)} type="button">↑</button><button aria-label={`下移${note.content}`} disabled={index === visible.length - 1} onClick={() => move(note, 1)} type="button">↓</button></div>
          <div className="more-menu"><button aria-expanded={menu === note.id} aria-label={`${note.content}的备注操作`} className="more-button" onClick={(event) => { event.stopPropagation(); setMenu(menu === note.id ? null : note.id); }} type="button">⋯</button>{menu === note.id ? <div className="context-menu" role="menu"><button onClick={() => setDialog({ kind: "edit", note })} role="menuitem" type="button">编辑备注</button><button onClick={() => toggle(note)} role="menuitem" type="button">{note.isActive ? "停用备注" : "启用备注"}</button><button className="danger-action" onClick={() => setDialog({ kind: "delete", note })} role="menuitem" type="button">删除备注</button></div> : null}</div>
        </article>)}
        {visible.length === 0 ? <div className="empty-panel compact"><strong>当前分组还没有快捷备注</strong><span>备注始终可选，代理仍可不填备注保存。</span></div> : null}
      </div>
      {dialog?.kind === "create" || dialog?.kind === "edit" ? <AgentDialog onClose={() => setDialog(null)} title={dialog.kind === "edit" ? "编辑快捷备注" : `新增${label}快捷备注`}><form className="admin-form" onSubmit={submitContent}><label><span>快捷备注内容</span><input aria-label="快捷备注内容" className="text-input" defaultValue={dialog.kind === "edit" ? dialog.note.content : ""} maxLength={60} name="content" required /></label><p className="form-error">{error}</p><button className="primary-button" type="submit">{dialog.kind === "edit" ? "保存修改" : "确认新增"}</button></form></AgentDialog> : null}
      {dialog?.kind === "delete" ? <AgentDialog onClose={() => setDialog(null)} title="删除快捷备注"><p>准备删除：{dialog.note.content}</p><p>已经保存到扫楼记录和审计中的备注文字不会改变。</p><p className="form-error">{error}</p><button className="danger-button full-button" onClick={() => remove(dialog.note)} type="button">确认删除</button></AgentDialog> : null}
    </div>
  );
}
