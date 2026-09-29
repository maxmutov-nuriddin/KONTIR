import { GridMap, finalizeMarkers } from './builder.mjs';

/** SAHARA OUTPOST: three-lane desert town. West lane + B site, mid, long east lane + raised A site. */
export function buildSahara() {
  const m = new GridMap({ id: 'sahara', cols: 30, rows: 38, seed: 7, wallMaterials: ['sand_wall', 'sand_wall', 'plaster_white', 'brick'] });
  m.border('#');
  const building = (c0, r0, c1, r1, doors, ch = '#') => {
    m.fill(c0, r0, c1, r1, ch).fill(c0 + 1, r0 + 1, c1 - 1, r1 - 1, 'R');
    for (const [c, r] of doors) m.set(c, r, 'a');
  };
  // --- CT spawn & flanking corridors
  m.fill(10, 1, 10, 10, '#').fill(19, 1, 19, 10, '#');
  m.fill(10, 4, 10, 5, 'a').fill(19, 4, 19, 5, 'a');
  m.fill(17, 9, 18, 14, '#');
  m.fill(11, 1, 18, 8, ',');
  // --- B site (west) with raised back platform
  m.fill(1, 11, 10, 12, '#').fill(3, 11, 5, 12, 'a');
  m.fill(1, 1, 4, 4, 'P').fill(5, 2, 5, 3, '<').fill(1, 5, 3, 5, 'P');
  m.fill(4, 6, 8, 9, 'B');
  m.set(8, 3, 'C').set(7, 10, 'c').set(2, 8, 'b').set(9, 6, 'c').set(6, 9, 'H').set(7, 9, 'H');
  // --- A site (east) with raised back platform and ramp from mid
  m.fill(19, 11, 28, 12, '#').fill(24, 11, 26, 12, 'a');
  m.fill(24, 1, 28, 4, 'P').fill(23, 2, 23, 3, '>').fill(26, 5, 28, 5, 'P');
  m.fill(21, 6, 25, 9, 'A');
  m.set(21, 3, 'C').set(27, 9, 'c').set(21, 10, 'c').set(23, 8, 'H').set(24, 8, 'H').set(27, 7, 'b');
  // --- west lane: covered tunnels then open approach
  m.fill(1, 16, 5, 22, 'R');
  for (const r of [16, 19, 22]) m.set(1, r, 'p').set(5, r, 'p');
  m.set(3, 14, 'c').set(2, 25, 'C').set(4, 28, 'c').set(1, 30, 'b').set(4, 32, 'H').set(5, 32, 'H');
  // --- buildings between lanes (hollow, walkable interiors with doors)
  building(6, 15, 10, 27, [[6, 20], [6, 21], [10, 24], [10, 25], [8, 15]]);
  building(17, 17, 21, 29, [[21, 22], [21, 23], [17, 26], [17, 27], [19, 29]]);
  // --- mid lane cover
  m.set(13, 12, 'C').set(15, 18, 'c').set(12, 24, 'c').set(14, 30, 'C').set(16, 33, 'H').set(12, 33, 'H');
  // --- long east lane: pillars, crates, half walls
  m.set(24, 16, 'p').set(24, 21, 'p').set(27, 18, 'C').set(23, 26, 'c').set(26, 29, 'H').set(27, 29, 'H').set(25, 32, 'b').set(22, 14, 'c');
  // --- T yard: houses at both sides, road, spawns
  m.fill(1, 33, 3, 36, '2').fill(26, 33, 28, 36, '2');
  m.fill(4, 33, 25, 36, ',');
  m.fill(9, 34, 18, 36, 't');
  m.fill(11, 2, 17, 4, 'x');
  m.set(8, 32, 'c').set(21, 32, 'c');
  for (const [c, r] of [[2, 31], [27, 31], [8, 30], [21, 30], [4, 26], [1, 24], [9, 2], [22, 2], [12, 13], [27, 22], [3, 8], [26, 8]]) m.set(c, r, 'T');
  const out = m.build();
  m.poleLine(-42, 38, 42, 38, 12); m.poleLine(14, -20, 14, 30, 11); m.rubble(140);
  const dressed = m.output(); out.meshes = dressed.meshes; out.materials = dressed.materials;
  out.markers = [...finalizeMarkers(m, out)];
  return { map: m, ...out };
}
