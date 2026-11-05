// Run with: node test.js
const assert = require('assert');
const { createGame, MAP } = require('./logic.js');

const D = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
// run(g, "R12 D8") walks 12 steps right then 8 down
function run(g, plan) {
  let last;
  plan.split(/\s+/).filter(Boolean).forEach((tok) => {
    for (let i = 0; i < Number(tok.slice(1)); i++) last = g.move(...D[tok[0]]);
  });
  return last;
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

test('map is rectangular with one start and one exit', () => {
  MAP.forEach((r) => assert.strictEqual(r.length, MAP[0].length));
  const flat = MAP.join('');
  assert.strictEqual((flat.match(/S/g) || []).length, 1);
  assert.strictEqual((flat.match(/E/g) || []).length, 1);
  assert.ok((flat.match(/[DGWT]/g) || []).length >= 3, 'needs at least 3 puzzles/obstacles');
});

test('full solution wins with all coins, no damage, 3 stars', () => {
  const g = createGame();
  run(g, 'R12 D8 L6 U2 R4 U4 L8 D2 U2 R4 D2 L2 R4');
  assert.strictEqual(g.status, 'won');
  assert.strictEqual(g.coins, g.totalCoins);
  assert.strictEqual(g.hearts, 3);
  assert.strictEqual(g.stars(), 3);
});

test('walls block movement', () => {
  const g = createGame();
  const r = g.move(-1, 0);
  assert.strictEqual(r.moved, false);
  assert.deepStrictEqual([g.x, g.y], [1, 1]);
});

test('locked door stays shut without the key', () => {
  const g = createGame();
  g.x = 7; g.y = 9; // stand below the door without having picked up the key
  const r = g.move(0, -1);
  assert.strictEqual(r.event, 'locked');
  assert.deepStrictEqual([g.x, g.y], [7, 9]);
});

test('key unlocks the door and saves a checkpoint', () => {
  const g = createGame();
  run(g, 'R12 D8 L6 U1');
  assert.strictEqual(g.doorOpen, true);
  assert.deepStrictEqual(g.checkpoint, { x: 7, y: 8 });
});

test('trap costs a heart and respawns at start', () => {
  const g = createGame();
  const r = run(g, 'D8 R3');
  assert.strictEqual(r.event, 'trap');
  assert.strictEqual(g.hearts, 2);
  assert.deepStrictEqual([g.x, g.y], [1, 1]);
});

test('trap after the door respawns at the door checkpoint', () => {
  const g = createGame();
  run(g, 'R12 D8 L6 U2 L2');
  assert.strictEqual(g.hearts, 2);
  assert.deepStrictEqual([g.x, g.y], [7, 8]);
});

test('three traps end the game', () => {
  const g = createGame();
  run(g, 'D8 R3 D8 R3 D8 R3');
  assert.strictEqual(g.status, 'lost');
  assert.strictEqual(g.hearts, 0);
});

test('gate is shut until the switch is pressed', () => {
  const g = createGame();
  run(g, 'R12 D8 L6 U2 R4 U4 L4');
  assert.deepStrictEqual([g.x, g.y], [7, 3]);
  const r = g.move(0, 1);
  assert.strictEqual(r.event, 'gate');
  assert.deepStrictEqual([g.x, g.y], [7, 3]);
});

console.log('\n' + passed + ' tests passed');
