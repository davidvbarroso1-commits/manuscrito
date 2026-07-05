/* app.js — orquesta vistas, perfiles y conecta los módulos. */
const APP = (() => {
  let profiles=[], current=null;
  let toastT=null;

  /* ---------- utilidades UI ---------- */
  function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
    clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2600); }
  function busy(msg){ const o=document.getElementById('overlay'); document.getElementById('overlayMsg').textContent=msg||'Procesando…'; o.hidden=false; }
  function idle(){ document.getElementById('overlay').hidden=true; }

  /* ---------- perfiles ---------- */
  function getProfile(){ return current; }
  async function persist(){ if(current) await DB.put(current); }

  async function loadProfiles(){
    profiles=await DB.all();
    if(!profiles.length){ const p=DB.blank('Mi caligrafía'); await DB.put(p); profiles=[p]; }
    current=profiles[0];
    fillProfileSelect();
  }
  function fillProfileSelect(){
    const sel=document.getElementById('profileSel'); sel.innerHTML='';
    for(const p of profiles){ const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; sel.appendChild(o); }
    sel.value=current.id;
    // refresca la lista "Mi caligrafía" del generador si está activa
    const k=document.getElementById('optFontKind');
    if(window.GENERATE && GENERATE.populateFonts && k && k.value==='mia') GENERATE.populateFonts();
  }
  async function newProfile(){
    const name=prompt('Nombre del nuevo perfil de caligrafía:','Caligrafía '+(profiles.length+1));
    if(name===null) return;
    const p=DB.blank(name||'Sin nombre'); await DB.put(p);
    profiles.push(p); current=p; fillProfileSelect(); refresh(); CAPTURE.renderVariants();
    toast('Perfil creado: '+p.name);
  }
  async function switchProfile(id){ current=profiles.find(p=>p.id===id)||current; refresh(); CAPTURE.setChar(CAPTURE.char); }

  // crea un perfil nuevo ya poblado (usado por "Apuntes → nuevo estilo")
  async function createProfileWith(name, glyphs){
    const p=DB.blank(name||'Tipo escaneado'); p.glyphs=glyphs||{};
    await DB.put(p); profiles.push(p); current=p; fillProfileSelect(); refresh(); CAPTURE.renderVariants();
    return p;
  }

  function exportProfile(){
    if(!current) return;
    const blob=new Blob([JSON.stringify(current)],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=(current.name||'caligrafia').replace(/\s+/g,'-')+'.json'; a.click();
  }
  function importProfile(file){
    const fr=new FileReader();
    fr.onload=async()=>{ try{ const p=JSON.parse(fr.result);
      if(!p.glyphs) throw new Error('formato');
      p.id=DB.blank().id; p.name=(p.name||'Importado')+' (importado)'; p.createdAt=Date.now();
      await DB.put(p); profiles.push(p); current=p; fillProfileSelect(); refresh(); CAPTURE.renderVariants();
      toast('Perfil importado ✓');
    }catch(e){ toast('Archivo no válido'); } };
    fr.readAsText(file);
  }

  /* ---------- charset grid + progreso ---------- */
  function refresh(){ renderGrid(); updateProgress(); }
  function renderGrid(){
    const grid=document.getElementById('charsetGrid'); if(!grid) return;
    const filter=document.getElementById('charFilter').value;
    grid.innerHTML='';
    let chars=CHARSET.all;
    if(filter==='pending') chars=chars.filter(c=>!(current.glyphs[c]&&current.glyphs[c].length));
    else if(filter!=='all') chars=chars.filter(c=>CHARSET.catOf(c)===filter);
    for(const ch of chars){
      const list=current.glyphs[ch]||[];
      const chip=document.createElement('div');
      chip.className='glyph-chip '+(list.length?'done':'pending')+(ch===CAPTURE.char?' active':'');
      chip.textContent=ch;
      if(list.length){ const b=document.createElement('span'); b.className='cnt'; b.textContent=list.length; chip.appendChild(b); }
      chip.onclick=()=>{ setSubtab('draw'); CAPTURE.setChar(ch); renderGrid(); };
      grid.appendChild(chip);
    }
  }
  function updateProgress(){
    const done=CHARSET.all.filter(c=>current.glyphs[c]&&current.glyphs[c].length).length;
    const total=CHARSET.all.length, pct=Math.round(done/total*100);
    document.getElementById('homeProgBar').style.width=pct+'%';
    document.getElementById('homeProgTxt').textContent=`${done} / ${total} glifos`;
    const cc=document.getElementById('charsetCount'); if(cc) cc.textContent=`${done}/${total} listos`;
  }

  /* ---------- navegación ---------- */
  function setView(v){
    document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===v));
    document.querySelectorAll('.view').forEach(s=>s.classList.toggle('active',s.id==='view-'+v));
    if(v==='capture'){ CAPTURE.resize(); setTimeout(()=>CAPTURE.resize(),60); }
  }
  function setSubtab(m){
    document.querySelectorAll('.subtab').forEach(t=>t.classList.toggle('active',t.dataset.mode===m));
    document.getElementById('capture-draw').hidden=(m!=='draw');
    document.getElementById('capture-scan').hidden=(m!=='scan');
    document.getElementById('capture-notes').hidden=(m!=='notes');
    // el panel de glifos solo aplica a dibujar/plantilla
    document.querySelector('.charset-panel').style.display=(m==='notes')?'none':'';
    document.querySelector('.capture-layout').style.gridTemplateColumns=(m==='notes')?'1fr':'';
    if(m==='draw'){ CAPTURE.resize(); setTimeout(()=>CAPTURE.resize(),60); }
  }

  /* ---------- init ---------- */
  async function init(){
    await loadProfiles();

    CAPTURE.bind({getProfile,persist,refresh}); CAPTURE.init();
    SCAN.bind({getProfile,persist,refresh}); SCAN.init();
    TRANSCRIBE.bind({createProfile:createProfileWith, getProfile}); TRANSCRIBE.init();
    GENERATE.bind({getProfile, getProfiles:()=>profiles}); GENERATE.init();

    // tabs
    document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>setView(t.dataset.view));
    document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>setView(b.dataset.goto));
    document.querySelectorAll('.subtab').forEach(t=>t.onclick=()=>setSubtab(t.dataset.mode));
    document.getElementById('charFilter').onchange=renderGrid;

    // navegación de glifos
    document.getElementById('nextCharBtn').onclick=()=>moveChar(1);
    document.getElementById('prevCharBtn').onclick=()=>moveChar(-1);

    // perfiles
    document.getElementById('profileSel').onchange=e=>switchProfile(e.target.value);
    document.getElementById('newProfileBtn').onclick=newProfile;
    document.getElementById('exportProfileBtn').onclick=exportProfile;
    document.getElementById('importProfileBtn').onclick=()=>document.getElementById('importProfileInput').click();
    document.getElementById('importProfileInput').onchange=e=>{ if(e.target.files[0]) importProfile(e.target.files[0]); };

    CAPTURE.setChar('a');
    refresh();
  }
  function moveChar(d){
    const i=CHARSET.all.indexOf(CAPTURE.char);
    const ni=(i+d+CHARSET.all.length)%CHARSET.all.length;
    CAPTURE.setChar(CHARSET.all[ni]); renderGrid();
  }

  return { init, toast, busy, idle, getProfile, persist, refresh };
})();

window.addEventListener('DOMContentLoaded', APP.init);

// errores globales: nunca fallar en silencio
window.addEventListener('error', e=>{ try{ APP.idle(); APP.toast('Error: '+(e.message||'desconocido')); }catch(_){} });
window.addEventListener('unhandledrejection', e=>{ try{ APP.idle(); APP.toast('Error: '+((e.reason&&e.reason.message)||e.reason||'desconocido')); }catch(_){} });
