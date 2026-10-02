import { GridMap, finalizeMarkers } from './builder.mjs';
import { tracer } from './trace.mjs';

/**
 * CHANGTEPA — the classic "Dust II" layout, traced 1:1 from the 17 x 17 callout overview (1080 px, 30 px = one 3 m cell).
 * T spawn south, CT spawn north-east. A (north-east, raised) via LONG (outside long -> long doors -> long corner -> A ramp),
 * SHORT (mid -> stairs -> catwalk -> A) ; B (north-west) via OUTSIDE / UPPER TUNNELS, MID DOORS -> CT MID -> B DOORS.
 */
export function buildChangtepa() {
  const m = new GridMap({ id: 'changtepa', cols: 36, rows: 36, seed: 2002, wallMaterials: ['sand_wall', 'plaster_ochre', 'sand_wall', 'stone_wall'],
    groundMaterial: 'sand_ground', raisedMaterial: 'sand_raised', stairMaterial: 'stone_base', spawnYaw: { T: Math.PI, CT: 0 } });
  m.fill(0, 0, 35, 35, '#');
  const T = tracer(m, 30);
  // ---- T spawn and the T-side exits
  T.floor(60, 930, 640, 1050); T.floor(60, 810, 360, 1050);
  T.floor(95, 630, 295, 820);                                    // outside tunnels
  T.floor(175, 520, 225, 640);                                   // tunnel neck
  T.floor(65, 430, 345, 520, 0, 'R');                            // upper tunnels (roofed)
  T.floor(300, 400, 460, 460, 0, 'R');                           // lower tunnels (roofed) -> mid doors
  T.floor(95, 330, 145, 440);                                    // tunnels -> B ("dog" / fence)
  // ---- mid
  T.floor(455, 330, 535, 400);                                   // mid doors
  T.floor(455, 380, 545, 905);                                   // mid lane (xbox, cat wall) -> suicide
  T.floor(430, 600, 760, 705);                                   // top mid / green / palm
  T.floor(470, 705, 505, 935);                                   // suicide to T spawn
  T.floor(625, 700, 780, 885);                                   // outside long
  // ---- long
  T.floor(720, 580, 780, 720);                                   // long doors
  T.floor(780, 580, 900, 735);                                   // long doors yard
  T.floor(900, 575, 980, 740);                                   // pit
  T.floor(710, 470, 1030, 585);                                  // long corner + blue
  T.floor(890, 300, 1030, 480);                                  // long
  T.floor(990, 230, 1030, 340);                                  // car
  // ---- A (raised one level), CT spawn (raised), short / catwalk (raised)
  T.floor(655, 95, 900, 200, 1); T.floor(820, 135, 990, 300, 1); // goose / site / ramp top
  T.paint(900, 300, 990, 330, '^', 0);                           // long -> A ramp (rises north)
  T.floor(605, 155, 720, 285, 1);                                // CT spawn
  T.floor(660, 200, 720, 400, 1);                                // stairs side down to short
  T.floor(545, 395, 720, 460, 1);                                // short / catwalk
  T.paint(515, 395, 545, 460, 'E', 0);                           // mid -> catwalk stairs (rise east)
  // ---- CT mid and B
  T.floor(270, 150, 520, 280);                                   // CT mid
  T.paint(545, 210, 575, 280, 'E', 0); T.floor(520, 210, 545, 280); // CT mid -> CT spawn ramp
  T.floor(265, 150, 300, 260);                                   // B doors
  T.floor(65, 150, 265, 340);                                    // B site
  T.floor(60, 20, 270, 150);                                     // back plat / back site
  T.floor(180, 300, 265, 370);                                   // car / closet
  // ---- sites, cover, props
  T.paint(830, 140, 900, 210, 'A'); T.paint(170, 70, 270, 180, 'B');
  T.at(845, 160, 'C'); T.at(700, 110, 'c'); T.at(870, 105, 'b'); T.at(1000, 270, 'k'); T.at(780, 500, 'C');
  T.at(205, 110, 'c'); T.at(150, 180, 'C'); T.at(95, 120, 'c'); T.at(210, 330, 'k'); T.at(70, 250, 'c');
  T.at(490, 480, 'C'); T.at(445, 610, 'c');   // xbox in mid, clear of the catwalk stairs T.at(540, 650, 'T'); T.at(760, 610, 'c'); T.at(940, 600, 'b');
  T.at(270, 790, 'c'); T.at(150, 990, 'C'); T.at(560, 960, 'k'); T.at(980, 540, 'H');
  // ---- spawns
  T.paint(330, 960, 520, 1040, 't'); for (const [x, y] of [[360, 990], [420, 990], [480, 990]]) T.at(x, y, '.');
  T.paint(615, 165, 710, 270, 'x'); for (const [x, y] of [[640, 220], [690, 220]]) T.at(x, y, '.');
  const out = m.build();
  m.poleLine(-60, 62, 60, 62, 14); m.rubble(220);
  const dressed = m.output(); out.meshes = dressed.meshes; out.materials = dressed.materials;
  out.markers = [...finalizeMarkers(m, out)];
  return { map: m, ...out };
}
