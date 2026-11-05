/* MazeQuest Mini: rendering and input. Game rules live in logic.js. */
(function () {
  'use strict';

  const Logic = window.MazeLogic;
  const CELL = 40;
  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');

  let game = Logic.createGame();
  let playing = false;
  let msgTimer = null;
  let repeatDelay = null;
  let repeatTimer = null;

  canvas.width = game.w * CELL;
  canvas.height = game.h * CELL;

  // ---------- drawing ----------
  function drawCell(x, y, t) {
    const px = x * CELL;
    const py = y * CELL;
    const cx = px + CELL / 2;
    const cy = py + CELL / 2;

    if (t === '#') {
      ctx.fillStyle = '#475569'; ctx.fillRect(px, py, CELL, CELL);
      ctx.fillStyle = '#64748b'; ctx.fillRect(px, py, CELL, 6);
      ctx.fillStyle = '#334155'; ctx.fillRect(px, py + CELL - 6, CELL, 6);
      return;
    }

    ctx.fillStyle = (x + y) % 2 ? '#1e293b' : '#243247';
    ctx.fillRect(px, py, CELL, CELL);

    if (t === 'E') {
      ctx.fillStyle = '#facc15';
      ctx.fillRect(px + 5, py + 5, CELL - 10, CELL - 10);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('★', cx, cy + 1);
    } else if (t === 'D' && !game.doorOpen) {
      ctx.fillStyle = '#92400e'; ctx.fillRect(px + 6, py + 4, CELL - 12, CELL - 8);
      ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.strokeRect(px + 6, py + 4, CELL - 12, CELL - 8);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath(); ctx.arc(cx, cy - 2, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(cx - 1.5, cy, 3, 8);
    } else if (t === 'G') {
      ctx.fillStyle = game.gateOpen ? 'rgba(167,139,250,.45)' : '#7c3aed';
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(px + 5 + i * 9, py + 3, 4, game.gateOpen ? 6 : CELL - 6);
      }
    } else if (t === 'W') {
      ctx.fillStyle = '#475569';
      ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = game.gateOpen ? '#22c55e' : '#ef4444';
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
    } else if (t === 'T') {
      ctx.fillStyle = '#ef4444';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(px + 4 + i * 11, py + CELL - 6);
        ctx.lineTo(px + 9.5 + i * 11, py + 10);
        ctx.lineTo(px + 15 + i * 11, py + CELL - 6);
        ctx.closePath(); ctx.fill();
      }
    } else if (t === 'C') {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b45309'; ctx.lineWidth = 2; ctx.stroke();
    } else if (t === 'K') {
      ctx.strokeStyle = '#fde047'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx - 6, cy - 5, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 2, cy - 1); ctx.lineTo(cx + 10, cy + 11);
      ctx.moveTo(cx + 5, cy + 6); ctx.lineTo(cx + 9, cy + 2); ctx.stroke();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < game.h; y++) {
      for (let x = 0; x < game.w; x++) drawCell(x, y, game.tile(x, y));
    }
    // start marker
    ctx.strokeStyle = 'rgba(34,197,94,.7)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(game.start.x * CELL + CELL / 2, game.start.y * CELL + CELL / 2, 15, 0, Math.PI * 2);
    ctx.stroke();
    // player
    const px = game.x * CELL + CELL / 2;
    const py = game.y * CELL + CELL / 2;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath(); ctx.arc(px, py, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0369a1'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(px - 5, py - 3, 3.2, 0, Math.PI * 2); ctx.arc(px + 5, py - 3, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(px - 5, py - 3, 1.4, 0, Math.PI * 2); ctx.arc(px + 5, py - 3, 1.4, 0, Math.PI * 2); ctx.fill();
  }

  // ---------- HUD and messages ----------
  function hud() {
    $('hearts').textContent = '❤'.repeat(game.hearts) + '♡'.repeat(game.maxHearts - game.hearts);
    $('coins').textContent = 'Coins ' + game.coins + '/' + game.totalCoins;
    $('key').textContent = game.hasKey ? 'Key: yes' : (game.doorOpen ? 'Door: open' : 'Key: no');
    $('moves').textContent = 'Moves ' + game.moves;
  }

  function showMsg(text, ms) {
    $('msg').textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { $('msg').textContent = ''; }, ms || 2600);
  }

  function shake() {
    canvas.classList.remove('shake');
    void canvas.offsetWidth; // restart animation
    canvas.classList.add('shake');
  }

  // ---------- flow ----------
  function showEnd() {
    const won = game.status === 'won';
    const s = game.stars();
    $('endTitle').textContent = won ? 'Level complete!' : 'Out of hearts';
    $('endStars').textContent = won ? '★'.repeat(s) + '☆'.repeat(3 - s) : '';
    $('endText').textContent = won
      ? 'Coins ' + game.coins + '/' + game.totalCoins + ' · Moves ' + game.moves
      : 'The spikes got you. Try a safer route.';
    $('end').classList.remove('hidden');
    playing = false;
  }

  function startGame() {
    game = Logic.createGame();
    playing = true;
    $('menu').classList.add('hidden');
    $('end').classList.add('hidden');
    draw(); hud();
    showMsg('Find the key, unlock the door, reach the exit.', 4500);
  }

  function showMenu() {
    playing = false;
    $('end').classList.add('hidden');
    $('menu').classList.remove('hidden');
  }

  function step(dx, dy) {
    if (!playing) return;
    const r = game.move(dx, dy);
    if (r.msg) showMsg(r.msg);
    if (r.event === 'trap' || r.event === 'dead' || r.event === 'bump') shake();
    draw(); hud();
    if (game.status !== 'play') showEnd();
  }

  // ---------- input ----------
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const KEYS = {
    ArrowUp: DIRS.up, ArrowDown: DIRS.down, ArrowLeft: DIRS.left, ArrowRight: DIRS.right,
    w: DIRS.up, s: DIRS.down, a: DIRS.left, d: DIRS.right
  };

  document.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (KEYS[k] && playing) { e.preventDefault(); step(KEYS[k][0], KEYS[k][1]); }
    else if (k === 'r' && playing) startGame();
    else if (k === 'Escape') showMenu();
  });

  function stopRepeat() { clearTimeout(repeatDelay); clearInterval(repeatTimer); }

  document.querySelectorAll('.pad button').forEach((btn) => {
    const d = DIRS[btn.dataset.dir];
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      step(d[0], d[1]);
      stopRepeat();
      repeatDelay = setTimeout(() => {
        repeatTimer = setInterval(() => step(d[0], d[1]), 130);
      }, 280);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, stopRepeat));
  });

  // tap the board: move one step toward the tapped side of the player
  canvas.addEventListener('pointerdown', (e) => {
    if (!playing) return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const dx = (e.clientX - rect.left) * scale - (game.x * CELL + CELL / 2);
    const dy = (e.clientY - rect.top) * scale - (game.y * CELL + CELL / 2);
    if (Math.abs(dx) > Math.abs(dy)) step(Math.sign(dx), 0);
    else if (dy !== 0) step(0, Math.sign(dy));
  });

  canvas.addEventListener('animationend', () => canvas.classList.remove('shake'));

  $('playBtn').addEventListener('click', startGame);
  $('howBtn').addEventListener('click', () => $('how').classList.toggle('hidden'));
  $('againBtn').addEventListener('click', startGame);
  $('toMenuBtn').addEventListener('click', showMenu);
  $('restart').addEventListener('click', startGame);
  $('menuBtn').addEventListener('click', showMenu);

  draw(); hud();
})();
