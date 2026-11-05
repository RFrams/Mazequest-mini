/* MazeQuest Mini: pure game logic (no DOM). Works in the browser and in Node for tests.
 *
 * Legend:
 *  #  wall            S  start            E  exit
 *  D  locked door     K  key              G  gate (opened by switch)
 *  W  switch          T  spike trap       C  coin
 */
(function (root) {
  'use strict';

  const MAP = [
    '###############',
    '#S........K..C#',
    '#.###########.#',
    '#.#W........#.#',
    '#.#.###G###.#.#',
    '#.#C#C...E#.#C#',
    '#.#.#######.#.#',
    '#.#..T......#.#',
    '#.#####D#####.#',
    '#...TT...C....#',
    '###############'
  ];

  function createGame() {
    const rows = MAP.map((r) => r.split(''));
    const h = rows.length;
    const w = rows[0].length;
    let start = { x: 1, y: 1 };
    let totalCoins = 0;
    rows.forEach((row, y) => row.forEach((c, x) => {
      if (c === 'S') start = { x, y };
      if (c === 'C') totalCoins++;
    }));

    const g = {
      w, h, rows, start, totalCoins,
      x: start.x, y: start.y,
      checkpoint: { x: start.x, y: start.y },
      hearts: 3, maxHearts: 3,
      hasKey: false, doorOpen: false, gateOpen: false,
      coins: 0, moves: 0,
      status: 'play', // 'play' | 'won' | 'lost'
      lostHeartEver: false,
      collected: new Set()
    };

    g.tile = function (x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return '#';
      if (g.collected.has(x + ',' + y)) return '.';
      const c = rows[y][x];
      return c === 'S' ? '.' : c;
    };

    g.move = function (dx, dy) {
      if (g.status !== 'play') return { moved: false };
      const nx = g.x + dx;
      const ny = g.y + dy;
      const t = g.tile(nx, ny);

      if (t === '#') return { moved: false, event: 'bump' };

      if (t === 'D' && !g.doorOpen) {
        if (!g.hasKey) {
          return { moved: false, event: 'locked', msg: 'Locked door. Find the key first.' };
        }
        g.hasKey = false;
        g.doorOpen = true;
        g.x = nx; g.y = ny; g.moves++;
        g.checkpoint = { x: nx, y: ny };
        return { moved: true, event: 'unlock', msg: 'Door unlocked! Checkpoint saved.' };
      }

      if (t === 'G' && !g.gateOpen) {
        return { moved: false, event: 'gate', msg: 'The gate is shut. Find a switch.' };
      }

      g.x = nx; g.y = ny; g.moves++;
      const k = nx + ',' + ny;

      if (t === 'K') {
        g.hasKey = true; g.collected.add(k);
        return { moved: true, event: 'key', msg: 'Got the key! Now find the locked door.' };
      }
      if (t === 'C') {
        g.coins++; g.collected.add(k);
        return { moved: true, event: 'coin' };
      }
      if (t === 'W' && !g.gateOpen) {
        g.gateOpen = true;
        return { moved: true, event: 'switch', msg: 'Click! A gate opened somewhere.' };
      }
      if (t === 'T') {
        g.hearts--;
        g.lostHeartEver = true;
        if (g.hearts <= 0) {
          g.status = 'lost';
          return { moved: true, event: 'dead', msg: 'Out of hearts.' };
        }
        g.x = g.checkpoint.x; g.y = g.checkpoint.y;
        return { moved: true, event: 'trap', msg: 'Spikes! Back to your checkpoint.' };
      }
      if (t === 'E') {
        g.status = 'won';
        return { moved: true, event: 'win' };
      }
      return { moved: true };
    };

    // 1 star for finishing, +1 for all coins, +1 for never touching a trap.
    g.stars = function () {
      return 1 + (g.coins === g.totalCoins ? 1 : 0) + (g.lostHeartEver ? 0 : 1);
    };

    return g;
  }

  const api = { MAP, createGame };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MazeLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
