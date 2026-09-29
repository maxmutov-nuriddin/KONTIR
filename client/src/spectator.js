/** Interpolated snapshots can still hide enemy poses just after the local player dies. */
export function spectatorTarget(players, localId, localTeam, pick = 0) {
  const visible = players.filter(p => p.alive && p.id !== localId && p.char);
  const teammates = visible.filter(p => p.team === localTeam).sort((a, b) => a.id < b.id ? -1 : 1);
  const pool = teammates.length ? teammates : visible;
  return pool.length ? pool[((pick % pool.length) + pool.length) % pool.length] : null;
}
