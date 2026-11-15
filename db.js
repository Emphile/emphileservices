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
    // Query with one equality filter (needed where rules only allow reading matching documents).
    async listWhere(table, field, value) {
      const snap = await fs.collection(table).where(field, '==', value).get();
      return snap.docs.map(x => ({ ...x.data(), id: x.id }));
    },
    // Files are stored as <=900 KB pieces in material_files (Firestore documents are capped at 1 MiB).
    async uploadFile(materialId, file, progress) {
      const SIZE = 900000, n = Math.ceil(file.size / SIZE);
      for (let i = 0; i < n; i++) {
        const u8 = new Uint8Array(await file.slice(i * SIZE, (i + 1) * SIZE).arrayBuffer());
        await fs.collection('material_files').doc(materialId + '_' + i).set({ material_id: materialId, n: i, data: firebase.firestore.Blob.fromUint8Array(u8) });
        if (progress) progress(i + 1, n);
      }
      return n;
    },
    async readFile(m, progress) {
      const parts = new Array(m.chunks);
      let done = 0, next = 0;
      const worker = async () => {
        while (next < m.chunks) {
          const i = next++;
          const d = await fs.collection('material_files').doc(m.id + '_' + i).get();
          if (!d.exists) throw new Error('Part ' + (i + 1) + ' of the file is missing.');
          parts[i] = d.data().data.toUint8Array();
          if (progress) progress(++done, m.chunks);
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      return new Blob(parts, { type: m.mime || 'application/pdf' });
    },
    async removeFile(materialId, chunks) {
      for (let i = 0; i < chunks; i++) await fs.collection('material_files').doc(materialId + '_' + i).delete();
    },
    signUp: (email, password) => auth.createUserWithEmailAndPassword(email, password),
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
