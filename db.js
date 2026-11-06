/* Data layer: Firebase (Firestore + Auth). Shared by the public site and the staff portal. */
(function () {
  const C = window.EMPHILE_CONFIG || {};
  if (!(C.apiKey && C.projectId && window.firebase)) { window.EmphileDB = { configured: false }; return; }
  if (!firebase.apps.length) firebase.initializeApp(C);
  const fs = firebase.firestore();
  const auth = firebase.auth ? firebase.auth() : null;

  // Missing values sort last in either direction.
  const byKey = (key, asc) => (a, b) => {
    const x = a[key], y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return x === y ? 0 : (x > y ? 1 : -1) * (asc ? 1 : -1);
  };

  window.EmphileDB = {
    configured: true,
    async list(table, opts = {}) {
      const snap = await fs.collection(table).get();
      const rows = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      return opts.order ? rows.sort(byKey(opts.order, opts.asc)) : rows;
    },
    async add(table, data) {
      const row = { created_at: new Date().toISOString(), ...data };
      const ref = await fs.collection(table).add(row);
      return { ...row, id: ref.id };
    },
    async get(table, id) { const d = await fs.collection(table).doc(id).get(); return d.exists ? { ...d.data(), id: d.id } : null; },
    update: (table, id, data) => fs.collection(table).doc(id).update(data),
    remove: (table, id) => fs.collection(table).doc(id).delete(),
    set: (table, id, data) => fs.collection(table).doc(id).set(data, { merge: true }),

    user: () => new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u); }); }),
    signIn: (email, password) => auth.signInWithEmailAndPassword(email, password),
    signOut: () => auth.signOut(),
    // Returns { ok, reason }: reason explains a refusal so the sign-in screen can say why.
    async checkAdmin(uid) {
      try {
        const d = await fs.collection('admins').doc(uid).get();
        return d.exists ? { ok: true } : { ok: false, reason: 'missing' };
      } catch (e) { return { ok: false, reason: e.code || e.message }; }
    },
  };
})();
