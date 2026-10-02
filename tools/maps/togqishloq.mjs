import { GridMap, finalizeMarkers } from './builder.mjs';

/**
 * TOG'QISHLOQ — terraced mountain village. T spawn at the foot (south), CT spawn on the top terrace (north).
 *   MID: a stepped street climbing two terraces. B (west, terrace 1) up the west lane; A (east, terrace 2) up the
 *   east ramp lane. Two flat-roofed houses (level 3, 3.6 m) are reached by stair runs and overlook mid and the lanes.
 */
export function buildTogqishloq() {
  const m = new GridMap({ id: 'togqishloq', cols: 36, rows: 36, seed: 4242, wallMaterials: ['stone_wall', 'plaster_white', 'stone_wall', 'plaster_ochre'],
    groundMaterial: 'stone_floor', raisedMaterial: 'stone_wall', stairMaterial: 'stone_base', spawnYaw: { T: 0, CT: Math.PI } });
  m.fill(0, 0, 35, 35, '#');
  const open = (c0, r0, c1, r1, lvl = 0, ch = '.') => { m.fill(c0, r0, c1, r1, ch); m.setLevel(c0, r0, c1, r1, lvl); };
  // spawns
  open(12, 30, 23, 34, 0);                           // T spawn (valley floor)
  open(12, 1, 23, 5, 2);                             // CT spawn (top terrace)
  // MID: stepped street
  open(16, 18, 19, 29, 0); m.fill(16, 17, 19, 17, 'N');
  open(16, 13, 19, 16, 1); m.fill(16, 12, 19, 12, 'N'); m.setLevel(16, 12, 19, 12, 1);
  open(16, 6, 19, 11, 2);
  // EAST lane -> A (terrace 2)
  open(24, 30, 33, 31, 0); open(28, 22, 33, 29, 0); m.fill(28, 21, 33, 21, '^');
  open(28, 16, 33, 20, 1); m.fill(28, 15, 33, 15, '^'); m.setLevel(28, 15, 33, 15, 1);
  open(26, 6, 34, 14, 2); open(24, 2, 27, 5, 2);     // A site + CT -> A
  // WEST lane -> B (terrace 1)
  open(2, 30, 11, 31, 0); open(2, 18, 7, 29, 0); m.fill(2, 17, 7, 17, 'N');
  open(2, 15, 7, 16, 1); open(1, 7, 9, 14, 1);       // B site
  open(6, 3, 11, 5, 2); m.fill(6, 6, 9, 6, 'N'); m.setLevel(6, 6, 9, 6, 1);   // CT -> B stairs down
  // connectors: lower mid <-> west lane, upper mid <-> A (short A)
  open(8, 20, 15, 20, 0); open(20, 9, 25, 9, 2);
  // ROOFTOP 1 (between mid and the east lane): stair run up from lower mid, roof overlooks mid and the A lane
  m.set(20, 28, 'N').setLevel(20, 28, 20, 28, 0); m.set(20, 27, 'N').setLevel(20, 27, 20, 27, 1); m.set(20, 26, 'N').setLevel(20, 26, 20, 26, 2);
  open(20, 22, 27, 25, 3);
  // ROOFTOP 2 (between the west lane and mid): stair run from the west lane
  m.set(8, 27, 'N').setLevel(8, 27, 8, 27, 0); m.set(8, 26, 'N').setLevel(8, 26, 8, 26, 1); m.set(8, 25, 'N').setLevel(8, 25, 8, 25, 2);
  open(8, 21, 15, 24, 3);
  // sites, cover, props
  m.fill(28, 8, 33, 12, 'A'); m.fill(2, 9, 8, 13, 'B');
  m.set(30, 10, 'C').set(27, 13, 'c').set(33, 7, 'b').set(29, 13, 'H').set(30, 13, 'H');
  m.set(4, 11, 'C').set(7, 8, 'c').set(2, 14, 'b').set(8, 13, 'H').set(9, 13, 'H');
  m.set(17, 24, 'c').set(18, 27, 'C').set(18, 15, 'c').set(17, 8, 'w').set(30, 26, 'c').set(31, 18, 'C').set(4, 24, 'c').set(5, 19, 'b');
  m.set(13, 32, 'k').set(22, 31, 'c').set(26, 30, 'T').set(9, 30, 'T').set(25, 3, 'T').set(13, 3, 'c');
  m.fill(14, 32, 21, 34, 't'); for (let c = 14; c <= 21; c += 2) m.set(c, 33, '.');
  m.fill(14, 2, 21, 3, 'x'); for (let c = 15; c <= 21; c += 2) m.set(c, 2, '.');
  const out = m.build();
  m.poleLine(-60, 54, 60, 54, 14); m.rubble(160);
  const dressed = m.output(); out.meshes = dressed.meshes; out.materials = dressed.materials;
  out.markers = [...finalizeMarkers(m, out)];
  return { map: m, ...out };
}
