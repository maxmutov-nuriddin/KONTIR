import { GridMap, finalizeMarkers } from './builder.mjs';

/**
 * OMBOR — "cache"-style industrial yard (T spawn south, CT spawn north):
 *   A MAIN (east lane) -> A site (quad stack, truck containers) <- A-CT (forklift)
 *   MID (white box, long sightline) -> HIGHWAY (roofed) -> A ; Z-CONNECTOR / VENTS (roofed) -> B
 *   B MAIN (west lane) -> B site (HEAVEN raised platform, SUN ROOM roofed) <- CHECKERS (roofed) <- CT
 */
export function buildOmbor() {
  const m = new GridMap({ id: 'ombor', cols: 42, rows: 44, seed: 9090, containers: true, wallMaterials: ['concrete', 'metal_wall', 'concrete', 'brick', 'plaster_blue'],
    groundMaterial: 'asphalt', raisedMaterial: 'concrete', stairMaterial: 'concrete', spawnYaw: { T: 0, CT: Math.PI } });
  m.fill(0, 0, 41, 43, '#');
  const open = (c0, r0, c1, r1, lvl = 0, ch = '.') => { m.fill(c0, r0, c1, r1, ch); m.setLevel(c0, r0, c1, r1, lvl); };

  open(11, 36, 30, 42);                       // T spawn
  open(32, 18, 40, 35);                       // A main
  open(31, 36, 40, 38);                       // T -> A main
  open(33, 17, 39, 17);                       // A main opens onto the site
  open(28, 3, 40, 16);                        // A site
  open(18, 2, 27, 6);                         // A-CT
  open(15, 1, 27, 1); open(15, 2, 17, 8);     // CT spawn
  open(18, 12, 23, 35);                       // mid
  open(24, 16, 31, 18, 0, 'R');               // highway (roofed)
  open(10, 16, 17, 18, 0, 'R');               // z-connector / vents
  open(3, 20, 9, 35);                         // B main
  open(3, 36, 10, 38);                        // T -> B main
  open(2, 3, 14, 14);                         // B site
  open(2, 3, 5, 6, 1);                        // heaven (raised)
  m.fill(6, 4, 6, 5, 'W');                    // heaven stairs
  open(10, 11, 14, 14, 0, 'R');               // sun room
  open(10, 7, 17, 9, 0, 'R');                 // checkers (CT <-> B)
  open(18, 7, 23, 11);                        // CT mid (links CT, checkers, mid)
  m.fill(4, 15, 8, 19, '.');                  // B main mouth

  m.fill(18, 13, 23, 34, ','); m.fill(33, 18, 39, 35, ',');

  // A: quad stack, truck, containers
  m.fill(30, 6, 38, 13, 'A');
  m.set(33, 10, 'C').set(29, 4, 'K').set(30, 4, 'K').set(37, 14, 'L').set(38, 14, 'L').set(35, 5, 'c').set(31, 12, 'b').set(39, 8, 'k');
  m.set(22, 4, 'b').set(25, 3, 'c');                                  // forklift corner
  // A main containers / cover
  m.set(33, 22, 'K').set(34, 22, 'K').set(38, 27, 'K').set(39, 27, 'K').set(35, 31, 'c').set(40, 20, 'b');
  // mid: white box, garage cover
  m.set(20, 24, 'c').set(22, 30, 'C').set(19, 14, 'b').set(21, 19, 'H').set(22, 19, 'H');
  // B: containers, boxes, checkers crates
  m.fill(6, 8, 12, 12, 'B');
  m.set(8, 10, 'C').set(11, 5, 'K').set(12, 5, 'K').set(3, 12, 'c').set(13, 8, 'b').set(9, 13, 'H');
  m.set(5, 26, 'K').set(6, 26, 'K').set(8, 31, 'c').set(4, 33, 'b').set(14, 8, 'c');
  // T spawn props
  m.set(13, 38, 'K').set(14, 38, 'K').set(27, 39, 'L').set(28, 39, 'L').set(20, 37, 'c');
  // spawns
  m.fill(15, 40, 26, 41, 't');
  for (let c = 15; c <= 26; c += 3) m.set(c, 40, '.');
  m.fill(19, 2, 26, 3, 'x'); m.fill(15, 2, 17, 6, 'x');

  const out = m.build();
  m.poleLine(-60, 62, 60, 62, 13); m.poleLine(64, -60, 64, 50, 13); m.rubble(180);
  const dressed = m.output(); out.meshes = dressed.meshes; out.materials = dressed.materials;
  out.markers = [...finalizeMarkers(m, out)];
  return { map: m, ...out };
}
