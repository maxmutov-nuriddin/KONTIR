import { GridMap, finalizeMarkers } from './builder.mjs';

/** IRON HARBOR: container terminal. Warehouse centre, stacked-container mazes, raised crane-yard site. */
export function buildHarbor() {
  const m = new GridMap({ id: 'harbor', cols: 30, rows: 38, seed: 21, wallMaterials: ['concrete', 'plaster_blue', 'concrete', 'metal_wall'] });
  m.border('#');
  const building = (c0, r0, c1, r1, doors) => {
    m.fill(c0, r0, c1, r1, '#').fill(c0 + 1, r0 + 1, c1 - 1, r1 - 1, 'R');
    for (const [c, r] of doors) m.set(c, r, 'a');
  };
  // CT gatehouse north-centre
  m.fill(11, 1, 18, 7, ',');
  m.fill(9, 1, 10, 9, '#').fill(19, 1, 20, 9, '#');
  m.fill(9, 5, 10, 6, 'a').fill(19, 5, 20, 6, 'a');
  // B site (north-west): sunken-looking dock yard with container walls
  m.fill(1, 1, 8, 10, '.').fill(3, 4, 7, 8, 'B');
  m.set(1, 3, 'K').set(2, 3, 'K').set(1, 4, 'L').set(2, 4, 'L');
  m.set(6, 1, 'K').set(7, 1, 'K').set(5, 10, 'K').set(6, 10, 'K');
  m.set(8, 7, 'C').set(3, 9, 'c').set(4, 2, 'b').set(8, 3, 'c');
  m.fill(1, 11, 9, 12, '#').fill(3, 11, 4, 12, 'a').fill(7, 11, 8, 12, 'a');
  // A site (north-east): raised crane yard on a platform, ramp entries
  m.fill(21, 1, 28, 10, '.').fill(23, 4, 27, 8, 'A');
  m.fill(24, 1, 28, 2, 'P').fill(23, 1, 23, 1, '>').set(28, 3, '^');
  m.set(22, 9, 'K').set(23, 9, 'K').set(26, 10, 'K').set(27, 10, 'K').set(22, 3, 'C').set(27, 6, 'c').set(21, 6, 'b');
  m.fill(20, 11, 28, 12, '#').fill(21, 11, 22, 12, 'a').fill(26, 11, 27, 12, 'a');
  // central warehouse
  building(9, 15, 20, 26, [[9, 19], [9, 20], [20, 21], [20, 22], [14, 15], [15, 15], [14, 26], [15, 26]]);
  m.set(11, 18, 'c').set(17, 23, 'c').set(12, 22, 'C').set(18, 17, 'c');
  // west / east container mazes
  const pairs = [[1, 14], [3, 14], [1, 17], [3, 17], [5, 19], [1, 21], [3, 22], [5, 24], [1, 25], [3, 26], [6, 28], [1, 29], [3, 30]];
  for (const [c, r] of pairs) m.set(c, r, 'K').set(c + 1, r, 'K');
  m.set(1, 19, 'L').set(2, 19, 'L');
  const east = [[22, 14], [25, 14], [23, 17], [26, 18], [22, 20], [25, 22], [23, 24], [26, 25], [22, 27], [25, 29], [23, 31]];
  for (const [c, r] of east) m.set(c, r, 'K').set(c + 1, r, 'K');
  m.set(25, 18, 'L').set(26, 18, 'L');
  // mid approach & south quay
  m.set(12, 12, 'C').set(16, 13, 'c').set(13, 29, 'H').set(14, 29, 'H').set(16, 29, 'H').set(15, 30, 'c');
  m.fill(1, 33, 5, 36, '2').fill(24, 33, 28, 36, '2');
  m.fill(6, 33, 23, 36, ',');
  m.fill(9, 34, 18, 36, 't');
  m.fill(11, 2, 17, 4, 'x');
  for (const [c, r] of [[6, 31], [24, 31], [12, 12], [17, 13], [2, 8]]) m.set(c, r, 'T');
  const out = m.build();
  m.poleLine(-44, 44, 44, 44, 13); m.poleLine(-14, -14, 14, -14, 14); m.rubble(160);
  const dressed = m.output(); out.meshes = dressed.meshes; out.materials = dressed.materials;
  out.markers = [...finalizeMarkers(m, out)];
  return { map: m, ...out };
}
