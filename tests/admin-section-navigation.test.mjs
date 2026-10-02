import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../docs/prototype/campus-sweep-saas-prototype.html', import.meta.url), 'utf8');
const stateModule = html.match(/\/\* admin-section-state:start \*\/([\s\S]*?)\/\* admin-section-state:end \*\//);

assert.ok(stateModule, 'prototype must expose its admin-section state module');

const context = {};
vm.createContext(context);
vm.runInContext(`${stateModule[1]};this.api={createAdminSectionState,resolveAdminSectionFromHash,selectAdminSection}`, context);
const api = context.api;

test('admin navigation defaults to campus data for missing or unknown hashes', () => {
  assert.deepEqual({ ...api.createAdminSectionState('') }, {
    activeSection: 'campus',
    hash: '#admin-campus',
  });
  assert.equal(api.resolveAdminSectionFromHash('#unknown'), 'campus');
});

test('direct admin hashes restore the matching section', () => {
  assert.equal(api.resolveAdminSectionFromHash('#admin-agents'), 'agents');
  assert.equal(api.resolveAdminSectionFromHash('#admin-quick-notes'), 'quick-notes');
  assert.equal(api.resolveAdminSectionFromHash('#admin-sweep-data'), 'sweep-data');
});

test('selecting a section returns its stable deep-link hash', () => {
  assert.deepEqual({ ...api.selectAdminSection(api.createAdminSectionState(''), 'sweep-data') }, {
    activeSection: 'sweep-data',
    hash: '#admin-sweep-data',
  });
});

test('an invalid selection keeps the currently active section', () => {
  const current = api.createAdminSectionState('#admin-agents');

  assert.deepEqual({ ...api.selectAdminSection(current, 'missing') }, {
    activeSection: 'agents',
    hash: '#admin-agents',
  });
});
