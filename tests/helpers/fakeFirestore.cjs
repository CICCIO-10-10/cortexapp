'use strict';
// Firestore finto in memoria per test unitari del backend (nessuna rete).
// Supporta: collection/doc, get/set(merge)/update/delete, where(==, !=)+select,
// runTransaction (letture/scritture applicate al commit), sentinel
// increment / arrayUnion / serverTimestamp / delete, Timestamp.fromMillis.
const INC = Symbol('inc'), UNION = Symbol('union'), DEL = Symbol('del'), TS = Symbol('ts');
class Timestamp {
  constructor(ms) { this._ms = ms; }
  static fromMillis(ms) { return new Timestamp(ms); }
  toMillis() { return this._ms; }
}
const FieldValue = {
  increment: n => ({ [INC]: n }),
  arrayUnion: (...v) => ({ [UNION]: v }),
  serverTimestamp: () => ({ [TS]: true }),
  delete: () => ({ [DEL]: true }),
};
const clone = v => (v instanceof Timestamp ? v : v && typeof v === 'object' ? (Array.isArray(v) ? v.map(clone) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]))) : v);
function resolve(old, val, now) {
  if (val && typeof val === 'object' && !(val instanceof Timestamp)) {
    if (INC in val) return (typeof old === 'number' ? old : 0) + val[INC];
    if (UNION in val) { const arr = Array.isArray(old) ? [...old] : []; for (const x of val[UNION]) if (!arr.some(y => JSON.stringify(y) === JSON.stringify(x))) arr.push(clone(x)); return arr; }
    if (TS in val) return Timestamp.fromMillis(now());
  }
  return clone(val);
}
function merge(old, data, now) {
  const out = { ...(old || {}) };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && DEL in v) { delete out[k]; continue; }
    if (k.includes('.')) { // update con percorso puntato
      const [head, ...rest] = k.split('.');
      out[head] = merge(out[head] || {}, { [rest.join('.')]: v }, now);
      continue;
    }
    out[k] = resolve(out[k], v, now);
  }
  return out;
}
const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

function createFakeFirestore({ now = () => Date.now() } = {}) {
  const rows = new Map();
  const stats = { writes: 0 };
  const snap = (id, path) => ({ id, exists: rows.has(path), data: () => clone(rows.get(path)), ref: ref(path) });
  function write(path, data, opts) {
    stats.writes++;
    rows.set(path, opts && opts.merge ? merge(rows.get(path), data, now) : merge({}, data, now));
  }
  function ref(path) {
    const id = path.split('/').at(-1);
    return {
      id, path,
      get: async () => snap(id, path),
      set: async (data, opts) => write(path, data, opts),
      update: async data => { if (!rows.has(path)) throw Object.assign(new Error('not-found'), { code: 5 }); write(path, data, { merge: true }); },
      delete: async () => { rows.delete(path); },
      collection: sub => collection(path + '/' + sub),
    };
  }
  function query(prefix, filters) {
    const run = async () => {
      const docs = [...rows.entries()]
        .filter(([p]) => p.startsWith(prefix + '/') && !p.slice(prefix.length + 1).includes('/'))
        .filter(([, d]) => filters.every(([f, op, v]) => { const x = getPath(d, f); return op === '==' ? x === v : op === '!=' ? x !== v && x !== undefined : false; }))
        .map(([p]) => snap(p.split('/').at(-1), p));
      return { docs, empty: !docs.length, size: docs.length, forEach: fn => docs.forEach(fn) };
    };
    return { where: (f, op, v) => query(prefix, [...filters, [f, op, v]]), select: () => ({ get: run }), limit: () => ({ get: run }), get: run };
  }
  function collection(name) { return { doc: id => ref(name + '/' + id), ...query(name, []) }; }
  async function runTransaction(fn) {
    const pending = [];
    const tx = {
      get: async r => r.get(),
      set: (r, data, opts) => { pending.push(() => write(r.path, data, opts)); return tx; },
      update: (r, data) => { pending.push(() => write(r.path, data, { merge: true })); return tx; },
      create: (r, data) => { pending.push(() => { if (rows.has(r.path)) throw new Error('already-exists'); write(r.path, data); }); return tx; },
      delete: r => { pending.push(() => rows.delete(r.path)); return tx; },
    };
    const result = await fn(tx);
    for (const p of pending) p();
    return result;
  }
  async function recursiveDelete(r) {
    if (db.failNextRecursiveDelete) { db.failNextRecursiveDelete = false; throw Object.assign(new Error('deadline'), { code: 4 }); }
    for (const p of [...rows.keys()]) if (p === r.path || p.startsWith(r.path + '/')) rows.delete(p);
  }
  const db = { collection, runTransaction, recursiveDelete, failNextRecursiveDelete: false, batch: () => { const ops = []; return { set: (r, d, o) => ops.push(() => write(r.path, d, o)), update: (r, d) => ops.push(() => write(r.path, d, { merge: true })), delete: r => ops.push(() => rows.delete(r.path)), commit: async () => ops.forEach(f => f()) }; } };
  const admin = { firestore: Object.assign(() => db, { FieldValue, Timestamp }) };
  return { db, admin, rows, stats, Timestamp, FieldValue };
}
module.exports = { createFakeFirestore, Timestamp, FieldValue };
