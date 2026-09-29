// Client-side prediction + server reconciliation for movement AND the weapon state machine.
// Every command is simulated locally at once; on each snapshot the authoritative state is restored at the
// acknowledged command and the still-unacknowledged commands are replayed on top (silently).
import { DT, neutralInput } from '../../shared/constants.js';
import { stepPlayer } from '../../shared/movement.js';
import { speedMul } from '../../shared/weapons.js';

export class Prediction {
  /** @param {import('../../shared/collision.js').MeshCollider} collider @param {import('../WeaponManager.js').WeaponManager} weapons */
  constructor(collider, weapons) {
    this.collider = collider; this.weapons = weapons;
    this.pending = []; this.seq = 0; this.epoch = -1; this.life = -1;
    this.char = null; this.prev = null; this.offset = { x: 0, y: 0, z: 0 };
    this.phase = 'warmup'; this.alive = false;
  }
  gate(phase, alive) {
    return { canMove: alive && phase !== 'buy' && phase !== 'matchEnd', canFire: alive && (phase === 'live' || phase === 'warmup') };
  }
  simulate(char, cmd, phase, alive, silent) {
    const { canMove, canFire } = this.gate(phase, alive);
    if (!alive) { char.yaw = cmd.yaw; char.pitch = Math.max(-1.55, Math.min(1.55, cmd.pitch)); return null; }
    const input = canMove ? cmd : { ...neutralInput(), yaw: cmd.yaw, pitch: cmd.pitch };
    char.speedMul = speedMul(this.weapons.inventory.weapon()?.id);
    const events = stepPlayer(char, input, this.collider, DT);
    this.weapons.predict(cmd, { canFire }, silent);
    return events;
  }
  /** Builds, records and simulates the next command. Returns { cmd, events }. */
  command(input, viewTick) {
    if (!this.char || this.pending.length >= 128) return null;
    const cmd = { ...input, seq: this.seq++, viewTick, epoch: this.epoch, life: this.life };
    this.pending.push(cmd);
    this.prev = { ...this.char };
    const events = this.simulate(this.char, cmd, this.phase, this.alive, false);
    // a stair pop is not interpolated: the camera rig absorbs it with a decaying offset instead
    if (events?.step) { this.prev.x += events.step.x; this.prev.y += events.step.y; this.prev.z += events.step.z; }
    return { cmd, events };
  }
  reconcile(state, id) {
    const me = state.players.find(p => p.id === id);
    if (!me) return false;
    this.phase = state.phase; this.alive = me.alive;
    if (me.inv && this.weapons.team !== me.team) this.weapons.setTeam(me.team);
    if (this.epoch !== state.epoch || this.life !== me.life || !this.char) {
      this.epoch = state.epoch; this.life = me.life; this.pending = []; this.char = { ...me.char }; this.prev = { ...me.char };
      this.offset = { x: 0, y: 0, z: 0 }; this.seq = Math.max(this.seq, me.ack + 1);
      if (me.inv) this.weapons.load(me.inv);
      return true;
    }
    const before = { ...this.char };
    this.pending = this.pending.filter(c => c.seq > me.ack);
    this.char = { ...me.char };
    if (me.inv) this.weapons.load(me.inv);
    for (const cmd of this.pending) this.simulate(this.char, cmd, state.phase, me.alive, true);
    const error = Math.hypot(before.x - this.char.x, before.y - this.char.y, before.z - this.char.z);
    if (error > 2.5 || !me.alive) this.offset = { x: 0, y: 0, z: 0 };
    else { this.offset.x += before.x - this.char.x; this.offset.y += before.y - this.char.y; this.offset.z += before.z - this.char.z; }
    this.prev = { ...this.char, x: this.char.x, y: this.char.y, z: this.char.z };
    return false;
  }
  smooth(dt) { const k = Math.exp(-14 * dt); this.offset.x *= k; this.offset.y *= k; this.offset.z *= k; }
}
