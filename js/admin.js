(async () => {
  const st = staff.get();
  if (!st || st.role !== 'admin') { location.href = 'login.html'; return; }
  await loadSite({ title: 'Admin', wide: true, nav: '<nav><button class="btn btn-outline btn-sm" id="out">Sign out</button></nav>' });
  $('#out').onclick = () => { staff.clear(); location.href = 'login.html'; };

  const A = (p, o = {}) => api('/api/admin' + p, { auth: true, ...o });
  const main = $('#main'), dlg = $('#modal'), dbody = $('#modal-body');
  const badge = (t) => `<span class="badge b-${esc(String(t).toLowerCase())}">${esc(t)}</span>`;
  const table = (cols, rows, empty = 'Nothing here yet.') => rows.length
    ? `<div class="tablewrap"><table><thead><tr>${cols.map((c) => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : `<p class="empty">${empty}</p>`;
  const kv = (rows) => `<table class="summary">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}</table>`;
  const openModal = (html) => { dbody.innerHTML = html + '<p style="margin-top:18px"><button class="btn btn-outline btn-sm" data-close>Close</button></p>'; if (!dlg.open) dlg.showModal(); };
  const closeModal = () => dlg.open && dlg.close();
  const toLocal = (iso) => { if (!iso) return ''; const d = new Date(iso); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const toISO = (v) => (v ? new Date(v).toISOString() : null);
  const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message); } };

  const TABS = [['overview', 'Overview'], ['bookings', 'Bookings'], ['packages', 'Consultation Packages'], ['payments', 'Payments'], ['contributions', 'Contributions'], ['doctors', 'Doctors'], ['settings', 'Website Settings']];
  $('#tabs').innerHTML = TABS.map(([id, l]) => `<button role="tab" data-tab="${id}">${l}</button>`).join('');
  let current = 'overview', cache = {};
  async function go(tab) {
    current = tab;
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    main.innerHTML = '<div class="spinner"></div>';
    try { await views[tab](); } catch (e) { main.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }

  const views = {
    async overview() {
      const [s, { settings }] = await Promise.all([A('/stats'), A('/settings')]);
      const t = [['TOTAL BOOKINGS', s.total_bookings], ['PAID BOOKINGS', s.paid_bookings], ['PENDING PAYMENTS', s.pending_payments], ['ACTIVE CONSULTATIONS', s.active_consultations], ['COMPLETED CONSULTATIONS', s.completed_consultations], ['TOTAL REVENUE', money(s.total_revenue_cents, s.currency)], ['TOTAL CONTRIBUTIONS', money(s.total_contributions_cents, s.currency)]];
      const open = settings.booking_open && !(settings.countdown_enabled && settings.countdown_target && new Date(settings.countdown_target) < new Date());
      main.innerHTML = `<div class="tiles">${t.map(([l, v]) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
        <h2 style="margin-top:28px">Booking availability</h2>
        ${kv([['Status', badge(open ? 'open' : 'closed')], ['Countdown', settings.countdown_enabled ? 'On' : 'Off'], ['Countdown expires', settings.countdown_target ? esc(fmtDT(settings.countdown_target)) : '—']])}
        <button class="btn btn-outline btn-sm" data-tab="settings">Change in Website Settings</button>`;
    },

    async bookings() {
      const { bookings } = await A('/bookings'); cache.bookings = bookings;
      const cols = [['Booking ID', (b) => esc(b.booking_code)], ['Patient', (b) => esc(b.patient_name)], ['Email', (b) => esc(b.email)], ['Phone', (b) => esc(b.phone || '')], ['Package', (b) => esc(b.package_name)], ['Duration', (b) => esc(b.duration_label)], ['Amount', (b) => money(b.amount_cents, b.currency)], ['Type', (b) => esc(b.consultation_type)], ['Date', (b) => esc(fmtDT(b.preferred_at))], ['Payment', (b) => badge(b.payment_status)], ['Consultation', (b) => badge(b.consultation_status)], ['Created', (b) => esc(fmtDT(b.created_at))], ['Actions', (b) => `<button class="btn btn-outline btn-sm" data-booking="${b.id}">Open</button>`]];
      main.innerHTML = `<div class="row" style="margin-bottom:14px"><div><label class="f" for="q">Search</label><input id="q" type="text" placeholder="Name, email or booking ID"></div><div><label class="f" for="ps">Payment status</label><select id="ps"><option value="">All</option><option>success</option><option>pending</option><option>failed</option><option>refunded</option></select></div></div><div id="tbl"></div>`;
      const draw = () => { const q = $('#q').value.toLowerCase(), ps = $('#ps').value; $('#tbl').innerHTML = table(cols, bookings.filter((b) => (!ps || b.payment_status === ps) && (!q || [b.patient_name, b.email, b.booking_code].join(' ').toLowerCase().includes(q))), 'No bookings match.'); };
      $('#q').oninput = draw; $('#ps').onchange = draw; draw();
    },

    async packages() {
      const [{ packages }, { settings }] = await Promise.all([A('/packages'), A('/settings')]); cache.packages = packages; cache.currency = settings.currency;
      main.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h2 style="margin:0">Consultation Packages</h2><button class="btn btn-primary btn-sm" data-pkg="new">Create package</button></div>` + table([['Name', (p) => esc(p.name)], ['Duration', (p) => esc(durationLabel(p.duration_minutes))], ['Price', (p) => money(p.price_cents, cache.currency || 'USD')], ['Description', (p) => esc(p.description)], ['Status', (p) => badge(p.active ? 'active' : 'disabled')], ['Actions', (p) => `<button class="btn btn-outline btn-sm" data-pkg="${p.id}">Edit</button> <button class="btn btn-outline btn-sm" data-toggle="${p.id}">${p.active ? 'Disable' : 'Enable'}</button> <button class="btn btn-danger btn-sm" data-delpkg="${p.id}">Delete</button>`]], packages);
    },

    async payments() {
      const { payments } = await A('/payments'); cache.payments = payments;
      main.innerHTML = '<h2>Payments</h2>' + table([['Transaction ID', (p) => esc(p.transaction_id || '—')], ['Booking ID', (p) => esc(p.booking_code)], ['Customer', (p) => esc(p.customer)], ['Amount', (p) => money(p.amount_cents, p.currency)], ['Method', (p) => esc(p.channel || '—')], ['Status', (p) => badge(p.status.toUpperCase() === 'SUCCESS' ? 'success' : p.status)], ['Paystack reference', (p) => esc(p.reference)], ['Date', (p) => esc(p.paid_at ? new Date(p.paid_at).toLocaleDateString() : new Date(p.created_at).toLocaleDateString())], ['Time', (p) => esc(new Date(p.paid_at || p.created_at).toLocaleTimeString())], ['Actions', (p) => `<button class="btn btn-outline btn-sm" data-payment="${p.id}">Details</button>`]], payments);
    },

    async contributions() {
      const d = await A('/contributions');
      main.innerHTML = `<h2>Contributions</h2><div class="tile" style="max-width:260px;margin-bottom:16px"><b>${money(d.total_cents, d.currency)}</b><span>Total contributions</span></div>` + table([['Contributor', (c) => esc(c.name || 'Anonymous')], ['Email', (c) => esc(c.email || '—')], ['Amount', (c) => money(c.amount_cents, c.currency)], ['Payment reference', (c) => esc(c.paystack_reference)], ['Status', (c) => badge(c.status)], ['Date', (c) => esc(fmtDT(c.paid_at || c.created_at))]], d.contributions);
    },

    async doctors() {
      const { doctors } = await A('/doctors'); cache.doctors = doctors;
      main.innerHTML = `<h2>Doctors</h2>` + table([['Name', (d) => esc(d.full_name)], ['Email', (d) => esc(d.email)], ['Status', (d) => badge(d.active ? 'active' : 'disabled')], ['Actions', (d) => `<button class="btn btn-outline btn-sm" data-doc="${d.id}" data-on="${d.active ? 0 : 1}">${d.active ? 'Disable' : 'Enable'}</button>`]], doctors) + `
        <h3 style="margin-top:28px">Add a doctor</h3><form class="card" id="docform" style="max-width:520px"><label class="f" for="dn">Full name</label><input id="dn" type="text" required><label class="f" for="de">Email</label><input id="de" type="email" required><label class="f" for="dp">Temporary password (10+ characters)</label><input id="dp" type="password" minlength="10" required autocomplete="new-password"><button class="btn btn-primary btn-sm" style="margin-top:16px">Create doctor account</button></form>`;
      $('#docform').onsubmit = guard(async (e) => { e.preventDefault(); await A('/doctors', { method: 'POST', body: { full_name: $('#dn').value, email: $('#de').value, password: $('#dp').value } }); toast('Doctor added'); go('doctors'); });
    },

    async settings() {
      const [{ settings: S }, { doctors }] = await Promise.all([A('/settings'), A('/doctors')]);
      const txt = (k, l, type = 'text') => `<label class="f" for="${k}">${l}</label><input id="${k}" type="${type}" value="${esc(S[k] || '')}">`;
      const area = (k, l) => `<label class="f" for="${k}">${l}</label><textarea id="${k}">${esc(S[k] || '')}</textarea>`;
      const ch = (v, l) => `<label class="check"><input type="checkbox" data-ch="${v}" ${S.payment_channels.includes(v) ? 'checked' : ''}><span>${l}</span></label>`;
      main.innerHTML = `<form id="sf" style="max-width:760px">
        <h2>Website</h2><div class="card">${txt('site_name', 'Website name')}${txt('doctor_name', 'Doctor name')}${txt('doctor_photo_url', 'Doctor photo (image link)', 'url')}${area('doctor_description', 'Doctor description')}${txt('contact_email', 'Contact email', 'email')}${area('emergency_disclaimer', 'Emergency disclaimer')}${txt('terms_url', 'Terms link', 'url')}${txt('privacy_url', 'Privacy link', 'url')}
        <label class="f" for="default_doctor_id">Default doctor for new bookings</label><select id="default_doctor_id"><option value="">First active doctor</option>${doctors.filter((d) => d.active).map((d) => `<option value="${d.id}" ${S.default_doctor_id === d.id ? 'selected' : ''}>${esc(d.full_name)}</option>`).join('')}</select></div>
        <h2 style="margin-top:28px">Booking availability and countdown</h2><div class="card">
        <label class="check"><input type="checkbox" id="booking_open" ${S.booking_open ? 'checked' : ''}><span>Bookings are open (untick to pause or close bookings)</span></label>
        <div class="grid2"><div><label class="f" for="booking_start">Booking start date</label><input id="booking_start" type="datetime-local" value="${toLocal(S.booking_start)}"></div><div><label class="f" for="booking_end">Booking end date</label><input id="booking_end" type="datetime-local" value="${toLocal(S.booking_end)}"></div></div>
        <label class="check" style="margin-top:18px"><input type="checkbox" id="countdown_enabled" ${S.countdown_enabled ? 'checked' : ''}><span>Show countdown on the homepage. When it reaches zero, booking closes automatically until you extend it.</span></label>
        <label class="f" for="countdown_target">Countdown ends at</label><input id="countdown_target" type="datetime-local" value="${toLocal(S.countdown_target)}">
        <div class="row" style="margin-top:10px"><div><label class="f" for="cd_days">Or set it to end in (days)</label><input id="cd_days" type="number" min="0" value="3"></div><div><label class="f" for="cd_hours">and hours</label><input id="cd_hours" type="number" min="0" value="0"></div><div><button type="button" class="btn btn-outline btn-sm" id="cd_set">Set from now</button></div></div>
        <p class="muted" id="cd_info" style="margin:10px 0 0"></p></div>
        <h2 style="margin-top:28px">Payments and support</h2><div class="card">
        <label class="f" for="currency">Currency (must be enabled on your Paystack account)</label><select id="currency"><option ${S.currency === 'USD' ? 'selected' : ''}>USD</option><option ${S.currency === 'KES' ? 'selected' : ''}>KES</option></select>
        <label class="f">Payment methods shown at checkout</label>${ch('card', 'Card')}${ch('apple_pay', 'Apple Pay (activate it on your Paystack dashboard first)')}${ch('mobile_money', 'Mobile money')}${ch('bank_transfer', 'Bank transfer')}
        <label class="check"><input type="checkbox" id="contributions_enabled" ${S.contributions_enabled ? 'checked' : ''}><span>Accept contributions</span></label>
        <label class="f" for="min">Minimum contribution</label><input id="min" type="number" min="1" step="0.01" value="${(S.contribution_min_cents / 100).toFixed(2)}">
        ${txt('support_heading', 'Support page heading')}${area('support_text', 'Support page text')}</div>
        <button class="btn btn-primary" style="margin-top:22px">SAVE SETTINGS</button></form>`;
      main.insertAdjacentHTML('beforeend', `<h2 style="margin-top:28px">Email</h2><div class="card" style="max-width:760px"><p class="muted" style="margin-top:0">Send yourself a test to check that patient emails are set up.</p><label class="f" for="te">Send test email to</label><input id="te" type="email" value="${esc(S.contact_email || '')}"><button type="button" class="btn btn-outline btn-sm" style="margin-top:12px" id="tebtn">Send test email</button><p class="muted" id="teout" style="margin-bottom:0"></p></div>`);
      $('#tebtn').onclick = guard(async () => {
        const to = $('#te').value.trim(); if (!to) return toast('Enter an email address first');
        $('#teout').textContent = 'Sending…';
        const r = await A('/test-email', { method: 'POST', body: { to } });
        $('#teout').textContent = r.ok ? 'Sent. Check the inbox, and the spam folder too.' : `Not sent (${r.status}): ${r.error || 'unknown error'}`;
      });
      const info = () => { const v = $('#countdown_target').value; $('#cd_info').textContent = v ? (new Date(v) > new Date() ? `Countdown expires ${fmtDT(toISO(v))}.` : 'This time has passed, so booking is closed.') : 'No countdown time set.'; };
      $('#countdown_target').oninput = info; info();
      $('#cd_set').onclick = () => { const ms = (Number($('#cd_days').value) * 24 + Number($('#cd_hours').value)) * 3600e3; $('#countdown_target').value = toLocal(new Date(Date.now() + ms).toISOString()); $('#countdown_enabled').checked = true; info(); };
      $('#sf').onsubmit = guard(async (e) => {
        e.preventDefault();
        const v = (k) => $('#' + k).value.trim();
        const body = { site_name: v('site_name'), doctor_name: v('doctor_name'), doctor_photo_url: v('doctor_photo_url'), doctor_description: v('doctor_description'), contact_email: v('contact_email'), emergency_disclaimer: v('emergency_disclaimer'), terms_url: v('terms_url'), privacy_url: v('privacy_url'), default_doctor_id: $('#default_doctor_id').value || null, booking_open: $('#booking_open').checked, booking_start: toISO($('#booking_start').value), booking_end: toISO($('#booking_end').value), countdown_enabled: $('#countdown_enabled').checked, countdown_target: toISO($('#countdown_target').value), currency: $('#currency').value, payment_channels: [...document.querySelectorAll('[data-ch]:checked')].map((x) => x.dataset.ch), contributions_enabled: $('#contributions_enabled').checked, contribution_min_cents: Math.round(Number($('#min').value) * 100), support_heading: v('support_heading'), support_text: v('support_text') };
        try { await A('/settings', { method: 'PUT', body }); toast('Settings saved'); } catch (er) { toast(er.details?.map((d) => `${d.field}: ${d.message}`).join('. ') || er.message); }
      });
    }
  };

  // ---------- modals and actions ----------
  const bookingModal = guard(async (id) => {
    const { booking: b, room } = await A('/bookings/' + id);
    const pay = (b.payments || [])[0];
    let html = `<h3>Booking ${esc(b.booking_code)}</h3>` + kv([['Patient', esc(b.users.full_name)], ['Email', esc(b.users.email)], ['Phone', esc(b.users.phone || '—')], ['Country', esc(b.users.country || '—')], ['Package', `${esc(b.package_name)} (${esc(b.duration_label)})`], ['Amount', money(b.amount_cents, b.currency)], ['Type', esc(b.consultation_type)], ['Preferred time', esc(fmtDT(b.preferred_at))], ['Patient timezone', esc(b.timezone || '—')], ['Payment', badge(b.payment_status)], ['Paystack reference', esc(pay?.paystack_reference || '—')], ['Access code', esc(b.access_code || '—')], ['Notes', esc(b.notes || '—')], ['Created', esc(fmtDT(b.created_at))]]);
    if (room) {
      const link = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}consult.html?t=${room.access_token}`;
      html += `<h3 style="margin-top:18px">Consultation</h3>` + kv([['Status', badge(room.status)], ['Starts', esc(fmtDT(room.starts_at))], ['Access expires', esc(fmtDT(room.expires_at))], ['Doctor', esc(room.doctor_name || 'Unassigned')]]) +
        `<div class="row"><div><label class="f" for="ext">Extend access (hours)</label><input id="ext" type="number" min="1" value="24"></div><div><button class="btn btn-outline btn-sm" data-extend="${room.id}">Extend</button></div></div>
        <div class="row" style="margin-top:12px"><div><label class="f" for="rdoc">Assign doctor</label><select id="rdoc"><option value="">Unassigned</option>${(cache.doctors || (cache.doctors = (await A('/doctors')).doctors)).map((d) => `<option value="${d.id}" ${room.doctor_id === d.id ? 'selected' : ''}>${esc(d.full_name)}</option>`).join('')}</select></div><div><button class="btn btn-outline btn-sm" data-assign="${room.id}">Save doctor</button></div></div>
        <p style="margin-top:14px"><button class="btn ${room.terminated ? 'btn-outline' : 'btn-danger'} btn-sm" data-term="${room.id}" data-val="${room.terminated ? 0 : 1}">${room.terminated ? 'Reopen access' : 'Terminate access'}</button> <button class="btn btn-outline btn-sm" data-copy="${esc(link)}">Copy patient link</button> <a class="btn btn-outline btn-sm" href="consult.html?room=${room.id}">Open as staff</a></p>`;
    }
    openModal(html);
  });

  const pkgModal = (id) => {
    const p = id === 'new' ? { name: '', duration_minutes: 240, price_cents: 5000, description: '', active: true, sort_order: 0 } : cache.packages.find((x) => x.id === id);
    const unit = p.duration_minutes % 10080 === 0 ? 10080 : p.duration_minutes % 1440 === 0 ? 1440 : p.duration_minutes % 60 === 0 ? 60 : 1;
    openModal(`<h3>${id === 'new' ? 'Create package' : 'Edit package'}</h3><form id="pf"><label class="f" for="pn">Package name</label><input id="pn" type="text" value="${esc(p.name)}" required>
      <div class="grid2"><div><label class="f" for="pd">Duration</label><input id="pd" type="number" min="1" value="${p.duration_minutes / unit}" required></div><div><label class="f" for="pu">Unit</label><select id="pu">${[[1, 'Minutes'], [60, 'Hours'], [1440, 'Days'], [10080, 'Weeks']].map(([m, l]) => `<option value="${m}" ${m === unit ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <label class="f" for="pp">Price</label><input id="pp" type="number" min="0.01" step="0.01" value="${(p.price_cents / 100).toFixed(2)}" required>
      <label class="f" for="pdesc">Description</label><textarea id="pdesc">${esc(p.description)}</textarea>
      <label class="check"><input type="checkbox" id="pa" ${p.active ? 'checked' : ''}><span>Available to book</span></label>
      <button class="btn btn-primary btn-sm">Save package</button></form>`);
    $('#pf').onsubmit = guard(async (e) => {
      e.preventDefault();
      const body = { name: $('#pn').value.trim(), duration_minutes: Math.round(Number($('#pd').value) * Number($('#pu').value)), price_cents: Math.round(Number($('#pp').value) * 100), description: $('#pdesc').value.trim(), active: $('#pa').checked };
      await A(id === 'new' ? '/packages' : '/packages/' + id, { method: id === 'new' ? 'POST' : 'PATCH', body });
      closeModal(); toast('Package saved'); go('packages');
    });
  };

  const paymentModal = (id) => {
    const p = cache.payments.find((x) => x.id === id);
    openModal(`<h3>Payment details</h3>` + kv([['Transaction ID', esc(p.transaction_id || '—')], ['Paystack reference', esc(p.reference)], ['Booking ID', esc(p.booking_code)], ['Customer', `${esc(p.customer)} (${esc(p.email)})`], ['Amount', money(p.amount_cents, p.currency)], ['Method', esc(p.channel || '—')], ['Status', badge(p.status)], ['Paid at', esc(fmtDT(p.paid_at))], ['Created', esc(fmtDT(p.created_at))]]) + (p.status === 'success' ? `<button class="btn btn-danger btn-sm" data-refund="${p.id}">Refund payment</button>` : ''));
  };

  document.addEventListener('click', guard(async (e) => {
    const t = e.target.closest('button,a'); if (!t) return;
    const d = t.dataset;
    if (d.tab) return go(d.tab);
    if (d.close !== undefined) return closeModal();
    if (d.booking) return bookingModal(d.booking);
    if (d.pkg) return pkgModal(d.pkg);
    if (d.payment) return paymentModal(d.payment);
    if (d.toggle) { const p = cache.packages.find((x) => x.id === d.toggle); await A('/packages/' + d.toggle, { method: 'PATCH', body: { active: !p.active } }); return go('packages'); }
    if (d.delpkg) { if (confirm('Delete this package? Existing bookings keep their details.')) { await A('/packages/' + d.delpkg, { method: 'DELETE' }); go('packages'); } return; }
    if (d.doc) { await A('/doctors/' + d.doc, { method: 'PATCH', body: { active: d.on === '1' } }); return go('doctors'); }
    if (d.extend) { await A(`/rooms/${d.extend}/extend`, { method: 'POST', body: { minutes: Math.round(Number($('#ext').value) * 60) } }); toast('Access extended'); closeModal(); return go(current); }
    if (d.assign) { await A(`/rooms/${d.assign}/doctor`, { method: 'POST', body: { doctor_id: $('#rdoc').value || null } }); toast('Doctor assigned'); return; }
    if (d.term) { await A(`/rooms/${d.term}/terminate`, { method: 'POST', body: { terminated: d.val === '1' } }); toast('Access updated'); closeModal(); return go(current); }
    if (d.copy) { await navigator.clipboard.writeText(d.copy); return toast('Link copied'); }
    if (d.refund) { if (confirm('Refund this payment through Paystack? The consultation will be closed.')) { await A(`/payments/${d.refund}/refund`, { method: 'POST' }); toast('Refund requested'); closeModal(); go('payments'); } return; }
  }));

  go('overview');
})();
