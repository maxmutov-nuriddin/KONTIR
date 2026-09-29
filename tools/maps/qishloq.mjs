import { GridMap, finalizeMarkers } from './builder.mjs';

/**
 * QISHLOQ — classic "inferno"-style village layout (T spawn SW, CT spawn NE):
 *   BANANA (long alley north from T, car + sandbags at the top) -> ramp up onto B (fountain, coffins, new box) <- CT road
 *   MID / SECOND MID -> TOP MID -> ARCH (roofed) -> A ; SHORT (mid -> A)
 *   T APARTMENTS (roofed upper floor) -> BALCONY -> stairs down onto A ; PIT (low corner of A) ; LIBRARY (roofed) A <-> CT
 */
export function buildQishloq() {
  const m = new GridMap({ id: 'qishloq', cols: 42, rows: 44, seed: 4242, wallMaterials: ['plaster_ochre', 'plaster_white', 'stone_wall', 'brick', 'plaster_rose'],
    groundMaterial: 'stone_floor', raisedMaterial: 'stone_floor', stairMaterial: 'stone_wall', spawnYaw: { T: 0, CT: Math.PI } });
  m.fill(0, 0, 41, 43, '#');
  const open = (c0, r0, c1, r1, lvl = 0, ch = '.') => { m.fill(c0, r0, c1, r1, ch); m.setLevel(c0, r0, c1, r1, lvl); };

  // T spawn, banana
  open(2, 34, 13, 42);
  open(6, 24, 10, 33);                        // lower banana
  open(4, 14, 9, 24);                         // upper banana
  m.fill(4, 13, 8, 13, '^');                  // ramp up onto B
  // B site (raised) + CT road + CT spawn + library
  open(2, 2, 16, 12, 1);
  open(17, 3, 26, 7, 1);
  open(27, 2, 40, 9, 1);
  open(35, 10, 40, 12, 1, 'R');               // library
  m.fill(36, 13, 38, 13, 'N');                // library stairs down to A
  // arch: CT spawn -> arch (roofed) -> A, also opens west to top mid
  m.fill(28, 10, 29, 10, 'N');
  open(27, 11, 30, 13, 0, 'R');
  open(20, 12, 26, 13);                       // top mid
  // mid, second mid, short
  open(15, 14, 20, 33);
  open(13, 34, 20, 36);
  open(21, 21, 28, 23);                       // short A
  // A site + pit
  open(29, 14, 40, 26);
  open(34, 27, 40, 33);                       // pit
  // T apartments -> balcony -> A
  open(14, 38, 24, 41);
  m.fill(25, 39, 25, 40, 'E');                // stairs up into the apartments
  open(26, 33, 33, 41, 1, 'R');
  open(28, 28, 33, 32, 1);                    // balcony (open air)
  m.fill(30, 27, 31, 27, 'S');                // balcony stairs down onto A (rise toward south)

  // paths before props
  // (stone floor throughout; no asphalt in the village)

  // props & cover
  m.set(5, 15, 'k').set(8, 17, 'H').set(9, 17, 'H').set(9, 27, 'c').set(6, 31, 'b').set(7, 21, 'c');              // banana: car, sandbags
  m.fill(5, 4, 12, 9, 'B');
  m.set(7, 5, 'C').set(12, 4, 'c').set(10, 8, 'w').set(3, 3, 'c').set(15, 2, 'b').set(13, 10, 'H').set(14, 10, 'H').set(4, 10, 'c'); // coffins, fountain, new box
  m.set(20, 5, 'c').set(24, 4, 'T').set(33, 3, 'T');
  m.fill(31, 16, 38, 24, 'A');
  m.set(33, 18, 'C').set(37, 21, 'k').set(31, 23, 'c').set(35, 15, 'H').set(36, 15, 'H').set(39, 25, 'b').set(29, 15, 'T');      // A: truck, boxes
  m.set(38, 31, 'c').set(36, 29, 'b').set(17, 20, 'c').set(19, 28, 'C').set(15, 25, 'b').set(24, 22, 'c');
  m.set(4, 38, 'T').set(12, 36, 'c').set(21, 39, 'c');
  // spawns
  m.fill(3, 38, 11, 41, 't');
  for (let c = 3; c <= 11; c += 2) m.set(c, 39, '.');
  m.fill(29, 3, 38, 6, 'x');
  for (let c = 29; c <= 38; c += 3) m.set(c, 4, '.');

  const out = m.build();
  m.poleLine(-60, 64, 60, 64, 14); m.rubble(220);
  const dressed = m.output(); out.meshes = dressed.meshes; out.materials = dressed.materials;
  out.markers = [...finalizeMarkers(m, out)];
  return { map: m, ...out };
}
