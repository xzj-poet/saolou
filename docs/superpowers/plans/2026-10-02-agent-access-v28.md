# Agent Accounts and School Access v28 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static administrator agent cards, school permissions, and login demo into one page-memory interactive flow driven by a shared agent state.

**Architecture:** Add a pure `agent-state` module inside the existing standalone HTML prototype, then connect the admin list, dialogs, login, identity menu, and agent school list to that state. Keep data in memory only and continue deriving school names and active status from `campusDemoState`.

**Tech Stack:** Standalone HTML, CSS and vanilla JavaScript; Node.js built-in test runner; PowerShell contract test.

**Spec:** `docs/superpowers/specs/2026-09-29-campus-sweep-saas-design.md`

## Global Constraints

- The product serves one internal team and has only administrator and agent roles.
- Agent access is granted per school; revocation must not delete history or other account data.
- Disabled agents cannot log in; re-enabling preserves permissions and records.
- Initial and reset passwords are shown once in the administrator flow.
- New schools are not automatically granted to existing agents.
- This prototype remains online-only and keeps demo changes in page memory.

## Review Focus

- Blank or duplicate login names must not create an agent.
- Replacing school access with an empty set must be supported.
- Disabling and re-enabling an agent must preserve school access.
- A disabled school must remain inaccessible without erasing the saved grant.
- Wrong passwords and unknown accounts must use the same credentials error.

---

### Task 1: Pure agent account and access state

**Files:**
- Modify: `docs/prototype/campus-sweep-saas-prototype.html`
- Create: `tests/agent-state.test.mjs`
- Modify: `tests/prototype-contract.ps1`

**Interfaces:**
- Consumes: `createInitialCampusState`, `addSchool`, `removeOrDisableSchool`, `restoreSchool`.
- Produces: `createInitialAgentState`, `createAgent`, `renameAgent`, `replaceAgentSchoolAccess`, `toggleAgentStatus`, `resetAgentPassword`, `authenticateSession`, `listSchoolAccess`.

- [x] Write behavior tests for creation validation, overwrite-style access, account-state preservation, school activation, password reset, and login errors.
- [x] Run `node --test tests/agent-state.test.mjs` and verify failure because `agent-state` is absent.
- [x] Implement the minimal pure state module inside the prototype.
- [x] Run `node --test tests/agent-state.test.mjs` and verify all tests pass.

### Task 2: Wire the administrator and agent pages

**Files:**
- Modify: `docs/prototype/campus-sweep-saas-prototype.html`
- Modify: `tests/prototype-contract.ps1`

**Interfaces:**
- Consumes: Task 1 agent-state functions and the existing campus state/renderers.
- Produces: dynamic agent list, live school-access dialog, real agent actions, state-aware login and identity, and permission-aware school rows.

- [x] Add contract assertions for the dynamic agent renderer and action application entry points.
- [x] Run the contract test and verify those new assertions fail.
- [x] Render agent cards and school-access choices from shared state and wire create, rename, access replacement, password reset, and status toggle.
- [x] Authenticate the login form from shared state, display the signed-in name, and derive school authorization from the current agent.
- [x] Run the complete Node and PowerShell test suites.
- [x] Open the v28 administrator agent view in the right preview and manually exercise representative flows.

