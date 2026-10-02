import { GridMap, finalizeMarkers } from './builder.mjs';
import { tracer } from './trace.mjs';

/**
 * SAROB — the classic "Mirage" layout, traced 1:1 from the callout overview (1075 x 715 px, 30 px = one 3 m cell).
 * T spawn east. A (south) via PALACE (raised, roofed) / T RAMP + tetris / CONNECTOR -> stairs; MID with catwalk,
 * top of mid, window / sniper's nest, underpass; B (north-west) via APARTMENTS (raised, roofed) / B SHORT / MARKET.
 */
export function buildSarob() {
  const m = new GridMap({ id: 'sarob', cols: 36, rows: 24, seed: 777, wallMaterials: ['plaster_ochre', 'stone_wall', 'plaster_white', 'plaster_rose', 'sand_wall'],
    groundMaterial: 'stone_floor', raisedMaterial: 'stone_floor', stairMaterial: 'stone_wall', spawnYaw: { T: -Math.PI / 2, CT: Math.PI / 2 } });
  m.fill(0, 0, 35, 23, '#');
  const T = tracer(m, 30);
  // ---- T spawn, side alley, apartments
  T.floor(955, 150, 1030, 270);                                  // T spawn
  T.floor(965, 50, 1035, 660);                                   // T corridor (side alley <-> palace alley)
  T.floor(720, 50, 965, 200);                                    // side alley / cart
  T.floor(700, 140, 830, 300);                                   // top of mid
  T.floor(570, 15, 850, 60, 1, 'R'); T.floor(440, 55, 650, 110, 1, 'R'); T.floor(180, 15, 450, 60, 1, 'R'); // house TV / back alley / apartments
  T.floor(380, 60, 470, 130, 0, 'R'); T.paint(440, 70, 470, 110, 'E', 0); // kitchen (ground) + stairs up into back alley
  T.floor(880, 15, 960, 50); T.paint(850, 15, 880, 45, '<', 0);  // apps ramp: side alley -> house TV (rises west)
  // ---- B
  T.floor(35, 75, 300, 225);                                     // B site
  T.paint(180, 60, 240, 90, 'N', 0);                             // B -> B plat / apartments stairs (rise north)
  T.floor(300, 70, 360, 190);                                    // arches
  T.floor(420, 110, 525, 230);                                   // B short
  T.floor(100, 200, 310, 335, 0, 'R');                           // shop / market (roofed)
  T.floor(90, 225, 150, 265); T.floor(100, 300, 165, 335);       // door / sneaky
  // ---- mid
  T.floor(425, 230, 830, 385);                                   // middle (catwalk side + chair)
  T.floor(390, 190, 440, 300, 0, 'R');                           // underpass (roofed) to B short
  T.floor(370, 280, 430, 345, 1, 'R'); T.paint(430, 300, 445, 345, 'W', 0); // sniper's nest (raised room) + step down to mid
  T.floor(830, 280, 1000, 400);                                  // top mid -> palace alley
  T.floor(820, 360, 965, 500);                                   // palace alley
  // ---- connector, jungle, CT
  T.floor(480, 380, 560, 470, 0, 'R');                           // connector (roofed)
  T.floor(340, 400, 480, 490);                                   // jungle
  T.floor(260, 330, 360, 640);                                   // CT corridor
  T.floor(190, 490, 330, 610);                                   // CT spawn
  T.floor(330, 600, 500, 700);                                   // CT / ticket / trash
  // ---- A, T ramp, palace
  T.floor(480, 470, 700, 690);                                   // A site
  T.floor(690, 470, 860, 530);                                   // T ramp / tetris
  T.floor(860, 450, 905, 530);                                   // T roof
  T.floor(720, 530, 960, 680, 1, 'R');                           // palace interior (raised, roofed)
  T.floor(905, 480, 965, 530, 1);                                // palace entrance from T corridor
  T.paint(690, 540, 720, 620, 'E', 0);                           // scaffolding: A -> palace (rise east)
  T.paint(965, 480, 995, 530, 'W', 0);                           // T corridor -> palace entrance (rise west)
  // ---- sites, cover, props
  T.paint(530, 560, 640, 650, 'A'); T.paint(130, 100, 250, 190, 'B');
  T.at(560, 580, 'c'); T.at(630, 640, 'C'); T.at(610, 480, 'H'); T.at(650, 500, 'c'); T.at(500, 620, 'k');
  T.at(170, 130, 'C'); T.at(80, 120, 'c'); T.at(250, 200, 'c'); T.at(330, 120, 'p');
  T.at(760, 320, 'C'); T.at(600, 340, 'c'); T.at(780, 120, 'k'); T.at(880, 420, 'c'); T.at(300, 560, 'T');
  // ---- spawns
  T.paint(965, 160, 1025, 260, 't'); T.at(995, 210, '.');
  T.paint(200, 500, 320, 600, 'x'); T.at(260, 550, '.');
  const out = m.build();
  m.poleLine(-60, 42, 60, 42, 14); m.rubble(180);
  const dressed = m.output(); out.meshes = dressed.meshes; out.materials = dressed.materials;
  out.markers = [...finalizeMarkers(m, out)];
  return { map: m, ...out };
}
