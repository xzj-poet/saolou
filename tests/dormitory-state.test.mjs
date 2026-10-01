import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../docs/prototype/campus-sweep-saas-prototype.html', import.meta.url), 'utf8');
const stateModule = html.match(/\/\* dormitory-state:start \*\/([\s\S]*?)\/\* dormitory-state:end \*\//);

assert.ok(stateModule, 'prototype must expose its dormitory-state module');

const context = {};
vm.createContext(context);
vm.runInContext(`${stateModule[1]};this.dormitoryApi={createInitialDormitoryState,generateDormitoryRange,addDormitories,removeDormitories,summarizeDormitories,listActiveDormitories}`, context);
const {
  createInitialDormitoryState,
  generateDormitoryRange,
  addDormitories,
  removeDormitories,
  summarizeDormitories,
  listActiveDormitories,
} = context.dormitoryApi;

test('single additions derive building counts from active dormitories', () => {
  const result = addDormitories(createInitialDormitoryState(), [{ floor: '2', roomNo: '203' }]);

  assert.deepEqual([...result.added], ['203']);
  assert.deepEqual([...result.skipped], []);
  assert.deepEqual({ ...summarizeDormitories(result.state) }, { floorCount: 1, dormCount: 3 });
});

test('batch additions generate room numbers and skip duplicates', () => {
  const generated = generateDormitoryRange(2, 3, 1, 3);
  const result = addDormitories(createInitialDormitoryState(), generated);

  assert.deepEqual([...generated].map(room => room.roomNo), ['201', '202', '203', '301', '302', '303']);
  assert.deepEqual([...result.added], ['203', '301', '302', '303']);
  assert.deepEqual([...result.skipped], ['201', '202']);
  assert.deepEqual({ ...summarizeDormitories(result.state) }, { floorCount: 2, dormCount: 6 });
});

test('rooms with sweep records are disabled while empty rooms are deleted', () => {
  const result = removeDormitories(createInitialDormitoryState(), ['201', '202']);

  assert.deepEqual([...result.disabled], ['201']);
  assert.deepEqual([...result.deleted], ['202']);
  assert.equal(result.state['201'].isActive, false);
  assert.equal(result.state['202'], undefined);
  assert.deepEqual({ ...summarizeDormitories(result.state) }, { floorCount: 0, dormCount: 0 });
});

test('active dormitory lists exclude disabled rooms and remain sorted', () => {
  const initial = createInitialDormitoryState();
  const added = addDormitories(initial, [{ floor: '3', roomNo: '302' }, { floor: '3', roomNo: '301' }]).state;
  const removed = removeDormitories(added, ['201']).state;

  assert.deepEqual([...listActiveDormitories(removed)].map(room => room.roomNo), ['202', '301', '302']);
});
