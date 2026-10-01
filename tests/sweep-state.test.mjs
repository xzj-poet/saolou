import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../docs/prototype/campus-sweep-saas-prototype.html', import.meta.url), 'utf8');
const stateModule = html.match(/\/\* sweep-state:start \*\/([\s\S]*?)\/\* sweep-state:end \*\//);

assert.ok(stateModule, 'prototype must expose its sweep-state module');

const context = {};
vm.createContext(context);
vm.runInContext(`${stateModule[1]};this.sweepApi={createInitialSweepState,deriveOverallStatus,applySweepSave,summarizeSweepState,hasMyRecord}`, context);
const { createInitialSweepState, deriveOverallStatus, applySweepSave, summarizeSweepState, hasMyRecord } = context.sweepApi;

test('initial matrix summary is derived from current records', () => {
  const state = createInitialSweepState();

  assert.deepEqual({ ...summarizeSweepState(state) }, { covered: 1, pending: 0, unvisited: 1 });
  assert.equal(deriveOverallStatus(state['201']), 'covered');
  assert.equal(deriveOverallStatus(state['202']), 'unvisited');
});

test('creating a pending record refreshes counts and personal routing', () => {
  const state = applySweepSave(createInitialSweepState(), ['202'], 'pending', '晚上再来');

  assert.deepEqual({ ...summarizeSweepState(state) }, { covered: 1, pending: 1, unvisited: 0 });
  assert.equal(hasMyRecord(state, '202'), true);
  assert.deepEqual({ ...state['202'].myRecord }, {
    agent: '张三',
    status: 'pending',
    note: '晚上再来',
    modified: '刚刚',
  });
});

test('editing the only covered record can make the room pending', () => {
  const state = applySweepSave(createInitialSweepState(), ['201'], 'pending', '下次换时间');

  assert.equal(deriveOverallStatus(state['201']), 'pending');
  assert.deepEqual({ ...summarizeSweepState(state) }, { covered: 0, pending: 1, unvisited: 1 });
});

test('batch covered save refreshes every selected room atomically', () => {
  const state = applySweepSave(createInitialSweepState(), ['201', '202'], 'covered', '已充分沟通');

  assert.deepEqual({ ...summarizeSweepState(state) }, { covered: 2, pending: 0, unvisited: 0 });
  assert.equal(deriveOverallStatus(state['201']), 'covered');
  assert.equal(deriveOverallStatus(state['202']), 'covered');
});

test('covered takes priority over pending across agents', () => {
  const room = {
    myRecord: { agent: '张三', status: 'pending', note: '', modified: '刚刚' },
    otherRecords: [{ agent: '李四', status: 'covered', note: '已充分沟通', modified: '昨天' }],
  };

  assert.equal(deriveOverallStatus(room), 'covered');
});
