/* render.js — dibuja un glifo capturado con realismo de pluma.
   Coordenadas normalizadas de una variante: 1 unidad = altura-x; baseline = 0; y crece hacia ARRIBA.
   - stroke: { type:'stroke', strokes:[[{x,y,p}]], inkW, adv }
   - image:  { type:'image', img:dataURL, w, top, h, adv }  (alpha de la imagen = oscuridad de la tinta) */
const RENDER = (() => {

  /* --- PRNG determinista --- */
  function mulberry32(seed){
    let a = seed >>> 0;
    return function(){
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed){ return mulberry32(seed); }

  /* --- color helpers --- */
  function hexToRgb(hex){
    hex = hex.replace('#','');
    if (hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
    return { r:parseInt(hex.slice(0,2),16), g:parseInt(hex.slice(2,4),16), b:parseInt(hex.slice(4,6),16) };
  }
  function rgbToHsl({r,g,b}){
    r/=255;g/=255;b/=255;
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h,s,l=(mx+mn)/2;
    if(mx===mn){h=s=0;}else{const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);
      switch(mx){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h/=6;}
    return {h:h*360,s:s*100,l:l*100};
  }
  function hsl(h,s,l,a){ return `hsla(${h},${s}%,${l}%,${a})`; }

  /* image tint cache: alpha de imagen = oscuridad, se recolorea preservando esa variación tonal.
     El brillo se cuantiza (pasos de 4) para que el cache no crezca por glifo; tope 400 entradas. */
  const tintCache = new Map();
  function tinted(variant, color){
    const key = variant.img.length + '|' + variant.img.slice(-24) + '|' + color;
    if (tintCache.has(key)) return tintCache.get(key);
    if (tintCache.size > 400) tintCache.clear();
    const im = variant._imgEl;            // ya precargada
    const c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const cx = c.getContext('2d');
    cx.drawImage(im,0,0);
    cx.globalCompositeOperation = 'source-in';   // conserva alpha (tono), pinta color
    cx.fillStyle = color; cx.fillRect(0,0,c.width,c.height);
    tintCache.set(key, c);
    return c;
  }

  // precarga la imagen de una variante (debe llamarse antes de renderizar)
  function preload(variant){
    return new Promise(res=>{
      if (variant.type!=='image' || variant._imgEl) return res();
      const im = new Image(); im.onload=()=>{variant._imgEl=im;res();}; im.onerror=()=>res();
      im.src = variant.img;
    });
  }

  /* mide el avance (ancho) en px */
  function advance(variant, fs, spacing){ return variant.adv * fs * spacing; }

  /* dibuja UN glifo. Devuelve el avance px.
     R = { pressure, tone, jitter, slantDeg, rng, brush }  (0..1 salvo slantDeg/brush) */
  function glyph(ctx, variant, penX, baseY, fs, baseHsl, R){
    const rng = R.rng;
    const j = R.jitter;
    // jitter por-glifo
    const rot = (rng()-0.5) * 0.06 * j;                 // rotación leve
    const sxv = 1 + (rng()-0.5) * 0.10 * j;             // escala horizontal
    const syv = 1 + (rng()-0.5) * 0.07 * j;             // escala vertical
    const blJit = (rng()-0.5) * 0.18 * fs * j;          // salto de línea base
    const slantTan = Math.tan(R.slantDeg * Math.PI/180);
    // tono por-glifo: leve cambio de claridad y alpha
    // R.smooth (disimulo) amortigua los saltos de tono/transparencia entre letras
    const sK = 1 - (R.smooth||0);
    const lJit = (rng()-0.5) * 16 * R.tone * (0.4+0.6*sK);
    const tMix = 0.5 + (rng()-0.5)*sK;
    const tJit = 1 - (R.transp||0) * (0.35 + 0.65*tMix);
    const gAlpha = (1 - (0.5+(rng()-0.5)*sK) * 0.12 * R.tone) * tJit * (R.alphaMul||1);
    const sb = (variant.adv - (variant.inkW ?? variant.w ?? variant.adv)) / 2;
    const originX = penX + sb * fs;
    const originY = baseY + blJit;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const sx = fs * sxv, sy = fs * syv;

    if (variant.type === 'image'){
      const qL = Math.round(clamp(baseHsl.l + lJit,0,100)/4)*4;   // cuantizado → cache reutilizable
      const img = tinted(variant, hsl(baseHsl.h, baseHsl.s, qL, 1));
      ctx.save();
      ctx.globalAlpha = clamp(gAlpha * (R.opacity ?? 1), 0, 1);
      ctx.translate(originX, originY);
      ctx.rotate(rot);
      ctx.transform(1, 0, -slantTan, 1, 0, 0);
      const gw = variant.w * sx, gh = variant.h * sy, gy0 = -variant.top * sy;
      ctx.drawImage(img, 0, gy0, gw, gh);
      // zona de MÁS presión dentro de la letra: re-dibuja recortado en una elipse aleatoria
      if ((R.hotspot||0) > 0.2 && rng() < 0.75){
        ctx.beginPath();
        ctx.ellipse(gw*rng(), gy0 + gh*rng(), gw*0.35, gh*0.28, rng()*3, 0, 7);
        ctx.clip();
        ctx.globalAlpha = clamp(gAlpha * (R.opacity ?? 1) * (0.45 + 0.45*R.hotspot), 0, 1);
        ctx.drawImage(img, 0, gy0, gw, gh);
      }
      ctx.restore();
      return advance(variant, fs, R.spacing);
    }

    // --- stroke ---
    // transforma un punto unidad a px de pantalla
    function tp(ux, uy){
      const hx = ux + slantTan * uy;       // shear (inclinación)
      let X = hx * sx, Y = -uy * sy;       // escala (y hacia abajo en pantalla)
      const Xr = X*cos - Y*sin, Yr = X*sin + Y*cos;   // rotación
      return [originX + Xr, originY + Yr];
    }
    // parámetros del instrumento (con valores por defecto seguros)
    const opacity  = R.opacity   ?? 1;     // opacidad máxima de la tinta
    const grain    = R.grain     ?? 0;     // textura (lápiz)
    const widthSpan= R.widthSpan ?? 1.0;   // cuánto engrosa con la presión (pluma > boli)
    const pooling  = R.pooling   ?? 0;     // acumulación de tinta en inicios/finales (pluma)
    const baseWidth = R.brush * (fs/26);   // grosor base proporcional al tamaño
    for (const stroke of variant.strokes){
      if (!stroke.length) continue;
      const ph = rng()*100; const L = stroke.length;
      if (L === 1){
        const [x,y] = tp(stroke[0].x, stroke[0].y);
        const pr = pressureAt(stroke[0], 0, ph, R);
        let a = gAlpha*inkAlpha(pr,R)*opacity; if(grain>0) a*=1-grain*0.4*rng();
        ctx.fillStyle = hsl(baseHsl.h, baseHsl.s, clamp(baseHsl.l+lJit,0,100), clamp(a,0,1));
        ctx.beginPath(); ctx.arc(x,y, baseWidth*(0.5+pr*0.7), 0, 7); ctx.fill();
        continue;
      }
      ctx.lineCap='round'; ctx.lineJoin='round';
      // punto de presión propio de este trazo (zona más marcada dentro de la letra)
      const hsT = rng(), hs = R.hotspot||0;
      for (let i=1;i<L;i++){
        const a=stroke[i-1], b=stroke[i];
        const [x0,y0]=tp(a.x,a.y), [x1,y1]=tp(b.x,b.y);
        const u = i/(L-1);
        let pr = pressureAt(b, u, ph, R);
        if (hs>0.2) pr = clamp(pr + hs*0.45*Math.exp(-Math.pow((u-hsT)/0.16,2)), 0, 1.15);
        const endProx = pooling>0 ? Math.max(0, 1 - Math.min(u,1-u)/0.18) : 0;
        let w  = baseWidth * (0.4 + widthSpan*pr) * (1 + pooling*0.5*endProx) * (R.widthMul||1);
        let al = gAlpha*inkAlpha(pr,R)*opacity * (1 + pooling*0.22*endProx);
        if(grain>0){ al *= 1 - grain*0.55*rng(); w *= 1 + (rng()-0.5)*grain*0.5; }
        ctx.strokeStyle = hsl(baseHsl.h, baseHsl.s, clamp(baseHsl.l+lJit,0,100), clamp(al,0,1));
        ctx.lineWidth = Math.max(0.4, w);
        ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
      }
    }
    return advance(variant, fs, R.spacing);
  }

  // presión efectiva 0..1: mezcla la capturada con ruido lento; modulada por el slider
  function pressureAt(pt, t, phase, R){
    const captured = (pt.p && pt.p>0) ? pt.p : 0.5;
    const noise = 0.5 + 0.5*Math.sin(t*6.0 + phase) * Math.sin(t*2.3 + phase*1.7);
    const mixed = captured*0.6 + noise*0.4;
    // amount=0 -> presión plana (0.55); amount=1 -> toda la variación
    return 0.55 + (mixed - 0.5) * (0.9 * R.pressure);
  }
  // alpha de tinta según presión (más presión = más oscuro)
  function inkAlpha(pr, R){ return clamp(0.62 + (pr-0.5)*0.9*R.pressure, 0.3, 1); }

  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

  // precarga en paralelo todas las variantes de un perfil (mucho más rápido que en serie)
  function preloadAll(glyphs){
    const jobs=[];
    for(const ch in glyphs) for(const v of glyphs[ch]) if(v.type==='image'&&!v._imgEl) jobs.push(preload(v));
    return jobs.length ? Promise.all(jobs) : Promise.resolve();
  }

  return { makeRng, hexToRgb, rgbToHsl, glyph, advance, preload, preloadAll };
})();
