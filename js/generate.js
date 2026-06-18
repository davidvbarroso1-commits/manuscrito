/* generate.js — extrae texto, lo resume si se pide, y lo maqueta en hojas.
   Dos motores de letra: (1) tu caligrafía capturada, (2) fuentes web (Google Fonts). */
const GENERATE = (() => {
  let hooks = { getProfile:()=>null, getProfiles:()=>[] };
  function bind(h){ hooks=Object.assign(hooks,h); }
  let lastPages = [];
  let fontHand = [], fontPrint = [], fontsReady = false;

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
  const val=id=>document.getElementById(id).value;

  function init(){
    const sync=(id,v,fmt)=>{ const el=document.getElementById(id),o=document.getElementById(v);
      const f=fmt||(x=>x); el.addEventListener('input',()=>o.textContent=f(el.value)); o.textContent=f(el.value); };
    sync('optSize','valSize'); sync('optLine','valLine',x=>(+x).toFixed(1));
    sync('optPressure','valPressure'); sync('optTone','valTone'); sync('optJitter','valJitter');
    sync('optSlant','valSlant',x=>x+'°');

    document.getElementById('optInstrument').addEventListener('change', e=>{
      const p=INSTRUMENTS[e.target.value]; if(p) document.getElementById('optColor').value=p.color;
    });

    // tipo de letra
    document.getElementById('optFontKind').addEventListener('change', populateFonts);
    document.getElementById('optFontSearch').addEventListener('input', populateFonts);
    document.getElementById('optFont').addEventListener('change', updateFontPreview);

    // archivos + arrastrar
    document.getElementById('docInput').addEventListener('change', e=>{ if(e.target.files[0]) handleFile(e.target.files[0]); });
    setupDropzone();

    document.getElementById('genBtn').addEventListener('click', run);
    document.getElementById('printBtn').addEventListener('click', ()=>{ if(!lastPages.length){APP.toast('Genera los apuntes primero');return;} window.print(); });
    document.getElementById('pdfBtn').addEventListener('click', exportPDF);

    loadFontLibrary();
  }

  /* ---------- biblioteca de fuentes ---------- */
  async function loadFontLibrary(){
    try{
      const r=await FONTS.load(); fontHand=r.hand; fontPrint=r.print; fontsReady=true;
      const note=document.getElementById('fontNote');
      if(note) note.textContent = r.full
        ? `${fontHand.length+fontPrint.length} fuentes disponibles`
        : `${fontHand.length+fontPrint.length} fuentes (catálogo básico sin conexión)`;
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
      updateFontPreview(); return;
    }
    document.getElementById('fontSearchRow').style.display='';
    const base=(kind==='hand'?fontHand:fontPrint);
    const list=base.filter(f=>!q||f.toLowerCase().includes(q)).slice(0,400);
    for(const f of list){ const o=document.createElement('option'); o.value='font:'+f; o.textContent=f; sel.appendChild(o); }
    if(!list.length){ const o=document.createElement('option'); o.textContent='(sin resultados)'; sel.appendChild(o); }
    updateFontPreview();
  }
  async function updateFontPreview(){
    const pv=document.getElementById('fontPreview'); if(!pv) return;
    const v=val('optFont')||'';
    if(v.startsWith('font:')){
      const fam=v.slice(5);
      pv.textContent='Aa Bb Cc — '+fam;
      await FONTS.ensure(fam);
      pv.style.fontFamily=`"${fam}", cursive`;
    }else{
      pv.style.fontFamily=''; pv.textContent='(usa los glifos que capturaste)';
    }
  }

  /* ---------- arrastrar y soltar ---------- */
  function setupDropzone(){
    const dz=document.getElementById('dropzone');
    const stop=e=>{ e.preventDefault(); e.stopPropagation(); };
    ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{stop(e);dz.classList.add('over');}));
    ['dragleave','dragend','drop'].forEach(ev=>dz.addEventListener(ev,e=>{stop(e);dz.classList.remove('over');}));
    dz.addEventListener('drop',e=>{ const f=e.dataTransfer.files[0]; if(f) handleFile(f); });
    dz.addEventListener('click',()=>document.getElementById('docInput').click());
    // evita que el navegador abra el archivo si sueltan fuera de la zona
    const prev=document.getElementById('view-generate');
    ['dragover','drop'].forEach(ev=>prev.addEventListener(ev,e=>{ if(e.target!==dz) e.preventDefault(); }));
  }

  async function handleFile(f){
    const st=document.getElementById('docStatus'); st.textContent='Leyendo '+f.name+'…';
    try{
      let text=(await extract(f)).trim();
      if(!text){ st.textContent='✗ No encontré texto en el archivo'; APP.toast('No encontré texto'); APP.idle(); return; }
      if(val('optMode')==='resumir' && text.length>180){
        APP.busy('Resumiendo…'); text=SUMMARIZE.run(text, 0.5); APP.idle();
      }
      document.getElementById('genText').value=text;
      st.textContent=`✓ ${f.name}`;
      await run();   // genera automáticamente
    }catch(err){ console.error(err); APP.idle(); st.textContent='✗ '+(err.message||'No se pudo leer'); APP.toast('Error al leer el archivo'); }
  }

  /* ---------- extracción de texto ---------- */
  async function extract(f){
    const name=f.name.toLowerCase();
    if(name.endsWith('.txt')||name.endsWith('.md')||f.type.startsWith('text/')) return await f.text();
    if(name.endsWith('.pdf')||f.type==='application/pdf') return await readPDF(f);
    if(name.endsWith('.docx')) return await readDOCX(f);
    if(f.type.startsWith('image/')) return await readImageOCR(f);
    return await f.text();
  }
  async function readPDF(f){
    APP.busy('Cargando lector de PDF…');
    const pdfjs=await LIBS.pdfjs(); const buf=await f.arrayBuffer();
    const pdf=await pdfjs.getDocument({data:buf}).promise; let out='';
    for(let p=1;p<=pdf.numPages;p++){ APP.busy(`Leyendo PDF… página ${p}/${pdf.numPages}`);
      const page=await pdf.getPage(p); const c=await page.getTextContent(); let last=null;
      for(const it of c.items){ out+=(last&&it.transform[5]<last-2?'\n':'')+it.str+(it.hasEOL?'\n':' '); last=it.transform[5]; }
      out+='\n\n';
    }
    APP.idle(); return out;
  }
  async function readDOCX(f){
    APP.busy('Cargando lector de Word…');
    const mammoth=await LIBS.mammoth(); const buf=await f.arrayBuffer();
    const res=await mammoth.extractRawText({arrayBuffer:buf}); APP.idle(); return res.value;
  }
  // OCR con preprocesado (escala + escala de grises + contraste) para texto IMPRESO.
  // La letra manuscrita en cursiva sigue siendo difícil para OCR offline.
  async function readImageOCR(f){
    APP.busy('Preparando imagen…');
    const T=await LIBS.tesseract();
    const url=URL.createObjectURL(f);
    const img=await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=url;});
    const sc=Math.min(3, Math.max(1, 1900/img.naturalWidth));
    const c=document.createElement('canvas'); c.width=Math.round(img.naturalWidth*sc); c.height=Math.round(img.naturalHeight*sc);
    const cx=c.getContext('2d',{willReadFrequently:true}); cx.drawImage(img,0,0,c.width,c.height);
    const id=cx.getImageData(0,0,c.width,c.height), d=id.data;
    let mn=255,mx=0; const g=new Float32Array(d.length/4);
    for(let i=0,j=0;i<d.length;i+=4,j++){ const v=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; g[j]=v; if(v<mn)mn=v; if(v>mx)mx=v; }
    const rg=Math.max(1,mx-mn);
    for(let i=0,j=0;i<d.length;i+=4,j++){ let v=(g[j]-mn)/rg; v=v<0.5? v*v*1.3 : 1-(1-v)*(1-v)*1.3; v=clamp(v,0,1)*255;
      d[i]=d[i+1]=d[i+2]=v; }
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

  /* ---------- generación ---------- */
  async function run(){
    const text=document.getElementById('genText').value;
    if(!text.trim()){ APP.toast('Escribe, pega o arrastra un texto'); return; }

    const opt={
      paper:val('optPaper'), ruling:val('optRuling'), holes:val('optHoles'),
      size:+val('optSize'), line:+val('optLine'), color:val('optColor'),
      pressure:+val('optPressure')/100, tone:+val('optTone')/100,
      jitter:+val('optJitter')/100, slant:+val('optSlant'),
      instr: INSTRUMENTS[val('optInstrument')] || INSTRUMENTS['boli-azul'],
    };
    const fontVal=val('optFont')||'';
    const useFont = fontVal.startsWith('font:');

    // --- prepara el motor de letra ---
    let prof=null, family=null, fontPx=0, fs=0, mkItem=null, spaceW=0;
    const P=PAPER[opt.paper], scale=P.w/820;
    const ink=RENDER.rgbToHsl(RENDER.hexToRgb(opt.color));
    const rng=RENDER.makeRng(0x9e37 ^ text.length);
    const gap = opt.size*scale*0.04;

    if(useFont){
      family=fontVal.slice(5);
      APP.busy('Cargando la fuente…'); await FONTS.ensure(family);
      fontPx=opt.size*scale*1.5;
      const m=document.createElement('canvas').getContext('2d'); m.font=`${fontPx}px "${family}"`;
      spaceW=m.measureText(' ').width || fontPx*0.3;
      const fontStr=`${fontPx}px "${family}"`;
      mkItem=(ch)=>{ const w=m.measureText(ch).width;
        return { adv:w+gap*0.4, render:(ctx,x,y)=>drawFontChar(ctx,ch,x,y,fontStr,fontPx,ink,opt,rng) }; };
      fs=fontPx;  // para interlineado/guías
    }else{
      // tu caligrafía: usa el perfil elegido (o el actual)
      if(fontVal.startsWith('profile:')){
        const id=fontVal.slice(8); prof=(hooks.getProfiles()||[]).find(p=>p.id===id);
      }
      prof=prof||hooks.getProfile();
      if(!prof || !Object.keys(prof.glyphs).length){
        APP.toast('Esa caligrafía no tiene letras. Captúrala o elige una fuente.'); return;
      }
      APP.busy('Componiendo a mano…'); await new Promise(r=>setTimeout(r,20));
      for(const ch in prof.glyphs) for(const v of prof.glyphs[ch]) await RENDER.preload(v);
      fs=opt.size*scale;
      spaceW=fs*0.34;
      const R={pressure:opt.pressure,tone:opt.tone,jitter:opt.jitter,slantDeg:opt.slant,
        brush:opt.instr.brush, widthSpan:opt.instr.widthSpan, opacity:opt.instr.opacity,
        grain:opt.instr.grain, pooling:opt.instr.pooling, spacing:1, rng};
      mkItem=(ch)=>{ const v=pickVariant(prof,ch,rng);
        if(!v) return { adv:fs*0.45, render:()=>{} };
        return { adv:RENDER.advance(v,fs,1)+gap, render:(ctx,x,y)=>RENDER.glyph(ctx,v,x,y,fs,ink,R) }; };
    }
    APP.busy('Componiendo…'); await new Promise(r=>setTimeout(r,10));

    const lineH=fs*opt.line;
    const ml=95 + (opt.holes!=='none'?42:0) + (opt.ruling==='college'?70:0);
    const mr=90, mt=120, mb=110;
    const usableW=P.w-ml-mr;

    // 1) construye el documento (mide avances)
    const paras=text.replace(/\r/g,'').split('\n');
    const doc=[];
    for(const para of paras){
      if(para.trim()===''){ doc.push({blank:true}); continue; }
      const words=[];
      for(const token of para.split(/(\s+)/)){
        if(token===''||/^\s+$/.test(token)) continue;
        const items=[]; let w=0;
        for(const ch of token){ const it=mkItem(ch); items.push(it); w+=it.adv; }
        words.push({items,w});
      }
      doc.push({words});
    }

    // 2) maqueta y dibuja
    lastPages=[];
    let page=newPage(P), ctx=page.ctx, y=mt+lineH*0.85, x=ml;
    paintPaper(ctx,P,opt,ml,mr,mt,mb,lineH);
    function nextLine(){ x=ml; y+=lineH; if(y>P.h-mb){ lastPages.push(page); page=newPage(P); ctx=page.ctx; paintPaper(ctx,P,opt,ml,mr,mt,mb,lineH); y=mt+lineH*0.85; } }
    for(const para of doc){
      if(para.blank){ nextLine(); continue; }
      for(const word of para.words){
        if(x>ml && x+word.w>ml+usableW) nextLine();
        if(word.w>usableW){ for(const it of word.items){ if(x+it.adv>ml+usableW) nextLine(); it.render(ctx,x,y); x+=it.adv; } }
        else { for(const it of word.items){ it.render(ctx,x,y); x+=it.adv; } }
        x+=spaceW;
      }
      nextLine();
    }
    lastPages.push(page);

    const host=document.getElementById('pages'); host.innerHTML='';
    document.getElementById('emptyPreview').style.display='none';
    for(const pg of lastPages) host.appendChild(pg.canvas);
    APP.idle();
    APP.toast(`${lastPages.length} hoja${lastPages.length>1?'s':''} ✦`);

    function newPage(P){ const c=document.createElement('canvas'); c.width=P.w; c.height=P.h;
      c.className='page-canvas'; const cx=c.getContext('2d'); cx.fillStyle='#fffdf8'; cx.fillRect(0,0,P.w,P.h); return {canvas:c,ctx:cx}; }
  }

  // dibuja un carácter con una fuente web, con realismo sutil (jitter/tono/inclinación)
  function drawFontChar(ctx,ch,x,baseY,fontStr,fontPx,ink,opt,rng){
    const lJit=(rng()-0.5)*14*opt.tone;
    const a=opt.instr.opacity*(1-rng()*0.12*opt.tone);
    ctx.save();
    ctx.translate(x, baseY+(rng()-0.5)*0.12*fontPx*opt.jitter);
    ctx.rotate((rng()-0.5)*0.05*opt.jitter);
    ctx.transform(1,0,Math.tan(-opt.slant*Math.PI/180),1,0,0);
    ctx.font=fontStr; ctx.textBaseline='alphabetic'; ctx.textAlign='left';
    ctx.fillStyle=`hsla(${ink.h},${ink.s}%,${clamp(ink.l+lJit,0,100)}%,${clamp(a,0,1)})`;
    ctx.fillText(ch,0,0);
    ctx.restore();
  }

  /* ---------- papel ---------- */
  function paintPaper(ctx,P,opt,ml,mr,mt,mb,lineH){
    ctx.fillStyle='#fffdf8'; ctx.fillRect(0,0,P.w,P.h);
    const right=P.w-mr;
    if(opt.ruling==='lined'||opt.ruling==='college'){
      ctx.strokeStyle='#cfe0ee'; ctx.lineWidth=1.2;
      for(let y=mt+lineH*0.85; y<=P.h-mb; y+=lineH){ ctx.beginPath(); ctx.moveTo(opt.ruling==='college'?ml-50:60,y); ctx.lineTo(right,y); ctx.stroke(); }
      if(opt.ruling==='college'){ ctx.strokeStyle='#f3b0b0'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(ml-50,mt-30); ctx.lineTo(ml-50,P.h-mb+20); ctx.stroke(); }
    } else if(opt.ruling==='grid'){
      ctx.strokeStyle='#dfeaf3'; ctx.lineWidth=1;
      for(let y=mt;y<=P.h-mb;y+=lineH){ ctx.beginPath(); ctx.moveTo(60,y); ctx.lineTo(right,y); ctx.stroke(); }
      for(let x=60;x<=right;x+=lineH){ ctx.beginPath(); ctx.moveTo(x,mt); ctx.lineTo(x,P.h-mb); ctx.stroke(); }
    }
    if(opt.holes==='3'){ ctx.fillStyle='#eef0f2'; ctx.strokeStyle='#d4d8dd'; ctx.lineWidth=1.5;
      for(const fy of [0.2,0.5,0.8]){ const cy=P.h*fy; ctx.beginPath(); ctx.arc(34,cy,15,0,7); ctx.fill(); ctx.stroke(); } }
    else if(opt.holes==='spiral'){ ctx.strokeStyle='#c8ccd1'; ctx.lineWidth=4;
      for(let y=60;y<P.h-40;y+=46){ ctx.beginPath(); ctx.ellipse(30,y,9,16,0,0,7); ctx.stroke(); } }
  }

  /* ---------- exportar PDF ---------- */
  async function exportPDF(){
    if(!lastPages.length){ APP.toast('Genera los apuntes primero'); return; }
    APP.busy('Creando PDF…');
    try{
      const {jsPDF}=await LIBS.jspdf(); const paper=val('optPaper'); const mm=PAPER[paper].mm;
      const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:paper==='a4'?'a4':'letter'});
      lastPages.forEach((pg,i)=>{ if(i>0) pdf.addPage();
        pdf.addImage(pg.canvas.toDataURL('image/jpeg',0.92),'JPEG',0,0,mm[0],mm[1]); });
      pdf.save('apuntes-manuscritos.pdf'); APP.idle(); APP.toast('PDF descargado ⬇');
    }catch(e){ console.error(e); APP.idle(); APP.toast('No se pudo crear el PDF'); }
  }

  return { init, bind, populateFonts };
})();
