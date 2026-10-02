import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../docs/prototype/campus-sweep-saas-prototype.html', import.meta.url), 'utf8');
const campusModule = html.match(/\/\* campus-state:start \*\/([\s\S]*?)\/\* campus-state:end \*\//);
const agentModule = html.match(/\/\* agent-state:start \*\/([\s\S]*?)\/\* agent-state:end \*\//);

assert.ok(campusModule, 'prototype must expose its campus-state module');
assert.ok(agentModule, 'prototype must expose its agent-state module');

const context = {};
vm.createContext(context);
vm.runInContext(`${campusModule[1]};${agentModule[1]};this.api={createInitialCampusState,addSchool,removeOrDisableSchool,restoreSchool,createInitialAgentState,createAgent,renameAgent,replaceAgentSchoolAccess,toggleAgentStatus,resetAgentPassword,authenticateSession,listSchoolAccess}`, context);
const api = context.api;

test('agent creation requires a unique login and returns a one-time password', () => {
  const initial = api.createInitialAgentState();
  const blank = api.createAgent(initial, '', '');
  assert.equal(blank.error, 'required');

  const duplicate = api.createAgent(initial, '新张三', ' ZHANGSAN ');
  assert.equal(duplicate.error, 'duplicate');

  const created = api.createAgent(initial, '赵六', ' ZHAOLIU ');
  assert.equal(created.error, '');
  assert.equal(created.state.agents[created.agentId].displayName, '赵六');
  assert.equal(created.state.agents[created.agentId].loginName, 'zhaoliu');
  assert.deepEqual([...created.state.agents[created.agentId].schoolIds], []);
  assert.match(created.password, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});

test('renaming and disabling an agent preserve login, password and school access', () => {
  const initial = api.createInitialAgentState();
  const before = initial.agents['zhang-san'];
  const renamed = api.renameAgent(initial, 'zhang-san', '张三丰');
  const disabled = api.toggleAgentStatus(renamed.state, 'zhang-san');
  const restored = api.toggleAgentStatus(disabled.state, 'zhang-san');

  assert.equal(restored.state.agents['zhang-san'].displayName, '张三丰');
  assert.equal(restored.state.agents['zhang-san'].loginName, before.loginName);
  assert.equal(restored.state.agents['zhang-san'].password, before.password);
  assert.deepEqual([...restored.state.agents['zhang-san'].schoolIds], ['school-main', 'school-dushuhu']);
  assert.equal(restored.state.agents['zhang-san'].isActive, true);
});

test('school access is overwritten and new schools stay unauthorized', () => {
  let campus = api.createInitialCampusState();
  const addedSchool = api.addSchool(campus, '新校区');
  campus = addedSchool.state;
  let agents = api.createInitialAgentState();

  agents = api.replaceAgentSchoolAccess(agents, 'li-si', ['school-dushuhu'], campus).state;
  const access = api.listSchoolAccess(agents, campus, 'li-si');
  assert.deepEqual(Array.from(access, item => [item.schoolId, item.isAuthorized]), [
    ['school-main', false],
    ['school-dushuhu', true],
    [addedSchool.schoolId, false],
  ]);

  agents = api.replaceAgentSchoolAccess(agents, 'li-si', [], campus).state;
  assert.deepEqual([...agents.agents['li-si'].schoolIds], []);
});

test('disabled schools are inaccessible without erasing a saved grant', () => {
  let campus = api.createInitialCampusState();
  const agents = api.createInitialAgentState();
  campus = api.removeOrDisableSchool(campus, 'school-main').state;
  let row = api.listSchoolAccess(agents, campus, 'zhang-san').find(item => item.schoolId === 'school-main');
  assert.equal(row.isAuthorized, true);
  assert.equal(row.canEnter, false);

  campus = api.restoreSchool(campus, 'school-main').state;
  row = api.listSchoolAccess(agents, campus, 'zhang-san').find(item => item.schoolId === 'school-main');
  assert.equal(row.canEnter, true);
});

test('authentication distinguishes disabled accounts but keeps other failures generic', () => {
  let agents = api.createInitialAgentState();
  assert.deepEqual({ ...api.authenticateSession(agents, 'zhangsan', 'demo123') }, { role: 'agent', agentId: 'zhang-san', error: '' });
  assert.equal(api.authenticateSession(agents, 'missing', 'demo123').error, 'credentials');
  assert.equal(api.authenticateSession(agents, 'zhangsan', 'wrong').error, 'credentials');

  agents = api.toggleAgentStatus(agents, 'zhang-san').state;
  assert.equal(api.authenticateSession(agents, 'zhangsan', 'demo123').error, 'disabled');
});

test('resetting a password invalidates the old password and returns the new one once', () => {
  const initial = api.createInitialAgentState();
  const reset = api.resetAgentPassword(initial, 'li-si');
  assert.notEqual(reset.password, 'demo123');
  assert.equal(api.authenticateSession(reset.state, 'lisi', 'demo123').error, 'credentials');
  assert.equal(api.authenticateSession(reset.state, 'lisi', reset.password).error, '');
});
