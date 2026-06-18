/* scan.js — (1) genera plantilla imprimible, (2) extrae glifos de una foto. */
const SCAN = (() => {
  const G = { ascender:0.20, waist:0.45, baseline:0.74, descender:0.90 };
  const SIDEBEARING = 0.10;
  let hooks = { getProfile:()=>null, persist:()=>{}, refresh:()=>{} };
  function bind(h){ hooks = Object.assign(hooks, h); }

  let cv, cx;
  let state = null;     // { img, scale, corners:[{x,y}], srcW, srcH }
  let drag = -1;
  let pending = [];     // variantes extraídas pendientes de asignar

  function init(){
    cv = document.getElementById('scanCanvas'); cx = cv.getContext('2d');
    document.getElementById('genTemplateBtn').addEventListener('click', genTemplate);
    document.getElementById('scanInput').addEventListener('change', onFile);
    document.getElementById('scanProcessBtn').addEventListener('click', process);
    document.getElementById('scanSaveBtn').addEventListener('click', saveAll);
    document.getElementById('scanThresh').addEventListener('input', ()=>{ /* re-procesar manual */ });
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', ()=>drag=-1);
  }

  /* ---------- 1. PLANTILLA ---------- */
  function genTemplate(){
    const cols = +document.getElementById('tplCols').value || 7;
    const chars = CHARSET.all;
    const cells = chars.map(ch=>{
      const a=G.ascender*100, w=G.waist*100, b=G.baseline*100, d=G.descender*100;
      return `<div class="cell">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <line x1="0" y1="${a}" x2="100" y2="${a}" class="gl"/>
          <line x1="0" y1="${w}" x2="100" y2="${w}" class="gw"/>
          <line x1="0" y1="${b}" x2="100" y2="${b}" class="gb"/>
          <line x1="0" y1="${d}" x2="100" y2="${d}" class="gl"/>
        </svg>
        <span class="ghost" style="bottom:${100-b}%">${esc(ch)}</span>
        <span class="lbl">${esc(ch)}</span>
      </div>`;
    }).join('');
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Plantilla de caligrafía — Manuscrito</title>
<style>
  @page{size:A4;margin:12mm}
  *{box-sizing:border-box}
  body{font-family:Inter,Arial,sans-serif;margin:0;color:#333}
  .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .head h1{font-size:16px;margin:0}
  .note{font-size:11px;color:#777;max-width:62%}
  .corner{position:fixed;width:14px;height:14px;border:2px solid #444}
  .grid{display:grid;grid-template-columns:repeat(${cols},1fr);gap:0;border-left:1px solid #cfd8e8;border-top:1px solid #cfd8e8}
  .cell{position:relative;border-right:1px solid #cfd8e8;border-bottom:1px solid #cfd8e8;height:84px}
  .cell svg{position:absolute;inset:0;width:100%;height:100%}
  .gl{stroke:#e3e9f2;stroke-width:1}
  .gw{stroke:#dfe7fb;stroke-width:1}
  .gb{stroke:#c3d0ee;stroke-width:1.4}
  .ghost{position:absolute;left:50%;transform:translateX(-50%);font-size:34px;color:#e7ebf2;line-height:1}
  .lbl{position:absolute;top:2px;left:4px;font-size:9px;color:#b9c2d0}
  .btnbar{margin-bottom:10px}
  button{font:inherit;padding:8px 14px;border:none;border-radius:8px;background:#3b5bdb;color:#fff;cursor:pointer}
  @media print{.btnbar{display:none}}
</style></head><body>
  <div class="btnbar"><button onclick="window.print()">🖨️ Imprimir plantilla</button></div>
  <div class="head"><h1>✍️ Plantilla de caligrafía</h1>
    <div class="note">Escribe cada letra <b>sobre la línea base</b> (la más marcada), centrada en su casilla y con bolígrafo oscuro. Luego tómale una foto recta y con buena luz, y súbela en Manuscrito.</div></div>
  <div class="grid">${cells}</div>
  <p style="font-size:10px;color:#999;margin-top:8px">Total: ${chars.length} casillas · ${cols} columnas · Manuscrito</p>
</body></html>`;
    const w = window.open('', '_blank');
    if(!w){ APP.toast('Permite las ventanas emergentes para ver la plantilla'); return; }
    w.document.write(html); w.document.close();
  }
  function esc(c){ return c.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ---------- 2. SUBIR FOTO ---------- */
  function onFile(e){
    const f = e.target.files[0]; if(!f) return;
    const img = new Image();
    img.onload = ()=>{
      const maxW = Math.min(900, (cv.parentElement.clientWidth||820)-4);
      const scale = Math.min(1, maxW/img.naturalWidth);
      state = { img, scale, srcW:img.naturalWidth, srcH:img.naturalHeight,
        corners:[ {x:img.naturalWidth*0.06,y:img.naturalHeight*0.10},
                  {x:img.naturalWidth*0.94,y:img.naturalHeight*0.10},
                  {x:img.naturalWidth*0.94,y:img.naturalHeight*0.92},
                  {x:img.naturalWidth*0.06,y:img.naturalHeight*0.92} ] };
      document.getElementById('scanWork').hidden=false;
      document.getElementById('scanAssign').hidden=true;
      // filas sugeridas
      const cols=+document.getElementById('scanCols').value||7;
      document.getElementById('scanRows').value = Math.ceil(CHARSET.all.length/cols);
      draw();
    };
    img.src = URL.createObjectURL(f);
  }

  function draw(){
    if(!state) return;
    const s = state.scale;
    cv.width = state.srcW*s; cv.height = state.srcH*s;
    cx.setTransform(1,0,0,1,0,0);
    cx.drawImage(state.img,0,0,cv.width,cv.height);
    const pts = state.corners.map(c=>({x:c.x*s,y:c.y*s}));
    // cuadrícula previa
    const rows=+document.getElementById('scanRows').value||1, cols=+document.getElementById('scanCols').value||7;
    cx.strokeStyle='rgba(59,91,219,.55)'; cx.lineWidth=1;
    for(let r=0;r<=rows;r++){ const v=r/rows;
      const A=lerp(pts[0],pts[3],v), B=lerp(pts[1],pts[2],v);
      cx.beginPath();cx.moveTo(A.x,A.y);cx.lineTo(B.x,B.y);cx.stroke(); }
    for(let c=0;c<=cols;c++){ const u=c/cols;
      const A=lerp(pts[0],pts[1],u), B=lerp(pts[3],pts[2],u);
      cx.beginPath();cx.moveTo(A.x,A.y);cx.lineTo(B.x,B.y);cx.stroke(); }
    // marco + manijas
    cx.strokeStyle='#3b5bdb'; cx.lineWidth=2;
    cx.beginPath(); cx.moveTo(pts[0].x,pts[0].y);
    for(let i=1;i<4;i++) cx.lineTo(pts[i].x,pts[i].y); cx.closePath(); cx.stroke();
    cx.fillStyle='#3b5bdb';
    for(const p of pts){ cx.beginPath(); cx.arc(p.x,p.y,7,0,7); cx.fill();
      cx.fillStyle='#fff'; cx.beginPath(); cx.arc(p.x,p.y,3,0,7); cx.fill(); cx.fillStyle='#3b5bdb'; }
  }
  function lerp(a,b,t){ return {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t}; }

  function cpos(e){ const r=cv.getBoundingClientRect(); return {x:(e.clientX-r.left)/state.scale, y:(e.clientY-r.top)/state.scale}; }
  function onDown(e){ if(!state)return; const p=cpos(e); drag=-1; let best=24/state.scale;
    state.corners.forEach((c,i)=>{ const d=Math.hypot(c.x-p.x,c.y-p.y); if(d<best){best=d;drag=i;} }); }
  function onMove(e){ if(drag<0||!state)return; const p=cpos(e);
    state.corners[drag]={x:clamp(p.x,0,state.srcW),y:clamp(p.y,0,state.srcH)}; draw(); }
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

  /* ---------- extraer celdas ---------- */
  function process(){
    if(!state){ APP.toast('Sube una foto primero'); return; }
    const rows=+document.getElementById('scanRows').value, cols=+document.getElementById('scanCols').value;
    const T=+document.getElementById('scanThresh').value;
    const [TL,TR,BR,BL]=state.corners;
    // pixeles fuente
    const off=document.createElement('canvas'); off.width=state.srcW; off.height=state.srcH;
    const ox=off.getContext('2d'); ox.drawImage(state.img,0,0);
    const src=ox.getImageData(0,0,state.srcW,state.srcH).data;
    pending=[];
    const SH=170;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const u0=c/cols,u1=(c+1)/cols,v0=r/rows,v1=(r+1)/rows;
        const cTL=bil(TL,TR,BR,BL,u0,v0), cTR=bil(TL,TR,BR,BL,u1,v0),
              cBR=bil(TL,TR,BR,BL,u1,v1), cBL=bil(TL,TR,BR,BL,u0,v1);
        const wpx=(dist(cTL,cTR)+dist(cBL,cBR))/2, hpx=(dist(cTL,cBL)+dist(cTR,cBR))/2;
        const SW=Math.max(20,Math.round(SH*(wpx/Math.max(1,hpx))));
        const cell=new Float32Array(SW*SH);   // alpha 0..1
        let minX=SW,minY=SH,maxX=0,maxY=0,has=false;
        const m=Math.round(SW*0.04), mY=Math.round(SH*0.04); // margen interno (ignora bordes)
        for(let oy=0;oy<SH;oy++){
          for(let ox2=0;ox2<SW;ox2++){
            const uu=ox2/SW,vv=oy/SH;
            const P=quad(cTL,cTR,cBR,cBL,uu,vv);
            const sx=P.x|0, sy=P.y|0;
            if(sx<0||sy<0||sx>=state.srcW||sy>=state.srcH) continue;
            const i=(sy*state.srcW+sx)*4;
            const lum=0.299*src[i]+0.587*src[i+1]+0.114*src[i+2];
            let a = lum<T ? (T-lum)/T : 0;
            if(ox2<m||ox2>=SW-m||oy<mY||oy>=SH-mY) a=0; // recorta bordes de casilla
            if(a>0.06){ has=true; if(ox2<minX)minX=ox2; if(ox2>maxX)maxX=ox2; if(oy<minY)minY=oy; if(oy>maxY)maxY=oy; }
            cell[oy*SW+ox2]=a;
          }
        }
        if(!has) continue;
        // recorta bbox -> imagen alpha
        const bw=maxX-minX+1, bh=maxY-minY+1;
        const gc=document.createElement('canvas'); gc.width=bw; gc.height=bh;
        const gd=gc.getContext('2d').createImageData(bw,bh);
        for(let yy=0;yy<bh;yy++) for(let xx=0;xx<bw;xx++){
          const a=cell[(minY+yy)*SW+(minX+xx)]; const di=(yy*bw+xx)*4;
          gd.data[di]=0; gd.data[di+1]=0; gd.data[di+2]=0; gd.data[di+3]=Math.round(Math.min(1,a)*255);
        }
        gc.getContext('2d').putImageData(gd,0,0);
        const baseline=G.baseline*SH, waist=G.waist*SH, unit=baseline-waist;
        const wU=bw/unit, hU=bh/unit, topU=(baseline-minY)/unit;
        pending.push({ type:'image', img:gc.toDataURL('image/png'),
          w:wU, h:hU, top:topU, adv:wU+SIDEBEARING*2 });
      }
    }
    if(!pending.length){ APP.toast('No detecté tinta. Ajusta el marco o el umbral.'); return; }
    renderAssign();
  }
  function bil(TL,TR,BR,BL,u,v){ const t=lerp(TL,TR,u),b=lerp(BL,BR,u); return lerp(t,b,v); }
  function quad(TL,TR,BR,BL,u,v){ const t=lerp(TL,TR,u),b=lerp(BL,BR,u); return lerp(t,b,v); }
  function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }

  async function renderAssign(){
    document.getElementById('scanAssign').hidden=false;
    const grid=document.getElementById('assignGrid'); grid.innerHTML='';
    const chars=CHARSET.all;
    for(let i=0;i<pending.length;i++){
      const v=pending[i];
      const cell=document.createElement('div'); cell.className='assign-cell';
      const img=document.createElement('img'); img.src=v.img; img.style.filter='invert(.1)';
      cell.appendChild(img);
      const inp=document.createElement('input'); inp.maxLength=2; inp.value=chars[i]||'';
      inp.dataset.idx=i; cell.appendChild(inp);
      grid.appendChild(cell);
    }
    document.getElementById('scanAssign').scrollIntoView({behavior:'smooth'});
    APP.toast(`Extraje ${pending.length} casillas. Revisa la asignación.`);
  }

  function saveAll(){
    const prof=hooks.getProfile(); if(!prof) return;
    const inputs=document.querySelectorAll('#assignGrid input');
    let n=0;
    inputs.forEach(inp=>{
      const ch=inp.value.trim(); if(!ch) return;
      const v=pending[+inp.dataset.idx];
      (prof.glyphs[ch]=prof.glyphs[ch]||[]).push(v); n++;
    });
    if(!n){ APP.toast('Asigna al menos una letra'); return; }
    hooks.persist(); hooks.refresh();
    document.getElementById('scanAssign').hidden=true;
    document.getElementById('assignGrid').innerHTML='';
    pending=[];
    APP.toast(`Guardé ${n} letras desde la plantilla ✓`);
  }

  return { init, bind };
})();
