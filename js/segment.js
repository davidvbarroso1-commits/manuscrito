/* segment.js — visión por computadora compartida.
   Toma una imagen y devuelve glifos recortados (alpha = oscuridad real de la tinta),
   agrupados por líneas y ordenados en orden de lectura.
   Usado por: escaneo por-letra (x100) y escaneo de apuntes largos. */
const SEGMENT = (() => {

  function loadImage(file, maxDim){
    return new Promise((res,rej)=>{
      const img=new Image();
      img.onload=()=>{
        let w=img.naturalWidth, h=img.naturalHeight;
        const s=Math.min(1, maxDim/Math.max(w,h));
        w=Math.round(w*s); h=Math.round(h*s);
        const c=document.createElement('canvas'); c.width=w; c.height=h;
        const cx=c.getContext('2d',{willReadFrequently:true}); cx.drawImage(img,0,0,w,h);
        res({data:cx.getImageData(0,0,w,h), w, h, url:img.src});
      };
      img.onerror=()=>rej(new Error('No se pudo leer la imagen'));
      img.src=URL.createObjectURL(file);
    });
  }

  // alpha[i] = oscuridad 0..1 ; ink[i] = 1 si es tinta
  function binarize(imgData, T){
    const {data,width:w,height:h}=imgData;
    const alpha=new Float32Array(w*h), ink=new Uint8Array(w*h);
    for(let i=0,p=0;i<w*h;i++,p+=4){
      const lum=0.299*data[p]+0.587*data[p+1]+0.114*data[p+2];
      const a = lum<T ? (T-lum)/T : 0;
      alpha[i]=a; if(a>0.10) ink[i]=1;
    }
    return {alpha, ink, w, h};
  }

  // componentes conectados (8-vecinos) por flood fill iterativo
  function components(ink, w, h){
    const lab=new Int32Array(w*h).fill(0);
    const comps=[]; const stack=new Int32Array(w*h);
    let cur=0;
    for(let i=0;i<w*h;i++){
      if(!ink[i]||lab[i]) continue;
      cur++; let sp=0; stack[sp++]=i; lab[i]=cur;
      let minX=w,minY=h,maxX=0,maxY=0,cnt=0;
      while(sp){
        const idx=stack[--sp]; const x=idx%w, y=(idx/w)|0;
        if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; cnt++;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy)continue; const nx=x+dx, ny=y+dy;
          if(nx<0||ny<0||nx>=w||ny>=h)continue;
          const ni=ny*w+nx; if(ink[ni]&&!lab[ni]){ lab[ni]=cur; stack[sp++]=ni; }
        }
      }
      comps.push({minX,minY,maxX,maxY,cnt});
    }
    return comps;
  }

  // líneas por proyección horizontal de tinta
  function findLines(ink, w, h){
    const row=new Float32Array(h);
    for(let y=0;y<h;y++){ let s=0; for(let x=0;x<w;x++) s+=ink[y*w+x]; row[y]=s; }
    let mx=0; for(let y=0;y<h;y++) mx=Math.max(mx,row[y]);
    const thr=Math.max(2, mx*0.04);
    const lines=[]; let y0=-1;
    for(let y=0;y<h;y++){
      if(row[y]>thr){ if(y0<0)y0=y; }
      else if(y0>=0){ if(y-y0>=Math.max(8,h*0.012)) lines.push({y0,y1:y}); y0=-1; }
    }
    if(y0>=0) lines.push({y0,y1:h});
    return lines.length?lines:[{y0:0,y1:h}];
  }

  // agrupa componentes de UNA línea en glifos (une punto/tilde sobre su trazo)
  function clusterLine(comps){
    comps.sort((a,b)=>a.minX-b.minX);
    const used=new Array(comps.length).fill(false), glyphs=[];
    for(let i=0;i<comps.length;i++){
      if(used[i])continue; used[i]=true;
      let g={minX:comps[i].minX,minY:comps[i].minY,maxX:comps[i].maxX,maxY:comps[i].maxY};
      let changed=true;
      while(changed){ changed=false;
        for(let j=0;j<comps.length;j++){
          if(used[j])continue; const c=comps[j];
          const ox=Math.min(g.maxX,c.maxX)-Math.max(g.minX,c.minX);
          const minW=Math.min(g.maxX-g.minX, c.maxX-c.minX)+1;
          if(ox > minW*0.35){ // se solapan en X -> misma columna (tilde/punto)
            g.minX=Math.min(g.minX,c.minX); g.maxX=Math.max(g.maxX,c.maxX);
            g.minY=Math.min(g.minY,c.minY); g.maxY=Math.max(g.maxY,c.maxY);
            used[j]=true; changed=true;
          }
        }
      }
      glyphs.push(g);
    }
    return glyphs;
  }

  // recorta un glifo a un canvas RGBA con alpha=oscuridad
  function crop(alpha, w, g){
    const bw=g.maxX-g.minX+1, bh=g.maxY-g.minY+1;
    const c=document.createElement('canvas'); c.width=bw; c.height=bh;
    const cx=c.getContext('2d'); const id=cx.createImageData(bw,bh);
    for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
      const a=alpha[(g.minY+y)*w+(g.minX+x)]; const di=(y*bw+x)*4;
      id.data[di]=0; id.data[di+1]=0; id.data[di+2]=0; id.data[di+3]=Math.round(Math.min(1,a)*255);
    }
    cx.putImageData(id,0,0);
    return {canvas:c, bw, bh};
  }

  /* análisis completo. Devuelve líneas con glifos ordenados (orden de lectura). */
  async function analyze(file, T, maxDim){
    const {data,w,h}=await loadImage(file, maxDim||1500);
    const {alpha,ink}=binarize(data, T);
    const comps=components(ink,w,h);
    // filtra ruido por área
    const minArea=Math.max(6, w*h*0.00003), maxArea=w*h*0.25;
    const valid=comps.filter(c=>c.cnt>=minArea && c.cnt<=maxArea && (c.maxX-c.minX)>=2 && (c.maxY-c.minY)>=2);
    const lineBands=findLines(ink,w,h);
    // asigna cada componente a su banda (por centro vertical)
    const buckets=lineBands.map(()=>[]);
    for(const c of valid){
      const cy=(c.minY+c.maxY)/2;
      let bi=0,best=1e9;
      lineBands.forEach((b,k)=>{ const d=cy<b.y0?b.y0-cy:cy>b.y1?cy-b.y1:0; if(d<best){best=d;bi=k;} });
      buckets[bi].push(c);
    }
    const lines=[];
    buckets.forEach((cs,k)=>{
      if(!cs.length)return;
      const glyphRects=clusterLine(cs);
      const glyphs=glyphRects.map(g=>{ const cr=crop(alpha,w,g);
        return {canvas:cr.canvas, bw:cr.bw, bh:cr.bh, cx:(g.minX+g.maxX)/2, rect:g}; });
      glyphs.sort((a,b)=>a.cx-b.cx);
      lines.push({band:lineBands[k], glyphs});
    });
    const flat=[]; lines.forEach(l=>l.glyphs.forEach(g=>flat.push(g)));
    return {w, h, lines, flat, count:flat.length};
  }

  // convierte un glifo recortado + su carácter en una variante normalizada para RENDER
  function toVariant(glyph, ch){
    const m=CHARSET.metricsFor(ch);
    const hU=Math.max(0.15, m.top-m.bottom);
    const wU=(glyph.bw/glyph.bh)*hU;
    return { type:'image', img:glyph.canvas.toDataURL('image/png'),
             w:wU, h:hU, top:m.top, adv:wU+0.20 };
  }

  return { analyze, toVariant, loadImage, binarize };
})();
