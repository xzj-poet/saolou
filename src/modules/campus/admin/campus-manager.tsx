"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { BuildingBlueprint } from "@/modules/campus/admin/building-blueprint";
import { CampusDialog } from "@/modules/campus/admin/campus-dialog";
import type { AdminBuildingSummary, AdminSchoolSummary } from "@/modules/campus/campus-types";

type DialogState =
  | { kind: "blueprint" | "dormitories"; building: AdminBuildingSummary }
  | { kind: "school-create" }
  | { kind: "school-edit" | "school-retire"; school: AdminSchoolSummary }
  | { kind: "building-create"; school: AdminSchoolSummary }
  | { kind: "building-name" | "building-note" | "building-retire"; building: AdminBuildingSummary }
  | null;

type ApiFailure = { error?: { message?: string } };

async function requestJson(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    method,
  });
  const payload = (await response.json()) as ApiFailure & Record<string, unknown>;
  if (!response.ok) throw new Error(payload.error?.message ?? "操作失败，请重试");
  return payload;
}

function MoreMenu({
  id,
  label,
  menu,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  menu: string | null;
  onToggle: (id: string | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="more-menu">
      <button
        aria-expanded={menu === id}
        aria-haspopup="menu"
        aria-label={label}
        className="more-button"
        onClick={(event) => {
          event.stopPropagation();
          onToggle(menu === id ? null : id);
        }}
        type="button"
      >
        ⋯
      </button>
      {menu === id ? <div className="context-menu" role="menu">{children}</div> : null}
    </div>
  );
}

function MenuAction({ children, danger = false, onClick }: { children: React.ReactNode; danger?: boolean; onClick: () => void }) {
  return (
    <button className={danger ? "danger-action" : undefined} onClick={onClick} role="menuitem" type="button">
      {children}
    </button>
  );
}

function SimpleForm({
  fields,
  onSubmit,
  submitLabel = "保存",
}: {
  fields: Array<{ label: string; name: string; value?: string }>;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  submitLabel?: string;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit(Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败，请重试");
      setSaving(false);
    }
  }
  return (
    <form className="admin-form" onSubmit={submit}>
      {fields.map((field) => (
        <label key={field.name}>
          <span>{field.label}</span>
          <input className="text-input" defaultValue={field.value} name={field.name} required={field.name !== "note"} />
        </label>
      ))}
      <p aria-live="polite" className="form-error">{error}</p>
      <button className="primary-button" disabled={saving} type="submit">{saving ? "保存中…" : submitLabel}</button>
    </form>
  );
}

function DormitoryManager({ building, onChanged }: { building: AdminBuildingSummary; onChanged: (message: string) => void }) {
  const [tab, setTab] = useState<"single" | "batch" | "retire">("single");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ duplicates: string[]; roomNumbers: string[] } | null>(null);
  const [range, setRange] = useState<Record<string, number> | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  async function single(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await requestJson(`/api/admin/buildings/${building.id}/dormitories`, "POST", {
        buildingId: building.id,
        floor: String(values.floor),
        roomNo: String(values.roomNo),
      });
      onChanged("宿舍已添加");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "添加失败"); }
  }

  async function previewBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const nextRange = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
    try {
      const result = await requestJson(`/api/admin/buildings/${building.id}/dormitories`, "POST", { action: "preview", range: nextRange });
      setRange(nextRange as Record<string, number>);
      setPreview(result as unknown as { duplicates: string[]; roomNumbers: string[] });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "预览失败"); }
  }

  async function createBatch() {
    if (!range) return;
    try {
      await requestJson(`/api/admin/buildings/${building.id}/dormitories`, "POST", { action: "create", range });
      onChanged("宿舍已批量添加");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "添加失败"); }
  }

  async function retire() {
    try {
      await requestJson(`/api/admin/buildings/${building.id}/dormitories/retire`, "POST", { dormitoryIds: selected });
      onChanged("所选宿舍已处理");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "处理失败"); }
  }

  return (
    <div>
      <div aria-label="宿舍管理方式" className="dialog-tabs" role="tablist">
        <button aria-selected={tab === "single"} onClick={() => setTab("single")} role="tab" type="button">单个添加</button>
        <button aria-selected={tab === "batch"} onClick={() => setTab("batch")} role="tab" type="button">批量添加</button>
        <button aria-selected={tab === "retire"} onClick={() => setTab("retire")} role="tab" type="button">删除停用</button>
      </div>
      {tab === "single" ? (
        <form className="admin-form" onSubmit={single}>
          <label><span>楼层</span><input className="text-input" name="floor" required /></label>
          <label><span>宿舍号</span><input className="text-input" name="roomNo" required /></label>
          <button className="primary-button" type="submit">添加宿舍</button>
        </form>
      ) : null}
      {tab === "batch" ? (
        <div>
          <form className="range-form" onSubmit={previewBatch}>
            <label>起始楼层<input className="text-input" min="1" name="floorStart" type="number" /></label>
            <label>结束楼层<input className="text-input" min="1" name="floorEnd" type="number" /></label>
            <label>起始房号<input className="text-input" min="1" name="roomStart" type="number" /></label>
            <label>结束房号<input className="text-input" min="1" name="roomEnd" type="number" /></label>
            <button className="quiet-button" type="submit">生成预览</button>
          </form>
          {preview ? <div className="batch-preview"><strong>将处理：{preview.roomNumbers.join("、")}</strong><span>重复项：{preview.duplicates.join("、") || "无"}</span><button className="primary-button" onClick={createBatch} type="button">确认批量添加</button></div> : null}
        </div>
      ) : null}
      {tab === "retire" ? (
        <div className="retire-list">
          {building.dormitories.map((room) => <label key={room.id}><input checked={selected.includes(room.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, room.id] : current.filter((id) => id !== room.id))} type="checkbox" /><span>{room.roomNo}</span><small>{room.isProtected ? "有记录，只能停用" : "可永久删除"}</small></label>)}
          <button className="danger-button" disabled={selected.length === 0} onClick={retire} type="button">删除/停用所选宿舍</button>
        </div>
      ) : null}
      <p aria-live="polite" className="form-error">{error}</p>
    </div>
  );
}

