/* generate.js — extrae texto de archivos, maqueta en hojas y exporta. */
const GENERATE = (() => {
  let hooks = { getProfile:()=>null };
  function bind(h){ hooks=Object.assign(hooks,h); }
  let lastPages = [];   // {canvas, w, h}

  const PAPER = {
    a4:     { w:1240, h:1754, mm:[210,297] },
    letter: { w:1275, h:1650, mm:[215.9,279.4] },
  };

  // instrumentos de escritura: color por defecto + comportamiento del trazo
  const INSTRUMENTS = {
    'boli-azul': { color:'#1f3ac4', brush:3.0, widthSpan:0.55, opacity:0.96, grain:0,    pooling:0   },
    'boli-negro':{ color:'#17181d', brush:2.9, widthSpan:0.50, opacity:0.96, grain:0,    pooling:0   },
    'lapiz':     { color:'#4d4d52', brush:3.2, widthSpan:1.00, opacity:0.70, grain:0.65, pooling:0   },
    'pluma':     { color:'#1d2473', brush:3.6, widthSpan:1.70, opacity:1.00, grain:0,    pooling:0.7 },
    'marcador':  { color:'#c0392b', brush:6.2, widthSpan:0.25, opacity:0.85, grain:0.05, pooling:0   },
    'color':     { color:'#2e7d32', brush:3.4, widthSpan:0.90, opacity:0.78, grain:0.45, pooling:0   },
  };

  function init(){
    // etiquetas de sliders
    const sync=(id,val,fmt)=>{ const el=document.getElementById(id),v=document.getElementById(val);
      const f=fmt||(x=>x); el.addEventListener('input',()=>v.textContent=f(el.value)); v.textContent=f(el.value); };
    sync('optSize','valSize'); sync('optLine','valLine',x=>(+x).toFixed(1));
    sync('optPressure','valPressure'); sync('optTone','valTone'); sync('optJitter','valJitter');
    sync('optSlant','valSlant',x=>x+'°');

    // al cambiar de instrumento, propone su color por defecto (editable después)
    document.getElementById('optInstrument').addEventListener('change', e=>{
      const p=INSTRUMENTS[e.target.value]; if(p) document.getElementById('optColor').value=p.color;
    });

    document.getElementById('docInput').addEventListener('change', onFile);
    document.getElementById('genBtn').addEventListener('click', run);
    document.getElementById('printBtn').addEventListener('click', ()=>{ if(!lastPages.length){APP.toast('Genera los apuntes primero');return;} window.print(); });
    document.getElementById('pdfBtn').addEventListener('click', exportPDF);
  }

  /* ---------- extracción de texto ---------- */
  async function onFile(e){
    const f=e.target.files[0]; if(!f) return;
    const st=document.getElementById('docStatus'); st.textContent='Leyendo…';
    try{
      const text=await extract(f);
      document.getElementById('genText').value=text.trim();
      st.textContent=`✓ ${f.name} (${text.length.toLocaleString()} caracteres)`;
    }catch(err){ console.error(err); st.textContent='✗ '+(err.message||'No se pudo leer'); APP.toast('Error al leer el archivo'); }
  }

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
    const pdfjs=await LIBS.pdfjs();
    const buf=await f.arrayBuffer();
    const pdf=await pdfjs.getDocument({data:buf}).promise;
    let out='';
    for(let p=1;p<=pdf.numPages;p++){ APP.busy(`Leyendo PDF… página ${p}/${pdf.numPages}`);
      const page=await pdf.getPage(p); const c=await page.getTextContent();
      let last=null;
      for(const it of c.items){ out+= (last && it.transform[5]<last-2 ? '\n':'') + it.str + (it.hasEOL?'\n':' '); last=it.transform[5]; }
      out+='\n\n';
    }
    APP.idle(); return out;
  }
  async function readDOCX(f){
    APP.busy('Cargando lector de Word…');
    const mammoth=await LIBS.mammoth();
    const buf=await f.arrayBuffer();
    const res=await mammoth.extractRawText({arrayBuffer:buf});
    APP.idle(); return res.value;
  }
  async function readImageOCR(f){
    APP.busy('Cargando OCR (puede tardar)…');
    const T=await LIBS.tesseract();
    const url=URL.createObjectURL(f);
    const res=await T.recognize(url,'spa+eng',{logger:m=>{ if(m.status==='recognizing text') APP.busy(`OCR… ${Math.round(m.progress*100)}%`);} });
    URL.revokeObjectURL(url); APP.idle(); return res.data.text;
  }

  /* ---------- elección de variante ---------- */
  function pickVariant(prof, ch, rng){
    let list=prof.glyphs[ch];
    if(!list||!list.length){
      const fb=CHARSET.fallback[ch];
      if(fb) list=prof.glyphs[fb];
    }
    if(!list||!list.length) return null;
    return list[Math.floor(rng()*list.length)%list.length];
  }

  /* ---------- generación ---------- */
  async function run(){
    const prof=hooks.getProfile();
    if(!prof){ APP.toast('Crea un perfil de caligrafía'); return; }
    if(!Object.keys(prof.glyphs).length){ APP.toast('Primero captura tu letra en "Estudio de letra"'); return; }
    const text=document.getElementById('genText').value;
    if(!text.trim()){ APP.toast('Escribe o sube un texto'); return; }

    APP.busy('Componiendo a mano…');
    await new Promise(r=>setTimeout(r,30));

    // precarga imágenes
    for(const ch in prof.glyphs) for(const v of prof.glyphs[ch]) await RENDER.preload(v);

    const opt={
      paper:val('optPaper'), ruling:val('optRuling'), holes:val('optHoles'),
      size:+val('optSize'), line:+val('optLine'), color:val('optColor'),
      pressure:+val('optPressure')/100, tone:+val('optTone')/100,
      jitter:+val('optJitter')/100, slant:+val('optSlant'),
      instr: INSTRUMENTS[val('optInstrument')] || INSTRUMENTS['boli-azul'],
    };
    const P=PAPER[opt.paper];
    const scale=P.w/820;
    const fs=opt.size*scale;                 // altura-x en px de página
    const lineH=fs*opt.line;
    const ml=95 + (opt.holes!=='none'?42:0) + (opt.ruling==='college'?70:0);
    const mr=90, mt=120, mb=110;
    const usableW=P.w-ml-mr;
    const spaceW=fs*0.34, gap=fs*0.05;

    const ink=RENDER.rgbToHsl(RENDER.hexToRgb(opt.color));
    const rng=RENDER.makeRng(0x9e37 ^ text.length);

    // 1) pre-elige variantes y mide
    const paras=text.replace(/\r/g,'').split('\n');
    const doc=[]; // [{words:[{glyphs:[{v,adv,ch}], w}]}]
    for(const para of paras){
      const words=[];
      for(const word of para.split(/(\s+)/)){
        if(word===''||/^\s+$/.test(word)){ continue; }
        const glyphs=[]; let w=0;
        for(const ch of word){
          const v=pickVariant(prof,ch,rng);
          const adv=v?RENDER.advance(v,fs,1)+gap : fs*0.45;
          glyphs.push({v,adv,ch}); w+=adv;
        }
        words.push({glyphs,w});
      }
      doc.push({words, blank:para.trim()===''});
    }

    // 2) maqueta
    lastPages=[];
    let page=newPage(P), ctx=page.ctx;
    const baselines=[];
    let y=mt+lineH*0.85;
    paintPaper(ctx,P,opt,ml,mr,mt,mb,lineH,fs);
    let x=ml;
    const R={pressure:opt.pressure,tone:opt.tone,jitter:opt.jitter,slantDeg:opt.slant,
      brush:opt.instr.brush, widthSpan:opt.instr.widthSpan, opacity:opt.instr.opacity,
      grain:opt.instr.grain, pooling:opt.instr.pooling, spacing:1, rng};

    function nextLine(){ x=ml; y+=lineH; if(y>P.h-mb){ finishPage(page); page=newPage(P); ctx=page.ctx; paintPaper(ctx,P,opt,ml,mr,mt,mb,lineH,fs); y=mt+lineH*0.85; } }

    for(const para of doc){
      if(para.blank){ nextLine(); continue; }
      for(const word of para.words){
        if(x>ml && x+word.w>ml+usableW) nextLine();
        // palabra más ancha que la línea: parte por letras
        if(word.w>usableW){
          for(const g of word.glyphs){
            if(x+g.adv>ml+usableW) nextLine();
            if(g.v) RENDER.glyph(ctx,g.v,x,y,fs,ink,R);
            x+=g.adv;
          }
        }else{
          for(const g of word.glyphs){ if(g.v) RENDER.glyph(ctx,g.v,x,y,fs,ink,R); x+=g.adv; }
        }
        x+=spaceW;
      }
      nextLine();
    }
    finishPage(page);

    // muestra
    const host=document.getElementById('pages'); host.innerHTML='';
    document.getElementById('emptyPreview').style.display='none';
    for(const pg of lastPages){ host.appendChild(pg.canvas); }
    APP.idle();
    APP.toast(`${lastPages.length} hoja${lastPages.length>1?'s':''} lista${lastPages.length>1?'s':''} ✦`);

    function newPage(P){ const c=document.createElement('canvas'); c.width=P.w; c.height=P.h;
      c.className='page-canvas'; const cx=c.getContext('2d');
      cx.fillStyle='#fffdf8'; cx.fillRect(0,0,P.w,P.h); return {canvas:c,ctx:cx}; }
    function finishPage(pg){ lastPages.push(pg); }
  }
  function val(id){ return document.getElementById(id).value; }

  /* ---------- papel ---------- */
  function paintPaper(ctx,P,opt,ml,mr,mt,mb,lineH,fs){
    // textura sutil
    ctx.fillStyle='#fffdf8'; ctx.fillRect(0,0,P.w,P.h);
    const left=ml, right=P.w-mr;
    if(opt.ruling==='lined'||opt.ruling==='college'){
      ctx.strokeStyle='#cfe0ee'; ctx.lineWidth=1.2;
      for(let y=mt+lineH*0.85; y<=P.h-mb; y+=lineH){
        ctx.beginPath(); ctx.moveTo(opt.ruling==='college'?ml-50:60, y); ctx.lineTo(right, y); ctx.stroke();
      }
      if(opt.ruling==='college'){
        ctx.strokeStyle='#f3b0b0'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(ml-50, mt-30); ctx.lineTo(ml-50, P.h-mb+20); ctx.stroke();
      }
    } else if(opt.ruling==='grid'){
      ctx.strokeStyle='#dfeaf3'; ctx.lineWidth=1;
      for(let y=mt; y<=P.h-mb; y+=lineH){ ctx.beginPath(); ctx.moveTo(60,y); ctx.lineTo(right,y); ctx.stroke(); }
      for(let x=60; x<=right; x+=lineH){ ctx.beginPath(); ctx.moveTo(x,mt); ctx.lineTo(x,P.h-mb); ctx.stroke(); }
    }
    // agujeros
    if(opt.holes==='3'){
      ctx.fillStyle='#eef0f2'; ctx.strokeStyle='#d4d8dd'; ctx.lineWidth=1.5;
      for(const fy of [0.2,0.5,0.8]){ const cy=P.h*fy; ctx.beginPath(); ctx.arc(34,cy,15,0,7); ctx.fill(); ctx.stroke(); }
    } else if(opt.holes==='spiral'){
      ctx.strokeStyle='#c8ccd1'; ctx.lineWidth=4;
      for(let y=60;y<P.h-40;y+=46){ ctx.beginPath(); ctx.ellipse(30,y,9,16,0,0,7); ctx.stroke(); }
    }
  }

  /* ---------- exportar PDF ---------- */
  async function exportPDF(){
    if(!lastPages.length){ APP.toast('Genera los apuntes primero'); return; }
    APP.busy('Creando PDF…');
    try{
      const {jsPDF}=await LIBS.jspdf();
      const paper=val('optPaper');
      const mm=PAPER[paper].mm;
      const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:paper==='a4'?'a4':'letter'});
      lastPages.forEach((pg,i)=>{
        if(i>0) pdf.addPage();
        const img=pg.canvas.toDataURL('image/jpeg',0.92);
        pdf.addImage(img,'JPEG',0,0,mm[0],mm[1]);
      });
      pdf.save('apuntes-manuscritos.pdf');
      APP.idle(); APP.toast('PDF descargado ⬇');
    }catch(e){ console.error(e); APP.idle(); APP.toast('No se pudo crear el PDF'); }
  }

  return { init, bind };
})();
