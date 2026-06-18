/* db.js — almacenamiento de perfiles de caligrafía en IndexedDB
   Un "perfil" = { id, name, createdAt, glyphs: { "a":[variant,...], "b":[...] } }
   Cada variante está ya normalizada (ver capture.js / scan.js). */
const DB = (() => {
  const DB_NAME = 'manuscrito';
  const STORE = 'profiles';
  let _db = null;

  function open(){
    return new Promise((res, rej) => {
      if (_db) return res(_db);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE))
          db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = e => { _db = e.target.result; res(_db); };
      req.onerror = e => rej(e.target.error);
    });
  }

  function tx(mode){ return open().then(db => db.transaction(STORE, mode).objectStore(STORE)); }

  async function all(){
    const store = await tx('readonly');
    return new Promise((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result.sort((a,b)=>a.createdAt-b.createdAt));
      r.onerror = () => rej(r.error);
    });
  }
  async function get(id){
    const store = await tx('readonly');
    return new Promise((res, rej) => {
      const r = store.get(id);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function put(profile){
    const store = await tx('readwrite');
    return new Promise((res, rej) => {
      const r = store.put(profile);
      r.onsuccess = () => res(profile); r.onerror = () => rej(r.error);
    });
  }
  async function remove(id){
    const store = await tx('readwrite');
    return new Promise((res, rej) => {
      const r = store.delete(id);
      r.onsuccess = () => res(); r.onerror = () => rej(r.error);
    });
  }

  function blank(name){
    return { id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
             name: name || 'Mi caligrafía', createdAt: Date.now(), glyphs: {} };
  }

  return { all, get, put, remove, blank };
})();