export function CampusManager({ initialSchoolId, schools }: { initialSchoolId?: string; schools: AdminSchoolSummary[] }) {
  const router = useRouter();
  const [openSchoolId, setOpenSchoolId] = useState<string | null>(
    initialSchoolId ?? schools[0]?.id ?? null,
  );
  const [menu, setMenu] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [announcement, setAnnouncement] = useState("");

  function selectSchool(id: string) {
    const next = openSchoolId === id ? null : id;
    setOpenSchoolId(next);
    router.replace(next ? `/admin/campus?school=${next}` : "/admin/campus");
  }
  function changed(message: string, close = true) {
    setAnnouncement(message);
    setMenu(null);
    if (close) setDialog(null);
    router.refresh();
  }
  async function retire(url: string) {
    await requestJson(url, "DELETE");
    changed("基础数据已处理");
  }

  return (
    <div className="campus-manager" onClick={() => menu && setMenu(null)}>
      <div className="manager-toolbar"><div><p className="page-kicker">基础数据</p><h1>学校、楼栋与宿舍</h1></div><button className="primary-button" onClick={() => setDialog({ kind: "school-create" })} type="button">＋ 添加学校</button></div>
      <p aria-live="polite" className="sr-announcement">{announcement}</p>
      <div className="school-list">
        {schools.map((school) => (
          <section className={`school-card${school.isActive ? "" : " is-disabled"}`} key={school.id}>
            <div className="school-card-header">
              <button aria-expanded={openSchoolId === school.id} aria-label={`${openSchoolId === school.id ? "收起" : "展开"}${school.name}`} className="school-toggle" onClick={() => selectSchool(school.id)} type="button"><span><strong>{school.name}</strong><small>{school.buildingCount}栋楼 · {school.dormitoryCount}间宿舍</small></span><span className="status-pill">{school.isActive ? "启用中" : "已停用"}</span></button>
              <MoreMenu id={`school-${school.id}`} label={`${school.name}操作`} menu={menu} onToggle={setMenu}>
                <MenuAction onClick={() => setDialog({ kind: "school-edit", school })}>编辑学校名称</MenuAction>
                <MenuAction onClick={() => setDialog({ kind: "building-create", school })}>新建楼栋</MenuAction>
                <MenuAction danger onClick={() => setDialog({ kind: "school-retire", school })}>删除/停用学校</MenuAction>
              </MoreMenu>
            </div>
            {openSchoolId === school.id ? <div className="building-grid">{school.buildings.length === 0 ? <div className="empty-panel compact">该学校还没有楼栋。</div> : school.buildings.map((building) => (
              <article className={`building-card${building.isActive ? "" : " is-disabled"}`} key={building.id}>
                <button aria-label={`查看${building.name}宿舍蓝图`} className="building-card-body" onClick={() => setDialog({ building, kind: "blueprint" })} type="button"><strong>{building.name}</strong><span>{building.floorCount}层 · {building.dormitoryCount}间宿舍</span>{building.note ? <small>{building.note}</small> : null}</button>
                <span className="status-pill">{building.isActive ? "启用中" : "已停用"}</span>
                <MoreMenu id={`building-${building.id}`} label={`${building.name}操作`} menu={menu} onToggle={setMenu}>
                  <MenuAction onClick={() => setDialog({ building, kind: "building-name" })}>编辑楼栋名称</MenuAction>
                  <MenuAction onClick={() => setDialog({ building, kind: "building-note" })}>编辑楼栋备注</MenuAction>
                  <MenuAction onClick={() => setDialog({ building, kind: "dormitories" })}>宿舍管理</MenuAction>
                  <MenuAction danger onClick={() => setDialog({ building, kind: "building-retire" })}>删除/停用楼栋</MenuAction>
                </MoreMenu>
              </article>
            ))}</div> : null}
          </section>
        ))}
      </div>
      {schools.length === 0 ? <div className="empty-panel"><strong>还没有学校</strong><span>点击“添加学校”开始建立校园数据。</span></div> : null}

      {dialog?.kind === "blueprint" ? <CampusDialog onClose={() => setDialog(null)} title={`${dialog.building.name}宿舍蓝图`} wide><BuildingBlueprint building={dialog.building} /></CampusDialog> : null}
      {dialog?.kind === "dormitories" ? <CampusDialog onClose={() => setDialog(null)} title={`${dialog.building.name}宿舍管理`} wide><DormitoryManager building={dialog.building} onChanged={(message) => changed(message)} /></CampusDialog> : null}
      {dialog?.kind === "school-create" ? <CampusDialog onClose={() => setDialog(null)} title="添加学校"><SimpleForm fields={[{ label: "学校名称", name: "name" }]} onSubmit={async (values) => { await requestJson("/api/admin/schools", "POST", values); changed("学校已添加"); }} /></CampusDialog> : null}
      {dialog?.kind === "school-edit" ? <CampusDialog onClose={() => setDialog(null)} title="编辑学校名称"><SimpleForm fields={[{ label: "学校名称", name: "name", value: dialog.school.name }]} onSubmit={async (values) => { await requestJson(`/api/admin/schools/${dialog.school.id}`, "PATCH", values); changed("学校名称已更新"); }} /></CampusDialog> : null}
      {dialog?.kind === "building-create" ? <CampusDialog onClose={() => setDialog(null)} title="新建楼栋"><SimpleForm fields={[{ label: "楼栋名称", name: "name" }, { label: "楼栋备注（可选）", name: "note" }]} onSubmit={async (values) => { await requestJson("/api/admin/buildings", "POST", { ...values, schoolId: dialog.school.id }); changed("楼栋已添加"); }} /></CampusDialog> : null}
      {dialog?.kind === "building-name" ? <CampusDialog onClose={() => setDialog(null)} title="编辑楼栋名称"><SimpleForm fields={[{ label: "楼栋名称", name: "name", value: dialog.building.name }]} onSubmit={async (values) => { await requestJson(`/api/admin/buildings/${dialog.building.id}`, "PATCH", values); changed("楼栋名称已更新"); }} /></CampusDialog> : null}
      {dialog?.kind === "building-note" ? <CampusDialog onClose={() => setDialog(null)} title="编辑楼栋备注"><SimpleForm fields={[{ label: "楼栋备注（可选）", name: "note", value: dialog.building.note ?? "" }]} onSubmit={async (values) => { await requestJson(`/api/admin/buildings/${dialog.building.id}`, "PATCH", values); changed("楼栋备注已更新"); }} /></CampusDialog> : null}
      {dialog?.kind === "school-retire" ? <CampusDialog onClose={() => setDialog(null)} title="删除/停用学校"><p>空学校将永久删除；已有楼栋时只会停用，历史数据不会丢失。</p><button className="danger-button" onClick={() => retire(`/api/admin/schools/${dialog.school.id}`)} type="button">确认处理</button></CampusDialog> : null}
      {dialog?.kind === "building-retire" ? <CampusDialog onClose={() => setDialog(null)} title="删除/停用楼栋"><p>空楼栋将永久删除；已有宿舍时只会停用。</p><button className="danger-button" onClick={() => retire(`/api/admin/buildings/${dialog.building.id}`)} type="button">确认处理</button></CampusDialog> : null}
    </div>
  );
}
