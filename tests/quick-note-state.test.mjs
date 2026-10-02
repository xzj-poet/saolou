import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../docs/prototype/campus-sweep-saas-prototype.html', import.meta.url), 'utf8');
const quickNoteModule = html.match(/\/\* quick-note-state:start \*\/([\s\S]*?)\/\* quick-note-state:end \*\//);
const sweepModule = html.match(/\/\* sweep-state:start \*\/([\s\S]*?)\/\* sweep-state:end \*\//);

assert.ok(quickNoteModule, 'prototype must expose its quick-note-state module');
assert.ok(sweepModule, 'prototype must expose its sweep-state module');

const context = {};
vm.createContext(context);
vm.runInContext(`${quickNoteModule[1]};${sweepModule[1]};this.api={createInitialQuickNoteState,addQuickNote,editQuickNote,toggleQuickNote,deleteQuickNote,moveQuickNote,listQuickNotes,getActiveQuickNoteTexts,createInitialSweepState}`, context);
const api = context.api;

test('agent options include only enabled notes in administrator order', () => {
  const state = api.createInitialQuickNoteState();

  assert.deepEqual([...api.getActiveQuickNoteTexts(state, 'pending')], ['没人在', '只有1-2人在', '正在打游戏/忙', '没聊进去']);
  assert.deepEqual([...api.getActiveQuickNoteTexts(state, 'covered')], ['已加种子', '已注册', '已成交', '已充分沟通', '有人可帮忙传达', '明确没需求']);
});

test('new notes require unique text inside their group and append at the end', () => {
  const initial = api.createInitialQuickNoteState();
  assert.equal(api.addQuickNote(initial, 'pending', ' ').error, 'required');
  assert.equal(api.addQuickNote(initial, 'pending', ' 没人在 ').error, 'duplicate');

  const added = api.addQuickNote(initial, 'pending', ' 晚些再来 ');
  assert.equal(added.error, '');
  assert.equal(added.state.notes[added.noteId].text, '晚些再来');
  assert.equal(added.state.notes[added.noteId].isActive, true);
  assert.equal([...api.listQuickNotes(added.state, 'pending')].at(-1).id, added.noteId);
});

test('editing configuration does not rewrite text already saved in sweep records', () => {
  const notes = api.createInitialQuickNoteState();
  const sweep = api.createInitialSweepState();
  const before = JSON.stringify(sweep);

  const edited = api.editQuickNote(notes, 'covered-seed', '已找到种子');
  assert.equal(edited.error, '');
  assert.equal(edited.state.notes['covered-seed'].text, '已找到种子');
  assert.equal(sweep['201'].myRecord.note, '已加种子');
  assert.equal(JSON.stringify(sweep), before);
});

test('enabling, disabling and deleting notes immediately changes future options', () => {
  let state = api.createInitialQuickNoteState();
  state = api.toggleQuickNote(state, 'pending-other-time').state;
  assert.deepEqual([...api.getActiveQuickNoteTexts(state, 'pending')], ['没人在', '只有1-2人在', '正在打游戏/忙', '没聊进去', '下次换时间']);

  state = api.toggleQuickNote(state, 'pending-no-answer').state;
  assert.equal(api.getActiveQuickNoteTexts(state, 'pending').includes('没人在'), false);

  state = api.deleteQuickNote(state, 'pending-few-home').state;
  assert.equal(api.listQuickNotes(state, 'pending').some(note => note.id === 'pending-few-home'), false);
});

test('moving notes changes only their order within the same group', () => {
  const initial = api.createInitialQuickNoteState();
  const moved = api.moveQuickNote(initial, 'covered-relay', 'up');

  assert.deepEqual([...api.listQuickNotes(moved.state, 'covered')].map(note => note.id), [
    'covered-seed',
    'covered-registered',
    'covered-deal',
    'covered-relay',
    'covered-introduced',
    'covered-no-demand',
  ]);
  assert.deepEqual([...api.listQuickNotes(moved.state, 'pending')].map(note => note.id), [
    'pending-no-answer',
    'pending-few-home',
    'pending-busy',
    'pending-no-conversation',
    'pending-other-time',
  ]);
});
