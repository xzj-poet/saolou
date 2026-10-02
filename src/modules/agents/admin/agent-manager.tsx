"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AgentDialog } from "@/modules/agents/admin/agent-dialog";

export type AdminAgentRow = {
  id: string;
  name: string;
  schools: Array<{ id: string; isActive: boolean; name: string }>;
  status: "ACTIVE" | "DISABLED";
  username: string;
};

export type AdminSchoolOption = { id: string; isActive: boolean; name: string };

type Dialog =
  | { kind: "create" }
  | { agent: AdminAgentRow; kind: "access" | "rename" | "reset" | "status" }
  | null;

async function requestJson(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    method,
  });
  const payload = await response.json() as { error?: { message?: string }; temporaryPassword?: string };
  if (!response.ok) throw new Error(payload.error?.message ?? "操作失败，请重试");
  return payload;
}

function PasswordPanel({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard?.writeText(password);
    setCopied(true);
  }
  return (
    <div className="password-result">
      <p>此密码只展示一次，请立即复制并安全交给代理。</p>
      <code>{password}</code>
      <button className="quiet-button" onClick={copy} type="button">{copied ? "已复制" : "复制密码"}</button>
    </div>
  );
}

export function AgentManager({ agents, schools }: { agents: AdminAgentRow[]; schools: AdminSchoolOption[] }) {
  const router = useRouter();
  const [menu, setMenu] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState<string | null>(null);
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("");

  function closeDialog() {
    setDialog(null);
    setPassword(null);
    setError("");
  }
  function open(next: NonNullable<Dialog>) {
    setMenu(null);
    setPassword(null);
    setError("");
    if (next.kind === "access") setSelectedSchools(next.agent.schools.map(({ id }) => id));
    setDialog(next);
  }
  function changed(message: string, keepDialog = false) {
    setAnnouncement(message);
    router.refresh();
    if (!keepDialog) closeDialog();
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const result = await requestJson("/api/admin/agents", "POST", values);
      setPassword(result.temporaryPassword ?? null);
      setAnnouncement("代理账号已创建");
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "创建失败"); }
  }
  async function rename(event: FormEvent<HTMLFormElement>, agent: AdminAgentRow) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    try { await requestJson(`/api/admin/agents/${agent.id}`, "PATCH", { name }); changed("代理名称已更新"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "保存失败"); }
  }
  async function saveAccess(agent: AdminAgentRow) {
    try {
      await requestJson(`/api/admin/agents/${agent.id}/school-access`, "PUT", { schoolIds: selectedSchools });
      changed("学校权限已更新");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "保存失败"); }
  }
  async function resetPassword(agent: AdminAgentRow) {
    try {
      const result = await requestJson(`/api/admin/agents/${agent.id}/password`, "POST");
      setPassword(result.temporaryPassword ?? null);
      setAnnouncement("密码已重置");
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "重置失败"); }
  }
  async function toggleStatus(agent: AdminAgentRow) {
    const status = agent.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try { await requestJson(`/api/admin/agents/${agent.id}`, "PATCH", { status }); changed(status === "ACTIVE" ? "代理已启用" : "代理已禁用"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "操作失败"); }
  }

  return (
    <div className="agent-manager" onClick={() => menu && setMenu(null)}>
      <div className="manager-toolbar"><div><p className="page-kicker">代理账号</p><h1>代理与学校权限</h1></div><button className="primary-button" onClick={() => open({ kind: "create" })} type="button">＋ 创建代理</button></div>
      <p aria-live="polite" className="sr-announcement">{announcement}</p>
      <div className="agent-list">
        {agents.map((agent) => (
          <article className={`agent-row${agent.status === "DISABLED" ? " is-disabled" : ""}`} key={agent.id}>
            <div className="agent-identity"><strong>{agent.name}</strong><span>{agent.username}</span></div>
            <span className="status-pill">{agent.status === "ACTIVE" ? "启用中" : "已禁用"}</span>
            <div className="school-tags">{agent.schools.length ? agent.schools.map((school) => <span key={school.id}>{school.name}</span>) : <em>暂未授权学校</em>}</div>
            <div className="more-menu">
              <button aria-expanded={menu === agent.id} aria-label={`${agent.name}账号操作`} className="more-button" onClick={(event) => { event.stopPropagation(); setMenu(menu === agent.id ? null : agent.id); }} type="button">⋯</button>
              {menu === agent.id ? <div className="context-menu" role="menu">
                <button onClick={() => open({ agent, kind: "rename" })} role="menuitem" type="button">编辑代理名称</button>
                <button onClick={() => open({ agent, kind: "access" })} role="menuitem" type="button">配置学校权限</button>
                <button onClick={() => open({ agent, kind: "reset" })} role="menuitem" type="button">重置密码</button>
                <button className={agent.status === "ACTIVE" ? "danger-action" : undefined} onClick={() => open({ agent, kind: "status" })} role="menuitem" type="button">{agent.status === "ACTIVE" ? "禁用代理" : "启用代理"}</button>
              </div> : null}
            </div>
          </article>
        ))}
      </div>
      {agents.length === 0 ? <div className="empty-panel"><strong>还没有代理账号</strong><span>创建后再配置可以进入的学校。</span></div> : null}

      {dialog?.kind === "create" ? <AgentDialog onClose={closeDialog} title="创建代理">{password ? <PasswordPanel password={password} /> : <form className="admin-form" onSubmit={create}><label><span>代理名称</span><input aria-label="代理名称" className="text-input" name="name" required /></label><label><span>登录账号</span><input aria-label="登录账号" className="text-input" name="username" required /></label><p className="form-error">{error}</p><button className="primary-button" type="submit">创建账号</button></form>}</AgentDialog> : null}
      {dialog?.kind === "rename" ? <AgentDialog onClose={closeDialog} title={`编辑${dialog.agent.name}的名称`}><form className="admin-form" onSubmit={(event) => rename(event, dialog.agent)}><label><span>代理名称</span><input className="text-input" defaultValue={dialog.agent.name} name="name" required /></label><p className="form-error">{error}</p><button className="primary-button" type="submit">保存名称</button></form></AgentDialog> : null}
      {dialog?.kind === "access" ? <AgentDialog onClose={closeDialog} title={`配置${dialog.agent.name}的学校权限`}><div className="school-access-list">{schools.map((school) => <label key={school.id}><input aria-label={school.name} checked={selectedSchools.includes(school.id)} disabled={!school.isActive && !selectedSchools.includes(school.id)} onChange={(event) => setSelectedSchools((current) => event.target.checked ? [...current, school.id] : current.filter((id) => id !== school.id))} type="checkbox" /><span>{school.name}</span>{!school.isActive ? <small>已停用</small> : null}</label>)}</div><p className="form-error">{error}</p><button className="primary-button full-button" onClick={() => saveAccess(dialog.agent)} type="button">保存学校权限</button></AgentDialog> : null}
      {dialog?.kind === "reset" ? <AgentDialog onClose={closeDialog} title={`重置${dialog.agent.name}的密码`}>{password ? <PasswordPanel password={password} /> : <><p>确认后旧密码和现有登录会话立即失效。</p><p className="form-error">{error}</p><button className="danger-button full-button" onClick={() => resetPassword(dialog.agent)} type="button">确认重置密码</button></>}</AgentDialog> : null}
      {dialog?.kind === "status" ? <AgentDialog onClose={closeDialog} title={`${dialog.agent.status === "ACTIVE" ? "禁用" : "启用"}${dialog.agent.name}`}><p>{dialog.agent.status === "ACTIVE" ? "禁用后其现有会话立即失效，但学校授权和历史记录都会保留。" : "启用后代理可以重新登录，原学校授权保持不变。"}</p><p className="form-error">{error}</p><button className={dialog.agent.status === "ACTIVE" ? "danger-button full-button" : "primary-button full-button"} onClick={() => toggleStatus(dialog.agent)} type="button">确认{dialog.agent.status === "ACTIVE" ? "禁用" : "启用"}</button></AgentDialog> : null}
    </div>
  );
}
