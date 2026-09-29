// Friends panel (lobby side sheet): search players by username, send / accept requests, presence, direct messages and
// 1:1 voice calls. Voice is peer-to-peer WebRTC; the game server only relays signalling between friends (rtc:signal).
// Without a TURN server some strict NATs cannot connect — the call then ends with a notice.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = { lobby: 'LOBBIDA', search: 'O‘YIN QIDIRMOQDA', game: 'O‘YINDA', offline: 'OFLAYN' };
const PARTY_ERR = { offline: 'Do‘st onlayn emas.', inparty: 'U allaqachon partiyada.', full: 'Partiya to‘la (5).' };
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export class Friends {
  /** @param {{ network, profile, toast, openAuth, sound? }} o */
  constructor(o) {
    Object.assign(this, o);
    this.list = { friends: [], incoming: [] }; this.open = false; this.chatWith = null; this.unread = new Map(); this.call = null;
    this.el = document.createElement('aside'); this.el.id = 'friends'; this.el.hidden = true; document.body.append(this.el);
    this.bar = document.createElement('div'); this.bar.id = 'call-bar'; this.bar.hidden = true; document.body.append(this.bar);
    const s = this.network.socket;
    s.on('friends:update', () => this.refresh());
    s.on('dm', ({ with: other, msg }) => {
      if (this.chatWith?.toLowerCase() === other.toLowerCase() && this.open) this.appendMsg(msg);
      else if (msg.from.toLowerCase() !== this.profile.name.toLowerCase()) { this.unread.set(other, (this.unread.get(other) || 0) + 1); this.toast(`✉ ${msg.from}: ${msg.text.slice(0, 60)}`); this.renderRail(); if (this.open) this.render(); }
    });
    s.on('rtc:signal', m => this.signal(m));
    // party: invites, roster (lobby party slots) and following the leader into rooms
    this.party = null;
    s.on('party:update', p => { this.party = p; this.renderParty(); if (this.open && !this.chatWith) this.render(); });
    s.on('party:invite', ({ from, leader }) => this.invitePrompt(from, leader));
    s.on('party:follow', f => this.onFollow?.(f));
  }
  // ------------------------------------------------------------------------------------------------ data
  async refresh() {
    if (this.profile.demo || !this.network.socket.connected) { this.list = { friends: [], incoming: [] }; this.renderRail(); if (this.open) this.render(); return; }
    try { this.list = await this.network.request('friends:list', {}); } catch { /* offline */ }
    this.renderRail(); if (this.open) this.render();
  }
  async act(event, payload, ok) {
    try { await this.network.request(event, payload); if (ok) this.toast(ok); await this.refresh(); }
    catch (e) { this.toast({ nouser: 'Bunday o‘yinchi topilmadi.', already: 'Allaqachon do‘stingiz.', self: 'O‘zingizni qo‘sha olmaysiz.', slow: 'Juda ko‘p urinish. Bir daqiqa kuting.', notfriend: 'Faqat do‘stlarga yozish mumkin.', ...PARTY_ERR }[e.message] || 'Server xatosi. Qayta urinib ko‘ring.'); }
  }
  // ------------------------------------------------------------------------------------------------ view
  toggle(force) { this.open = force ?? !this.open; this.el.hidden = !this.open; if (this.open) { this.render(); this.refresh(); } }
  renderRail() {
    const rail = document.querySelector('#rail-friends'); if (!rail) return;
    const online = this.list.friends.filter(f => f.status !== 'offline'), unread = [...this.unread.values()].reduce((a, b) => a + b, 0) + this.list.incoming.length;
    rail.innerHTML = `<button class="rail-btn friends-btn" id="friends-toggle" title="Do‘stlar">👥${unread ? `<i class="badge">${unread}</i>` : ''}</button>`
      + online.slice(0, 6).map(f => `<button class="friend-dot ${f.status}" data-chat="${esc(f.name)}" title="${esc(f.name)} · ${STATUS[f.status]}">${esc(f.name[0].toUpperCase())}</button>`).join('');
    rail.querySelector('#friends-toggle').onclick = () => this.toggle();
    rail.querySelectorAll('[data-chat]').forEach(b => b.onclick = () => { this.toggle(true); this.openChat(b.dataset.chat); });
  }
  render() {
    if (this.profile.demo) {
      this.el.innerHTML = `<header><b>DO‘STLAR</b><button class="x" data-close>×</button></header><div class="fr-empty"><p>Do‘stlar, yozishma va ovozli qo‘ng‘iroq uchun akkaunt kerak.</p><button class="primary" data-auth>KIRISH</button></div>`;
      this.el.querySelector('[data-auth]').onclick = () => { this.toggle(false); this.openAuth(); };
      this.el.querySelector('[data-close]').onclick = () => this.toggle(false);
      return;
    }
    if (this.chatWith) return this.renderChat();
    const { friends, incoming } = this.list, order = { game: 0, search: 1, lobby: 2, offline: 3 };
    this.el.innerHTML = `<header><b>DO‘STLAR</b><span>${friends.filter(f => f.status !== 'offline').length} / ${friends.length} ONLAYN</span><button class="x" data-close>×</button></header>
      <form class="fr-search"><input id="fr-q" maxlength="16" placeholder="Foydalanuvchi nomini qidiring" spellcheck="false" autocomplete="off" value="${esc(this.query || '')}"><button class="primary">IZLASH</button></form><div id="fr-results">${this.resultsHTML()}</div>
      ${incoming.length ? `<small class="fr-h">SO‘ROVLAR</small>${incoming.map(n => `<div class="fr-row"><span class="av">${esc(n[0].toUpperCase())}</span><b>${esc(n)}</b><button data-accept="${esc(n)}" class="ok">QABUL</button><button data-decline="${esc(n)}">RAD</button></div>`).join('')}` : ''}
      <small class="fr-h">DO‘STLAR</small>${friends.length ? [...friends].sort((a, b) => order[a.status] - order[b.status]).map(f => `<div class="fr-row ${f.status}"><span class="av">${esc(f.name[0].toUpperCase())}<i></i></span><div><b>${esc(f.name)}</b><small>${STATUS[f.status]}</small></div>
        <button data-chat="${esc(f.name)}" title="Xabar">✉${this.unread.get(f.name) ? `<i class="badge">${this.unread.get(f.name)}</i>` : ''}</button><button data-invite="${esc(f.name)}" title="Partiyaga taklif" ${f.status === 'offline' || this.party?.members.includes(f.name) ? 'disabled' : ''}>＋</button><button data-call="${esc(f.name)}" title="Ovozli qo‘ng‘iroq" ${f.status === 'offline' || this.call ? 'disabled' : ''}>🎙</button><button data-remove="${esc(f.name)}" title="O‘chirish">×</button></div>`).join('') : '<p class="fr-note">Hali do‘stlar yo‘q. Yuqorida nom bo‘yicha qidiring.</p>'}`;
    const $ = q => this.el.querySelector(q);
    $('[data-close]').onclick = () => this.toggle(false);
    // typed text and focus survive re-renders (presence updates arrive at any moment)
    const q = $('#fr-q'); q.oninput = () => { this.query = q.value; };
    if (this.searchFocus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    q.onfocus = () => { this.searchFocus = true; }; q.onblur = () => { this.searchFocus = false; };
    $('.fr-search').onsubmit = e => { e.preventDefault(); this.search(q.value.trim()); };
    this.el.querySelectorAll('[data-add]').forEach(b => b.onclick = async () => { await this.act('friends:request', b.dataset.add, 'So‘rov yuborildi.'); this.search(this.query); });
    this.el.querySelectorAll('[data-accept]').forEach(b => b.onclick = () => this.act('friends:respond', { name: b.dataset.accept, accept: true }, 'Do‘st qo‘shildi.'));
    this.el.querySelectorAll('[data-decline]').forEach(b => b.onclick = () => this.act('friends:respond', { name: b.dataset.decline, accept: false }));
    this.el.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => { if (confirm(`${b.dataset.remove} — do‘stlardan o‘chirilsinmi?`)) this.act('friends:remove', b.dataset.remove); });
    this.el.querySelectorAll('[data-chat]').forEach(b => b.onclick = () => this.openChat(b.dataset.chat));
    this.el.querySelectorAll('[data-call]').forEach(b => b.onclick = () => this.startCall(b.dataset.call));
    this.el.querySelectorAll('[data-invite]').forEach(b => b.onclick = () => this.act('party:invite', b.dataset.invite, 'Taklif yuborildi.'));
  }
  invitePrompt(from, leader) {
    const el = document.createElement('div'); el.className = 'party-invite';
    el.innerHTML = `<span>👥 <b>${esc(from)}</b> sizni partiyaga taklif qildi</span><button class="ok" data-y>QO‘SHILISH</button><button data-n>RAD</button>`;
    document.body.append(el); this.sound?.();
    const close = () => el.remove(); const t = setTimeout(close, 30000);
    el.querySelector('[data-n]').onclick = () => { clearTimeout(t); close(); };
    el.querySelector('[data-y]').onclick = async () => { clearTimeout(t); close(); await this.act('party:accept', leader); };
  }
  /** Lobby party box: leader first, then members; a leave button when in a party. */
  renderParty() {
    const slots = document.querySelector('.party-slots'), count = document.querySelector('#party-count'); if (!slots) return;
    const others = (this.party?.members || []).filter(n => n.toLowerCase() !== this.profile.name.toLowerCase());
    count.textContent = `${1 + others.length} / 5`;
    slots.innerHTML = others.map(n => `<i class="member" title="${esc(n)}${this.party.leader === n ? ' · lider' : ''}">${esc(n[0].toUpperCase())}${this.party.leader === n ? '<em>★</em>' : ''}</i>`).join('')
      + Array.from({ length: 4 - others.length }, () => '<i class="add" title="Do‘st taklif qilish">+</i>').join('')
      + (this.party ? '<button class="party-leave" title="Partiyadan chiqish">×</button>' : '');
    slots.querySelectorAll('.add').forEach(b => b.onclick = () => this.toggle(true));
    slots.querySelector('.party-leave')?.addEventListener('click', () => { this.network.socket.emit('party:leave'); this.party = null; this.renderParty(); });
  }
  resultsHTML() {
    const users = this.results; if (!users) return '';
    return users.length ? users.map(u => `<div class="fr-row"><span class="av">${esc(u.name[0].toUpperCase())}</span><b>${esc(u.name)}</b>${u.friend ? '<small>DO‘ST</small>' : u.pending ? '<small>YUBORILGAN</small>' : `<button data-add="${esc(u.name)}" class="ok">QO‘SHISH</button>`}</div>`).join('') : '<p class="fr-note">Hech kim topilmadi.</p>';
  }
  /** Search results live in state so presence / list refreshes never wipe them. */
  async search(q) {
    if (!q || q.length < 2) { this.query = q; this.results = null; return this.render(); }
    try { this.query = q; this.results = (await this.network.request('friends:search', q)).users; } catch { this.toast('Server xatosi. Qayta urinib ko‘ring.'); }
    if (this.open && !this.chatWith) this.render();
  }
  async openChat(name) {
    this.chatWith = name; this.msgs = []; this.draft = ''; this.unread.delete(name); this.renderRail(); this.renderChat();
    try { const { messages } = await this.network.request('dm:history', name); if (this.chatWith === name) { this.msgs = [...messages, ...this.msgs.filter(m => !messages.some(x => x.at === m.at && x.text === m.text))]; this.renderChat(); } } catch { /* offline */ }
  }
  renderChat() {
    const name = this.chatWith, f = this.list.friends.find(x => x.name === name);
    this.el.innerHTML = `<header><button class="x back" data-back>‹</button><b>${esc(name)}</b><span>${STATUS[f?.status || 'offline']}</span><button data-call="${esc(name)}" title="Ovozli qo‘ng‘iroq" ${!f || f.status === 'offline' || this.call ? 'disabled' : ''}>🎙</button><button class="x" data-close>×</button></header>
      <div class="fr-msgs"></div><form class="fr-send"><input id="fr-text" maxlength="300" autocomplete="off" placeholder="Xabar yozing…" value="${esc(this.draft || '')}"><button class="primary">➤</button></form>`;
    const $ = q => this.el.querySelector(q);
    $('[data-back]').onclick = () => { this.chatWith = null; this.render(); };
    $('[data-close]').onclick = () => this.toggle(false);
    $('[data-call]').onclick = () => this.startCall(name);
    $('#fr-text').oninput = e => { this.draft = e.target.value; };
    $('.fr-send').onsubmit = e => { e.preventDefault(); const t = $('#fr-text').value.trim(); if (!t) return; $('#fr-text').value = ''; this.draft = ''; this.act('dm:send', { to: name, text: t }); };
    for (const m of this.msgs || []) this.draw(m);
    $('#fr-text').focus();
  }
  appendMsg(m) { (this.msgs ||= []).push(m); this.draw(m); }
  draw(m) {
    const box = this.el.querySelector('.fr-msgs'); if (!box) return;
    const mine = m.from.toLowerCase() === this.profile.name.toLowerCase(), row = document.createElement('div');
    row.className = `msg ${mine ? 'me' : ''}`; row.innerHTML = `<span>${esc(m.text)}</span><small>${new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>`;
    box.append(row); box.scrollTop = box.scrollHeight;
  }
  // ------------------------------------------------------------------------------------------------ voice (WebRTC)
  send(to, sid, data) { this.network.socket.emit('rtc:signal', { to, sid, data }); }
  async mic() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('nomic');
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  }
  peer(call) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    call.stream.getTracks().forEach(t => pc.addTrack(t, call.stream));
    pc.onicecandidate = e => { if (e.candidate) this.send(call.with, call.sid, { type: 'ice', candidate: e.candidate.toJSON() }); };
    pc.ontrack = e => { call.audio.srcObject = e.streams[0]; call.audio.play().catch(() => {}); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') { call.state = 'live'; call.since = Date.now(); this.renderBar(); }
      if (pc.connectionState === 'failed') { this.toast('Ovozli ulanish o‘rnatilmadi (tarmoq/NAT).'); this.hangup(true); }
    };
    return pc;
  }
  async startCall(name) {
    if (this.call) return;
    let stream; try { stream = await this.mic(); } catch { return this.toast('Mikrofonga ruxsat berilmadi.'); }
    const audio = new Audio(); audio.autoplay = true;
    this.call = { with: name, sid: null, stream, audio, state: 'ringing', out: true, muted: false, ptt: false, queue: [] };
    this.send(name, null, { type: 'ring' });
    this.call.timer = setTimeout(() => { if (this.call?.state === 'ringing') { this.toast(`${name} javob bermadi.`); this.hangup(true); } }, 30000);
    this.renderBar(); if (this.open) this.render();
  }
  async signal({ from, sid, data }) {
    const c = this.call;
    if (data?.type === 'ring') {
      if (c) return this.send(from, sid, { type: 'busy' });
      this.call = { with: from, sid, state: 'incoming', out: false, muted: false, ptt: false, queue: [] };
      this.sound?.(); this.renderBar(); return;
    }
    if (!c || c.with.toLowerCase() !== from.toLowerCase() || (c.sid && sid !== c.sid)) return;
    if (data.type === 'busy') { this.toast(`${from} band.`); return this.hangup(false); }
    if (data.type === 'decline') { this.toast(`${from} qo‘ng‘iroqni rad etdi.`); return this.hangup(false); }
    if (data.type === 'hangup') { this.toast('Qo‘ng‘iroq tugadi.'); return this.hangup(false); }
    if (data.type === 'accept' && c.out && c.state === 'ringing') {
      clearTimeout(c.timer); c.sid = sid; c.state = 'connecting'; c.pc = this.peer(c);
      const offer = await c.pc.createOffer(); await c.pc.setLocalDescription(offer);
      this.send(c.with, c.sid, { type: 'offer', sdp: offer.sdp }); this.renderBar(); return;
    }
    if (data.type === 'offer' && !c.out && c.pc) {
      await c.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      const answer = await c.pc.createAnswer(); await c.pc.setLocalDescription(answer);
      this.send(c.with, c.sid, { type: 'answer', sdp: answer.sdp });
      for (const cand of c.queue.splice(0)) await c.pc.addIceCandidate(cand).catch(() => {});
      return;
    }
    if (data.type === 'answer' && c.out && c.pc) { await c.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp }); for (const cand of c.queue.splice(0)) await c.pc.addIceCandidate(cand).catch(() => {}); return; }
    if (data.type === 'ice') { if (c.pc?.remoteDescription) await c.pc.addIceCandidate(data.candidate).catch(() => {}); else c.queue.push(data.candidate); }
  }
  async accept() {
    const c = this.call; if (!c || c.state !== 'incoming') return;
    try { c.stream = await this.mic(); } catch { this.toast('Mikrofonga ruxsat berilmadi.'); this.send(c.with, c.sid, { type: 'decline' }); return this.hangup(false); }
    c.audio = new Audio(); c.audio.autoplay = true; c.state = 'connecting'; c.pc = this.peer(c);
    this.send(c.with, c.sid, { type: 'accept' }); this.renderBar();
  }
  hangup(notify = true) {
    const c = this.call; if (!c) return;
    if (notify) this.send(c.with, c.sid, { type: c.state === 'incoming' ? 'decline' : 'hangup' });
    clearTimeout(c.timer); c.pc?.close(); c.stream?.getTracks().forEach(t => t.stop()); if (c.audio) c.audio.srcObject = null;
    this.call = null; this.renderBar(); if (this.open) this.render();
  }
  /** Mic gate: muted button, and push-to-talk while in a match (voice key held). */
  applyMic() { const c = this.call; if (!c?.stream) return; const on = !c.muted && (!this.inGame?.() || c.ptt); c.stream.getAudioTracks().forEach(t => { t.enabled = on; }); }
  setPTT(down) { if (!this.call) return; this.call.ptt = down; this.applyMic(); this.bar.classList.toggle('talking', down); }
  renderBar() {
    const c = this.call; this.bar.hidden = !c; if (!c) return;
    const label = c.state === 'incoming' ? `📞 ${esc(c.with)} qo‘ng‘iroq qilmoqda` : c.state === 'ringing' ? `📞 ${esc(c.with)} — chaqirilmoqda…` : c.state === 'connecting' ? `🎙 ${esc(c.with)} — ulanmoqda…` : `🎙 ${esc(c.with)}`;
    this.bar.innerHTML = `<span>${label}</span>${c.state === 'incoming' ? '<button class="ok" data-acc>QABUL</button><button data-end>RAD</button>' : `<button data-mute>${c.muted ? 'MIC O‘CHIQ' : 'MIC'}</button><button data-end>TUGATISH</button>`}`;
    this.bar.querySelector('[data-acc]')?.addEventListener('click', () => this.accept());
    this.bar.querySelector('[data-end]').onclick = () => this.hangup(true);
    this.bar.querySelector('[data-mute]')?.addEventListener('click', () => { c.muted = !c.muted; this.applyMic(); this.renderBar(); });
    this.applyMic();
  }
}
