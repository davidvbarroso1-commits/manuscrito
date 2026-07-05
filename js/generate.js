/* generate.js — extrae texto, lo convierte al formato de apuntes elegido y lo maqueta.
   Dos motores de letra: (1) caligrafía capturada, (2) fuentes web. Vista previa de realismo. */
const GENERATE = (() => {
  let hooks = { getProfile:()=>null, getProfiles:()=>[] };
  function bind(h){ hooks=Object.assign(hooks,h); }
  let lastPages = [];
  let fontHand = [], fontPrint = [];
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
  const tick=()=>new Promise(r=>setTimeout(r,10));

  function init(){
    const sync=(id,v,fmt)=>{ const el=document.getElementById(id),o=document.getElementById(v);
      if(!el||!o)return; const f=fmt||(x=>x); el.addEventListener('input',()=>o.textContent=f(el.value)); o.textContent=f(el.value); };
    sync('optSize','valSize'); sync('optLine','valLine',x=>(+x).toFixed(1));
    sync('optPressure','valPressure'); sync('optTone','valTone'); sync('optTransp','valTransp');
    sync('optJitter','valJitter'); sync('optDrift','valDrift'); sync('optBlots','valBlots');
    sync('optWear','valWear'); sync('optSlant','valSlant',x=>x+'°');

    document.getElementById('optInstrument').addEventListener('change', e=>{
      const p=INSTRUMENTS[e.target.value]; if(p) document.getElementById('optColor').value=p.color; schedulePreview();
    });
    document.getElementById('optFontKind').addEventListener('change', populateFonts);
    document.getElementById('optFontSearch').addEventListener('input', debounce(populateFonts,250));
    document.getElementById('optFont').addEventListener('change', ()=>{ updateFontPreview(); schedulePreview(); });

    document.getElementById('docInput').addEventListener('change', e=>{ if(e.target.files[0]) handleFile(e.target.files[0]); });
    setupDropzone();

    document.getElementById('genBtn').addEventListener('click', run);
    document.getElementById('printBtn').addEventListener('click', ()=>{ if(!lastPages.length){APP.toast('Genera los apuntes primero');return;} window.print(); });
    document.getElementById('pdfBtn').addEventListener('click', exportPDF);

    // vista previa de realismo en vivo
    ['optInstrument','optColor','optSize','optLine','optPressure','optTone','optTransp',
     'optJitter','optDrift','optBlots','optWear','optSlant','optFontKind','optPaper'].forEach(id=>{
      const el=document.getElementById(id); if(el){ el.addEventListener('input',schedulePreview); el.addEventListener('change',schedulePreview); }
    });

    loadFontLibrary();
  }
  function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

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
    const base=(kind==='hand'?fontHand:fontPrint);
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
    jitter:+val('optJitter')/100, drift:+val('optDrift')/100, blots:+val('optBlots')/100,
    wear:+(val('optWear')||45)/100,
    slant:+val('optSlant'), instr:INSTRUMENTS[val('optInstrument')]||INSTRUMENTS['boli-azul'],
    format:val('optFormat'), fontVal:val('optFont')||'', _seed:1234 }; }

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
      const ok=await FONTS.ensure(family);
      const fs=fsOverride || opt.size*scale*1.5;
      const fontStr=`${fs}px "${family}", cursive`;
      const gap=fs*0.04;
      const m=document.createElement('canvas').getContext('2d'); m.font=fontStr;
      const spaceW=m.measureText(' ').width||fs*0.3;
      const wear=makeWear(opt,rng);
      const mkItem=(ch)=>{ const w=m.measureText(ch).width;
        return {adv:w+gap*0.4, render:(ctx,x,y)=>drawFontChar(ctx,ch,x,y,fontStr,fs,ink,opt,rng,wear)}; };
      return {ok:true, useFont:true, fs, spaceW, mkItem, ink, rng, blot:mkBlot(ink,fs,opt), stepWord:wear.step};
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
      transp:opt.transp, hotspot:opt.pressure };          // transparencia por-letra + presión intra-letra
    const stepWord=()=>{ wear.step(); R.widthMul=wear.widthMul; R.alphaMul=wear.alphaMul; };
    stepWord();
    const mkItem=(ch)=>{ const v=pickVariant(prof,ch,rng); if(!v) return {adv:fs*0.45,render:()=>{}};
      return {adv:RENDER.advance(v,fs,1)+gap, render:(ctx,x,y)=>RENDER.glyph(ctx,v,x,y,fs,ink,R)}; };
    return {ok:true, useFont:false, fs, spaceW:fs*0.34, mkItem, ink, rng, blot:mkBlot(ink,fs,opt), stepWord};
  }

  function drawFontChar(ctx,ch,x,baseY,fontStr,fontPx,ink,opt,rng,wear){
    const lJit=(rng()-0.5)*14*opt.tone;
    // transparencia aleatoria POR LETRA + desgaste del instrumento (tajado / tinta pobre)
    const tJit=1-opt.transp*(0.35+0.65*rng());
    const a=opt.instr.opacity*(1-rng()*0.12*opt.tone)*tJit*((wear&&wear.alphaMul)||1);
    ctx.save();
    ctx.translate(x, baseY+(rng()-0.5)*0.12*fontPx*opt.jitter);
    ctx.rotate((rng()-0.5)*0.05*opt.jitter);
    ctx.transform(1,0,Math.tan(-opt.slant*Math.PI/180),1,0,0);
    ctx.font=fontStr; ctx.textBaseline='alphabetic'; ctx.textAlign='left';
    ctx.fillStyle=`hsla(${ink.h},${ink.s}%,${clamp(ink.l+lJit,0,100)}%,${clamp(a,0,1)})`;
    ctx.fillText(ch,0,0);
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

  /* ---------- maquetación ---------- */
  function buildParas(text, mkItem){
    const out=[];
    for(const para of text.replace(/\r/g,'').split('\n')){
      if(para.trim()===''){ out.push({blank:true}); continue; }
      const words=[];
      for(const tok of para.split(/(\s+)/)){ if(tok===''||/^\s+$/.test(tok)) continue;
        const items=[]; let w=0; for(const ch of tok){ const it=mkItem(ch); items.push(it); w+=it.adv; } words.push({items,w}); }
      out.push({words});
    }
    return out;
  }
  function newPage(P){ const c=document.createElement('canvas'); c.width=P.w; c.height=P.h;
    c.className='page-canvas'; const cx=c.getContext('2d'); cx.fillStyle='#fffdf8'; cx.fillRect(0,0,P.w,P.h); return {canvas:c,ctx:cx}; }

  function composePages(paras, opt, eng, cfg){
    const P=PAPER[opt.paper], rng=eng.rng;
    const pages=[]; let pg=newPage(P), pageIndex=0; cfg.paint(pg.ctx,P,pageIndex);
    let x=cfg.x0, y=cfg.top, slope=cfg.drift?slp():0, dirty=false;
    function slp(){ return (rng()-0.5)*0.05*opt.drift; }
    function by(xx){ return y + slope*(xx-cfg.x0); }
    function nl(){ x=cfg.x0; y+=cfg.lineH; slope=cfg.drift?slp():0;
      if(y>cfg.bottom){ pages.push(pg); pageIndex++; pg=newPage(P); cfg.paint(pg.ctx,P,pageIndex); y=cfg.top; dirty=false; } }
    for(const para of paras){
      if(para.blank){ nl(); continue; }
      for(const word of para.words){
        if(eng.stepWord) eng.stepWord();                       // desgaste: tajado / tinta
        if(x>cfg.x0 && x+word.w>cfg.x1) nl();
        // inclinación propia de la palabra (sesgo hacia abajo → asimetría natural)
        const wx0=x, wSlope=((rng()-0.42)*0.055)*opt.jitter;
        const wy=xx=>by(xx)+wSlope*(xx-wx0);
        if(word.w>(cfg.x1-cfg.x0)){ for(const it of word.items){ if(x+it.adv>cfg.x1) nl(); it.render(pg.ctx,x,wy(x)); x+=it.adv; dirty=true; } }
        else { let first=true; for(const it of word.items){ it.render(pg.ctx,x,wy(x));
            if(first&&opt.blots&&rng()<0.012*opt.blots) eng.blot(pg.ctx,x,wy(x)); first=false; x+=it.adv; } dirty=true; }
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
    const paras=buildParas(text, eng.mkItem); let x=region.x0, y=region.top;
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
    const paras=buildParas(text, eng.mkItem);
    const cfg={ x0:ml, x1:P.w-mr, top:mt+lineH*0.85, bottom:P.h-mb, lineH, drift:opt.drift>0,
      paint:(ctx,Pp,idx)=>paintPaper(ctx,Pp,opt,ml,mr,mt,mb,lineH) };
    return composePages(paras, opt, eng, cfg).pages.map(p=>p.canvas);
  }

  function renderCornell(data, opt, eng){
    const P=PAPER[opt.paper], lineH=eng.fs*opt.line;
    const mt=130, mb=110, ml=80, mr=70, usableW=P.w-ml-mr;
    const xDiv=ml+usableW*0.30, summaryH=(P.h-mt-mb)*0.20, ySum=P.h-mb-summaryH;
    const notes=buildParas(data.notes.map(n=>'• '+n).join('\n'), eng.mkItem);
    const cfg={ x0:xDiv+24, x1:P.w-mr, top:mt+lineH*0.9, bottom:ySum-16, lineH, drift:opt.drift>0,
      paint:(ctx,Pp,idx)=>{ paintCornell(ctx,Pp,opt,ml,mr,mt,mb,xDiv,ySum,lineH);
        if(idx===0) drawBlock(ctx, data.cues.join('\n'), {x0:ml+8,x1:xDiv-14,top:mt+lineH*0.9,bottom:ySum-16}, eng, lineH); } };
    const {pages,last}=composePages(notes, opt, eng, cfg);
    if(data.summary) drawBlock(last.ctx, data.summary, {x0:ml+8,x1:P.w-mr,top:ySum+lineH*0.95,bottom:P.h-mb+8}, eng, lineH);
    return pages.map(p=>p.canvas);
  }

  /* ---------- generación principal ---------- */
  async function run(){
    const src=document.getElementById('genText').value;
    if(!src.trim()){ APP.toast('Escribe, pega o arrastra un texto'); return; }
    const opt=buildOpt(); opt._seed=src.length;
    APP.busy('Componiendo…'); await tick();
    try{
      const eng=await makeEngine(opt);
      if(!eng.ok){ APP.idle(); APP.toast(eng.noGlyphs?'Esa caligrafía no tiene letras: captúrala o elige una fuente':'No se pudo preparar la letra'); return; }
      let canvases;
      if(opt.format==='cornell') canvases=renderCornell(SUMMARIZE.format(src,'cornell'), opt, eng);
      else canvases=renderNormal(SUMMARIZE.format(src,opt.format), opt, eng);
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
    const wrapW=(cv.parentElement.clientWidth||260)-2, h=104, d=window.devicePixelRatio||1;
    cv.width=wrapW*d; cv.height=h*d; cv.style.width=wrapW+'px'; cv.style.height=h+'px';
    const ctx=cv.getContext('2d'); ctx.setTransform(d,0,0,d,0,0); ctx.fillStyle='#fffdf8'; ctx.fillRect(0,0,wrapW,h);
    ctx.strokeStyle='#e7eef6'; ctx.lineWidth=1;
    const opt=buildOpt(); opt._seed=777;
    const fs=Math.round(h*0.30), lineH=fs*1.7;
    for(let y=fs+8; y<h; y+=lineH){ ctx.beginPath(); ctx.moveTo(8,y+3); ctx.lineTo(wrapW-8,y+3); ctx.stroke(); }
    let eng; try{ eng=await makeEngine(opt, fs); }catch(e){ return; }
    if(!eng.ok){ ctx.fillStyle='#8a8175'; ctx.font='13px Inter,sans-serif'; ctx.fillText('Captura tu letra o elige una fuente',12,h/2); return; }
    drawBlock(ctx, 'Apuntes a mano: ¿qué tal?\náéíóú ñ 123 — prueba.', {x0:12,x1:wrapW-12,top:fs+8,bottom:h-2}, eng, lineH);
  }

  /* ---------- papel ---------- */
  function paintPaper(ctx,P,opt,ml,mr,mt,mb,lineH){
    ctx.fillStyle='#fffdf8'; ctx.fillRect(0,0,P.w,P.h); const right=P.w-mr;
    if(opt.ruling==='lined'||opt.ruling==='college'){
      ctx.strokeStyle='#cfe0ee'; ctx.lineWidth=1.2;
      for(let y=mt+lineH*0.85; y<=P.h-mb; y+=lineH){ ctx.beginPath(); ctx.moveTo(opt.ruling==='college'?ml-50:60,y); ctx.lineTo(right,y); ctx.stroke(); }
      if(opt.ruling==='college'){ ctx.strokeStyle='#f3b0b0'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(ml-50,mt-30); ctx.lineTo(ml-50,P.h-mb+20); ctx.stroke(); }
    } else if(opt.ruling==='grid'){
      ctx.strokeStyle='#dfeaf3'; ctx.lineWidth=1;
      for(let y=mt;y<=P.h-mb;y+=lineH){ ctx.beginPath(); ctx.moveTo(60,y); ctx.lineTo(right,y); ctx.stroke(); }
      for(let x=60;x<=right;x+=lineH){ ctx.beginPath(); ctx.moveTo(x,mt); ctx.lineTo(x,P.h-mb); ctx.stroke(); }
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
