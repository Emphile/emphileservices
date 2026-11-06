/* Emphile back office: shared framework (auth guard, layout, generic list/edit engine, print view) */
(function () {
  const db = window.EmphileDB;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '£' + Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fdate = d => d ? new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
  const todayISO = () => new Date().toISOString().slice(0, 10);

  const NAV = [
    ['index.html', 'Dashboard'], ['crm.html', 'CRM'], ['jobs.html', 'Jobs & billing'],
    ['inspections.html', 'Inspections'], ['staff.html', 'Staff & finance'], ['settings.html', 'Settings'],
  ];

  function notice(title, text) {
    document.body.innerHTML = `<div class="center"><div class="login"><h1>${esc(title)}</h1><p class="muted">${text}</p><a class="btn" href="login.html">Back to sign in</a></div></div>`;
  }

  async function guard() {
    if (!db || !db.configured) {
      document.body.innerHTML = '<div class="center"><div class="login"><h1>Not connected</h1><p class="muted">Add your Firebase settings to <b>config.js</b> in the site root, then reload.</p></div></div>';
      return null;
    }
    const user = await db.user();
    if (!user) { location.href = 'login.html'; return null; }
    const chk = await db.checkAdmin(user.uid);
    if (!chk.ok) {
      await db.signOut();
      const why = chk.reason === 'missing'
        ? 'No document was found in the <b>admins</b> collection with this exact ID.'
        : 'Firestore refused the lookup (' + esc(chk.reason) + '). Check that the database exists and the rules from firestore.rules are published.';
      notice('No access', `${why}<br><br>Signed in as ${esc(user.email)}.<br>Your User UID is:<br><b style="word-break:break-all;user-select:all">${esc(user.uid)}</b><br><br>In Firestore, the <b>admins</b> document ID must be exactly this, with a field <b>isAdmin</b> = true. See SETUP.md, step 5.`);
      return null;
    }
    return { user };
  }

  function shell(active, title, session) {
    document.getElementById('app').innerHTML = `
      <div class="layout">
        <aside>
          <a class="brand" href="index.html" aria-label="Emphile dashboard"><img src="../assets/logo.png" alt="Emphile Engineering Services"></a>
          ${NAV.map(([h, l]) => `<a class="n ${h === active ? 'on' : ''}" href="${h}">${l}</a>`).join('')}
          <div class="sp"></div>
          <a class="n" href="../index.html">View website</a>
          <div class="who">${esc(session.user.email)}</div>
          <button class="btn sm" id="out">Sign out</button>
        </aside>
        <main><div class="top"><h1>${esc(title)}</h1></div><div id="content"></div></main>
      </div>`;
    document.getElementById('out').onclick = async () => { await db.signOut(); location.href = 'login.html'; };
    return document.getElementById('content');
  }

  async function nextNumber(table, key, prefix) {
    const data = await db.list(table);
    let max = 0;
    data.forEach(r => { const m = String(r[key] || '').match(/(\d+)$/); if (m) max = Math.max(max, +m[1]); });
    return prefix + String(max + 1).padStart(4, '0');
  }

  const docTotals = row => {
    const sub = (row.items || []).reduce((s, i) => s + (+i.q || 0) * (+i.p || 0), 0);
    const vat = sub * (+row.vat_rate || 0) / 100;
    return { sub, vat, total: sub + vat };
  };

  async function getSettings() {
    const s = {}; (await db.list('settings')).forEach(r => { s[r.id] = r.value; });
    return s;
  }

  /* ---------- Receipt capture: photo -> small saved copy + OCR (runs in the browser; the photo is not sent to any service) ---------- */
  const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const loaded = {};
  const loadScript = src => new Promise((res, rej) => {
    if (loaded[src]) return res();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { loaded[src] = true; res(); };
    s.onerror = () => rej(new Error('Could not load the receipt reader. Check your internet connection.'));
    document.head.appendChild(s);
  });

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const CATEGORIES = [
    ['Vehicle & fuel', /\b(shell|bp|esso|texaco|jet|gulf|petrol|diesel|unleaded|fuel|halfords|parking|ringgo|toll|dart charge)\b/],
    ['Materials', /\b(screwfix|toolstation|wickes|b&q|b & q|cef|city electrical|rexel|travis perkins|jewson|electrical wholesale|cable|conduit|trunking|breaker|consumer unit)\b/],
    ['Tools & equipment', /\b(tool|drill|hilti|dewalt|makita|milwaukee|fluke|megger|ladder|ppe|safety boots|workwear)\b/],
    ['Insurance', /\b(insurance|premium|aviva|axa|zurich|hiscox)\b/],
    ['Software', /\b(subscription|licen[cs]e|software|google|microsoft|adobe|zoom|xero|quickbooks)\b/],
    ['Training & certification', /\b(training|course|exam|niceic|napit|city & guilds|certificate)\b/],
    ['Office', /\b(stationery|paper|toner|ink|staples|post office|royal mail|printing)\b/],
  ];
  const pad2 = n => String(n).padStart(2, '0');
  const isoOk = (y, m, d) => {
    if (y < 100) y += 2000;
    if (y < 2000 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1) return null;
    if (dt > new Date(Date.now() + 864e5)) return null;
    return y + '-' + pad2(m) + '-' + pad2(d);
  };

  function parseReceipt(text) {
    const lines = String(text || '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const out = { date: null, amount: null, supplier: null, category: null };

    // amount: prefer a "total" line, otherwise the largest money value on the receipt
    const amtRe = /(\d{1,3}(?:,\d{3})+|\d+)[.,](\d{2})\b/g;
    const amounts = l => [...l.matchAll(amtRe)].map(m => parseFloat(m[1].replace(/,/g, '') + '.' + m[2]));
    const totalWord = /\b(grand total|total due|total to pay|amount due|balance due|to pay|total|amount paid|card payment|paid by card)\b/i;
    const skipWord = /sub\s*-?\s*total|\bvat\b|\btax\b|saving|change|cash tendered|points/i;
    let best = null;
    lines.forEach((l, i) => {
      if (!totalWord.test(l) || skipWord.test(l)) return;
      let v = amounts(l);
      if (!v.length && lines[i + 1]) v = amounts(lines[i + 1]);
      v.forEach(x => { if (best === null || x > best) best = x; });
    });
    if (best === null) lines.forEach(l => { if (!/change|cash/i.test(l)) amounts(l).forEach(x => { if (best === null || x > best) best = x; }); });
    out.amount = best;

    // date (UK day-first)
    for (const l of lines) {
      let m = l.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if (m) { out.date = isoOk(+m[1], +m[2], +m[3]); if (out.date) break; }
      m = l.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})\b/);
      if (m) { out.date = isoOk(+m[3], +m[2], +m[1]) || isoOk(+m[3], +m[1], +m[2]); if (out.date) break; }
      m = l.match(/\b(\d{1,2})(?:st|nd|rd|th)?[ \-]([A-Za-z]{3,9})[ ,.\-]+(\d{4}|\d{2})\b/);
      if (m && MONTHS[m[2].slice(0, m[2].toLowerCase().startsWith('sept') ? 4 : 3).toLowerCase()]) {
        out.date = isoOk(+m[3], MONTHS[m[2].slice(0, m[2].toLowerCase().startsWith('sept') ? 4 : 3).toLowerCase()], +m[1]);
        if (out.date) break;
      }
    }

    // supplier: first line near the top that reads like a name
    const skipTop = /^(receipt|tax invoice|invoice|welcome|thank|vat|tel|phone|www|http|customer copy|duplicate|copy|order|table|date|time)/i;
    for (const l of lines.slice(0, 7)) {
      const letters = (l.match(/[A-Za-z]/g) || []).length;
      if (letters < 3 || letters < l.replace(/\s/g, '').length * 0.5 || skipTop.test(l)) continue;
      let name = l.replace(/^[^A-Za-z0-9&]+|[^A-Za-z0-9&.)]+$/g, '');
      if (name === name.toUpperCase()) name = name.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
      out.supplier = name.slice(0, 80);
      break;
    }

    const lower = String(text || '').toLowerCase();
    for (const [cat, re] of CATEGORIES) if (re.test(lower)) { out.category = cat; break; }
    return out;
  }

  const scaled = (bmp, max, filter) => {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const x = c.getContext('2d');
    if (filter) x.filter = filter;
    x.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  };

  const receiptHtml = (id, v) => `<div class="receipt" id="${id}" data-value="${esc(v || '')}">
    <label class="btn" for="${id}_file">&#128247; Take a photo or choose an image</label>
    <input id="${id}_file" type="file" accept="image/*" capture="environment" hidden>
    <div class="rcstat muted"></div><img class="rcimg" alt="Receipt photo" hidden></div>`;

  function wireReceipt(rc, dlg) {
    const input = rc.querySelector('input[type=file]'), stat = rc.querySelector('.rcstat'), img = rc.querySelector('.rcimg');
    const show = url => { if (url) { img.src = url; img.hidden = false; } };
    show(rc.dataset.value);
    const fill = (key, val) => {
      const n = dlg.querySelector('#f_' + key);
      if (!n || !val) return false;
      n.value = val; n.classList.add('autofilled');
      n.addEventListener('input', () => n.classList.remove('autofilled'), { once: true });
      return true;
    };
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      try {
        stat.textContent = 'Preparing the photo...';
        const bmp = await createImageBitmap(file);
        const small = scaled(bmp, 1000).toDataURL('image/jpeg', 0.68);
        rc.dataset.value = small; show(small);
        stat.textContent = 'Loading the receipt reader (the first time takes a few seconds)...';
        await loadScript(TESS);
        const { data } = await Tesseract.recognize(scaled(bmp, 2000, 'grayscale(1) contrast(1.3)'), 'eng', {
          logger: m => { if (m.status === 'recognizing text') stat.textContent = 'Reading the receipt... ' + Math.round(m.progress * 100) + '%'; },
        });
        const got = parseReceipt(data.text);
        const found = [];
        if (fill('expense_date', got.date)) found.push('date');
        if (fill('amount', got.amount != null ? got.amount.toFixed(2) : '')) found.push('amount');
        if (fill('supplier', got.supplier)) found.push('supplier');
        if (fill('category', got.category)) found.push('category');
        stat.textContent = found.length
          ? 'Read from the receipt: ' + found.join(', ') + '. Please check these before saving.'
          : 'Could not read details from this photo. Try a flatter, brighter photo, or type them in.';
      } catch (e) {
        stat.textContent = (e && e.message ? e.message : 'Could not read this image.') + ' You can still type the details in.';
      }
    };
  }

  /* ---------- Generic resource view ---------- */
  async function mountResource(el, cfg) {
    let rows = [], ctx = {};
    const lookups = {};
    const lookupFields = cfg.fields.filter(f => f.lookup);
    const labelOf = (f, id) => {
      const r = (lookups[f.lookup.table] || []).find(x => x.id === id);
      if (!r) return '';
      return typeof f.lookup.label === 'function' ? f.lookup.label(r) : r[f.lookup.label];
    };

    async function load() {
      try {
        for (const t of [...new Set(lookupFields.map(f => f.lookup.table))]) lookups[t] = await db.list(t);
        rows = await db.list(cfg.table, { order: cfg.order || 'created_at', asc: !!cfg.asc });
      } catch (error) {
        el.innerHTML = `<div class="msg">${esc(error.message)} (have the rules in firestore.rules been published?)</div>`; return;
      }
      ctx = cfg.preload ? await cfg.preload() : {};
      draw();
    }

    function cell(col, r) {
      if (col.render) return col.render(r, ctx);
      const f = cfg.fields.find(x => x.key === col.key) || {};
      const v = r[col.key];
      if (f.lookup) return esc(labelOf(f, v));
      if (f.type === 'date') return esc(fdate(v));
      if (f.type === 'money') return v == null ? '' : money(v);
      if (f.type === 'checkbox') return v ? 'Yes' : 'No';
      if (col.pill) return v ? `<span class="pill ${(col.pill[v] || '')}">${esc(v)}</span>` : '';
      return esc(v);
    }

    function draw() {
      const q = (el.querySelector('.q')?.value || '').toLowerCase();
      const fv = el.querySelector('.flt')?.value || '';
      const shown = rows.filter(r => {
        if (fv && r[cfg.filter.key] !== fv) return false;
        if (!q) return true;
        return JSON.stringify(cfg.columns.map(c => cell(c, r))).toLowerCase().includes(q) ||
          Object.entries(r).some(([k, v]) => k !== 'receipt' && typeof v === 'string' && v.toLowerCase().includes(q));
      });
      el.innerHTML = `
        <div class="bar">
          <input class="q grow" type="search" placeholder="Search ${esc(cfg.title.toLowerCase())}" value="${esc(q)}" aria-label="Search">
          ${cfg.filter ? `<select class="flt" aria-label="Filter"><option value="">All ${esc(cfg.filter.label)}</option>${cfg.filter.options.map(o => `<option ${o === fv ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}
          <button class="btn y add">+ Add ${esc(cfg.single)}</button>
        </div>
        <div class="tw">${shown.length ? `<table><thead><tr>${cfg.columns.map(c => `<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead><tbody>
          ${shown.map(r => `<tr data-id="${r.id}">${cfg.columns.map(c => `<td>${cell(c, r)}</td>`).join('')}
            <td class="act">${(cfg.actions || []).map((a, i) => `<button class="btn sm" data-a="${i}">${esc(a.label)}</button>`).join('')}
            <button class="btn sm" data-e>Edit</button><button class="btn sm d" data-d>Delete</button></td></tr>`).join('')}
          </tbody></table>` : `<div class="empty">No ${esc(cfg.title.toLowerCase())} yet.</div>`}</div>`;
      const qi = el.querySelector('.q');
      qi.oninput = () => { const pos = qi.selectionStart; draw(); const n = el.querySelector('.q'); n.focus(); n.setSelectionRange(pos, pos); };
      const fl = el.querySelector('.flt'); if (fl) fl.onchange = draw;
      el.querySelector('.add').onclick = () => form(null);
      el.querySelectorAll('[data-rcv]').forEach(b => b.onclick = () => {
        const r = rows.find(x => x.id === b.dataset.rcv), w = window.open('');
        if (w && r) { w.document.write('<title>Receipt</title><body style="margin:0;background:#222"><img src="' + r.receipt + '" style="display:block;max-width:100%;margin:auto">'); w.document.close(); }
      });
      el.querySelectorAll('tr[data-id]').forEach(tr => {
        const r = rows.find(x => x.id === tr.dataset.id);
        tr.querySelector('[data-e]').onclick = () => form(r);
        tr.querySelector('[data-d]').onclick = async () => {
          if (!confirm(`Delete this ${cfg.single.toLowerCase()}? This cannot be undone.`)) return;
          try { if (cfg.onDelete) await cfg.onDelete(r); await db.remove(cfg.table, r.id); load(); } catch (error) { alert(error.message); }
        };
        tr.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
          b.disabled = true;
          try { await cfg.actions[+b.dataset.a].run(r, { ctx, lookups, reload: load }); } catch (e) { alert(e.message); }
          b.disabled = false;
        });
      });
    }

    function inputFor(f, v) {
      const id = 'f_' + f.key, req = f.required ? 'required' : '';
      if (f.type === 'receipt') return receiptHtml(id, v);
      if (f.type === 'textarea') return `<textarea id="${id}" ${req}>${esc(v)}</textarea>`;
      if (f.type === 'checkbox') return `<select id="${id}"><option value="true" ${v !== false ? 'selected' : ''}>Yes</option><option value="false" ${v === false ? 'selected' : ''}>No</option></select>`;
      if (f.type === 'select') return `<select id="${id}" ${req}><option value=""></option>${f.options.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      if (f.lookup) return `<select id="${id}" ${req}><option value=""></option>${(lookups[f.lookup.table] || []).filter(r => !f.lookup.where || f.lookup.where(r)).map(r => `<option value="${r.id}" ${r.id === v ? 'selected' : ''}>${esc(typeof f.lookup.label === 'function' ? f.lookup.label(r) : r[f.lookup.label])}</option>`).join('')}</select>`;
      if (f.type === 'lines') {
        const items = Array.isArray(v) && v.length ? v : [{ d: '', q: 1, p: '' }];
        return `<div class="lines" id="${id}">${items.map(lineRow).join('')}<button type="button" class="btn sm" data-addline>+ Add line</button><div class="tot"></div></div>`;
      }
      const t = f.type === 'money' ? 'number' : (f.type || 'text');
      return `<input id="${id}" type="${t}" ${f.type === 'money' || f.type === 'number' ? 'step="0.01"' : ''} value="${esc(v)}" ${req}>`;
    }
    const lineRow = i => `<div class="row"><input data-d placeholder="Description" value="${esc(i.d)}"><input data-q type="number" step="0.01" placeholder="Qty" value="${esc(i.q)}"><input data-p type="number" step="0.01" placeholder="Unit £" value="${esc(i.p)}"><button type="button" class="btn sm d" data-rm aria-label="Remove line">×</button></div>`;

    async function form(row) {
      const rec = row ? { ...row } : {};
      if (!row) {
        for (const f of cfg.fields) if (f.default !== undefined) rec[f.key] = typeof f.default === 'function' ? f.default() : f.default;
        if (cfg.autoNumber) rec[cfg.autoNumber.key] = await nextNumber(cfg.table, cfg.autoNumber.key, cfg.autoNumber.prefix);
      }
      const dlg = document.createElement('dialog');
      dlg.innerHTML = `<form method="dialog" novalidate><h2>${row ? 'Edit' : 'Add'} ${esc(cfg.single)}</h2><div class="msg" hidden></div>
        <div class="fgrid">${cfg.fields.map(f => `<div class="${f.full || f.type === 'textarea' || f.type === 'lines' || f.type === 'receipt' ? 'full' : ''}"><label for="f_${f.key}">${esc(f.label)}${f.required ? ' *' : ''}</label>${inputFor(f, rec[f.key])}</div>`).join('')}</div>
        <div class="dfoot"><button type="button" class="btn" data-x>Cancel</button><button class="btn y" type="submit">Save</button></div></form>`;
      document.body.appendChild(dlg);
      dlg.showModal();
      const rcBox = dlg.querySelector('.receipt');
      if (rcBox) wireReceipt(rcBox, dlg);
      const msg = dlg.querySelector('.msg');
      const lines = dlg.querySelector('.lines');
      if (lines) {
        const retotal = () => {
          const items = [...lines.querySelectorAll('.row')].map(r => ({ q: r.querySelector('[data-q]').value, p: r.querySelector('[data-p]').value }));
          lines.querySelector('.tot').textContent = 'Subtotal ' + money(items.reduce((s, i) => s + (+i.q || 0) * (+i.p || 0), 0));
        };
        lines.addEventListener('input', retotal);
        lines.addEventListener('click', e => {
          if (e.target.matches('[data-addline]')) { e.target.insertAdjacentHTML('beforebegin', lineRow({ d: '', q: 1, p: '' })); }
          if (e.target.matches('[data-rm]') && lines.querySelectorAll('.row').length > 1) { e.target.closest('.row').remove(); retotal(); }
        });
        retotal();
      }
      dlg.querySelector('[data-x]').onclick = () => { dlg.close(); dlg.remove(); };
      dlg.querySelector('form').onsubmit = async e => {
        e.preventDefault();
        const out = {};
        for (const f of cfg.fields) {
          const node = dlg.querySelector('#f_' + f.key);
          if (f.type === 'receipt') { out[f.key] = node.dataset.value || null; continue; }
          if (f.type === 'lines') {
            out[f.key] = [...node.querySelectorAll('.row')].map(r => ({ d: r.querySelector('[data-d]').value.trim(), q: +r.querySelector('[data-q]').value || 0, p: +r.querySelector('[data-p]').value || 0 })).filter(i => i.d || i.p);
          } else if (f.type === 'checkbox') out[f.key] = node.value === 'true';
          else if (f.type === 'number' || f.type === 'money') out[f.key] = node.value === '' ? null : +node.value;
          else out[f.key] = node.value.trim() === '' ? null : node.value.trim();
          if (f.required && (out[f.key] === null || out[f.key] === '')) { msg.hidden = false; msg.textContent = f.label + ' is required.'; node.focus(); return; }
        }
        try { if (row) await db.update(cfg.table, row.id, out); else await db.add(cfg.table, out); }
        catch (error) { msg.hidden = false; msg.textContent = error.message; return; }
        dlg.close(); dlg.remove(); load();
      };
    }

    await load();
    return { reload: load };
  }

  function tabs(el, defs) {
    el.innerHTML = `<div class="tabs" role="tablist">${defs.map((d, i) => `<button role="tab" data-i="${i}">${esc(d.title)}</button>`).join('')}</div><div class="pane"></div>`;
    const pane = el.querySelector('.pane');
    const show = i => {
      el.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
      pane.innerHTML = ''; mountResource(pane, defs[i]);
    };
    el.querySelectorAll('.tabs button').forEach(b => b.onclick = () => show(+b.dataset.i));
    show(0);
  }

  /* ---------- Print view for quotes / invoices ---------- */
  async function printDoc(kind, row, lookups) {
    const s = await getSettings();
    const client = (lookups.clients || []).find(c => c.id === row.client_id) || {};
    const t = docTotals(row);
    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups to print.'); return; }
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(kind)} ${esc(row.number)}</title>
<style>body{font:14px/1.5 Arial,sans-serif;color:#111;margin:40px;max-width:780px}h1{margin:0;font-size:26px}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}td.r,th.r{text-align:right}.top{display:flex;justify-content:space-between;gap:20px}.tot{margin-left:auto;width:260px}.tot div{display:flex;justify-content:space-between;padding:4px 0}.b{font-weight:bold;border-top:2px solid #111;margin-top:4px;padding-top:8px}.m{color:#555;white-space:pre-line}</style>
<div class="top"><div><h1>${esc(s.business_name || 'Emphile Engineering Services Ltd')}</h1><div class="m">${esc(s.business_address || '')}${s.vat_number ? '\nVAT no. ' + esc(s.vat_number) : ''}</div></div>
<div style="text-align:right"><h1 style="text-transform:uppercase">${esc(kind)}</h1><div>No. ${esc(row.number)}<br>Date: ${esc(fdate(row.issue_date))}${row.due_date ? '<br>Due: ' + esc(fdate(row.due_date)) : ''}${row.valid_until ? '<br>Valid until: ' + esc(fdate(row.valid_until)) : ''}</div></div></div>
<p style="margin-top:28px"><b>${esc(client.name || '')}</b><br><span class="m">${esc(client.address || '')}</span></p>
<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Amount</th></tr></thead><tbody>
${(row.items || []).map(i => `<tr><td>${esc(i.d)}</td><td class="r">${esc(i.q)}</td><td class="r">${money(i.p)}</td><td class="r">${money(i.q * i.p)}</td></tr>`).join('')}</tbody></table>
<div class="tot"><div><span>Subtotal</span><span>${money(t.sub)}</span></div>${+row.vat_rate ? `<div><span>VAT ${esc(row.vat_rate)}%</span><span>${money(t.vat)}</span></div>` : ''}<div class="b"><span>Total</span><span>${money(t.total)}</span></div></div>
${row.notes ? `<p class="m">${esc(row.notes)}</p>` : ''}
${kind === 'Invoice' && s.payment_details ? `<p><b>Payment details</b></p><p class="m">${esc(s.payment_details)}</p>` : ''}
${s.document_terms ? `<p class="m" style="margin-top:24px;font-size:12px">${esc(s.document_terms)}</p>` : ''}
<script>onload=()=>print()<\/script>`);
    w.document.close();
  }

  window.Emphile = { parseReceipt, db, esc, money, fdate, todayISO, guard, shell, tabs, mountResource, printDoc, nextNumber, docTotals, getSettings };
})();
