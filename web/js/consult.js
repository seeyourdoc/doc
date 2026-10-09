(async () => {
  const q = new URLSearchParams(location.search);
  const token = q.get('t'), roomId = q.get('room');
  const isStaff = !!roomId;
  if (isStaff && !staff.get()) { location.href = 'login.html'; return; }
  const s = await loadSite({ title: 'Consultation' }).catch(() => null);
  const base = isStaff ? `/api/doctor/rooms/${encodeURIComponent(roomId)}` : `/api/consult/${encodeURIComponent(token || '')}`;
  const call = (p, o = {}) => api(base + p, { ...o, auth: isStaff });
  const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
  const banner = (html, cls = 'closed-note') => { const m = $('#msg'); m.className = cls; m.innerHTML = html; };

  let info, offset = 0, timer;
  async function loadInfo() {
    info = await call('');
    offset = new Date(info.server_time).getTime() - Date.now();
  }
  try { await loadInfo(); } catch (e) { banner(esc(e.message), 'err'); return; }

  const pad = (n) => String(n).padStart(2, '0');
  function renderHead() {
    const who = isStaff ? info.patient_name : info.doctor_name;
    const left = new Date(info.expires_at).getTime() - (Date.now() + offset);
    let line;
    if (info.status === 'terminated') line = 'This consultation has been closed.';
    else if (left <= 0) line = 'Your consultation period has ended.';
    else if (info.status === 'scheduled') line = `Your consultation starts ${fmtDT(info.starts_at)}.`;
    else {
      const t = Math.floor(left / 1000), d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60);
      line = `Consultation access expires in: ${d ? d + ' days ' : ''}${h} hours ${m} minutes`;
    }
    $('#head').innerHTML = `<div class="cbar"><div><h1 style="margin:0">Consultation with ${esc(who)}</h1><span class="muted">${esc(info.package_name)} · ${esc(info.duration_label)} · ${esc(info.booking_code)}</span></div><div class="exp">${esc(line)}</div></div>${isStaff && info.notes ? `<div class="notice"><strong>Patient notes:</strong> ${esc(info.notes)}</div>` : ''}`;
    return info.status === 'active' && left > 0;
  }

  let live = false, pollTimer;
  function apply() {
    const wasLive = live;
    live = renderHead();
    const isChat = info.consultation_type === 'chat';
    show('#chat', isChat && live); show('#video', !isChat && live);
    if (!live) {
      const text = info.status === 'scheduled' ? `This consultation opens 10 minutes before the start time. ${esc(isChat ? 'Chat' : 'Video')} will be available here.` : info.status === 'terminated' ? 'This consultation has been closed.' : 'Your consultation period has ended.';
      banner(text); stopPoll(); leaveVideo();
    } else { $('#msg').className = 'hidden'; if (isChat && !wasLive) startPoll(); }
  }
  apply();
  timer = setInterval(() => { renderHead(); if (info && new Date(info.expires_at) - (Date.now() + offset) <= 0) apply(); }, 30000);
  setInterval(async () => { try { await loadInfo(); apply(); } catch {} }, 60000); // picks up admin extensions/terminations

  // ---------- chat ----------
  let sig = '';
  const me = isStaff ? 'doctor' : 'patient';
  async function poll() {
    try {
      const { messages } = await call('/messages');
      const next = messages.map((m) => m.id + (m.read_at ? 'r' : '')).join();
      if (next === sig) return; sig = next;
      const box = $('#msgs'), stick = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      box.innerHTML = messages.length ? messages.map((m) => {
        const mine = m.sender_role === me;
        const t = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `<div class="m ${mine ? 'me' : ''}">${esc(m.body)}<small>${t}${mine ? (m.read_at ? ' · Read' : ' · Delivered') : ''}</small></div>`;
      }).join('') : '<p class="muted center">No messages yet. Say hello.</p>';
      if (stick) box.scrollTop = box.scrollHeight;
    } catch (e) { if (e.status === 403) { await loadInfo().catch(() => {}); apply(); } }
  }
  function startPoll() { poll(); pollTimer = setInterval(poll, 3000); }
  function stopPoll() { clearInterval(pollTimer); }
  async function send() {
    const body = $('#box').value.trim(); if (!body) return;
    $('#send').disabled = true;
    try { await call('/messages', { method: 'POST', body: { body } }); $('#box').value = ''; await poll(); }
    catch (e) { toast(e.message); }
    $('#send').disabled = false; $('#box').focus();
  }
  $('#send').onclick = send;
  $('#box').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  // ---------- video (LiveKit) ----------
  let room = null;
  const LK = window.LivekitClient;
  const stateText = { connected: 'Connected', connecting: 'Connecting…', reconnecting: 'Connection lost, reconnecting…', disconnected: 'Disconnected' };
  const setConn = (st) => { $('#conn').textContent = stateText[st] || st; };
  const updateWait = () => {
    const has = $('#remote').querySelector('video');
    $('#wait').classList.toggle('hidden', !!has);
    if (!has && room) $('#wait').textContent = `Waiting for the ${isStaff ? 'patient' : 'doctor'} to join…`;
  };
  function showJoin() {
    $('#vctl').innerHTML = '<button class="btn btn-primary btn-sm" id="join">Join video consultation</button>';
    $('#join').onclick = join; $('#remote').innerHTML = ''; $('#local').innerHTML = '';
    $('#wait').classList.remove('hidden'); $('#wait').textContent = 'Press “Join video consultation” to start.';
  }
  function leaveVideo() { if (room) { room.disconnect(); room = null; } }
  function controls() {
    $('#vctl').innerHTML = '<button class="btn btn-outline btn-sm" id="mic">Mute</button><button class="btn btn-outline btn-sm" id="cam">Turn camera off</button><button class="btn btn-danger btn-sm" id="leave">Leave consultation</button>';
    $('#mic').onclick = async () => { const on = room.localParticipant.isMicrophoneEnabled; await room.localParticipant.setMicrophoneEnabled(!on); $('#mic').textContent = on ? 'Unmute' : 'Mute'; };
    $('#cam').onclick = async () => { const on = room.localParticipant.isCameraEnabled; await room.localParticipant.setCameraEnabled(!on); $('#cam').textContent = on ? 'Turn camera on' : 'Turn camera off'; attachLocal(); };
    $('#leave').onclick = () => { leaveVideo(); showJoin(); setConn('disconnected'); };
  }
  function attachLocal() {
    const pub = room?.localParticipant.getTrackPublication(LK.Track.Source.Camera);
    $('#local').innerHTML = '';
    if (pub?.track && !pub.isMuted) { const el = pub.track.attach(); el.muted = true; $('#local').appendChild(el); }
  }
  async function join() {
    $('#join').disabled = true; setConn('connecting');
    try {
      const { url, token: lk } = await call('/video-token', { method: 'POST' });
      room = new LK.Room({ adaptiveStream: true, dynacast: true });
      const E = LK.RoomEvent;
      room.on(E.TrackSubscribed, (track) => {
        const el = track.attach();
        if (track.kind === 'video') $('#remote').replaceChildren(el); else $('#audio').appendChild(el);
        updateWait();
      });
      room.on(E.TrackUnsubscribed, (track) => { track.detach().forEach((el) => el.remove()); updateWait(); });
      room.on(E.ParticipantDisconnected, updateWait);
      room.on(E.ConnectionStateChanged, setConn);
      room.on(E.Disconnected, () => { room = null; showJoin(); setConn('disconnected'); });
      await room.connect(url, lk);
      try { await room.localParticipant.enableCameraAndMicrophone(); }
      catch { try { await room.localParticipant.setMicrophoneEnabled(true); toast('Camera unavailable. Joined with audio only.'); } catch { toast('Allow camera and microphone access in your browser, then rejoin.'); } }
      controls(); attachLocal(); updateWait(); setConn('connected');
    } catch (e) {
      room = null; showJoin(); setConn('disconnected'); toast(e.message || 'Could not join the video room.');
    }
  }
  $('#join').onclick = join;
  window.addEventListener('beforeunload', leaveVideo);
})();
