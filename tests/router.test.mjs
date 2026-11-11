import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, routeKey, routeHash, routeTitle, neighbourIds } from '../src/core/router.ts';

test('parseHash: all supported routes', () => {
  assert.deepEqual(parseHash(''), { name: 'atrium' });
  assert.deepEqual(parseHash('#/'), { name: 'atrium' });
  assert.deepEqual(parseHash('#/index'), { name: 'index' });
  for (let i = 1; i <= 6; i++) {
    assert.deepEqual(parseHash(`#/room/${i}`), { name: 'room', id: String(i) });
  }
});

test('parseHash: invalid room ids fall back to the atrium', () => {
  for (const h of ['#/room/0', '#/room/7', '#/room/abc', '#/room/', '#/unknown']) {
    assert.deepEqual(parseHash(h), { name: 'atrium' }, h);
  }
});

test('routeKey / routeHash round-trip', () => {
  const routes = [
    { name: 'atrium' }, { name: 'index' },
    ...Array.from({ length: 6 }, (_, i) => ({ name: 'room', id: String(i + 1) })),
  ];
  for (const r of routes) {
    assert.equal(parseHash(routeHash(r)).name, r.name);
    if (r.name === 'room') assert.equal(parseHash(routeHash(r)).id, r.id);
  }
  assert.equal(routeKey({ name: 'room', id: '4' }), 'r4');
  assert.equal(routeKey({ name: 'index' }), 'index');
});

test('routeTitle is language aware and always contains the brand', () => {
  for (const lang of ['en', 'zh']) {
    assert.match(routeTitle({ name: 'atrium' }, lang), /KELVIN ZERO/);
    assert.match(routeTitle({ name: 'index' }, lang), /INDEX/);
    assert.match(routeTitle({ name: 'room', id: '2' }, lang), /002/);
  }
  assert.match(routeTitle({ name: 'atrium' }, 'zh'), /零度美术馆/);
  assert.match(routeTitle({ name: 'room', id: '2' }, 'zh'), /水银/);
  assert.match(routeTitle({ name: 'room', id: '2' }, 'en'), /MERCURY/);
});

test('neighbourIds wraps within 1..6', () => {
  assert.equal(neighbourIds('1', -1), '6');
  assert.equal(neighbourIds('6', 1), '1');
  assert.equal(neighbourIds('3', 1), '4');
  assert.equal(neighbourIds('0', 1), '1');
  assert.equal(neighbourIds('invalid', -1), '6');
});
