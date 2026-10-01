import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../docs/prototype/campus-sweep-saas-prototype.html', import.meta.url), 'utf8');
const stateModule = html.match(/\/\* record-editor-state:start \*\/([\s\S]*?)\/\* record-editor-state:end \*\//);

assert.ok(stateModule, 'prototype must expose its shared record-editor state module');

const context = {};
vm.createContext(context);
vm.runInContext(`${stateModule[1]};this.recordEditorApi={getRecordNoteOptions,recordEditorTransition,canSaveRecord}`, context);
const { getRecordNoteOptions, recordEditorTransition, canSaveRecord } = context.recordEditorApi;

test('quick notes change with the selected status', () => {
  assert.deepEqual(Array.from(getRecordNoteOptions('pending')), [
    '没人在',
    '只有1-2人在',
    '正在打游戏/忙',
    '没聊进去',
    '下次换时间',
  ]);
  assert.deepEqual(Array.from(getRecordNoteOptions('covered')), [
    '已加种子',
    '已注册',
    '已成交',
    '已充分沟通',
    '有人可帮忙传达',
    '明确没需求',
  ]);
});

test('changing status clears an incompatible shortcut note', () => {
  let state = { status: '', noteMode: 'none', noteText: '' };
  state = recordEditorTransition(state, { type: 'select-status', status: 'pending' });
  state = recordEditorTransition(state, { type: 'select-note', noteText: '没人在' });
  state = recordEditorTransition(state, { type: 'select-status', status: 'covered' });

  assert.deepEqual({ ...state }, { status: 'covered', noteMode: 'none', noteText: '' });
});

test('custom notes remain optional while status is required', () => {
  let state = { status: '', noteMode: 'none', noteText: '' };
  assert.equal(canSaveRecord(state), false);

  state = recordEditorTransition(state, { type: 'select-status', status: 'pending' });
  assert.equal(canSaveRecord(state), true);

  state = recordEditorTransition(state, { type: 'select-custom' });
  assert.deepEqual({ ...state }, { status: 'pending', noteMode: 'custom', noteText: '' });
  assert.equal(canSaveRecord(state), true);

  state = recordEditorTransition(state, { type: 'input-custom', noteText: '晚上再来' });
  assert.equal(state.noteText, '晚上再来');
});
