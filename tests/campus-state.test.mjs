import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../docs/prototype/campus-sweep-saas-prototype.html', import.meta.url), 'utf8');
const stateModule = html.match(/\/\* campus-state:start \*\/([\s\S]*?)\/\* campus-state:end \*\//);

assert.ok(stateModule, 'prototype must expose its campus-state module');

const context = {};
vm.createContext(context);
vm.runInContext(`${stateModule[1]};this.campusApi={createInitialCampusState,addSchool,renameSchool,addBuilding,updateBuilding,removeOrDisableSchool,removeOrDisableBuilding,restoreSchool,restoreBuilding,summarizeSchool,summarizeCampus,listActiveSchools,listActiveBuildings}`, context);
const {
  createInitialCampusState,
  addSchool,
  renameSchool,
  addBuilding,
  updateBuilding,
  removeOrDisableSchool,
  removeOrDisableBuilding,
  restoreSchool,
  restoreBuilding,
  summarizeSchool,
  summarizeCampus,
  listActiveSchools,
  listActiveBuildings,
} = context.campusApi;

test('school totals are derived from active buildings', () => {
  const state = createInitialCampusState();

  assert.deepEqual({ ...summarizeSchool(state, 'school-main') }, { buildingCount: 6, dormCount: 602 });
  assert.deepEqual({ ...summarizeCampus(state) }, { schoolCount: 2, buildingCount: 10, dormCount: 1082 });
});

test('adding and editing a building updates identity without changing derived counts', () => {
  let result = addBuilding(createInitialCampusState(), 'school-main', '7号楼', '靠近北门');
  assert.equal(result.error, '');
  assert.deepEqual({ ...summarizeSchool(result.state, 'school-main') }, { buildingCount: 7, dormCount: 602 });

  const buildingId = result.buildingId;
  result = updateBuilding(result.state, 'school-main', buildingId, { name: '研究生楼', note: '夜间开放' });
  assert.deepEqual({ ...result.state.schools['school-main'].buildings[buildingId] }, {
    id: buildingId,
    name: '研究生楼',
    note: '夜间开放',
    isActive: true,
    floorCount: 0,
    dormCount: 0,
  });

  const duplicate = addBuilding(result.state, 'school-main', '研究生楼', '重复');
  assert.equal(duplicate.error, 'duplicate');
  assert.deepEqual({ ...summarizeSchool(duplicate.state, 'school-main') }, { buildingCount: 7, dormCount: 602 });
});

test('populated buildings are disabled while empty buildings are deleted and restorable', () => {
  let state = createInitialCampusState();
  let result = removeOrDisableBuilding(state, 'school-main', 'building-3');
  assert.equal(result.action, 'disabled');
  assert.deepEqual([...listActiveBuildings(result.state, 'school-main')].map(building => building.id), ['building-1', 'building-2', 'building-4', 'building-5', 'building-6']);
  assert.deepEqual({ ...summarizeSchool(result.state, 'school-main') }, { buildingCount: 5, dormCount: 600 });

  state = restoreBuilding(result.state, 'school-main', 'building-3').state;
  assert.deepEqual({ ...summarizeSchool(state, 'school-main') }, { buildingCount: 6, dormCount: 602 });

  const added = addBuilding(state, 'school-main', '临时楼', '').state;
  const emptyId = Object.values(added.schools['school-main'].buildings).find(building => building.name === '临时楼').id;
  result = removeOrDisableBuilding(added, 'school-main', emptyId);
  assert.equal(result.action, 'deleted');
  assert.equal(result.state.schools['school-main'].buildings[emptyId], undefined);
});

test('schools with buildings are disabled while empty schools are deleted', () => {
  let result = removeOrDisableSchool(createInitialCampusState(), 'school-main');
  assert.equal(result.action, 'disabled');
  assert.deepEqual([...listActiveSchools(result.state)].map(school => school.id), ['school-dushuhu']);

  let state = restoreSchool(result.state, 'school-main').state;
  assert.equal(state.schools['school-main'].isActive, true);
  state = renameSchool(state, 'school-main', '苏州大学天赐庄校区').state;
  assert.equal(state.schools['school-main'].name, '苏州大学天赐庄校区');

  const added = addSchool(state, '测试空学校');
  result = removeOrDisableSchool(added.state, added.schoolId);
  assert.equal(result.action, 'deleted');
  assert.equal(result.state.schools[added.schoolId], undefined);
});
