(function () {
  const API = window.SYD_CONFIG.API_BASE.replace(/\/$/, '');
  const FONTS = 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700;800&family=Source+Serif+4:wght@600&display=swap';
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONTS; document.head.appendChild(l);

  window.$ = (s, r = document) => r.querySelector(s);
  window.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.money = (c, cur) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD' }).format(c / 100);
  window.fmtDT = (iso) => (iso ? new Date(iso).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '—');
  window.durationLabel = (min) => {
    const f = (n, a, b) => `${n} ${n === 1 ? a : b}`;
    if (min % 10080 === 0) return f(min / 10080, 'Week', 'Weeks');
    if (min % 1440 === 0) return f(min / 1440, 'Day', 'Days');
    if (min % 60 === 0) return f(min / 60, 'Hour', 'Hours');
    return f(min, 'Minute', 'Minutes');
  };
  window.typeLabel = (t) => (t === 'chat' ? 'Chat with doctor' : 'Live video consultation');

  const store = {
    get() { try { return JSON.parse(sessionStorage.getItem('syd_staff')); } catch { return null; } },
    set(v) { sessionStorage.setItem('syd_staff', JSON.stringify(v)); },
    clear() { sessionStorage.removeItem('syd_staff'); }
  };
  window.staff = store;

  async function refresh() {
    const st = store.get();
    if (!st?.refresh_token) return false;
    try {
      const r = await fetch(API + '/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: st.refresh_token }) });
      if (!r.ok) return false;
      store.set(await r.json());
      return true;
    } catch { return false; }
  }

  window.api = async function (path, { method = 'GET', body, auth = false } = {}) {
    const go = () => {
      const headers = {};
      if (body) headers['Content-Type'] = 'application/json';
      const st = store.get();
      if (auth && st) headers.Authorization = 'Bearer ' + st.access_token;
      return fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    };
    let r;
    try { r = await go(); } catch { throw new Error('Could not reach the server. Check your connection and try again.'); }
    if (auth && r.status === 401 && (await refresh())) r = await go();
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (auth && r.status === 401) { store.clear(); location.href = 'login.html'; }
      const e = new Error(data.error || 'Something went wrong. Please try again.');
      e.status = r.status; e.code = data.code; e.details = data.details;
      throw e;
    }
    return data;
  };

  window.loadSite = async function (opts = {}) {
    const s = await api('/api/public/settings');
    document.title = `${s.site_name} — ${opts.title || 'Online Doctor Consultation'}`;
    const ic = document.createElement('link'); ic.rel = 'icon'; ic.href = 'assets/favicon.png'; document.head.appendChild(ic);
    const h = $('#site-header');
    if (h) h.innerHTML = `<div class="wrap ${opts.wide ? 'wide' : ''}"><a class="brand" href="index.html"><img src="assets/logo.png" alt=""><span>${esc(s.site_name.toUpperCase())}</span></a>${opts.nav || ''}</div>`;
    const f = $('#site-footer');
    if (f) {
      const links = [s.terms_url && `<a href="${esc(s.terms_url)}" rel="noopener">Terms</a>`, s.privacy_url && `<a href="${esc(s.privacy_url)}" rel="noopener">Privacy</a>`, s.contact_email && `<a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a>`].filter(Boolean).join(' &nbsp;·&nbsp; ');
      f.innerHTML = `<div class="wrap ${opts.wide ? 'wide' : ''}"><p>${esc(s.emergency_disclaimer)}</p>${links ? `<p>${links}</p>` : ''}</div>`;
    }
    return s;
  };

  window.toast = (m) => {
    const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = m;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2800);
  };
})();
