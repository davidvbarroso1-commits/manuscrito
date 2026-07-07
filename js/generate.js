/* generate.js — extrae texto, lo convierte al formato de apuntes elegido y lo maqueta.
   Dos motores de letra: (1) caligrafía capturada, (2) fuentes web. Vista previa de realismo. */
const GENERATE = (() => {
  let hooks = { getProfile:()=>null, getProfiles:()=>[] };
  function bind(h){ hooks=Object.assign(hooks,h); }
  let lastPages = [];
  let fontHand = [], fontPrint = [];
  let mixList = [];   // fuentes elegidas por el usuario para mezclar
  const RECOMMENDED = 'Homemade Apple';   // la más parecida a una letra real desprolija

  const PAPER = {
    a4:     { w:1240, h:1754, mm:[210,297] },
    letter: { w:1275, h:1650, mm:[215.9,279.4] },
  };
  const INSTRUMENTS = {
    'boli-azul': { color:'#1f3ac4', brush:3.0, widthSpan:0.55, opacity:0.96, grain:0,    pooling:0   },
    'boli-negro':{ color:'#17181d', brush:2.9, widthSpan:0.50, opacity:0.96, grain:0,    pooling:0   },
    'lapiz':     { color:'#4d4d52', brush:3.2, widthSpan:1.00, opacity:0.70, grain:0.65, pooling:0   },
    'pluma':     { color:'#1d2473', brush:3.6, widthSpan:1.70, opacity:1.00, grain:0,    pooling:0.7 },
    'marcador':  { color:'#c0392b', brush:6.2, widthSpan:0.25, opacity:0.85, grain:0.05, pooling:0   },
    'color':     { color:'#2e7d32', brush:3.4, widthSpan:0.90, opacity:0.78, grain:0.45, pooling:0   },
  };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const val=id=>{ const e=document.getElementById(id); return e?e.value:''; };
  // fuentes muy delgadas → refuerzo de trazo para que se vean bien
  const THIN_BOOST={ 'League Script':1.0, 'Stalemate':0.7, 'Kristi':0.6, 'Ruthie':0.5,
    'Zeyada':0.35, 'La Belle Aurore':0.35, 'Dawning of a New Day':0.3, 'Meddon':0.3,
    // segunda tanda (casi todas hairline)
    'Petemoss':0.9,'Fuggles':0.8,'Square Peg':0.7,'Qwitcher Grypen':0.8,'Water Brush':0.5,
    'Whisper':0.8,'Splash':0.5,'Smooch':0.6,'Mea Culpa':0.7,'Hurricane':0.6,'Kolker Brush':0.5,
    'Sassy Frass':0.7,'Ruge Boogie':0.6,'Oooh Baby':0.7,'Moon Dance':0.6,'Caramel':0.5,
    'Cherish':0.6,'Grechen Fuemen':0.7,'Neonderthaw':0.7,'Estonia':0.7,'Vujahday Script':0.6,
    'Babylonica':0.8,'Passions Conflict':0.8,'Tapestry':0.6,'Updock':0.7,'Twinkle Star':0.7,
    'Praise':0.7,'Love Light':0.7,'Send Flowers':0.7,'Island Moments':0.7,'Ole':0.5,
    'Are You Serious':0.7 };
  const tick=()=>new Promise(r=>setTimeout(r,10));

  function init(){
    const sync=(id,v,fmt)=>{ const el=document.getElementById(id),o=document.getElementById(v);
      if(!el||!o)return; const f=fmt||(x=>x); el.addEventListener('input',()=>o.textContent=f(el.value)); o.textContent=f(el.value); };
    sync('optSize','valSize'); sync('optLine','valLine',x=>(+x).toFixed(1));
    sync('optPressure','valPressure'); sync('optTone','valTone'); sync('optTransp','valTransp');
    sync('optJitter','valJitter'); sync('optDrift','valDrift'); sync('optBlots','valBlots');
    sync('optWear','valWear'); sync('optSmooth','valSmooth'); sync('optFall','valFall');
    sync('optRetrace','valRetrace'); sync('optStrikes','valStrikes');
    sync('optSlant','valSlant',x=>x+'°');

    document.getElementById('optInstrument').addEventListener('change', e=>{
      const p=INSTRUMENTS[e.target.value]; if(p) document.getElementById('optColor').value=p.color; schedulePreview();
    });
    document.getElementById('optFontKind').addEventListener('change', populateFonts);
    document.getElementById('optFontSearch').addEventListener('input', debounce(populateFonts,250));
    document.getElementById('optFont').addEventListener('change', ()=>{ updateFontPreview(); schedulePreview(); });

    document.getElementById('docInput').addEventListener('change', e=>{ if(e.target.files[0]) handleFile(e.target.files[0]); });
    setupDropzone();

    // retoques por palabra: envuelve la selección del textarea con marcas {c:..}/{i:..}
    const OBJ_FMTS=['cornell','flashcards','boxing','mapa'];
    function preRetouch(){
      const fmt=val('optFormat'), ta=document.getElementById('genText');
      if(OBJ_FMTS.includes(fmt)){ APP.toast('Los retoques funcionan en formatos de texto (Resumen, Esquema, etc.)'); return null; }
      if(fmt!=='completo' && ta.value.trim()){
        ta.value=SUMMARIZE.format(ta.value,fmt);
        document.getElementById('optFormat').value='completo';
        APP.toast('Apliqué el formato al texto. Ahora selecciona palabras y retoca.');
      }
      return ta;
    }
    function wrapSel(open,close){
      const ta=preRetouch(); if(!ta) return;
      const s=ta.selectionStart,e=ta.selectionEnd;
      if(s===e){ APP.toast('Primero selecciona palabras dentro del texto'); return; }
      ta.value=ta.value.slice(0,s)+open+ta.value.slice(s,e)+close+ta.value.slice(e);
      ta.focus(); ta.setSelectionRange(s, e+open.length+close.length);
    }
    document.getElementById('rtColorBtn').addEventListener('click', ()=>wrapSel('{c:'+val('rtColor')+'}','{/c}'));
    document.getElementById('rtInstrBtn').addEventListener('click', ()=>wrapSel('{i:'+val('rtInstr')+'}','{/i}'));
    document.getElementById('rtUnderBtn').addEventListener('click', ()=>wrapSel('{u}','{/u}'));
    document.getElementById('rtClearBtn').addEventListener('click', ()=>{
      const ta=document.getElementById('genText'); const s=ta.selectionStart,e=ta.selectionEnd;
      const rx=/\{\/?[ciu](:[^}]*)?\}/g;
      if(s!==e){ ta.value=ta.value.slice(0,s)+ta.value.slice(s,e).replace(rx,'')+ta.value.slice(e); }
      else ta.value=ta.value.replace(rx,'');
      APP.toast('Retoques quitados');
    });

    // mezcla de fuentes elegidas por el usuario
    try{ mixList=JSON.parse(localStorage.getItem('manuscrito_mix')||'[]'); }catch(e){ mixList=[]; }
    renderMixChips();
    document.getElementById('mixAddBtn').addEventListener('click', ()=>{
      const v=val('optFont');
      if(!v.startsWith('font:')){ APP.toast('Elige una fuente (no "Mi caligrafía") para añadirla'); return; }
      const fam=v.slice(5);
      if(mixList.includes(fam)){ APP.toast('Ya está en la mezcla'); return; }
      mixList.push(fam); FONTS.ensure(fam); saveMix();
      if(mixList.length>=2) document.getElementById('mixUse').checked=true;
      APP.toast(fam+' añadida a la mezcla ('+mixList.length+')');
    });
    document.getElementById('mixUse').addEventListener('change', schedulePreview);

    document.getElementById('genBtn').addEventListener('click', ()=>run());
    // aplicar el formato SOLO a la parte seleccionada del texto
    document.getElementById('fmtSelBtn').addEventListener('click', async()=>{
      const ta=document.getElementById('genText'); const s=ta.selectionStart,e=ta.selectionEnd;
      if(s===e){ APP.toast('Selecciona primero la parte del texto en el cuadro'); return; }
      const fmt=val('optFormat'); const parte=ta.value.slice(s,e);
      if(['cornell','flashcards','boxing','mapa'].includes(fmt)){
        await run(parte);                       // genera el layout solo con esa parte
        APP.toast('Generado con la selección solamente');
      } else {
        ta.value=ta.value.slice(0,s)+SUMMARIZE.format(parte,fmt)+ta.value.slice(e);
        document.getElementById('optFormat').value='completo';
        APP.toast('Sección convertida al formato; el resto quedó igual');
      }
    });
    document.getElementById('printBtn').addEventListener('click', ()=>{ if(!lastPages.length){APP.toast('Genera los apuntes primero');return;} window.print(); });
    document.getElementById('pdfBtn').addEventListener('click', exportPDF);

    // vista previa de realismo en vivo
    ['optInstrument','optColor','optSize','optLine','optPressure','optTone','optTransp',
     'optSmooth','optFall','optJitter','optDrift','optBlots','optWear','optRetrace','optStrikes','optSlant','optFontKind','optPaper'].forEach(id=>{
      const el=document.getElementById(id); if(el){ el.addEventListener('input',schedulePreview); el.addEventListener('change',schedulePreview); }
    });

    loadFontLibrary();
  }
  function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

  function saveMix(){ try{ localStorage.setItem('manuscrito_mix',JSON.stringify(mixList)); }catch(e){} renderMixChips(); }
  function renderMixChips(){
    const host=document.getElementById('mixChips'); if(!host) return;
    host.innerHTML='';
    mixList.forEach((f,i)=>{ const chip=document.createElement('span'); chip.className='mix-chip';
      chip.style.fontFamily=`"${f}", cursive`; chip.textContent=f+' ';
      const del=document.createElement('button'); del.textContent='×';
      del.onclick=()=>{ mixList.splice(i,1); saveMix(); schedulePreview(); };
      chip.appendChild(del); host.appendChild(chip); });
    if(!mixList.length) host.innerHTML='<span class="muted sm">— añade 2 o más fuentes y marca "usar mezcla" —</span>';
  }

  /* ---------- biblioteca de fuentes ---------- */
  async function loadFontLibrary(){
    try{ const r=await FONTS.load(); fontHand=r.hand; fontPrint=r.print;
      const note=document.getElementById('fontNote');
      if(note) note.textContent = r.full ? `${fontHand.length+fontPrint.length} fuentes`
        : `${fontHand.length+fontPrint.length} fuentes (catálogo básico)`;
    }catch(e){ console.error(e); }
    populateFonts();
  }
  function populateFonts(){
    const kind=val('optFontKind'), sel=document.getElementById('optFont');
    const q=(val('optFontSearch')||'').toLowerCase().trim();
    sel.innerHTML='';
    if(kind==='mia'){
      document.getElementById('fontSearchRow').style.display='none';
      const profs=hooks.getProfiles()||[];
      if(!profs.length){ const o=document.createElement('option'); o.textContent='(no hay perfiles)'; sel.appendChild(o); }
      for(const p of profs){ const o=document.createElement('option'); o.value='profile:'+p.id;
        o.textContent=`${p.name} · ${Object.keys(p.glyphs).length} letras`; sel.appendChild(o); }
      updateFontPreview(); schedulePreview(); return;
    }
    document.getElementById('fontSearchRow').style.display='';
    const base=(kind==='similar'?FONTS.SIMILAR:(kind==='hand'?fontHand:fontPrint));
    const list=base.filter(f=>!q||f.toLowerCase().includes(q)).slice(0,120);
    list.forEach((f,i)=>{ const o=document.createElement('option'); o.value='font:'+f;
      o.textContent=(f===RECOMMENDED?'⭐ '+f+' (parecida a tu letra)':f);
      o.style.fontFamily=`"${f}", cursive`;       // se ve en su propia letra (tipo Word)
      sel.appendChild(o);
      if(i<28) FONTS.ensure(f);                   // carga las primeras para que se vean ya
    });
    if(!list.length){ const o=document.createElement('option'); o.textContent='(sin resultados)'; sel.appendChild(o); }
    const rec=[...sel.options].find(o=>o.value==='font:'+RECOMMENDED);
    if(rec && !q) sel.value=rec.value;
    updateFontPreview(); schedulePreview();
  }
  async function updateFontPreview(){
    const pv=document.getElementById('fontPreview'); if(!pv) return;
    const v=val('optFont')||'';
    if(v.startsWith('font:')){
      const fam=v.slice(5);
      pv.style.whiteSpace='pre-line'; pv.textContent='Aa Bb Cc · áéíóú ñ · 123\nEl veloz murciélago hojeó.';
      const ok=await FONTS.ensure(fam);
      pv.style.fontFamily = ok ? `"${fam}", cursive` : 'cursive';
    }else{ pv.style.fontFamily=''; pv.style.whiteSpace='normal'; pv.textContent='(usa los glifos que capturaste)'; }
  }

  /* ---------- arrastrar y soltar ---------- */
  function setupDropzone(){
    const dz=document.getElementById('dropzone');
    const stop=e=>{ e.preventDefault(); e.stopPropagation(); };
    ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{stop(e);dz.classList.add('over');}));
    ['dragleave','dragend','drop'].forEach(ev=>dz.addEventListener(ev,e=>{stop(e);dz.classList.remove('over');}));
    dz.addEventListener('drop',e=>{ const f=e.dataTransfer.files[0]; if(f) handleFile(f); });
    dz.addEventListener('click',()=>document.getElementById('docInput').click());
    const view=document.getElementById('view-generate');
    ['dragover','drop'].forEach(ev=>view.addEventListener(ev,e=>{ if(e.target!==dz) e.preventDefault(); }));
  }
  async function handleFile(f){
    const st=document.getElementById('docStatus'); st.textContent='Leyendo '+f.name+'…';
    try{
      const text=(await extract(f)).trim();
      if(!text){ st.textContent='✗ No encontré texto (¿es una imagen/escaneo? prueba una foto más nítida)'; APP.idle(); APP.toast('No encontré texto en el archivo'); return; }
      document.getElementById('genText').value=text;
      st.textContent=`✓ ${f.name} · ${text.length.toLocaleString()} caracteres`;
      await run();
    }catch(err){ console.error(err); APP.idle(); st.textContent='✗ '+(err.message||'No se pudo leer'); APP.toast('Error al leer el archivo'); }
  }

  /* ---------- extracción ---------- */
  async function extract(f){
    const name=f.name.toLowerCase();
    if(name.endsWith('.txt')||name.endsWith('.md')||f.type.startsWith('text/')) return await f.text();
    if(name.endsWith('.pdf')||f.type==='application/pdf') return await readPDF(f);
    if(name.endsWith('.docx')) return await readDOCX(f);
    if(f.type.startsWith('image/')) return await readImageOCR(f);
    try{ return await f.text(); }catch(e){ throw new Error('Formato no soportado'); }
  }
  async function readPDF(f){
    APP.busy('Cargando lector de PDF…');
    const pdfjs=await LIBS.pdfjs();
    if(!pdfjs) throw new Error('No se pudo cargar el lector de PDF');
    const buf=await f.arrayBuffer(); const pdf=await pdfjs.getDocument({data:buf}).promise; let out='';
    for(let p=1;p<=pdf.numPages;p++){ APP.busy(`Leyendo PDF… página ${p}/${pdf.numPages}`);
      const page=await pdf.getPage(p); const c=await page.getTextContent(); let last=null;
      for(const it of c.items){ out+=(last&&it.transform[5]<last-2?'\n':'')+it.str+(it.hasEOL?'\n':' '); last=it.transform[5]; }
      out+='\n\n';
    }
    APP.idle();
    if(out.replace(/\s/g,'').length<3) throw new Error('El PDF no tiene texto (parece escaneado). Súbelo como imagen para OCR.');
    return out;
  }
  async function readDOCX(f){
    APP.busy('Cargando lector de Word…');
    const mammoth=await LIBS.mammoth(); const buf=await f.arrayBuffer();
    const res=await mammoth.extractRawText({arrayBuffer:buf}); APP.idle(); return res.value;
  }
  async function readImageOCR(f){
    APP.busy('Preparando imagen…');
    const T=await LIBS.tesseract();
    const url=URL.createObjectURL(f);
    const img=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error('Imagen inválida'));im.src=url;});
    const sc=Math.min(3, Math.max(1, 1900/img.naturalWidth));
    const c=document.createElement('canvas'); c.width=Math.round(img.naturalWidth*sc); c.height=Math.round(img.naturalHeight*sc);
    const cx=c.getContext('2d',{willReadFrequently:true}); cx.drawImage(img,0,0,c.width,c.height);
    const id=cx.getImageData(0,0,c.width,c.height), d=id.data;
    let mn=255,mx=0; const g=new Float32Array(d.length/4);
    for(let i=0,j=0;i<d.length;i+=4,j++){ const v=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; g[j]=v; if(v<mn)mn=v; if(v>mx)mx=v; }
    const rg=Math.max(1,mx-mn);
    for(let i=0,j=0;i<d.length;i+=4,j++){ let v=(g[j]-mn)/rg; v=v<0.5? v*v*1.3 : 1-(1-v)*(1-v)*1.3; v=clamp(v,0,1)*255; d[i]=d[i+1]=d[i+2]=v; }
    cx.putImageData(id,0,0); URL.revokeObjectURL(url);
    APP.busy('Leyendo texto (OCR)…');
    const res=await T.recognize(c,'spa',{logger:m=>{ if(m.status==='recognizing text') APP.busy(`OCR… ${Math.round(m.progress*100)}%`);} });
    APP.idle(); return res.data.text;
  }

  function pickVariant(prof, ch, rng){
    let list=prof.glyphs[ch];
    if(!list||!list.length){ const fb=CHARSET.fallback[ch]; if(fb) list=prof.glyphs[fb]; }
    if(!list||!list.length) return null;
    return list[Math.floor(rng()*list.length)%list.length];
  }

  /* ---------- opciones + motor de letra ---------- */
  function buildOpt(){ return {
    paper:val('optPaper'), ruling:val('optRuling'), holes:val('optHoles'),
    size:+val('optSize'), line:+val('optLine'), color:val('optColor'),
    pressure:+val('optPressure')/100, tone:+val('optTone')/100, transp:+val('optTransp')/100,
    smooth:+(val('optSmooth')||45)/100, fall:+(val('optFall')||15)/100,
    jitter:+val('optJitter')/100, drift:+val('optDrift')/100, blots:+val('optBlots')/100,
    wear:+(val('optWear')||45)/100,
    retrace:+(val('optRetrace')||12)/100, strikes:+(val('optStrikes')||8)/100,
    slant:+val('optSlant'), instr:INSTRUMENTS[val('optInstrument')]||INSTRUMENTS['boli-azul'],
    format:val('optFormat'), fontVal:val('optFont')||'',
    mix:(document.getElementById('mixUse')&&document.getElementById('mixUse').checked&&mixList.length>=2)?mixList.slice():null,
    _seed:1234 }; }

  /* estado de desgaste del instrumento: cada ~40-70 palabras pasa "algo":
     lápiz → se taja (trazo fino y oscuro que se va gastando);
     tinta → no sale bien un tramo (tenue) y se recupera poco a poco. */
  function makeWear(opt, rng){
    const isPencil = opt.instr.grain > 0.3;
    const st = { sharp: 0.4+rng()*0.6, flow: 1, count: 0, next: 40+Math.round(rng()*30), widthMul:1, alphaMul:1 };
    st.step = () => {
      if (opt.wear <= 0){ st.widthMul=1; st.alphaMul=1; return; }
      st.count++;
      if (isPencil) st.sharp = Math.max(0, st.sharp - 0.006 - rng()*0.006);   // se desgasta
      else st.flow = Math.min(1, st.flow + 0.025);                             // tinta se recupera
      if (st.count >= st.next){
        st.count = 0; st.next = 40 + Math.round(rng()*30);
        if (isPencil) st.sharp = 1;                        // ¡tajó el lápiz!
        else st.flow = 0.42 + rng()*0.22;                  // tramo de tinta pobre
      }
      if (isPencil){
        st.widthMul = 1.35 - 0.6*st.sharp*opt.wear;        // recién tajado = más fino
        st.alphaMul = 1 + (0.28*st.sharp - 0.14)*opt.wear; // recién tajado = más oscuro
      } else {
        st.widthMul = 0.9 + 0.1*st.flow;
        st.alphaMul = 1 - (1-st.flow)*(0.75*opt.wear+0.25);
      }
    };
    st.step();
    return st;
  }

  function mkBlot(ink,fs,opt){ return (ctx,x,y)=>{ ctx.save();
    ctx.fillStyle=`hsla(${ink.h},${ink.s}%,${Math.max(0,ink.l-8)}%,${0.45*(1-opt.transp)})`;
    const r=fs*(0.05+0.06*Math.random()); ctx.beginPath(); ctx.ellipse(x+fs*0.05,y-fs*0.18,r,r*0.8,0,0,7); ctx.fill(); ctx.restore(); }; }

  async function makeEngine(opt, fsOverride){
    const P=PAPER[opt.paper], scale=P.w/820;
    const ink=RENDER.rgbToHsl(RENDER.hexToRgb(opt.color));
    const rng=RENDER.makeRng(0x9e37 ^ (opt._seed||1234));
    if(opt.fontVal.startsWith('font:')){
      const family=opt.fontVal.slice(5);
      // mezcla de fuentes elegida por el usuario (≥2) o solo la actual
      const families=(opt.mix&&opt.mix.length>=2)?opt.mix.slice():[family];
      for(const f of families) await FONTS.ensure(f);
      const fs=fsOverride || opt.size*scale*1.5;
      const gap=fs*0.04;
      const m=document.createElement('canvas').getContext('2d');
      m.font=`${fs}px "${families[0]}", cursive`;
      const spaceW=m.measureText(' ').width||fs*0.3;
      const wear=makeWear(opt,rng);
      const inkCache={};
      const inkFor=c=>inkCache[c]||(inkCache[c]=RENDER.rgbToHsl(RENDER.hexToRgb(c)));
      // estado por palabra: fuente de la mezcla + tamaño levemente distinto
      let curFam=families[0], wordScale=1;
      const onWord=()=>{ curFam=families[Math.floor(rng()*families.length)%families.length];
        wordScale=1+(rng()-0.5)*0.09*opt.jitter; };
      onWord();
      const mkItem=(ch,st)=>{
        const fam=curFam, fsW=fs*wordScale, fstr=`${fsW}px "${fam}", cursive`;
        m.font=fstr; const w=m.measureText(ch).width;
        const useInk=(st&&st.c)?inkFor(st.c):ink;
        const useInstr=(st&&st.ins)?INSTRUMENTS[st.ins]:null;
        const boost=THIN_BOOST[fam]||0;
        return {adv:w+gap*0.4, render:(ctx,x,y)=>drawFontChar(ctx,ch,x,y,fstr,fsW,useInk,opt,rng,wear,useInstr,boost)}; };
      return {ok:true, useFont:true, fs, spaceW, mkItem, onWord, inkFor, ink, rng, blot:mkBlot(ink,fs,opt), stepWord:wear.step};
    }
    // caligrafía capturada
    let prof=null;
    if(opt.fontVal.startsWith('profile:')) prof=(hooks.getProfiles()||[]).find(p=>p.id===opt.fontVal.slice(8));
    prof=prof||hooks.getProfile();
    if(!prof || !Object.keys(prof.glyphs).length) return {ok:false, noGlyphs:true};
    await RENDER.preloadAll(prof.glyphs);
    const fs=fsOverride || opt.size*scale, gap=fs*0.04;
    const wear=makeWear(opt,rng);
    const R={pressure:opt.pressure,tone:opt.tone,jitter:opt.jitter,slantDeg:opt.slant,
      brush:opt.instr.brush,widthSpan:opt.instr.widthSpan,opacity:opt.instr.opacity,
      grain:opt.instr.grain,pooling:opt.instr.pooling,spacing:1,rng,
      transp:opt.transp, smooth:opt.smooth, hotspot:opt.pressure };   // transparencia/disimulo por letra + presión intra-letra
    const stepWord=()=>{ wear.step(); R.widthMul=wear.widthMul; R.alphaMul=wear.alphaMul; };
    stepWord();
    const inkCache={};
    const inkFor=c=>inkCache[c]||(inkCache[c]=RENDER.rgbToHsl(RENDER.hexToRgb(c)));
    const INSTR_KEYS=['brush','widthSpan','opacity','grain','pooling'];
    let wordScale=1;
    const onWord=()=>{ wordScale=1+(rng()-0.5)*0.09*opt.jitter; };
    const mkItem=(ch,st)=>{ const v=pickVariant(prof,ch,rng); if(!v) return {adv:fs*0.45,render:()=>{}};
      const fsW=fs*wordScale;
      const useInk=(st&&st.c)?inkFor(st.c):ink;
      const useInstr=(st&&st.ins)?INSTRUMENTS[st.ins]:null;
      return {adv:RENDER.advance(v,fsW,1)+gap, render:(ctx,x,y)=>{
        const save={}; if(useInstr) for(const k of INSTR_KEYS){ save[k]=R[k]; R[k]=useInstr[k]; }
        RENDER.glyph(ctx,v,x,y,fsW,useInk,R);
        // repintado: segunda pasada levemente corrida (como reforzar/corregir el trazo)
        if(opt.retrace>0 && rng()<opt.retrace*0.3)
          RENDER.glyph(ctx,v,x+(rng()-0.5)*fsW*0.07,y+(rng()-0.5)*fsW*0.06,fsW,useInk,R);
        if(useInstr) Object.assign(R,save);
      }}; };
    return {ok:true, useFont:false, fs, spaceW:fs*0.34, mkItem, onWord, inkFor, ink, rng, blot:mkBlot(ink,fs,opt), stepWord};
  }

  function drawFontChar(ctx,ch,x,baseY,fontStr,fontPx,ink,opt,rng,wear,instrOv,boost){
    const instr=instrOv||opt.instr;
    // disimulo: amortigua saltos de tono/transparencia entre letras
    const sK=1-(opt.smooth||0);
    const lJit=(rng()-0.5)*14*opt.tone*(0.4+0.6*sK);
    const tJit=1-opt.transp*(0.35+0.65*(0.5+(rng()-0.5)*sK));
    const a=instr.opacity*(1-(0.5+(rng()-0.5)*sK)*0.12*opt.tone)*tJit*((wear&&wear.alphaMul)||1);
    ctx.save();
    ctx.translate(x, baseY+(rng()-0.5)*0.12*fontPx*opt.jitter);
    ctx.rotate((rng()-0.5)*0.05*opt.jitter);
    ctx.transform(1,0,Math.tan(-opt.slant*Math.PI/180),1,0,0);
    ctx.font=fontStr; ctx.textBaseline='alphabetic'; ctx.textAlign='left';
    const fill=`hsla(${ink.h},${ink.s}%,${clamp(ink.l+lJit,0,100)}%,${clamp(a,0,1)})`;
    ctx.fillStyle=fill;
    ctx.fillText(ch,0,0);
    // fuente delgada: contorno extra la engrosa (League Script y similares)
    if(boost){ ctx.strokeStyle=fill; ctx.lineWidth=fontPx*0.014*boost; ctx.lineJoin='round'; ctx.strokeText(ch,0,0); }
    // repintado: segunda pasada levemente corrida
    if(opt.retrace>0 && rng()<opt.retrace*0.3){
      ctx.globalAlpha=0.75;
      ctx.fillText(ch,(rng()-0.5)*fontPx*0.06,(rng()-0.5)*fontPx*0.05);
      ctx.globalAlpha=1;
    }
    // zona de MÁS presión dentro de la letra (mancha más marcada en un punto aleatorio)
    if(opt.pressure>0.2 && rng()<0.7){
      const w=ctx.measureText(ch).width;
      ctx.beginPath();
      ctx.ellipse(w*rng(), -fontPx*0.35+fontPx*0.5*rng(), w*0.4, fontPx*0.22, rng()*3, 0, 7);
      ctx.clip();
      ctx.fillStyle=`hsla(${ink.h},${ink.s}%,${clamp(ink.l+lJit-6,0,100)}%,${clamp(a*(0.4+0.5*opt.pressure),0,1)})`;
      ctx.fillText(ch,0,0);
    }
    ctx.restore();
  }

  /* ---------- retoques por palabra: {c:#hex}texto{/c} · {i:lapiz}texto{/i} ---------- */
  function parseStyled(text){
    const out=[]; let c=null, ins=null, u=false;
    for(let i=0;i<text.length;i++){
      const rest=text.slice(i); let m;
      if((m=rest.match(/^\{c:(#[0-9a-fA-F]{3,8})\}/))){ c=m[1]; i+=m[0].length-1; continue; }
      if(rest.startsWith('{/c}')){ c=null; i+=3; continue; }
      if((m=rest.match(/^\{i:([\w-]+)\}/))){ ins=INSTRUMENTS[m[1]]?m[1]:ins; i+=m[0].length-1; continue; }
      if(rest.startsWith('{/i}')){ ins=null; i+=3; continue; }
      if(rest.startsWith('{u}')){ u=true; i+=2; continue; }
      if(rest.startsWith('{/u}')){ u=false; i+=3; continue; }
      out.push({ch:text[i], c, ins, u});
    }
    return out;
  }

  /* ---------- maquetación ---------- */
  function buildParas(text, mkItem, onWord){
    const ann=parseStyled(text.replace(/\r/g,''));
    const paras=[]; let words=[], items=[], w=0, wu=false, wc=null;
    const endWord=()=>{ if(items.length){ words.push({items,w,u:wu,c:wc}); items=[]; w=0; wu=false; wc=null; } };
    const endPara=()=>{ endWord(); paras.push(words.length?{words}:{blank:true}); words=[]; };
    for(const a of ann){
      if(a.ch==='\n'){ endPara(); continue; }
      if(/\s/.test(a.ch)){ endWord(); continue; }
      if(!items.length && onWord) onWord();           // inicio de palabra: fuente/tamaño de esta palabra
      if(a.u) wu=true; if(a.c&&!wc) wc=a.c;
      const it=mkItem(a.ch, (a.c||a.ins)?{c:a.c,ins:a.ins}:null); items.push(it); w+=it.adv;
    }
    endPara();
    return paras;
  }
  function newPage(P){ const c=document.createElement('canvas'); c.width=P.w; c.height=P.h;
    c.className='page-canvas'; const cx=c.getContext('2d'); cx.fillStyle='#fffdf8'; cx.fillRect(0,0,P.w,P.h); return {canvas:c,ctx:cx}; }

  function composePages(paras, opt, eng, cfg){
    const P=PAPER[opt.paper], rng=eng.rng;
    const pages=[]; let pg=newPage(P), pageIndex=0; cfg.paint(pg.ctx,P,pageIndex);
    // caída de renglón: pendiente base siempre hacia abajo + temblor aleatorio
    function slp(){ return (cfg.drift?(rng()-0.5)*0.05*opt.drift:0) + 0.035*(opt.fall||0); }
    let x=cfg.x0, y=cfg.top, slope=slp(), dirty=false;
    function by(xx){ return y + slope*(xx-cfg.x0); }
    function nl(){ x=cfg.x0; y+=cfg.lineH; slope=slp();
      if(y>cfg.bottom){ pages.push(pg); pageIndex++; pg=newPage(P); cfg.paint(pg.ctx,P,pageIndex); y=cfg.top; dirty=false; } }
    for(const para of paras){
      if(para.blank){ nl(); continue; }
      for(const word of para.words){
        if(eng.stepWord) eng.stepWord();                       // desgaste: tajado / tinta
        // tachón: escribe la palabra "mal", la raya y la reescribe al lado
        const doStrike = opt.strikes>0 && word.w<(cfg.x1-cfg.x0)*0.4 && rng()<0.16*opt.strikes;
        if(x>cfg.x0 && x+word.w*(doStrike?2.25:1)>cfg.x1) nl();
        // inclinación propia de la palabra (sesgo hacia abajo → asimetría natural)
        let wx0=x; const wSlope=((rng()-0.42)*0.055)*opt.jitter;
        const wy=xx=>by(xx)+wSlope*(xx-wx0);
        if(doStrike){
          const sx0=x;
          for(const it of word.items){ it.render(pg.ctx,x,wy(x)); x+=it.adv; }
          const passes=2+Math.floor(rng()*2);
          for(let k=0;k<passes;k++){
            const yy=wy((sx0+x)/2)-eng.fs*(0.15+rng()*0.35);
            sketchLine(pg.ctx,sx0-2,yy+(rng()-0.5)*4,x+2,yy+(rng()-0.5)*4,eng.ink,rng,Math.max(1.5,eng.fs*0.06));
          }
          x+=eng.spaceW*0.6; wx0=x; dirty=true;
        }
        if(word.w>(cfg.x1-cfg.x0)){ for(const it of word.items){ if(x+it.adv>cfg.x1){ nl(); wx0=x; } it.render(pg.ctx,x,wy(x)); x+=it.adv; dirty=true; } }
        else { let first=true; for(const it of word.items){ it.render(pg.ctx,x,wy(x));
            if(first&&opt.blots&&rng()<0.012*opt.blots) eng.blot(pg.ctx,x,wy(x)); first=false; x+=it.adv; } dirty=true; }
        // subrayado imperfecto (marca {u})
        if(word.u && x>wx0){
          const uInk=(word.c&&eng.inkFor)?eng.inkFor(word.c):eng.ink;
          sketchLine(pg.ctx, wx0-eng.fs*0.04, wy(wx0)+eng.fs*0.3, x-eng.fs*0.06, wy(x)+eng.fs*0.3+(rng()-0.5)*eng.fs*0.12, uInk, rng, Math.max(1.6,eng.fs*0.055));
        }
        // espacio entre palabras disparejo
        x+=eng.spaceW*(1+(rng()-0.4)*0.5*opt.jitter);
      }
      nl();
    }
    if(dirty||!pages.length) pages.push(pg);
    return {pages, last:pages[pages.length-1]};
  }
  // dibuja texto dentro de una caja (sin paginar) — para claves/resumen de Cornell
  function drawBlock(ctx, text, region, eng, lineH){
    const paras=buildParas(text, eng.mkItem, eng.onWord); let x=region.x0, y=region.top;
    for(const para of paras){
      if(para.blank){ y+=lineH; continue; }
      for(const word of para.words){
        if(eng.stepWord) eng.stepWord();
        if(x>region.x0 && x+word.w>region.x1){ x=region.x0; y+=lineH; if(y>region.bottom) return y; }
        for(const it of word.items){ it.render(ctx,x,y); x+=it.adv; } x+=eng.spaceW;
      }
      x=region.x0; y+=lineH; if(y>region.bottom) return y;
    }
    return y;
  }

  function renderNormal(text, opt, eng){
    const P=PAPER[opt.paper], lineH=eng.fs*opt.line;
    const ml=95+(opt.holes!=='none'?42:0)+(opt.ruling==='college'?70:0), mr=90, mt=120, mb=110;
    const paras=buildParas(text, eng.mkItem, eng.onWord);
    const cfg={ x0:ml, x1:P.w-mr, top:mt+lineH*0.85, bottom:P.h-mb, lineH, drift:opt.drift>0,
      paint:(ctx,Pp,idx)=>paintPaper(ctx,Pp,opt,ml,mr,mt,mb,lineH) };
    return composePages(paras, opt, eng, cfg).pages.map(p=>p.canvas);
  }

  /* ---- trazos "a mano" para marcos/líneas (temblor leve) ---- */
  function sketchLine(ctx,x0,y0,x1,y1,ink,rng,w){
    ctx.strokeStyle=`hsla(${ink.h},${ink.s}%,${ink.l}%,0.85)`; ctx.lineWidth=w||2; ctx.lineCap='round';
    const n=6; ctx.beginPath(); ctx.moveTo(x0,y0);
    for(let i=1;i<=n;i++){ const t=i/n;
      ctx.lineTo(x0+(x1-x0)*t+(rng()-0.5)*3, y0+(y1-y0)*t+(rng()-0.5)*3); }
    ctx.stroke();
  }
  function sketchRect(ctx,x0,y0,x1,y1,ink,rng){
    sketchLine(ctx,x0,y0,x1,y0,ink,rng); sketchLine(ctx,x1,y0,x1,y1,ink,rng);
    sketchLine(ctx,x1,y1,x0,y1,ink,rng); sketchLine(ctx,x0,y1,x0,y0,ink,rng);
  }
  function sketchEllipse(ctx,cx,cy,rx,ry,ink,rng){
    ctx.strokeStyle=`hsla(${ink.h},${ink.s}%,${ink.l}%,0.85)`; ctx.lineWidth=2.4; ctx.beginPath();
    for(let i=0;i<=26;i++){ const a=i/26*Math.PI*2;
      const x=cx+Math.cos(a)*(rx+(rng()-0.5)*4), y=cy+Math.sin(a)*(ry+(rng()-0.5)*4);
      i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
    ctx.stroke();
  }

  /* ---- flashcards: 6 tarjetas por hoja con borde de recorte ---- */
  function renderFlashcards(cards, opt, eng){
    const P=PAPER[opt.paper], lineH=eng.fs*opt.line;
    if(!cards.length) return [newPage(P).canvas];
    const mx=60,my=70,gx=36,gy=34, cols=2, rows=3;
    const cw=(P.w-2*mx-gx)/cols, chh=(P.h-2*my-(rows-1)*gy)/rows;
    const pages=[];
    for(let i=0;i<cards.length;i+=cols*rows){
      const pg=newPage(P); const ctx=pg.ctx;
      cards.slice(i,i+cols*rows).forEach((card,k)=>{
        const col=k%cols,row=(k/cols)|0, x0=mx+col*(cw+gx), y0=my+row*(chh+gy);
        ctx.save(); ctx.setLineDash([9,7]); ctx.strokeStyle='#b9c2d0'; ctx.lineWidth=1.5;
        ctx.strokeRect(x0,y0,cw,chh); ctx.restore();
        const qBottom=y0+chh*0.42;
        drawBlock(ctx, card.q, {x0:x0+18,x1:x0+cw-18,top:y0+lineH*1.0,bottom:qBottom}, eng, lineH);
        sketchLine(ctx,x0+14,qBottom+6,x0+cw-14,qBottom+6,eng.ink,eng.rng,1.6);
        drawBlock(ctx, card.a, {x0:x0+18,x1:x0+cw-18,top:qBottom+lineH*1.05,bottom:y0+chh-12}, eng, lineH);
      });
      pages.push(pg);
    }
    return pages.map(p=>p.canvas);
  }

  /* ---- boxing: cada idea dentro de una caja dibujada a mano ---- */
  function renderBoxing(ideas, opt, eng){
    const P=PAPER[opt.paper], lineH=eng.fs*opt.line;
    const ml=90,mr=80,mt=120,mb=110;
    const pages=[]; let pg=newPage(P); let y=mt+lineH;
    for(const idea of ideas){
      if(y>P.h-mb-lineH*2.5){ pages.push(pg); pg=newPage(P); y=mt+lineH; }
      const yEnd=drawBlock(pg.ctx, idea, {x0:ml+22,x1:P.w-mr-22,top:y,bottom:P.h-mb}, eng, lineH);
      sketchRect(pg.ctx, ml, y-lineH*0.85, P.w-mr, Math.min(yEnd-lineH*0.25,P.h-mb), eng.ink, eng.rng);
      y=yEnd+lineH*0.9;
    }
    pages.push(pg);
    return pages.map(p=>p.canvas);
  }

  /* ---- mapa mental: centro + ramas radiales ---- */
  function renderMindmap(mm, opt, eng){
    const P=PAPER[opt.paper], lineH=eng.fs*opt.line;
    const pg=newPage(P), ctx=pg.ctx;
    const cx=P.w/2, cy=P.h*0.42, rx=P.w*0.15, ry=lineH*1.6;
    sketchEllipse(ctx,cx,cy,rx,ry,eng.ink,eng.rng);
    drawBlock(ctx, mm.center||'Tema', {x0:cx-rx+22,x1:cx+rx-14,top:cy+eng.fs*0.35,bottom:cy+ry}, eng, lineH);
    const n=mm.branches.length||0;
    mm.branches.forEach((b,i)=>{
      const a=(i/Math.max(1,n))*Math.PI*2 - Math.PI/2;
      const bx=cx+Math.cos(a)*P.w*0.335, byy=cy+Math.sin(a)*P.h*0.28;
      sketchLine(ctx, cx+Math.cos(a)*rx*1.02, cy+Math.sin(a)*ry*1.05, bx, byy, eng.ink, eng.rng, 2.2);
      const half=P.w*0.13;
      const yTxt=drawBlock(ctx, b.term, {x0:bx-half,x1:bx+half,top:byy+eng.fs*0.2,bottom:byy+lineH*2}, eng, lineH);
      sketchLine(ctx,bx-half*0.8,yTxt-lineH*0.55,bx+half*0.8,yTxt-lineH*0.55,eng.ink,eng.rng,1.5);
      if(b.frag) drawBlock(ctx, b.frag, {x0:bx-half,x1:bx+half,top:yTxt-lineH*0.2,bottom:yTxt+lineH*2.4}, eng, lineH*0.92);
    });
    return [pg.canvas];
  }

  function renderCornell(data, opt, eng){
    const P=PAPER[opt.paper], lineH=eng.fs*opt.line;
    const mt=130, mb=110, ml=80, mr=70, usableW=P.w-ml-mr;
    const xDiv=ml+usableW*0.30, summaryH=(P.h-mt-mb)*0.20, ySum=P.h-mb-summaryH;
    const notes=buildParas(data.notes.map(n=>'• '+n).join('\n'), eng.mkItem, eng.onWord);
    const cfg={ x0:xDiv+24, x1:P.w-mr, top:mt+lineH*0.9, bottom:ySum-16, lineH, drift:opt.drift>0,
      paint:(ctx,Pp,idx)=>{ paintCornell(ctx,Pp,opt,ml,mr,mt,mb,xDiv,ySum,lineH);
        if(idx===0) drawBlock(ctx, data.cues.join('\n'), {x0:ml+8,x1:xDiv-14,top:mt+lineH*0.9,bottom:ySum-16}, eng, lineH); } };
    const {pages,last}=composePages(notes, opt, eng, cfg);
    if(data.summary) drawBlock(last.ctx, data.summary, {x0:ml+8,x1:P.w-mr,top:ySum+lineH*0.95,bottom:P.h-mb+8}, eng, lineH);
    return pages.map(p=>p.canvas);
  }

  /* ---------- generación principal ---------- */
  async function run(srcOverride){
    const src=(typeof srcOverride==='string'&&srcOverride)||document.getElementById('genText').value;
    if(!src.trim()){ APP.toast('Escribe, pega o arrastra un texto'); return; }
    const opt=buildOpt(); opt._seed=src.length;
    APP.busy('Componiendo…'); await tick();
    try{
      const eng=await makeEngine(opt);
      if(!eng.ok){ APP.idle(); APP.toast(eng.noGlyphs?'Esa caligrafía no tiene letras: captúrala o elige una fuente':'No se pudo preparar la letra'); return; }
      let canvases; const data=SUMMARIZE.format(src,opt.format);
      if(opt.format==='cornell')         canvases=renderCornell(data, opt, eng);
      else if(opt.format==='flashcards') canvases=renderFlashcards(data, opt, eng);
      else if(opt.format==='boxing')     canvases=renderBoxing(data, opt, eng);
      else if(opt.format==='mapa')       canvases=renderMindmap(data, opt, eng);
      else                               canvases=renderNormal(data, opt, eng);
      const host=document.getElementById('pages'); host.innerHTML='';
      document.getElementById('emptyPreview').style.display='none';
      lastPages=canvases.map(c=>({canvas:c})); for(const c of canvases) host.appendChild(c);
      APP.idle(); APP.toast(`${canvases.length} hoja${canvases.length>1?'s':''} ✦`);
    }catch(e){ console.error(e); APP.idle(); APP.toast('Error al generar: '+(e.message||e)); }
  }

  /* ---------- vista previa de realismo ---------- */
  let pvTimer=null;
  function schedulePreview(){ clearTimeout(pvTimer); pvTimer=setTimeout(renderRealismPreview,180); }
  async function renderRealismPreview(){
    const cv=document.getElementById('realismPreview'); if(!cv) return;
    // ancho mínimo: si el contenedor es angosto (o el layout aún no asentó) igual se ve bien
    const wrapW=Math.max(240,(cv.parentElement.clientWidth||260)-2), h=128, d=window.devicePixelRatio||1;
    cv.width=wrapW*d; cv.height=h*d; cv.style.width='100%'; cv.style.height=h+'px';
    const ctx=cv.getContext('2d'); ctx.setTransform(d,0,0,d,0,0); ctx.fillStyle='#fffdf8'; ctx.fillRect(0,0,wrapW,h);
    const opt=buildOpt(); opt._seed=777;
    const fs=Math.round(h*0.17), lineH=fs*1.8;
    ctx.strokeStyle='#e7eef6'; ctx.lineWidth=1;
    for(let y=fs+12; y<h; y+=lineH){ ctx.beginPath(); ctx.moveTo(8,y+3); ctx.lineTo(wrapW-8,y+3); ctx.stroke(); }
    let eng; try{ eng=await makeEngine(opt, fs); }catch(e){ return; }
    if(!eng.ok){ ctx.fillStyle='#8a8175'; ctx.font='13px Inter,sans-serif'; ctx.fillText('Captura tu letra o elige una fuente',12,h/2); return; }
    // mini-maqueta que refleja TODOS los sliders (caída, temblor, tachones, manchas, repintado)
    const rng=eng.rng, x0=12, x1=wrapW-12, bottom=h-6;
    const paras=buildParas('El pensamiento crítico\náéíóú ñ 123 ¿sí?', eng.mkItem, eng.onWord);
    const slp=()=>(rng()-0.5)*0.05*opt.drift + 0.035*(opt.fall||0);
    let x=x0, y=fs+12, slope=slp(), stop=false;
    const by=xx=>y+slope*(xx-x0);
    for(const para of paras){
      if(stop) break;
      if(para.blank){ x=x0; y+=lineH; slope=slp(); continue; }
      for(const word of para.words){
        if(eng.stepWord) eng.stepWord();
        const doStrike=opt.strikes>0 && word.w<(x1-x0)*0.5 && rng()<0.16*opt.strikes;
        if(x>x0 && x+word.w*(doStrike?2.2:1)>x1){ x=x0; y+=lineH; slope=slp(); if(y>bottom){stop=true;break;} }
        let wx0=x; const wSlope=((rng()-0.42)*0.055)*opt.jitter; const wy=xx=>by(xx)+wSlope*(xx-wx0);
        if(doStrike){ const sx0=x; for(const it of word.items){ it.render(ctx,x,wy(x)); x+=it.adv; }
          for(let k=0;k<2;k++){ const yy=wy((sx0+x)/2)-fs*(0.15+rng()*0.3);
            sketchLine(ctx,sx0-2,yy+(rng()-0.5)*3,x+2,yy+(rng()-0.5)*3,eng.ink,rng,Math.max(1.4,fs*0.06)); }
          x+=eng.spaceW*0.6; wx0=x; }
        let first=true; for(const it of word.items){ it.render(ctx,x,wy(x));
          if(first&&opt.blots&&rng()<0.012*opt.blots) eng.blot(ctx,x,wy(x)); first=false; x+=it.adv; }
        x+=eng.spaceW*(1+(rng()-0.4)*0.5*opt.jitter);
      }
      x=x0; y+=lineH; slope=slp(); if(y>bottom) stop=true;
    }
  }

  /* ---------- papel ---------- */
  function paintPaper(ctx,P,opt,ml,mr,mt,mb,lineH){
    ctx.fillStyle='#fffdf8'; ctx.fillRect(0,0,P.w,P.h); const right=P.w-mr;
    if(opt.ruling==='lined'||opt.ruling==='college'){
      ctx.strokeStyle='#cfe0ee'; ctx.lineWidth=1.2;
      for(let y=mt+lineH*0.85; y<=P.h-mb; y+=lineH){ ctx.beginPath(); ctx.moveTo(opt.ruling==='college'?ml-50:60,y); ctx.lineTo(right,y); ctx.stroke(); }
      if(opt.ruling==='college'){ ctx.strokeStyle='#f3b0b0'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(ml-50,mt-30); ctx.lineTo(ml-50,P.h-mb+20); ctx.stroke(); }
    } else if(opt.ruling.startsWith('grid')){
      // cuadrícula en mm reales (4/5/6/8) según el ancho del papel
      const mm=+opt.ruling.slice(4)||5;
      const wmm=opt.paper==='letter'?215.9:210;
      const step=P.w/wmm*mm;
      ctx.strokeStyle='#dfeaf3'; ctx.lineWidth=1;
      for(let y=mt;y<=P.h-mb;y+=step){ ctx.beginPath(); ctx.moveTo(60,y); ctx.lineTo(right,y); ctx.stroke(); }
      for(let x=60;x<=right;x+=step){ ctx.beginPath(); ctx.moveTo(x,mt); ctx.lineTo(x,P.h-mb); ctx.stroke(); }
    }
    paintHoles(ctx,P,opt);
  }
  function paintCornell(ctx,P,opt,ml,mr,mt,mb,xDiv,ySum,lineH){
    ctx.fillStyle='#fffdf8'; ctx.fillRect(0,0,P.w,P.h);
    ctx.strokeStyle='#eef2f8'; ctx.lineWidth=1;
    for(let y=mt+lineH*0.9; y<=ySum-8; y+=lineH){ ctx.beginPath(); ctx.moveTo(ml,y); ctx.lineTo(P.w-mr,y); ctx.stroke(); }
    ctx.strokeStyle='#b9c6e0'; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.moveTo(xDiv,mt-12); ctx.lineTo(xDiv,ySum); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ml,ySum); ctx.lineTo(P.w-mr,ySum); ctx.stroke();
    ctx.strokeStyle='#e6b3b3'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(ml,mt-12); ctx.lineTo(P.w-mr,mt-12); ctx.stroke();
    ctx.fillStyle='#9aa3b2'; ctx.font='600 20px Inter,sans-serif'; ctx.textBaseline='alphabetic';
    ctx.fillText('Claves', ml+6, mt-20); ctx.fillText('Notas', xDiv+24, mt-20); ctx.fillText('Resumen', ml+6, ySum+26);
    paintHoles(ctx,P,opt);
  }
  function paintHoles(ctx,P,opt){
    if(opt.holes==='3'){ ctx.fillStyle='#eef0f2'; ctx.strokeStyle='#d4d8dd'; ctx.lineWidth=1.5;
      for(const fy of[0.2,0.5,0.8]){const cy=P.h*fy;ctx.beginPath();ctx.arc(34,cy,15,0,7);ctx.fill();ctx.stroke();} }
    else if(opt.holes==='spiral'){ ctx.strokeStyle='#c8ccd1'; ctx.lineWidth=4;
      for(let y=60;y<P.h-40;y+=46){ ctx.beginPath(); ctx.ellipse(30,y,9,16,0,0,7); ctx.stroke(); } }
  }

  /* ---------- exportar PDF ---------- */
  async function exportPDF(){
    if(!lastPages.length){ APP.toast('Genera los apuntes primero'); return; }
    APP.busy('Creando PDF…');
    try{ const {jsPDF}=await LIBS.jspdf(); const paper=val('optPaper'); const mm=PAPER[paper].mm;
      const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:paper==='a4'?'a4':'letter'});
      lastPages.forEach((pg,i)=>{ if(i>0) pdf.addPage();
        pdf.addImage(pg.canvas.toDataURL('image/jpeg',0.92),'JPEG',0,0,mm[0],mm[1]); });
      pdf.save('apuntes-manuscritos.pdf'); APP.idle(); APP.toast('PDF descargado ⬇');
    }catch(e){ console.error(e); APP.idle(); APP.toast('No se pudo crear el PDF'); }
  }

  return { init, bind, populateFonts };
})();
