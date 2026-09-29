import { GridMap, finalizeMarkers } from './builder.mjs';

/**
 * CHANGTEPA — a classic "dust"-style bomb-defusal layout (north is up, T spawn south, CT spawn north):
 *   A site (NE, raised)  <- A ramp <- LONG A (east lane, long doors, outside long)
 *                        <- CATWALK / short (stairs up from mid)
 *   MID (centre lane, xbox crate, mid doors -> CT mid) ; CT mid -> B doors -> B site
 *   B site (NW, back platform, car) <- tunnel exit <- LOWER TUNNELS (roofed, link to mid) <- stairs <- UPPER TUNNELS <- T spawn
 * Elevation: level 1 (1.2 m) for T spawn, top mid, outside long, upper tunnels, catwalk, CT spawn, A site, B platform.
 */
export function buildChangtepa() {
  const m = new GridMap({ id: 'changtepa', cols: 40, rows: 46, seed: 1234, wallMaterials: ['sand_wall', 'sand_wall', 'stone_wall', 'plaster_white'],
    groundMaterial: 'sand_ground', raisedMaterial: 'sand_raised', stairMaterial: 'stone_base' });
  m.fill(0, 0, 39, 45, '#');
  const open = (c0, r0, c1, r1, lvl = 0, ch = '.') => { m.fill(c0, r0, c1, r1, ch); m.setLevel(c0, r0, c1, r1, lvl); };

  // ------------------------------------------------------------------ north: B site, CT mid, CT spawn, short, A site
  open(1, 1, 12, 13);                       // B site bowl
  open(1, 1, 4, 4, 1);                      // B back platform (raised)
  m.fill(5, 2, 5, 3, 'W');                  // stairs up to the platform (rise toward west)
  open(14, 1, 17, 12);                      // CT mid / B approach
  open(18, 9, 21, 12);                      // CT mid, below CT spawn
  open(18, 1, 27, 7, 1);                    // CT spawn (raised)
  m.fill(19, 8, 21, 8, 'N'); m.setLevel(19, 8, 21, 8, 0); // stairs CT mid -> CT spawn
  open(23, 8, 27, 18, 1);                   // short A / catwalk
  open(28, 1, 38, 12, 1);                   // A site plateau
  // B doors (arched gaps in the wall between B and CT mid) and B window
  m.fill(13, 8, 13, 10, 'a'); m.setLevel(13, 8, 13, 10, 0);
  m.fill(13, 4, 13, 5, 'H');
  // tunnel exit into B
  m.fill(4, 14, 6, 14, 'a');

  // ------------------------------------------------------------------ mid
  open(16, 14, 21, 32);                     // mid lane
  m.fill(17, 13, 20, 13, 'a');              // mid doors (arched double door)
  m.fill(22, 16, 22, 17, 'E');              // stairs mid -> catwalk (rise toward east)
  open(16, 34, 21, 37, 1);                  // top mid (raised, T side)
  m.fill(16, 33, 21, 33, 'v');              // ramp mid -> top mid (rises toward south)

  // ------------------------------------------------------------------ tunnels (west)
  open(3, 15, 7, 24, 0, 'R');               // lower tunnels (roofed)
  open(3, 15, 7, 15);                       // open light-well just inside the exit
  open(8, 21, 15, 23, 0, 'R');              // lower tunnels <-> mid connector
  m.fill(3, 25, 7, 25, 'S');                // stairs down from upper tunnels (rise toward south)
  open(3, 26, 7, 37, 1, 'R');               // upper tunnels (roofed)
  open(3, 26, 7, 27, 1);                    // skylight
  open(3, 38, 10, 41, 1);                   // tunnel mouth -> T spawn

  // ------------------------------------------------------------------ long A (east)
  open(30, 14, 38, 32);                     // long corridor
  m.fill(31, 13, 35, 13, '^');              // A ramp (rises north onto the A plateau)
  m.fill(32, 33, 34, 33, 'a');              // long doors
  m.fill(32, 34, 34, 34, 'v');              // ramp from outside long down to the doors
  open(29, 35, 38, 41, 1);                  // outside long (raised)

  // ------------------------------------------------------------------ T spawn
  open(11, 38, 28, 44, 1);

  // paths (painted before props so props sit on top)
  m.fill(16, 34, 21, 37, ','); m.fill(11, 44, 28, 44, ','); m.fill(29, 38, 38, 39, ',');

  // ------------------------------------------------------------------ cover, props, sites
  // A site: default box stack, goose boxes, car, low walls toward CT
  m.fill(30, 3, 35, 8, 'A');
  m.set(31, 5, 'C').set(34, 8, 'c').set(37, 2, 'c').set(38, 3, 'c').set(29, 10, 'H').set(30, 10, 'H').set(36, 10, 'k').set(33, 11, 'b');
  m.set(28, 4, 'H').set(28, 5, 'H');
  // B site: car, boxes, barrels
  m.fill(5, 5, 10, 10, 'B');
  m.set(9, 3, 'k').set(7, 7, 'C').set(4, 9, 'c').set(10, 11, 'c').set(2, 11, 'b').set(11, 6, 'c').set(1, 7, 'c');
  // CT side
  m.set(15, 3, 'c').set(16, 11, 'b').set(24, 3, 'T').set(20, 11, 'c');
  // catwalk: boxes at the top of short
  m.set(24, 11, 'c').set(26, 14, 'H').set(27, 14, 'H');
  // mid: xbox, well, crates
  m.set(18, 24, 'C').set(20, 15, 'c').set(17, 29, 'w').set(21, 20, 'b').set(16, 27, 'c');
  // lower tunnels
  m.set(5, 18, 'c').set(12, 22, 'c');
  // long: corner box, blue container stack, barrels, low wall
  m.fill(30, 20, 31, 32, '#');             // buildings narrow the south half of long -> 'long corner'
  m.set(37, 16, 'c').set(33, 26, 'C').set(37, 30, 'b').set(34, 20, 'H').set(35, 20, 'H').set(38, 24, 'c').set(30, 18, 'c');
  // outside long / T spawn
  m.set(36, 37, 'k').set(30, 40, 'c').set(12, 39, 'T').set(27, 39, 'T').set(38, 41, 'T').set(9, 40, 'c');
  m.fill(14, 40, 25, 43, 't');
  for (let c = 14; c <= 25; c++) if (c % 3 === 0) m.set(c, 40, '.');
  // CT spawn points
  m.fill(19, 2, 26, 5, 'x');
  m.set(23, 3, 'T');

  const out = m.build();
  m.poleLine(-50, 60, 50, 60, 14); m.poleLine(-6, -30, -6, 20, 12); m.rubble(220);
  const dressed = m.output(); out.meshes = dressed.meshes; out.materials = dressed.materials;
  out.markers = [...finalizeMarkers(m, out)];
  return { map: m, ...out };
}
