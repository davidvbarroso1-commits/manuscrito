/* capture.js — lienzo para dibujar cada glifo a mano (con presión vía PointerEvent). */
const CAPTURE = (() => {
  // guías como fracción de la altura del lienzo
  const G = { ascender:0.18, cap:0.26, waist:0.45, baseline:0.74, descender:0.90 };
  const SIDEBEARING = 0.10;

  let guides, ink, gx, ix;       // canvases y contextos
  let W=0, H=0, dpr=1;
  let strokes = [];              // trazos del dibujo actual (px CSS)
  let cur = null;                // trazo en curso
  let drawing = false;
  let curChar = 'a';
  let brush = 3.5;
  let hooks = { getProfile:()=>null, persist:()=>{}, refresh:()=>{} };

  function bind(h){ hooks = Object.assign(hooks, h); }

  function init(){
    guides = document.getElementById('padGuides');
    ink = document.getElementById('padInk');
    gx = guides.getContext('2d');
    ix = ink.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    ink.addEventListener('pointerdown', onDown);
    ink.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    ink.addEventListener('pointerleave', onUp);

    document.getElementById('brushSize').addEventListener('input', e=>{ brush=+e.target.value; });
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('clearBtn').addEventListener('click', clearPad);
    document.getElementById('saveVariantBtn').addEventListener('click', save);
    document.getElementById('lsInput').addEventListener('change', onLetterScan);
    document.getElementById('lsMeta').addEventListener('input', updateLS);
  }

  function resize(){
    const r = ink.parentElement.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    for (const c of [guides, ink]){
      c.width = W*dpr; c.height = H*dpr;
      c.getContext('2d').setTransform(dpr,0,0,dpr,0,0);
    }
    drawGuides(); redrawInk();
  }

  function y(frac){ return frac*H; }
  function drawGuides(){
    gx.clearRect(0,0,W,H);
    const lines = [
      [G.ascender,'#eadfce',1], [G.cap,'#f0e7d6',1],
      [G.waist,'#dfe7fb',1.5], [G.baseline,'#9fb3f0',2], [G.descender,'#f0e7d6',1]
    ];
    for (const [f,c,w] of lines){
      gx.strokeStyle=c; gx.lineWidth=w;
      gx.beginPath(); gx.moveTo(0,y(f)); gx.lineTo(W,y(f)); gx.stroke();
    }
    // etiqueta tenue del carácter
    gx.fillStyle='rgba(180,170,150,.22)';
    gx.font = `${H*0.5}px Inter, sans-serif`;
    gx.textAlign='center'; gx.textBaseline='alphabetic';
    gx.fillText(curChar, W*0.5, y(G.baseline));
  }

  function pos(e){
    const r = ink.getBoundingClientRect();
    return { x:e.clientX-r.left, y:e.clientY-r.top, p:(e.pressure&&e.pressure>0)?e.pressure:0 };
  }
  function onDown(e){ e.preventDefault(); ink.setPointerCapture?.(e.pointerId); drawing=true; cur=[pos(e)]; }
  function onMove(e){
    if(!drawing) return; e.preventDefault();
    const p = pos(e); const last = cur[cur.length-1];
    if (Math.hypot(p.x-last.x, p.y-last.y) < 1) return;
    cur.push(p);
    // dibujo incremental
    ix.strokeStyle='#22201c'; ix.lineCap='round'; ix.lineJoin='round';
    ix.lineWidth = brush*(0.5+ (p.p||0.5));
    ix.beginPath(); ix.moveTo(last.x,last.y); ix.lineTo(p.x,p.y); ix.stroke();
  }
  function onUp(){ if(!drawing) return; drawing=false; if(cur&&cur.length) strokes.push(cur); cur=null; }

  function redrawInk(){
    ix.clearRect(0,0,W,H);
    ix.strokeStyle='#22201c'; ix.lineCap='round'; ix.lineJoin='round';
    for(const s of strokes){
      if(s.length===1){ ix.beginPath(); ix.arc(s[0].x,s[0].y,brush*0.6,0,7); ix.fillStyle='#22201c'; ix.fill(); continue; }
      for(let i=1;i<s.length;i++){
        ix.lineWidth=brush*(0.5+(s[i].p||0.5));
        ix.beginPath(); ix.moveTo(s[i-1].x,s[i-1].y); ix.lineTo(s[i].x,s[i].y); ix.stroke();
      }
    }
  }
  function undo(){ strokes.pop(); redrawInk(); }
  function clearPad(){ strokes=[]; cur=null; redrawInk(); }

  function setChar(ch){ curChar=ch; clearPad(); drawGuides(); renderVariants(); updateLS();
    document.getElementById('curGlyph').textContent=ch;
    document.getElementById('varChar').textContent=ch;
    const lsc=document.getElementById('lsChar'); if(lsc) lsc.textContent=ch;
    const cat = CHARSET.catOf(ch);
    const hint = {lower:'minúscula',upper:'mayúscula',digit:'número',punct:'signo'}[cat]||'';
    document.getElementById('curGlyphHint').textContent = '· '+hint;
  }

  // progreso por-letra x100 (meta ajustable)
  function updateLS(){
    const prof=hooks.getProfile(); if(!prof) return;
    const meta=+document.getElementById('lsMeta').value||100;
    const n=(prof.glyphs[curChar]||[]).length;
    const cnt=document.getElementById('lsCount'); if(cnt) cnt.textContent=`${n} / ${meta}`;
    const bar=document.getElementById('lsBar'); if(bar) bar.style.width=Math.min(100,n/meta*100)+'%';
    const vc=document.getElementById('varCount'); if(vc) vc.textContent=n?`· ${n}`:'';
  }

  async function onLetterScan(e){
    const f=e.target.files[0]; if(!f){ return; }
    const T=+document.getElementById('lsThresh').value;
    const ch=curChar;
    APP.busy('Separando repeticiones…');
    try{
      const r=await SEGMENT.analyze(f, T, 1600);
      if(!r.flat.length){ APP.idle(); APP.toast('No detecté letras. Ajusta el umbral o mejora la foto.'); e.target.value=''; return; }
      const prof=hooks.getProfile(); const list=prof.glyphs[ch]=prof.glyphs[ch]||[];
      for(const g of r.flat) list.push(SEGMENT.toVariant(g, ch));
      await hooks.persist();
      APP.idle();
      APP.toast(`+${r.flat.length} variantes de "${ch}" (total ${list.length})`);
      renderVariants(); updateLS(); hooks.refresh();
    }catch(err){ console.error(err); APP.idle(); APP.toast('No pude procesar la foto'); }
    e.target.value='';
  }

  function save(){
    if(!strokes.length){ APP.toast('Dibuja la letra primero ✍️'); return; }
    const baselineY = y(G.baseline), waistY = y(G.waist), unit = baselineY-waistY;
    let minX=1e9,maxX=-1e9;
    for(const s of strokes) for(const p of s){ if(p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x; }
    const norm = strokes.map(s=>s.map(p=>({
      x:(p.x-minX)/unit, y:(baselineY-p.y)/unit, p:p.p||0
    })));
    const inkW = (maxX-minX)/unit || 0.3;
    const variant = { type:'stroke', strokes:norm, inkW, adv: inkW + SIDEBEARING*2 };
    const prof = hooks.getProfile(); if(!prof) return;
    (prof.glyphs[curChar] = prof.glyphs[curChar] || []).push(variant);
    hooks.persist();
    clearPad();
    renderVariants(); updateLS();
    hooks.refresh();
    APP.toast(`"${curChar}" guardada (${prof.glyphs[curChar].length} variante${prof.glyphs[curChar].length>1?'s':''})`);
  }

  const CAP=48;          // máximo de miniaturas a mostrar (rendimiento)
  async function renderVariants(){
    const strip = document.getElementById('variantStrip');
    strip.innerHTML='';
    const prof = hooks.getProfile(); if(!prof) return;
    const list = prof.glyphs[curChar] || [];
    if(!list.length){ strip.innerHTML='<span class="muted sm">— sin variantes aún —</span>'; return; }
    const show=Math.min(list.length, CAP);
    const thumbs=await Promise.all(list.slice(0,show).map(v=>thumb(v,60,54)));  // paralelo
    for(let i=0;i<show;i++){
      const wrap=document.createElement('div'); wrap.className='variant-thumb';
      wrap.appendChild(thumbs[i]);
      const del=document.createElement('button'); del.className='del'; del.textContent='×';
      del.onclick=()=>{ list.splice(i,1); if(!list.length) delete prof.glyphs[curChar];
        hooks.persist(); renderVariants(); updateLS(); hooks.refresh(); };
      wrap.appendChild(del);
      strip.appendChild(wrap);
    }
    if(list.length>CAP){
      const more=document.createElement('div'); more.className='variant-more';
      more.innerHTML=`+${list.length-CAP}<br><button class="btn-ghost sm" id="clearVarsBtn">Vaciar</button>`;
      strip.appendChild(more);
      more.querySelector('#clearVarsBtn').onclick=()=>{ if(confirm(`¿Borrar las ${list.length} variantes de "${curChar}"?`)){
        delete prof.glyphs[curChar]; hooks.persist(); renderVariants(); updateLS(); hooks.refresh(); } };
    }
  }

  // miniatura de una variante
  async function thumb(variant, w, h){
    await RENDER.preload(variant);
    const c=document.createElement('canvas'); const d=window.devicePixelRatio||1;
    c.width=w*d; c.height=h*d; c.style.width=w+'px'; c.style.height=h+'px';
    const cx=c.getContext('2d'); cx.setTransform(d,0,0,d,0,0);
    const fs=h*0.5; const baseY=h*0.66;
    const rng=RENDER.makeRng(99);
    const adv = RENDER.advance(variant, fs, 1);
    RENDER.glyph(cx, variant, Math.max(2,(w-adv)/2), baseY, fs,
      {h:30,s:30,l:14}, {pressure:0.4,tone:0.2,jitter:0,slantDeg:0,brush:3,spacing:1,rng});
    return c;
  }

  return { init, bind, setChar, renderVariants, thumb, resize, get char(){return curChar;} };
})();
