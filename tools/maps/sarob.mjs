import { GridMap, finalizeMarkers } from './builder.mjs';

/**
 * SAROB ("mirage") — a classic market-town bomb-defusal layout, T spawn east, CT spawn west:
 *   A site (south): reached from T via PALACE (roofed, upper floor) or A RAMP / tetris; CT side has JUNGLE + CONNECTOR, stairs, CT ramp.
 *   MID (east-west street): top mid (T), SNIPER WINDOW (raised room, CT side), SHORT/catwalk north to B, CONNECTOR south to A.
 *   B site (north-west): B APARTMENTS (roofed upper corridor from T spawn), short, MARKET (roofed) to CT spawn.
 */
export function buildSarob() {
  const m = new GridMap({ id: 'sarob', cols: 44, rows: 40, seed: 777, wallMaterials: ['plaster_ochre', 'stone_wall', 'plaster_white', 'plaster_rose', 'sand_wall'],
    groundMaterial: 'stone_floor', raisedMaterial: 'stone_floor', stairMaterial: 'stone_wall', spawnYaw: { T: Math.PI / 2, CT: -Math.PI / 2 } });
  m.fill(0, 0, 43, 39, '#');
  const open = (c0, r0, c1, r1, lvl = 0, ch = '.') => { m.fill(c0, r0, c1, r1, ch); m.setLevel(c0, r0, c1, r1, lvl); };

  // ------------------------------------------------------------------ T spawn (east, raised) and its exits
  open(37, 6, 42, 30, 1);                    // T spawn yard
  open(34, 2, 36, 7, 1);                     // alley to B apartments
  open(28, 16, 36, 19, 1);                   // top mid
  open(29, 21, 36, 27, 1);                   // T ramp / tetris
  open(36, 27, 36, 30, 1);                   // T -> palace yard
  // ------------------------------------------------------------------ mid
  open(13, 16, 27, 19);                      // mid street
  m.fill(27, 16, 27, 19, '>');               // ramp mid -> top mid (rises east)
  open(9, 16, 11, 19, 1);                    // sniper window room (raised)
  m.fill(12, 15, 12, 20, '#'); m.fill(12, 17, 12, 18, 'H'); m.setLevel(12, 17, 12, 18, 1); // the window
  // ------------------------------------------------------------------ short (catwalk) to B
  m.fill(16, 15, 17, 15, 'N');               // stairs mid -> short
  open(16, 7, 17, 14, 1);                    // short
  open(14, 7, 15, 8, 1);                     // short balcony
  m.fill(13, 7, 13, 8, 'E');                 // stairs balcony -> B (rise toward east)
  // ------------------------------------------------------------------ B site + apartments + market
  open(2, 1, 12, 9);                         // B site
  open(14, 2, 19, 5, 1);                     // apartments balcony (exit)
  m.fill(13, 2, 13, 3, 'E');                 // apartments stairs down into B
  open(20, 2, 33, 5, 1, 'R');                // B apartments (roofed upper corridor)
  open(26, 2, 27, 5, 1);                     // courtyard light-well in the apartments
  open(3, 10, 7, 15, 0, 'R');                // market (roofed) B <-> CT
  open(3, 10, 7, 10);                        // market doorway yard
  // ------------------------------------------------------------------ CT spawn (west) and CT links
  open(2, 16, 7, 34);                        // CT spawn / CT lane
  open(2, 20, 11, 21);                       // CT -> window stairs / mid side
  open(8, 22, 13, 34);                       // CT to A ("CT" / ticket booth)
  m.fill(9, 20, 10, 20, 'N');                // stairs from CT up into the window room
  m.fill(10, 23, 12, 27, '#');               // CT house between CT and jungle (ticket side)
  m.fill(13, 33, 14, 34, '2');               // low wall at CT entrance to A
  // ------------------------------------------------------------------ connector, jungle, A site, palace
  open(19, 20, 21, 26, 0, 'R');              // connector (roofed) mid -> jungle
  open(14, 22, 18, 26);                      // jungle
  open(14, 27, 28, 37);                      // A site
  m.fill(28, 22, 28, 27, '>');               // A ramp: tetris (raised) down to the site (rises east)
  open(30, 30, 35, 34, 1, 'R');              // palace (roofed upper rooms)
  open(30, 30, 31, 31, 1);                   // palace courtyard
  open(36, 31, 36, 34, 1);                   // palace entrance from T
  m.fill(29, 32, 29, 33, 'E');               // palace stairs down onto A (rise toward east)

  // ------------------------------------------------------------------ paths (painted before props)
  m.fill(13, 17, 26, 18, ','); m.fill(37, 16, 42, 18, ',');

  // ------------------------------------------------------------------ sites, cover and props
  m.fill(18, 29, 25, 35, 'A');
  m.set(20, 31, 'C')                          // firebox
    .set(23, 33, 'c').set(24, 33, 'c').set(23, 34, 'c')                 // triple
    .set(17, 28, 'H').set(18, 28, 'H')                                  // sandwich
    .set(26, 29, 'c').set(27, 36, 'b').set(15, 35, 'c').set(21, 36, 'k') // ticket-side car
    .set(14, 30, 'H').set(14, 31, 'H');                                  // stairs cover toward CT
  m.set(31, 24, 'C').set(33, 22, 'c').set(34, 26, 'c').set(30, 26, 'c'); // tetris
  m.fill(4, 3, 9, 7, 'B');
  m.set(3, 8, 'k').set(3, 2, 'c').set(10, 3, 'C').set(8, 8, 'b').set(11, 7, 'H').set(11, 8, 'H').set(2, 7, 'c'); // van, bench, boxes
  m.set(22, 17, 'w').set(15, 19, 'c').set(25, 16, 'c').set(32, 18, 'C').set(30, 16, 'b');                     // mid: fountain, boxes
  m.set(4, 18, 'T').set(9, 23, 'c').set(11, 30, 'H').set(5, 33, 'b').set(15, 24, 'T').set(17, 23, 'c');
  m.set(38, 8, 'k').set(41, 25, 'T').set(38, 28, 'c').set(40, 12, 'c').set(35, 3, 'c').set(21, 3, 'c');
  // spawns
  m.fill(39, 13, 41, 23, 't');
  for (let r = 13; r <= 23; r += 2) m.set(40, r, '.');
  m.fill(3, 24, 6, 31, 'x');
  for (let r = 24; r <= 31; r += 2) m.set(5, r, '.');

  const out = m.build();
  m.poleLine(-70, 66, 70, 66, 14); m.poleLine(30, -56, 30, -10, 12); m.rubble(200);
  const dressed = m.output(); out.meshes = dressed.meshes; out.materials = dressed.materials;
  out.markers = [...finalizeMarkers(m, out)];
  return { map: m, ...out };
}
