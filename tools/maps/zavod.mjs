import { GridMap, finalizeMarkers } from './builder.mjs';

/**
 * ZAVOD — abandoned factory. T spawn west, CT spawn east. The open-roof HALL in the middle has raised steel catwalks
 * (level 2, 2.4 m) along its north and south walls, each reached by a two-flight stair. A (north yard) and B (south
 * yard) sit behind the hall doors. Each side has an office block whose flat roof (level 3) is reached by stairs and
 * drops onto the hall catwalk.
 */
export function buildZavod() {
  const m = new GridMap({ id: 'zavod', cols: 40, rows: 30, seed: 9090, containers: true, wallMaterials: ['brick', 'metal_wall', 'concrete', 'brick'],
    groundMaterial: 'asphalt', raisedMaterial: 'concrete', stairMaterial: 'metal', spawnYaw: { T: -Math.PI / 2, CT: Math.PI / 2 } });
  m.fill(0, 0, 39, 29, '#');
  const open = (c0, r0, c1, r1, lvl = 0, ch = '.') => { m.fill(c0, r0, c1, r1, ch); m.setLevel(c0, r0, c1, r1, lvl); };
  open(1, 10, 5, 19); open(34, 10, 38, 19);           // spawns
  // HALL with catwalks
  open(12, 10, 27, 19);
  open(12, 9, 27, 9, 2); open(12, 20, 27, 20, 2);     // north / south catwalks
  m.set(14, 11, 'N').setLevel(14, 11, 14, 11, 0); m.set(14, 10, 'N').setLevel(14, 10, 14, 10, 1);
  m.set(25, 18, 'S').setLevel(25, 18, 25, 18, 0); m.set(25, 19, 'S').setLevel(25, 19, 25, 19, 1);
  for (const [c, r] of [[17, 12], [22, 12], [17, 17], [22, 17]]) m.set(c, r, 'p');
  m.set(19, 14, 'K').set(20, 15, 'c').set(15, 15, 'C').set(24, 13, 'c').set(13, 17, 'b').set(26, 11, 'b');
  // doors from the hall to the yards
  open(18, 7, 21, 8); open(18, 21, 21, 22);
  // A (north yard) and B (south yard)
  open(12, 1, 27, 6); open(12, 23, 27, 28);
  // T lanes (west) and CT lanes (east)
  open(6, 2, 11, 8); open(6, 14, 11, 15); open(6, 21, 11, 27);
  open(28, 2, 33, 8); open(28, 14, 33, 15); open(28, 21, 33, 27);
  open(6, 9, 6, 9); open(33, 20, 33, 20);
  open(3, 6, 5, 9); open(3, 20, 5, 23); open(34, 6, 36, 9); open(34, 20, 36, 23);   // spawn exits
  // T office roof: stairs up from the T mid corridor, roof drops onto the north catwalk
  m.set(7, 13, 'N').setLevel(7, 13, 7, 13, 0); m.set(7, 12, 'N').setLevel(7, 12, 7, 12, 1); m.set(7, 11, 'N').setLevel(7, 11, 7, 11, 2);
  open(7, 9, 11, 10, 3); open(8, 11, 11, 12, 3);
  // CT office roof: stairs up from the CT mid corridor, roof drops onto the south catwalk
  m.set(32, 16, 'S').setLevel(32, 16, 32, 16, 0); m.set(32, 17, 'S').setLevel(32, 17, 32, 17, 1); m.set(32, 18, 'S').setLevel(32, 18, 32, 18, 2);
  open(28, 19, 32, 20, 3); open(28, 17, 31, 18, 3);
  // sites, cover
  m.fill(15, 2, 24, 5, 'A'); m.fill(15, 24, 24, 27, 'B');
  m.set(17, 3, 'K').set(22, 4, 'C').set(13, 2, 'c').set(26, 5, 'b').set(19, 6, 'H').set(20, 6, 'H');
  m.set(16, 26, 'C').set(23, 25, 'K').set(26, 27, 'c').set(13, 24, 'b').set(19, 23, 'H').set(20, 23, 'H');
  m.set(8, 4, 'c').set(10, 24, 'C').set(30, 5, 'C').set(29, 25, 'c').set(8, 26, 'b').set(31, 3, 'b');
  m.fill(1, 12, 3, 17, 't'); for (let r = 12; r <= 17; r += 2) m.set(2, r, '.');
  m.fill(36, 12, 38, 17, 'x'); for (let r = 12; r <= 17; r += 2) m.set(37, r, '.');
  const out = m.build();
  m.poleLine(-70, 50, 70, 50, 16); m.rubble(220);
  const dressed = m.output(); out.meshes = dressed.meshes; out.materials = dressed.materials;
  out.markers = [...finalizeMarkers(m, out)];
  return { map: m, ...out };
}
