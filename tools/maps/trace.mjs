// Helpers for maps traced from a top-down overview image: rectangles are given in IMAGE PIXELS and painted onto the
// grid (PX pixels = one 3 m cell), so a layout can be copied 1:1 from a callout map.
export function tracer(m, PX) {
  const c = v => Math.max(0, Math.min(m.cols - 1, Math.floor(v / PX))), r = v => Math.max(0, Math.min(m.rows - 1, Math.floor(v / PX)));
  const box = (x0, y0, x1, y1) => [c(x0), r(y0), c(x1 - 1), r(y1 - 1)];
  return {
    /** walkable floor (optionally raised / roofed) */
    floor(x0, y0, x1, y1, lvl = 0, ch = '.') { const [a, b, d, e] = box(x0, y0, x1, y1); m.fill(a, b, d, e, ch); m.setLevel(a, b, d, e, lvl); },
    /** any grid symbol (ramps ^ v < >, stairs N S W E, cover, sites, spawns) keeping the cells' level */
    paint(x0, y0, x1, y1, ch, lvl = null) { const [a, b, d, e] = box(x0, y0, x1, y1); m.fill(a, b, d, e, ch); if (lvl !== null) m.setLevel(a, b, d, e, lvl); },
    /** a single cell at pixel (x, y) */
    at(x, y, ch) { m.set(c(x), r(y), ch); },
    cell: (x, y) => [c(x), r(y)],
  };
}
