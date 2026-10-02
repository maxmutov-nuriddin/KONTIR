// Touch controls for phones / tablets: a move stick (left), drag-to-look (right half) and action buttons that press the
// same bindings the keyboard / mouse use, so the game logic does not know the difference. Only built on coarse-pointer
// devices; shown while a match is being played.
const coarse = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const BUTTONS = [
  // [action, label, css class]
  ['attack', 'OT', 'tc-fire'], ['attack2', '◎', 'tc-aim'], ['jump', '⤒', 'tc-jump'], ['crouch', '⤓', 'tc-crouch'],
  ['reload', 'R', 'tc-reload'], ['use', 'E', 'tc-use'], ['quick', '⇄', 'tc-quick'], ['buy', '$', 'tc-buy'], ['scoreboard', '☰', 'tc-score'],
];

export class TouchControls {
  constructor(controller) {
    this.c = controller; this.enabled = coarse(); this.visible = false;
    if (!this.enabled) return;
    const root = this.root = document.createElement('div'); root.id = 'touch'; root.className = 'hidden';
    root.innerHTML = `<div class="tc-look"></div><div class="tc-stick"><i></i></div>${BUTTONS.map(([a, l, k]) => `<button data-act="${a}" class="tc-btn ${k}">${l}</button>`).join('')}`;
    document.body.appendChild(root);
    this.knob = root.querySelector('.tc-stick i');
    this.stick = { id: null, x: 0, y: 0 }; this.look = { id: null, x: 0, y: 0 };
    const stickEl = root.querySelector('.tc-stick'), lookEl = root.querySelector('.tc-look');
    stickEl.addEventListener('touchstart', e => this.stickStart(e, stickEl), { passive: false });
    lookEl.addEventListener('touchstart', e => this.lookStart(e), { passive: false });
    addEventListener('touchmove', e => this.move(e), { passive: false });
    addEventListener('touchend', e => this.end(e)); addEventListener('touchcancel', e => this.end(e));
    for (const b of root.querySelectorAll('[data-act]')) {
      const act = b.dataset.act;
      b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); this.press(act, true); }, { passive: false });
      b.addEventListener('touchend', e => { e.preventDefault(); b.classList.remove('down'); this.press(act, false); }, { passive: false });
      // fire also aims: dragging from the fire button keeps turning the view
      if (act === 'attack') b.addEventListener('touchstart', e => { const t = e.changedTouches[0]; if (this.look.id === null) this.look = { id: t.identifier, x: t.clientX, y: t.clientY }; });
    }
  }
  /** Shown during a match; on touch devices the match runs in a virtual "pointer lock". */
  setVisible(on) {
    if (!this.enabled) return;
    this.visible = on; this.root.classList.toggle('hidden', !on); this.c.touchActive = on;
    if (!on) { this.resetStick(); for (const a of ['attack', 'attack2', 'jump', 'crouch', 'reload', 'use']) this.press(a, false); }
  }
  code(action) { return this.c.binds[action]?.find(Boolean); }
  press(action, down) {
    if (action === 'buy') { if (down) this.c.callbacks.buy?.(); return; }
    if (action === 'scoreboard') { this.c.callbacks.scoreboard?.(down); return; }
    const code = this.code(action); if (!code) return;
    if (down) this.c.press(code); else this.c.release(code);
  }
  stickStart(e, el) {
    e.preventDefault(); const t = e.changedTouches[0], r = el.getBoundingClientRect();
    this.stick = { id: t.identifier, cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2 };
    this.stickMove(t);
  }
  stickMove(t) {
    const s = this.stick; let dx = t.clientX - s.cx, dy = t.clientY - s.cy; const d = Math.hypot(dx, dy), max = s.r * 0.8;
    if (d > max) { dx *= max / d; dy *= max / d; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = 1 / max; this.c.axis = { x: dx * k, y: -dy * k };
    this.c.walkTouch = Math.hypot(dx, dy) < max * 0.5;      // a short push = quiet walk
  }
  resetStick() { this.stick.id = null; if (this.knob) this.knob.style.transform = ''; this.c.axis = { x: 0, y: 0 }; this.c.walkTouch = false; }
  lookStart(e) { e.preventDefault(); const t = e.changedTouches[0]; this.look = { id: t.identifier, x: t.clientX, y: t.clientY }; }
  move(e) {
    if (!this.visible) return;
    for (const t of e.changedTouches) {
      if (t.identifier === this.stick.id) { e.preventDefault(); this.stickMove(t); }
      else if (t.identifier === this.look.id) {
        e.preventDefault();
        const dx = t.clientX - this.look.x, dy = t.clientY - this.look.y; this.look.x = t.clientX; this.look.y = t.clientY;
        this.c.touchLook(dx * 2.2, dy * 2.2);                    // CSS px -> mouse-count feel
      }
    }
  }
  end(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.stick.id) this.resetStick();
      if (t.identifier === this.look.id) this.look.id = null;
    }
  }
}
