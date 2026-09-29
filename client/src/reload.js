// Reload choreography shared by the first-person animation (WeaponManager) and remote foley (AudioEngine):
// each style lists sound cues as fractions of the weapon's reload time, so sounds always line up with the hands.
export const SHOTGUNS = new Set(['nova', 'xm1014', 'sawedoff']);
export const BOLT = new Set(['awp', 'ssg08']);
export const PISTOLS = new Set(['glock', 'usp', 'p250', 'fiveseven', 'tec9', 'deagle', 'cz75']);
export const REVOLVERS = new Set(['r8']);

export function reloadStyle(id) {
  if (SHOTGUNS.has(id)) return 'shotgun';
  if (BOLT.has(id)) return 'bolt';
  if (PISTOLS.has(id)) return 'pistol';
  if (REVOLVERS.has(id)) return 'revolver';
  return 'rifle';
}

/** [fraction, foley kind]; `full` cues only play for an empty-magazine reload (bolt / slide has to be cycled). */
export const CUES = {
  rifle: [[0.22, 'magOut'], [0.5, 'magTouch'], [0.64, 'magIn'], [0.8, 'boltBack', 'full'], [0.86, 'boltFwd', 'full']],
  bolt: [[0.22, 'magOut'], [0.64, 'magIn'], [0.76, 'boltUp'], [0.8, 'boltBack'], [0.86, 'boltFwd']],
  pistol: [[0.14, 'magOut'], [0.62, 'magIn'], [0.74, 'slide', 'full']],
  revolver: [[0.2, 'cylinderOut'], [0.35, 'shellsOut'], [0.62, 'shellsIn'], [0.8, 'cylinderIn']],
  shotgun: [],                      // shell cues are generated per shell (see shellCues)
};
/** Shell-by-shell: n inserts spread over 12-80 %, then a pump if the gun was empty. */
export function shellCues(n, full) {
  const out = [], a = 0.12, b = 0.8;
  for (let i = 0; i < n; i++) out.push([a + (b - a) * (i + 0.65) / n, 'shell']);
  if (full) out.push([0.86, 'pumpBack'], [0.92, 'pumpFwd']);
  return out;
}
export function cuesFor(id, { full = true, shells = 4 } = {}) {
  const style = reloadStyle(id);
  if (style === 'shotgun') return shellCues(shells, full);
  return CUES[style].filter(c => full || c[2] !== 'full');
}
