# MazeQuest Mini: Product Requirements Document

**Version:** 1.0 (first release) · **Owner:** Rodrigo · **Date:** 2026-11-05

## 1. Overview
MazeQuest Mini is a small top-down puzzle adventure that runs in any browser, on phone or desktop, with no install. The first release ships one hand-designed maze level, one controllable character, three puzzle types and a simple clickable UI.

## 2. Goals and non-goals
**Goals**
- A complete, playable first level that takes roughly 1 to 3 minutes.
- Clear puzzle loop: find key, open door, press switch, open gate, reach exit.
- Works with keyboard, touch D-pad and tapping the board.
- Zero dependencies, so it can be opened from a file or hosted on GitHub Pages.

**Non-goals (first release)**
- Multiple levels, level editor, saving progress, sound, accounts, leaderboards.

## 3. Target player
Casual players, including students and people on their phone, who want a quick puzzle session. No gaming experience assumed, so the UI explains itself in a short "How to play" panel.

## 4. User stories
1. As a player, I can start the game from a menu so I know when the level begins.
2. As a player, I can move my character up, down, left and right so I can explore the maze.
3. As a player, I get blocked by walls so the maze feels solid.
4. As a player, I can pick up a key and open a locked door so progress feels earned.
5. As a player, I can step on a switch to open a gate so puzzles connect to each other.
6. As a player, I lose a heart on spikes but respawn at a checkpoint so mistakes are punished but not brutal.
7. As a player, I can collect optional coins so exploring is rewarded.
8. As a player, I see a win screen with stars so I know how well I did, and I can replay.

## 5. Functional requirements
| ID | Requirement |
|----|-------------|
| FR-1 | One maze level with a clear start (green ring) and exit (gold star). |
| FR-2 | At least 3 puzzles or obstacles. Shipped: locked door + key, switch + gate, spike traps. |
| FR-3 | Collectibles: 5 coins placed off the main path to encourage exploring. |
| FR-4 | One character, 4-direction grid movement via arrow keys, WASD, on-screen D-pad, or tapping the board. |
| FR-5 | Collision: walls, closed door and closed gate block movement. |
| FR-6 | Interactive objects respond to movement: key pickup, door unlock, switch toggle, coin pickup, trap damage. |
| FR-7 | Hearts: 3 total. A trap costs 1 and respawns the player at the last checkpoint. 0 hearts ends the run. |
| FR-8 | Checkpoint: level start, then the door tile once the door is unlocked. |
| FR-9 | HUD shows hearts, coins collected, key/door status and move count. |
| FR-10 | Short hint messages for key events (locked door, gate shut, switch pressed, trap hit). |
| FR-11 | Clickable UI: start menu (Play, How to play), Restart and Menu buttons, end screen (Play again, Menu). |
| FR-12 | Score: 1 star for finishing, +1 for all coins, +1 for no trap hits. |

## 6. Level design (v1)
Grid 15 x 11, a nested-ring maze. The outer ring holds the start and key, the middle ring holds the switch, and the centre holds the exit.

| Symbol | Meaning |
|--------|---------|
| `#` | Wall |
| `S` / `E` | Start / exit |
| `K` / `D` | Key / locked door (door sits between outer and middle ring) |
| `W` / `G` | Switch / gate (gate sits between middle ring and centre) |
| `T` | Spike trap (3 placed; each has a trap-free detour) |
| `C` | Coin (5 total) |

**Intended solution:** take the key on the top corridor, loop around the right side to the bottom corridor (avoiding spikes on the left), unlock the door, go around the middle ring to the switch, return to the gate, enter the centre, reach the star. This route is verified by an automated test (`node test.js`): 60 moves, 5/5 coins, 0 damage.

## 7. UX flow and UI
Menu -> Play -> Level -> (Win or Out of hearts) -> Play again / Menu.
Mockups: [`mockups/ui-mockups.svg`](mockups/ui-mockups.svg) (start menu, level screen, win screen). Screenshots of the real build are in [`screenshots/`](screenshots/).

## 8. Non-functional requirements
- **Platform:** modern mobile and desktop browsers, no build step.
- **Performance:** instant load (under 30 KB of code), redraw only on input.
- **Mobile:** layout scales to the screen width, 56 px+ touch targets, no accidental zoom.
- **Accessibility:** high-contrast colours, buttons are real `<button>` elements, messages use `aria-live`. Colour is never the only signal: objects also differ by shape.

## 9. Technical approach
| File | Purpose |
|------|---------|
| `logic.js` | Pure game rules (map, movement, puzzles, score). No DOM, so it is unit-testable. |
| `main.js` | Canvas rendering, HUD, input, screens. |
| `index.html`, `style.css` | Layout and theme. |
| `test.js` | Node tests for the rules and a full solution run. |

## 10. Acceptance criteria
- [x] Level has a start, an exit and at least 3 puzzles or obstacles.
- [x] Coins are placed away from the shortest path.
- [x] Character moves in 4 directions and collides with walls.
- [x] Door, switch, gate, coins and traps behave as specified (covered by tests).
- [x] Start menu, HUD and end screen are clickable and work on touch.
- [x] The level can be completed (automated solution test, plus a headless-browser playthrough).

## 11. Risks
| Risk | Mitigation |
|------|-----------|
| Level too easy or too short | Optional coins and star rating add replay value. v2 adds levels. |
| Touch controls feel slow | Hold-to-repeat on the D-pad, tap-to-move on the board. |
| Soft-lock (cannot finish) | Every puzzle has a path; test proves a full solve. Restart is always available. |

## 12. Future releases
Multiple levels, push-blocks, moving enemies, sound, level timer, best-score saving, level editor.
