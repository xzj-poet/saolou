import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../docs/prototype/campus-sweep-saas-prototype.html', import.meta.url), 'utf8');
const navigationModule = html.match(/\/\* navigation-state:start \*\/([\s\S]*?)\/\* navigation-state:end \*\//);

assert.ok(navigationModule, 'prototype must expose its navigation-state module');

const context = { URL };
vm.createContext(context);
vm.runInContext(`${navigationModule[1]};this.navigationApi={buildSceneUrl,readSceneLocation,sceneUsesRoom}`, context);
const { buildSceneUrl, readSceneLocation, sceneUsesRoom } = context.navigationApi;

test('room pages keep the active dormitory in the URL', () => {
  const result = buildSceneUrl(
    'http://127.0.0.1:63701/campus-sweep-saas-prototype.html?v=24-live-matrix&scene=matrix',
    'detail',
    '202',
  );

  assert.equal(result, '/campus-sweep-saas-prototype.html?v=24-live-matrix&scene=detail&room=202');
  assert.equal(sceneUsesRoom('detail'), true);
  assert.equal(sceneUsesRoom('edit'), true);
  assert.equal(sceneUsesRoom('history'), true);
  assert.equal(sceneUsesRoom('single'), true);
});

test('non-room pages remove stale room parameters', () => {
  const result = buildSceneUrl(
    'http://127.0.0.1:63701/campus-sweep-saas-prototype.html?v=24-live-matrix&scene=detail&room=202',
    'matrix',
    '202',
  );

  assert.equal(result, '/campus-sweep-saas-prototype.html?v=24-live-matrix&scene=matrix');
  assert.equal(sceneUsesRoom('matrix'), false);
});

test('direct URLs restore a supported scene and room', () => {
  assert.deepEqual(
    { ...readSceneLocation('http://127.0.0.1:63701/campus-sweep-saas-prototype.html?v=24-live-matrix&scene=history&room=201') },
    { scene: 'history', room: '201' },
  );
  assert.deepEqual(
    { ...readSceneLocation('http://127.0.0.1:63701/campus-sweep-saas-prototype.html?v=24-live-matrix&scene=unknown&room=202') },
    { scene: 'login', room: '' },
  );
});
