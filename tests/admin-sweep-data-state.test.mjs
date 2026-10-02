import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../docs/prototype/campus-sweep-saas-prototype.html', import.meta.url), 'utf8');
const stateModule = html.match(/\/\* sweep-state:start \*\/([\s\S]*?)\/\* sweep-state:end \*\//);

assert.ok(stateModule, 'prototype must expose its sweep-state module');

const context = {};
vm.createContext(context);
vm.runInContext(`${stateModule[1]};this.api={createInitialSweepState,createInitialSweepAuditState,listSweepRecords,filterSweepRecords,adminEditSweepRecord,adminDeleteSweepRecord,deriveOverallStatus}`, context);
const api = context.api;

test('current-record list is derived from the shared sweep state', () => {
  const records = api.listSweepRecords(api.createInitialSweepState());

  assert.deepEqual([...records].map(record => record.id), ['record-zhang-201', 'record-li-201']);
  assert.deepEqual([...records].map(record => `${record.roomNo}:${record.agent}:${record.status}`), [
    '201:张三:covered',
    '201:李四:pending',
  ]);
});

test('record filters combine school, building, room, agent and status', () => {
  const records = api.listSweepRecords(api.createInitialSweepState());

  assert.deepEqual([...api.filterSweepRecords(records, {
    school: '苏州大学本部',
    building: '3号楼',
    room: '01',
    agent: '李四',
    status: 'pending',
  })].map(record => record.id), ['record-li-201']);
  assert.equal(api.filterSweepRecords(records, { room: '202' }).length, 0);
});

test('administrator edit updates the shared record and prepends an immutable audit entry', () => {
  const state = api.createInitialSweepState();
  const audits = api.createInitialSweepAuditState();
  const result = api.adminEditSweepRecord(state, audits, 'record-zhang-201', 'pending', '换时间再来', '10月3日 10:00');

  assert.equal(result.error, '');
  assert.equal(result.state['201'].myRecord.status, 'pending');
  assert.equal(result.state['201'].myRecord.note, '换时间再来');
  assert.equal(result.state['201'].myRecord.modified, '10月3日 10:00');
  assert.equal(api.deriveOverallStatus(result.state['201']), 'pending');
  assert.deepEqual({ ...result.audits[0] }, {
    id: 'audit-4',
    action: 'UPDATE',
    roomNo: '201',
    building: '3号楼',
    agent: '张三',
    actor: '管理员',
    time: '10月3日 10:00',
    beforeStatus: 'covered',
    beforeNote: '已加种子',
    afterStatus: 'pending',
    afterNote: '换时间再来',
  });
  assert.equal(state['201'].myRecord.note, '已加种子');
});

test('administrator delete removes only the chosen current record and preserves its snapshot', () => {
  const state = api.createInitialSweepState();
  const audits = api.createInitialSweepAuditState();
  const result = api.adminDeleteSweepRecord(state, audits, 'record-zhang-201', '10月3日 10:05');

  assert.equal(result.error, '');
  assert.equal(result.state['201'].myRecord, null);
  assert.equal(result.state['201'].otherRecords.length, 1);
  assert.equal(api.deriveOverallStatus(result.state['201']), 'pending');
  assert.deepEqual({ ...result.audits[0] }, {
    id: 'audit-4',
    action: 'DELETE',
    roomNo: '201',
    building: '3号楼',
    agent: '张三',
    actor: '管理员',
    time: '10月3日 10:05',
    beforeStatus: 'covered',
    beforeNote: '已加种子',
  });
  assert.equal(state['201'].myRecord.note, '已加种子');
});

test('deleting the only remaining record makes the dormitory unvisited', () => {
  const first = api.adminDeleteSweepRecord(api.createInitialSweepState(), api.createInitialSweepAuditState(), 'record-zhang-201', '10月3日 10:05');
  const second = api.adminDeleteSweepRecord(first.state, first.audits, 'record-li-201', '10月3日 10:06');

  assert.equal(api.deriveOverallStatus(second.state['201']), 'unvisited');
  assert.equal(api.listSweepRecords(second.state).length, 0);
});
