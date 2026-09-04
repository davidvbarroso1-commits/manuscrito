/* generate.js — extrae texto, lo convierte al formato de apuntes elegido y lo maqueta.
   Dos motores de letra: (1) caligrafía capturada, (2) fuentes web. Vista previa de realismo. */
const GENERATE = (() => {
  let hooks = { getProfile:()=>null, getProfiles:()=>[] };
  function bind(h){ hooks=Object.assign(hooks,h); }
  let lastPages = [];
  let fontHand = [], fontPrint = [];
  let mixList = [];        // fuentes elegidas por el usuario para mezclar
  let mixOff = new Set();  // fuentes de la mezcla APAGADAS (clic en el chip para alternar)
  let sigData = null;      // firma extraída {canvas, w, h, url}
  let lastWordRects = [];  // cajas de palabras (clic en el papel → selecciona su texto)
  let sigPlace = {xf:0.6, yf:0.8, wf:0.28, rot:0};   // ubicación editable (fracciones de la hoja)
  let sigTintURL = '';
  const RECOMMENDED = 'Homemade Apple';   // la más parecida a una letra real desprolija

  const PAPER = {
    a4:     { w:1240, h:1754, mm:[210,297] },
    letter: { w:1275, h:1650, mm:[215.9,279.4] },
  };
  const PXMM = 1240/210;   // ~5.905 px por mm (misma resolución que A4)
  function paperDims(opt){
    const kind=(opt&&opt.paper)||val('optPaper');
    if(kind==='custom'){ const w=+val('cpW')||214, h=+val('cpH')||278;
      return {w:Math.round(w*PXMM), h:Math.round(h*PXMM), mm:[w,h]}; }
    return PAPER[kind]||PAPER.a4;
  }
  let renderSeed = Math.floor(Math.random()*1e9);   // estable mientras se escribe (no reordena la letra)
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
    'Are You Serious':0.7,
    // tercera tanda
    'Ms Madi':0.5,'My Soul':0.7,'Lovers Quarrel':0.8,'Dr Sugiyama':0.7,'Miss Fajardose':0.8,
    'Mr Bedfort':0.6,'Mrs Sheppards':0.7,'Monsieur La Doulaise':0.8,'Jim Nightshade':0.6,
    'Meie Script':0.6,'Redressed':0.5,'Aguafina Script':0.6,'Felipa':0.5,'Bilbo':0.6,
    'Bilbo Swash Caps':0.6,'Euphoria Script':0.7,'Engagement':0.7,'Devonshire':0.7,'Condiment':0.5 };

  // errores plausibles por letra (para tachones: la palabra "mal escrita")
  const ERROR_MAP={a:'o',o:'a',e:'i',i:'e',u:'v',v:'u',n:'m',m:'n',r:'n',s:'z',z:'s',
    c:'s',b:'d',d:'b',p:'q',q:'p',t:'l',l:'t',g:'j',j:'g',h:'b',y:'i',f:'t',k:'c',w:'v',x:'s',
    'á':'a','é':'e','í':'i','ó':'o','ú':'u','ñ':'n'};
  function mutateChars(chars,rng){
    const out=chars.slice(); const L=out.length;
    const nMut=L>7?2:1;
    for(let m=0;m<nMut;m++){
      const op=Math.floor(rng()*4);
      const i=1+Math.floor(rng()*Math.max(1,L-2));
      if(op===0){ // sustituye por letra parecida (respeta mayúscula)
        const lo=out[i].toLowerCase(), rep=ERROR_MAP[lo];
        if(rep) out[i]=(out[i]===lo)?rep:rep.toUpperCase();
      } else if(op===1 && i<out.length-1){ const t=out[i]; out[i]=out[i+1]; out[i+1]=t; } // intercambia
      else if(op===2){ out.splice(i,0,out[i]); }   // duplica
      else if(op===3 && out.length>3){ out.splice(i,1); } // omite
    }
    return out;
  }
  const tick=()=>new Promise(r=>setTimeout(r,10));

  function init(){
    const sync=(id,v,fmt)=>{ const el=document.getElementById(id),o=document.getElementById(v);
      if(!el||!o)return; const f=fmt||(x=>x); el.addEventListener('input',()=>o.textContent=f(el.value)); o.textContent=f(el.value); };
    sync('optSize','valSize'); sync('optLine','valLine',x=>(+x).toFixed(1));
    sync('optPressure','valPressure'); sync('optTone','valTone'); sync('optTransp','valTransp');
    sync('optJitter','valJitter'); sync('optDrift','valDrift'); sync('optBlots','valBlots');
    sync('optWear','valWear'); sync('optSmooth','valSmooth'); sync('optFall','valFall');
    sync('optRetrace','valRetrace'); sync('optStrikes','valStrikes');
    sync('optSlant','valSlant',x=>x+'°'); sync('sigSize','valSigSize'); sync('optInk','valInk'); sync('optObjRough','valObjRough');

    // papel personalizado: campos de medidas visibles en modo "custom" (tamaño o estilo)
    const paperSel=document.getElementById('optPaper'), rulingSel=document.getElementById('optRuling'), cp=document.getElementById('customPaper');
    const toggleCustom=()=>{ cp.hidden = !(paperSel.value==='custom' || rulingSel.value==='custom'); };
    [paperSel,rulingSel].forEach(s=>{ s.addEventListener('change',toggleCustom); s.addEventListener('input',toggleCustom); }); toggleCustom();
    // preset: papel del traper del usuario (214×278, márgenes izq24/arr15/ab17/der10)
    document.getElementById('cpPreset').addEventListener('click', ()=>{
      const set=(id,v)=>{ const e=document.getElementById(id); if(e){ e.value=v; e.dispatchEvent(new Event('input')); } };
      set('optPaper','custom'); set('cpW','214'); set('cpH','278');
      set('cpTop','15'); set('cpBottom','17'); set('cpLeft','24'); set('cpRight','10'); set('cpGrid','5');
      document.getElementById('cpBox').value='box'; document.getElementById('cpStyle').value='traper';
      toggleCustom(); APP.toast('Papel de tu traper aplicado 📐'); scheduleLive();
    });
    // reroll: nueva variación de letra (estable mientras escribes)
    document.getElementById('rerollBtn').addEventListener('click', ()=>{ renderSeed=Math.floor(Math.random()*1e9); if(document.getElementById('genText').value.trim()) run(); });
    // Insertar objetos
    document.querySelectorAll('[data-ins]').forEach(b=>b.addEventListener('click',()=>addObject(b.dataset.ins)));

    // firma — subir / pegar / umbral
    // gancho de depuracion: permite probar el recorte desde la consola
    window.__MT=Object.assign(window.__MT||{},{useSigBlob});
    async function useSigBlob(blob){
      if(!blob) return;
      /* Antes se exigia que Gemini fuese el proveedor SELECCIONADO. Con el
         desplegable en otro (Mistral, Groq...) la IA no se activaba aunque
         hubiera clave de Gemini guardada, y el usuario no tenia forma de
         saberlo. Lo que importa es si HAY clave con vision, no cual esta
         elegido para escribir texto.                                        */
      const aiOn=document.getElementById('sigAI')&&document.getElementById('sigAI').checked
                 && typeof AI!=='undefined' && !!AI.claveVision();
      const dataUrl=await new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(blob); });
      const img=await loadImg(dataUrl);
      // manchas de tinta detectadas localmente (no dependen de la IA)
      const seg=(()=>{ try{ return inkClusters(img); }catch(e){ console.warn('seg',e); return null; } })();
      sigDiag={}; anotaDiag('foto', img.naturalWidth+'x'+img.naturalHeight);
      anotaDiag('modo', val('sigWhat')||'sig'); anotaDiag('ia', aiOn?'si':'no');
      anotaDiag('clusters', seg?seg.clusters.length:0);
      if(seg&&seg.clusters[0]){ const g=seg.clusters[0];
        anotaDiag('cluster0','x'+Math.round(g.x0)+'-'+Math.round(g.x1)+' y'+Math.round(g.y0)+'-'+Math.round(g.y1)); }

      // ¿la imagen YA es una firma recortada? (fondo transparente o casi todo blanco) → no llamar a la IA
      const pre=(()=>{ const t=document.createElement('canvas');
        const sc=Math.min(1,400/Math.max(img.naturalWidth,img.naturalHeight));
        t.width=Math.max(1,img.naturalWidth*sc|0); t.height=Math.max(1,img.naturalHeight*sc|0);
        const q=t.getContext('2d',{willReadFrequently:true}); q.drawImage(img,0,0,t.width,t.height);
        const dd=q.getImageData(0,0,t.width,t.height).data; let alpha0=0, blanco=0, tot=t.width*t.height;
        for(let i=0;i<dd.length;i+=4){ if(dd[i+3]<40) alpha0++;
          else if(dd[i]>235&&dd[i+1]>235&&dd[i+2]>235) blanco++; }
        return {transp:alpha0/tot, blanco:blanco/tot}; })();
      if(pre.transp>0.25 || pre.blanco>0.55){
        APP.busy('Limpiando firma…');
        try{ sigData=extractTight(img, +val('sigThresh')||50); showSig(); APP.idle();
          APP.toast('Firma lista ✓ (ya venía recortada)'); return; }
        catch(e){ /* sigue con el flujo normal */ }
      }

      /* El motor local (manchas, separacion por color, quitar cuadricula) NO
         puede depender de la casilla de IA. Estaba TODO dentro de este if, asi
         que sin clave de Gemini se caia al extractor antiguo y salia media foto
         pegada (720x875 al 29% de transparencia, frente a 221x179 al 80%).
         La IA es un refinamiento del recuadro, no la puerta de entrada.     */
      {
        APP.busy(aiOn? 'La IA está mirando la foto…' : 'Buscando la firma…');
        try{
          let items=[];
          const modo=val('sigWhat')||'sig';
          if(aiOn){
          // plazo: si Gemini esta saturado no se espera un minuto, se usa el recorte local
          const conPlazo=pr=>Promise.race([pr, new Promise(res=>setTimeout(()=>res(null),11000))]);
          if(modo==='both'){
            // dos consultas separadas: asi no se pierde ninguno de los dos elementos
            const [a,b]=await Promise.all([
              conPlazo(AI.findSignature(dataUrl,'sig').catch(()=>[])),
              conPlazo(AI.findSignature(dataUrl,'stamp').catch(()=>[]))
            ]);
            items=[...(a||[]),...(b||[])];
          } else items=await conPlazo(AI.findSignature(dataUrl, modo).catch(e=>{ console.warn('IA firma:',e); return []; }))||[];
          }
          const W=img.naturalWidth, H=img.naturalHeight;
          // Gemini usa box_2d = [ymin, xmin, ymax, xmax] normalizado 0-1000
          const boxes=(items||[]).map(it=>it.box_2d||it.box||[]).filter(b=>b.length>=4)
            .map(b=>{ const ymin=Math.min(b[0],b[2]), ymax=Math.max(b[0],b[2]),
                            xmin=Math.min(b[1],b[3]), xmax=Math.max(b[1],b[3]);
              return {x0:Math.max(0,xmin/1000*W), y0:Math.max(0,ymin/1000*H),
                      x1:Math.min(W,xmax/1000*W), y1:Math.min(H,ymax/1000*H)}; })
            .filter(b=>b.x1>b.x0+8 && b.y1>b.y0+8)
            .map(b=>refineBox(b,seg))       // ajusta el recuadro a los trazos reales
            .map(b=>{ // si el recuadro es minusculo respecto a la foto, agrandalo (la IA a veces se queda corta)
              const W2=img.naturalWidth, H2=img.naturalHeight;
              let bw=b.x1-b.x0, bh=b.y1-b.y0;
              const minW=W2*0.18, minH=H2*0.06;
              if(bw<minW||bh<minH){ const cx2=(b.x0+b.x1)/2, cy2=(b.y0+b.y1)/2;
                bw=Math.max(bw,minW); bh=Math.max(bh,minH);
                b={x0:Math.max(0,cx2-bw/2), y0:Math.max(0,cy2-bh/2), x1:Math.min(W2,cx2+bw/2), y1:Math.min(H2,cy2+bh/2)}; }
              return b; });
          if(boxes.length){
            const pieces=[];
            // valida que el recuadro tenga trazo real (no teclado/sombra): mide contraste local
            const boxScore=b=>{ const t=document.createElement('canvas');
              const bw=Math.max(8,Math.round(b.x1-b.x0)), bh=Math.max(8,Math.round(b.y1-b.y0));
              const sc=Math.min(1,220/Math.max(bw,bh)); t.width=Math.max(6,bw*sc|0); t.height=Math.max(6,bh*sc|0);
              const q=t.getContext('2d',{willReadFrequently:true});
              q.fillStyle='#fff'; q.fillRect(0,0,t.width,t.height);
              q.drawImage(img,b.x0,b.y0,bw,bh,0,0,t.width,t.height);
              const n=t.width*t.height, dd=q.getImageData(0,0,t.width,t.height).data;
              const L=new Float32Array(n); let sum=0;
              for(let i=0,p=0;i<dd.length;i+=4,p++){ const v=0.299*dd[i]+0.587*dd[i+1]+0.114*dd[i+2]; L[p]=v; sum+=v; }
              const avg=sum/n;
              // percentil 80 = color del papel dentro del recuadro
              const hist=new Uint32Array(256); for(let p=0;p<n;p++) hist[L[p]|0]++;
              let acc=0,paper=255; for(let v=255;v>=0;v--){ acc+=hist[v]; if(acc>=n*0.20){ paper=v; break; } }
              let dark=0;
              for(let p=0,i=0;p<n;p++,i+=4){ const r=dd[i],g=dd[i+1],b=dd[i+2];
                const sat=Math.max(r,g,b)-Math.min(r,g,b);
                if(L[p] < paper-40 || sat>55) dark++; }   // tinta por oscuridad O por color (verde/azul)
              const frac=dark/n;
              // Un recuadro de FIRMA: papel claro, trazo minoritario. Un teclado: papel oscuro y mucha "tinta".
              if(paper<100) return -1;              // fondo oscuro (teclado / mesa) -> descartar
              if(avg<80) return -1;                 // zona globalmente oscura
              if(frac<0.002 || frac>0.62) return -1;// sin trazo, o casi todo oscuro
              return frac*(paper/255);              // mas alto = mejor candidato
            };
            const okBox=b=>boxScore(b)>0;
            // si NINGUNA caja pasa la validacion NO se pegan todas las malas:
            // se deja vacio y entra el recorte local, que si sabe donde hay tinta
            const good=boxes.filter(okBox);
            anotaDiag('cajasIA', boxes.length); anotaDiag('cajasOK', good.length);
            boxes.length=0; Array.prototype.push.apply(boxes, good);
            for(const b of boxes){
              // los rasgos de una firma suben mas de lo que ocupa el cuerpo:
              // se da mas aire ARRIBA que abajo para no decapitarla
              const pad=Math.max(10,(b.x1-b.x0)*0.10);
              const padArriba=Math.max(pad, (b.y1-b.y0)*0.30);
              const cx0=Math.max(0,b.x0-pad), cy0=Math.max(0,b.y0-padArriba);
              const cw=Math.min(W,b.x1+pad)-cx0, ch=Math.min(H,b.y1+pad)-cy0;
              const c=document.createElement('canvas'); c.width=Math.round(cw); c.height=Math.round(ch);
              c.getContext('2d').drawImage(img,cx0,cy0,cw,ch,0,0,c.width,c.height);
              const piece=await loadImg(c.toDataURL('image/png'));
              // el recorte ya es SOLO la firma → binariza fuerte para dejar el trazo limpio
              try{
                const pz=extractTight(piece, +val('sigThresh')||50);
                if(esTrazo(pz)) pieces.push(pz);
                else console.warn('descartada: mancha maciza, no es firma ni sello');
              }catch(e){ console.error(e); }
            }
            if(pieces.length){
              let out=pieces[0];
              if(pieces.length>1){
                // conserva la posicion relativa real (firma arriba, sello abajo, como en la foto)
                const ux0=Math.min(...boxes.map(b=>b.x0)), uy0=Math.min(...boxes.map(b=>b.y0));
                const ux1=Math.max(...boxes.map(b=>b.x1)), uy1=Math.max(...boxes.map(b=>b.y1));
                const uw=Math.max(1,ux1-ux0), uh=Math.max(1,uy1-uy0);
                const scale=Math.max(...pieces.map((p,i)=>p.w/Math.max(1,boxes[i].x1-boxes[i].x0)));
                const cw=Math.round(uw*scale), ch=Math.round(uh*scale);
                const cc=document.createElement('canvas'); cc.width=Math.max(1,cw); cc.height=Math.max(1,ch);
                const c2=cc.getContext('2d');
                pieces.forEach((p,i)=>{ const b=boxes[i];
                  const dx=Math.round((b.x0-ux0)*scale), dy=Math.round((b.y0-uy0)*scale);
                  const dw=Math.max(1,Math.round((b.x1-b.x0)*scale)), dh=Math.max(1,Math.round((b.y1-b.y0)*scale));
                  c2.drawImage(p.canvas,dx,dy,dw,dh); });
                out={canvas:cc,w:cc.width,h:cc.height,url:cc.toDataURL('image/png')};
              }
              anotaDiag('origen','IA ('+pieces.length+' pieza/s)');
              sigRawImg=await loadImg(out.url); sigData=out;
              showSig(); APP.idle(); APP.toast('Firma recortada con IA ✓ ('+pieces.length+')'); return;
            }
          }
          // respaldo propio 1: las manchas de tinta que ya detectamos
          if(seg && seg.clusters.length){
            const want=(val('sigWhat')||'sig')==='both'?2:1;
            const cs=seg.clusters.slice(0,want);
            const ps=[];
            for(const g of cs){
              const pad=Math.max(8,(g.x1-g.x0)*0.10);
              const padArr=Math.max(pad,(g.y1-g.y0)*0.30);
              const gx0=Math.max(0,g.x0-pad), gy0=Math.max(0,g.y0-padArr);
              const gw=Math.min(img.naturalWidth,g.x1+pad)-gx0, gh=Math.min(img.naturalHeight,g.y1+pad)-gy0;
              const cc=document.createElement('canvas'); cc.width=Math.round(gw); cc.height=Math.round(gh);
              cc.getContext('2d').drawImage(img,gx0,gy0,gw,gh,0,0,cc.width,cc.height);
              try{ const pz=extractTight(await loadImg(cc.toDataURL('image/png')), +val('sigThresh')||50);
                   if(esTrazo(pz)) ps.push(pz); }catch(e){}
            }
            if(ps.length){
              let out=ps[0];
              if(ps.length>1){
                const ux0=Math.min(...cs.map(g=>g.x0)), uy0=Math.min(...cs.map(g=>g.y0));
                const ux1=Math.max(...cs.map(g=>g.x1)), uy1=Math.max(...cs.map(g=>g.y1));
                const sk=Math.max(...ps.map((p2,i)=>p2.w/Math.max(1,cs[i].x1-cs[i].x0)));
                const cc=document.createElement('canvas');
                cc.width=Math.max(1,Math.round((ux1-ux0)*sk)); cc.height=Math.max(1,Math.round((uy1-uy0)*sk));
                const c2=cc.getContext('2d');
                ps.forEach((p2,i)=>{ const g=cs[i];
                  c2.drawImage(p2.canvas, Math.round((g.x0-ux0)*sk), Math.round((g.y0-uy0)*sk),
                    Math.max(1,Math.round((g.x1-g.x0)*sk)), Math.max(1,Math.round((g.y1-g.y0)*sk))); });
                out={canvas:cc,w:cc.width,h:cc.height,url:cc.toDataURL('image/png')};
              }
              anotaDiag('origen','local, sin IA ('+ps.length+' pieza/s)');
              sigRawImg=await loadImg(out.url); sigData=out;
              showSig(); APP.idle(); APP.toast('Firma recortada ✓ ('+ps.length+', sin IA)'); return;
            }
          }
          // respaldo propio 2: buscar la zona de tinta sobre papel
          const reg=findInkRegion(img);
          if(reg){
            const bw=Math.round(reg.x1-reg.x0), bh=Math.round(reg.y1-reg.y0);
            const c=document.createElement('canvas'); c.width=bw; c.height=bh;
            c.getContext('2d').drawImage(img,reg.x0,reg.y0,bw,bh,0,0,bw,bh);
            const piece=await loadImg(c.toDataURL('image/png'));
            try{ sigData=extractTight(piece, +val('sigThresh')||50); showSig(); APP.idle();
              APP.toast('Firma recortada (sin IA) ✓ — ajusta "Recorte" si hace falta'); return; }catch(e){}
          }
          APP.idle();
          APP.toast('No encontré la firma. Prueba recortando la foto alrededor de la firma.');
          return;                                  // NO pega la foto entera
        }catch(e){ console.error(e); APP.idle();
          APP.toast('IA: '+String(e.message||e).slice(0,80));
          return;                                  // tampoco pega basura si la IA falla
        }
      }
      APP.busy('Procesando firma…');
      try{ sigData=await extractSignature(blob); showSig(); APP.idle(); APP.toast('Firma lista — arrástrala en la hoja ✋'); }
      catch(err){ APP.idle(); APP.toast(err.message||'No pude leer la firma'); }
    }
    function showSigThumb(){
      const th=document.getElementById('sigThumb'); if(!th||!sigData) return;
      th.hidden=false; th.innerHTML='';
      const im=new Image(); im.src=sigTintURL||sigData.url;   // ya filtrada y teñida
      th.appendChild(im);
    }
    function showSig(){
      const th=document.getElementById('sigThumb'); th.hidden=false; th.innerHTML=''; const im=new Image(); im.src=sigData.url; th.appendChild(im);
      const av=document.getElementById('sigVieja'); if(av) av.hidden=true;
      // los colores reales de la foto son el punto de partida; teñir es opcional
      const st=document.getElementById('sigTint'); if(st) st.value='orig';
      document.getElementById('sigClear').hidden=false; document.getElementById('sigThreshRow').hidden=false; document.getElementById('sigAllRow').hidden=false; document.getElementById('sigGridRow').hidden=false; document.getElementById('sigColorSoloRow').hidden=false; ['sigAvanzRow','sigQuitaNeutroRow','sigToleranciaRow','sigMinAlphaRow'].forEach(i=>{const e=document.getElementById(i); if(e) e.hidden=false;});
      try{ localStorage.setItem('manuscrito_sig', sigData.url+'|'+sigData.w+'|'+sigData.h); }catch(_){}
      // guarda tambien el recorte SIN procesar: asi una mejora del algoritmo se
      // puede aplicar a una firma vieja sin volver a subir la foto
      try{
        if(sigRawImg){
          const rw=sigRawImg.naturalWidth||sigRawImg.width, rh=sigRawImg.naturalHeight||sigRawImg.height;
          const k=Math.min(1,1100/Math.max(rw,rh));
          const rc=document.createElement('canvas');
          rc.width=Math.max(1,Math.round(rw*k)); rc.height=Math.max(1,Math.round(rh*k));
          const rx=rc.getContext('2d'); rx.fillStyle='#fff'; rx.fillRect(0,0,rc.width,rc.height);
          rx.drawImage(sigRawImg,0,0,rc.width,rc.height);
          localStorage.setItem('manuscrito_sig_raw', rc.toDataURL('image/jpeg',0.85));
        }
      }catch(_){ try{ localStorage.removeItem('manuscrito_sig_raw'); }catch(__){} }
      initSigPlace('br'); rebuildTint(); showSigThumb();
      if(lastPages.length) layoutSignatureOverlays(); else scheduleLive();
    }
    document.getElementById('sigInput').addEventListener('change', e=>{ if(e.target.files[0]) useSigBlob(e.target.files[0]); });

    // insertar una imagen REDIBUJADA a mano en el punto del cursor
    const croqIn=document.getElementById('croquisInput');
    if(croqIn){
      document.getElementById('croquisBtn').addEventListener('click',()=>croqIn.click());
      croqIn.addEventListener('change', async e=>{
        const f=e.target.files&&e.target.files[0]; if(!f) return;
        try{
          APP.busy('Redibujando la imagen a mano…');
          const img=await loadImg(URL.createObjectURL(f));
          const id=registraDibujo(img);
          const ta=document.getElementById('genText');
          const at=ta.selectionStart||ta.value.length;
          ta.value=ta.value.slice(0,at)+'\n@@dibujo:'+id+'\n'+ta.value.slice(at);
          document.getElementById('optFormat').value='completo';
          APP.idle(); await run(); APP.toast('Imagen redibujada a mano ✓');
        }catch(err){ APP.idle(); APP.toast('No pude usar esa imagen'); }
        finally{ croqIn.value=''; }
      });
    }
    document.getElementById('sigPaste').addEventListener('click', async ()=>{
      try{ const items=await navigator.clipboard.read();
        for(const it of items){ const ty=it.types.find(t=>t.startsWith('image/')); if(ty){ await useSigBlob(await it.getType(ty)); return; } }
        APP.toast('No hay imagen en el portapapeles');
      }catch(e){ APP.toast('Copia la imagen y pulsa Ctrl+V sobre la app'); }
    });
    document.addEventListener('paste', e=>{ if(!document.getElementById('view-generate').classList.contains('active')) return;
      const it=[...((e.clipboardData&&e.clipboardData.items)||[])].find(i=>i.type.startsWith('image/'));
      if(it){ e.preventDefault(); useSigBlob(it.getAsFile()); } });
    // re-extrae al mover el umbral (usa la imagen original guardada)
    document.getElementById('sigThresh').addEventListener('input', ()=>{
      const o=document.getElementById('valSigThresh'); if(o) o.textContent=val('sigThresh');
      if(!sigRawImg) return;
      try{ sigData=extractTight(sigRawImg, +val('sigThresh'));
        const th=document.getElementById('sigThumb'); th.innerHTML=''; const im=new Image(); im.src=sigData.url; th.appendChild(im);
        rebuildTint(); updateSigImgs();
      }catch(e){}
    });
    document.getElementById('sigAll').addEventListener('change', ()=>{ document.getElementById('sigThresh').dispatchEvent(new Event('input')); });
    document.getElementById('sigClear').addEventListener('click', ()=>{ sigData=null; sigRawImg=null;
      document.getElementById('sigThumb').hidden=true; document.getElementById('sigClear').hidden=true; document.getElementById('sigThreshRow').hidden=true; document.getElementById('sigAllRow').hidden=true; document.getElementById('sigGridRow').hidden=true; document.getElementById('sigColorSoloRow').hidden=true; ['sigAvanzRow','sigQuitaNeutroRow','sigToleranciaRow','sigMinAlphaRow'].forEach(i=>{const e=document.getElementById(i); if(e) e.hidden=true;});
      document.querySelectorAll('.sig-overlay').forEach(o=>o.remove());
      try{ localStorage.removeItem('manuscrito_sig'); localStorage.removeItem('manuscrito_sig_raw'); }catch(_){}; });
    restoreSig(); loadObjects();

    // vista en vivo: regenera al cambiar cualquier control (con retardo)
    document.getElementById('genText').addEventListener('input', scheduleLive);
    ['optFormat','optRuling','optHoles','optPaper','cpTop','cpBottom','cpLeft','cpRight','cpGrid','cpBox','cpW','cpH','cpStyle',
     'optSize','optLine','optInstrument','optColor','optFont',
     'optPressure','optTone','optTransp','optSmooth','optFall','optJitter','optDrift','optBlots',
     'optWear','optRetrace','optStrikes','optInk','optFlip','optSlant','mixUse'].forEach(id=>{
      const el=document.getElementById(id); if(el){ el.addEventListener('input',scheduleLive); el.addEventListener('change',scheduleLive); }
    });
    // controles de firma → mueven/actualizan la imagen sin re-renderizar todo
    document.getElementById('sigColor').addEventListener('input', ()=>{ document.getElementById('sigTint').value='one'; rebuildTint(); updateSigImgs(); });
    document.getElementById('optInk').addEventListener('input', ()=>{ if(sigData){ rebuildTint(); updateSigImgs(); } });
    ['sigWear','sigPress','sigInk','sigThick'].forEach(id=>document.getElementById(id).addEventListener('input', ()=>{
      const o=document.getElementById('val'+id[0].toUpperCase()+id.slice(1)); if(o) o.textContent=val(id);
      if(sigData){ rebuildTint(); updateSigImgs(); } }));
    document.getElementById('sigVary').addEventListener('click', ()=>{
      sigSeed=(Math.random()*1e9)|0;
      if(sigData){ rebuildTint(); updateSigImgs(); APP.toast('Otra variación 🎲'); } });
    ['sigGrid','sigColorSolo'].forEach(id=>document.getElementById(id).addEventListener('change', ()=>{
      document.getElementById('sigThresh').dispatchEvent(new Event('input')); }));
    /* Cuentagotas: se pincha en la miniatura y se toma el color de la tinta.
       Es lo que resuelve de una vez el caso de firma de color sobre texto
       impreso, sin depender de que yo acierte con un umbral.                */
    document.getElementById('sigThumb').addEventListener('click', e=>{
      const im=e.target; if(!im || im.tagName!=='IMG' || !sigData) return;
      if(!document.getElementById('sigCuentagotas').classList.contains('activo')) return;
      const rc=im.getBoundingClientRect();
      const cx2=Math.round((e.clientX-rc.left)/rc.width*sigData.w);
      const cy2=Math.round((e.clientY-rc.top)/rc.height*sigData.h);
      try{
        const d=sigData.canvas.getContext('2d',{willReadFrequently:true}).getImageData(cx2,cy2,1,1).data;
        if(d[3]<40){ APP.toast('Ahí no hay tinta: pincha sobre un trazo'); return; }
        sigPick={r:d[0],g:d[1],b:d[2]};
        const sw=document.getElementById('sigPickSw');
        if(sw){ sw.style.background=`rgb(${d[0]},${d[1]},${d[2]})`; sw.hidden=false; }
        document.getElementById('sigSoloPick').checked=true;
        document.getElementById('sigCuentagotas').classList.remove('activo');
        rebuildTint(); updateSigImgs(); showSigThumb();
        APP.toast('Tinta elegida: solo se conserva ese color');
      }catch(err){ APP.toast('No pude leer ese punto'); }
    });
    document.getElementById('sigCuentagotas').addEventListener('click', ()=>{
      const b=document.getElementById('sigCuentagotas');
      b.classList.toggle('activo');
      APP.toast(b.classList.contains('activo')? 'Pincha sobre el trazo de tu firma' : 'Cuentagotas apagado');
    });
    ['sigQuitaNeutro','sigTolerancia','sigMinAlpha'].forEach(id=>{
      const el=document.getElementById(id); if(!el) return;
      el.addEventListener('input', ()=>{
        const o=document.getElementById('val'+id[0].toUpperCase()+id.slice(1));
        if(o) o.textContent=val(id);
        if(sigData){ rebuildTint(); updateSigImgs(); showSigThumb(); } });
    });
    document.getElementById('sigSoloPick').addEventListener('change', ()=>{
      if(sigData){ rebuildTint(); updateSigImgs(); showSigThumb(); } });
    document.getElementById('sigDiagBtn').addEventListener('click', async()=>{
      // mide tambien el resultado final, que es lo que se ve
      try{
        if(sigProc){
          const c=sigProc, d=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data;
          let n=0,col=0,neu=0,tr=0;
          for(let i=0;i<d.length;i+=4){ if(d[i+3]<70){tr++;continue;} n++;
            const s2=Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2]);
            if(s2>=34) col++; else neu++; }
          anotaDiag('tam', c.width+'x'+c.height);
          anotaDiag('transp', Math.round(tr/(c.width*c.height)*100));
          anotaDiag('tinta', n); anotaDiag('color', col); anotaDiag('neutro', neu);
        }
      }catch(e){}
      const txt=informeFirma();
      try{ await navigator.clipboard.writeText(txt); APP.toast('Diagnóstico copiado — pégalo en la consulta'); }
      catch(e){ const ta=document.getElementById('genText');
        ta.value=txt+String.fromCharCode(10,10)+ta.value; APP.toast('Diagnóstico puesto al principio del texto'); }
    });
    document.getElementById('sigRedo').addEventListener('click', ()=>{
      if(!sigRawImg){ APP.toast('No guardé la foto original de esta firma: vuelve a subirla y ya quedará guardada'); return; }
      try{ sigData=extractTight(sigRawImg, +val('sigThresh')||50); showSig(); rebuildTint(); updateSigImgs();
        APP.toast('Recorte rehecho con el método más reciente ✓'); }
      catch(e){ APP.toast('No pude rehacer el recorte: '+String(e.message||e).slice(0,50)); } });
    document.getElementById('sigSize').addEventListener('input', ()=>{ if(sigData){ sigPlace.wf=(+val('sigSize')/100)*0.5; repositionAll(); } });
    document.getElementById('sigWhere').addEventListener('change', layoutSignatureOverlays);
    // paleta de colores de firma
    document.getElementById('sigOrig').addEventListener('click', ()=>{ document.getElementById('sigTint').value='orig'; rebuildTint(); updateSigImgs(); APP.toast('Firma con sus colores reales'); });
    document.querySelectorAll('.sig-sw[data-c]').forEach(b=>b.addEventListener('click', ()=>{
      document.getElementById('sigColor').value=b.dataset.c; document.getElementById('sigTint').value='one';
      rebuildTint(); updateSigImgs(); }));
    // cada proveedor emite claves con un prefijo propio: asi no hay que acertar
    // el selector antes de pegar
    function proveedorDeClave(v){
      v=String(v||'').trim();
      if(/^gsk_/.test(v)) return 'groq';
      if(/^sk-or-/.test(v)) return 'openrouter';
      if(/^csk-/.test(v)) return 'cerebras';
      if(/^sk-ant-/.test(v)) return 'anthropic';
      if(/^xai-/.test(v)) return 'xai';
      if(/^(AIza|AQ\.)/.test(v)) return 'gemini';
      return '';
    }
    // API key de IA
    const aiK=document.getElementById('aiKey'), aiS=document.getElementById('aiKeyState');
    if(aiK && typeof AI!=='undefined'){
      const refreshKeyUI=()=>{
        if(AI.getKey()){ aiK.value='••••••••••••'; aiS.textContent='✓ guardada'; }
        else { aiK.value=''; aiS.textContent='sin clave'; }
        // muestra el relevo: si uno se satura, entra el siguiente
        const el=document.getElementById('aiCadena');
        if(el){ const d=AI.proveedoresDisponibles();
          el.textContent = d.length>1
            ? ('Relevo automático: '+d.map(p=>AI.NOMBRES[p]||p).join(' → ')+'. Si uno se satura, entra el siguiente.')
            : (d.length===1 ? ('Solo '+(AI.NOMBRES[d[0]]||d[0])+'. Añade otra clave y se usará de reserva cuando se sature.')
                            : 'Sin ninguna clave guardada.'); }
      };
      refreshKeyUI();
      // avisa cuando ha tenido que cambiar de proveedor
      if(AI.alRelevar) AI.alRelevar(nombre=>APP.toast('Gemini saturado → seguí con '+nombre));
      document.getElementById('aiProvider').addEventListener('change', refreshKeyUI);
      /* El campo muestra puntos cuando ya hay clave. El listener de 'change'
         reponia los puntos al perder el foco, ANTES de que Guardar leyera el
         valor: se guardaba '••••' y la clave se borraba. Por eso no dejaba
         pegar ninguna. Ahora al enfocar se vacia y no se repone solo.        */
      aiK.addEventListener('focus', ()=>{ if(aiK.value.startsWith('•')) aiK.value=''; });
      aiK.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault();
        document.getElementById('aiSaveKey').click(); } });
      // pegar una clave la reconoce y cambia de proveedor sola
      aiK.addEventListener('paste', ()=>setTimeout(()=>{
        const v=aiK.value.trim(); const pr=proveedorDeClave(v);
        if(pr && pr!==val('aiProvider')){
          document.getElementById('aiProvider').value=pr;
          APP.toast('Esa clave es de '+(AI.NOMBRES[pr]||pr)+': cambio a ese proveedor');
        }
      },30));
      document.getElementById('aiTest').addEventListener('click', async()=>{
        aiS.textContent='probando…';
        try{ const r=await AI.format('La fotosintesis convierte luz en energia quimica en las plantas.','resumen');
          aiS.textContent='✓ funciona'; APP.toast('IA conectada: '+String(r).slice(0,60)+'…');
        }catch(e){ aiS.textContent='✗ error'; APP.toast('IA: '+(e.message||e).slice(0,90)); }
      });
      const bBorrar=document.getElementById('aiDelKey');
      if(bBorrar) bBorrar.addEventListener('click',()=>{
        const p=val('aiProvider');
        if(!confirm('¿Borrar la clave de '+(AI.NOMBRES[p]||p)+'?')) return;
        AI.setKey(''); aiK.value=''; refreshKeyUI(); APP.toast('Clave de '+(AI.NOMBRES[p]||p)+' borrada');
      });
      document.getElementById('aiSaveKey').addEventListener('click',()=>{
        const v=aiK.value.trim();
        /* Guardar con el campo VACIO ya no borra la clave. Al enfocar el campo
           se vacia para poder escribir, asi que un clic + Guardar (o Enter)
           destruia la clave guardada sin avisar. Para borrarla esta su boton. */
        if(!v){ APP.toast('Escribe o pega la clave. Para borrarla, usa 🗑'); refreshKeyUI(); return; }
        if(v.startsWith('•')){ APP.toast('Escribe o pega la clave primero'); return; }
        const pr=proveedorDeClave(v);
        if(pr && pr!==val('aiProvider')) document.getElementById('aiProvider').value=pr;
        AI.setKey(v); aiK.value='••••••••••••'; aiS.textContent='✓ guardada';
        const u=document.getElementById('aiUse'); if(u) u.checked=true;
        refreshKeyUI();
        APP.toast('Clave de '+(AI.NOMBRES[val('aiProvider')]||val('aiProvider'))+' guardada ✓');
      });
    }
    ['optTablaAlin','optTablaInter','optTablaTam','optTablaAncho'].forEach(id=>{ const el=document.getElementById(id); if(!el) return;
      el.addEventListener('input', ()=>{
        [['valTablaInter','optTablaInter'],['valTablaTam','optTablaTam'],['valTablaAncho','optTablaAncho']]
          .forEach(([o2,i2])=>{ const e2=document.getElementById(o2); if(e2) e2.textContent=val(i2); });
        scheduleLive(); });
      el.addEventListener('change', scheduleLive); });
    document.getElementById('optObjRough').addEventListener('input', layoutObjects);
    document.getElementById('optInstrument').addEventListener('change', layoutObjects);
    document.getElementById('optColor').addEventListener('input', layoutObjects);
    // MODO "escribir sobre la hoja": el cuadro de texto flota encima del papel (tipo Word)
    let onPaper=false;
    const dockBtn=document.getElementById('dockBtn');
    function applyDock(){
      const panel=document.getElementById('docPanel'), lay=document.querySelector('.word-layout'),
            prev=document.getElementById('genPreview');
      if(onPaper){
        panel.classList.add('on-paper'); lay.classList.add('paper-mode');
        prev.appendChild(panel);            // el cuadro va dentro de la zona de la hoja
        dockBtn.textContent='📋 Al costado';
      } else {
        panel.classList.remove('on-paper'); lay.classList.remove('paper-mode');
        lay.insertBefore(panel, prev);
        dockBtn.textContent='📄 Sobre la hoja';
      }
      try{ localStorage.setItem('manuscrito_onpaper', onPaper?'1':'0'); }catch(e){}
    }
    dockBtn.addEventListener('click', ()=>{ onPaper=!onPaper; applyDock(); });
    try{ onPaper=localStorage.getItem('manuscrito_onpaper')==='1'; }catch(e){}
    if(onPaper) applyDock();
    sync('optIndent','valIndent'); sync('optParaGap','valParaGap');
    // alineación tipo Word
    document.querySelectorAll('[data-al]').forEach(b=>b.addEventListener('click',()=>{
      document.querySelectorAll('[data-al]').forEach(x=>x.classList.toggle('on',x===b));
      document.getElementById('optAlign').value=b.dataset.al; scheduleLive();
    }));
    ['optIndent','optParaGap'].forEach(id=>document.getElementById(id).addEventListener('input',scheduleLive));
    // analizar documento con IA y sugerir formato
    const anBtn=document.getElementById('aiAnalyze');
    if(anBtn) anBtn.addEventListener('click', async()=>{
      const txt=document.getElementById('genText').value.trim();
      if(!txt){ APP.toast('Primero pega o sube el documento'); return; }
      if(typeof AI==='undefined'||!AI.hayIA()){ APP.toast('Falta la API key'); return; }
      const box=document.getElementById('aiAnalysis'); box.textContent='Analizando…'; APP.busy('Analizando documento…');
      try{ const a=await AI.analyze(txt);
        const sug=(a.sugerido&&a.sugerido.formato)||'resumen';
        box.innerHTML='<b>Tema:</b> '+(a.tema||'?')+'<br><b>Contiene:</b> '+((a.estructura||[]).join(', ')||'?')+
          '<br><b>Sugerido:</b> '+sug+' — '+((a.sugerido&&a.sugerido.motivo)||'');
        const sel=document.getElementById('optFormat');
        if([...sel.options].some(o=>o.value===sug)){ sel.value=sug; }
        // si detectó tablas reales, las inserta
        const tb=(a.sugerido&&a.sugerido.tablas)||[];
        for(const t of tb.slice(0,4)){
          if(!t.columnas||!t.columnas.length) continue;
          // sin recorte artificial: una tabla de frecuencias puede tener 30 filas
          const cols=Math.min(12, t.columnas.length), filas=(t.filas||[]).slice(0,60);
          const nf=filas.length+1;
          const o={id:++objSeq,type:'table',xf:0.14,yf:0.45,rot:0,fam:curHandFont(),
            rows:nf, cols,
            wf:Math.min(0.86, Math.max(0.30, 0.15*cols)),
            hf:Math.min(0.80, Math.max(0.10, 0.042*nf)),
            cells:[...t.columnas.slice(0,cols),
                   ...filas.flatMap(f=>{const r=[...f]; while(r.length<cols) r.push(''); return r.slice(0,cols);})]};
          objects.push(o);
        }
        if(tb.length){ saveObjects(); layoutObjects(); APP.toast('Analizado + '+tb.length+' tabla(s) insertada(s)'); }
        else APP.toast('Documento analizado ✓');
        APP.idle();
      }catch(e){ APP.idle(); box.textContent='Error: '+String(e.message||e).slice(0,120); }
    });
    // vista lado a lado (menús izquierda, hoja derecha) — todo visible sin scrollear
    const sideBtn=document.getElementById('sideBtn'), vGen=document.getElementById('view-generate');
    const applySide=on=>{ vGen.classList.toggle('side-mode',on);
      sideBtn.textContent = on?'⇱ Normal':'⇹ Lado a lado';
      try{ localStorage.setItem('manuscrito_side', on?'1':'0'); }catch(e){}
      setTimeout(()=>{ repositionAll(); layoutObjects(); },250); };
    sideBtn.addEventListener('click',()=>applySide(!vGen.classList.contains('side-mode')));
    try{ if(localStorage.getItem('manuscrito_side')==='1') applySide(true); }catch(e){}

    // biblioteca de firmas y sellos
    function loadLib(){ try{ return JSON.parse(localStorage.getItem('manuscrito_siglib')||'[]'); }catch(e){ return []; } }
    function saveLib(a){ try{ localStorage.setItem('manuscrito_siglib',JSON.stringify(a.slice(0,12))); }catch(e){} renderLib(); }
    function renderLib(){ const host=document.getElementById('sigLib'); if(!host) return;
      const lib=loadLib(); host.innerHTML='';
      if(!lib.length){ host.innerHTML='<span class="muted sm">— sin firmas guardadas —</span>'; return; }
      lib.forEach((it,i)=>{ const d=document.createElement('div'); d.className='sig-lib-item'; d.title='Usar esta firma';
        const im=new Image(); im.src=it.url; d.appendChild(im);
        d.onclick=async e=>{ if(e.target.tagName==='BUTTON') return;
          const img=await loadImg(it.url);
          const c=document.createElement('canvas'); c.width=it.w; c.height=it.h; c.getContext('2d').drawImage(img,0,0);
          sigData={canvas:c,w:it.w,h:it.h,url:it.url}; sigRawImg=img; showSig(); APP.toast('Firma cargada'); };
        const x=document.createElement('button'); x.className='x'; x.textContent='×';
        x.onclick=ev=>{ ev.stopPropagation(); const a=loadLib(); a.splice(i,1); saveLib(a); };
        d.appendChild(x); host.appendChild(d); });
    }
    const sl=document.getElementById('sigSaveLib');
    if(sl) sl.addEventListener('click',()=>{ if(!sigData){ APP.toast('Primero carga una firma'); return; }
      const a=loadLib(); a.unshift({url:sigData.url,w:sigData.w,h:sigData.h}); saveLib(a); APP.toast('Guardada en la biblioteca ✓'); });
    renderLib();
    // chat con la IA: aplica instrucciones al texto actual
    let aiPrev=null;
    const chatBtn=document.getElementById('aiChatBtn');
    if(chatBtn) chatBtn.addEventListener('click', async()=>{
      const ta=document.getElementById('genText'), instr=(val('aiChat')||'').trim();
      const st=document.getElementById('aiChatState');
      if(!instr){ APP.toast('Escribe qué querés que haga'); return; }
      if(!ta.value.trim()){ APP.toast('No hay texto'); return; }
      if(typeof AI==='undefined'||!AI.hayIA()){ APP.toast('Falta la API key'); return; }
      st.textContent='Pensando…'; APP.busy('La IA está trabajando…');
      try{
        aiPrev=ta.value;
        const out=await AI.chat(ta.value, instr);
        if(out){ ta.value=out; st.textContent='✓ aplicado'; scheduleLive(); run(); }
        else st.textContent='sin respuesta';
        APP.idle();
      }catch(e){ APP.idle(); st.textContent='Error: '+String(e.message||e).slice(0,90); }
    });
    const undoBtn=document.getElementById('aiUndoBtn');
    if(undoBtn) undoBtn.addEventListener('click',()=>{ if(aiPrev==null){APP.toast('Nada que deshacer');return;}
      document.getElementById('genText').value=aiPrev; aiPrev=null; run(); APP.toast('Deshecho'); });
    document.getElementById('optMapStyle').addEventListener('change',scheduleLive);
    // pestañas de la cinta (tipo Word)
    document.querySelectorAll('.rtab').forEach(t=>t.addEventListener('click', ()=>{
      document.querySelectorAll('.rtab').forEach(x=>x.classList.toggle('active',x===t));
      document.querySelectorAll('.rpanel').forEach(p=>p.classList.toggle('active',p.dataset.rp===t.dataset.rt));
    }));
    window.addEventListener('resize', repositionAll);

    document.getElementById('optInstrument').addEventListener('change', e=>{
      const p=INSTRUMENTS[e.target.value]; if(p) document.getElementById('optColor').value=p.color; schedulePreview();
    });
    document.getElementById('optFontKind').addEventListener('change', populateFonts);
    document.getElementById('optFontSearch').addEventListener('input', debounce(populateFonts,250));
    document.getElementById('optFont').addEventListener('change', ()=>{ updateFontPreview(); schedulePreview(); });

    document.getElementById('docInput').addEventListener('change', e=>{ if(e.target.files[0]) handleFile(e.target.files[0]); });

    /* Apuntes inteligentes: la IA lee el documento entero, decide que estructura
       le conviene y los escribe. No es un formato mas del desplegable: el
       formato lo elige ella segun el contenido.                               */
    let aiSmartPrev=null;
    async function apuntesIA(){
      const ta=document.getElementById('genText');
      const st=document.getElementById('aiSmartState');
      const texto=(ta.value||'').trim();
      if(!texto){ APP.toast('Primero sube un documento o escribe el texto'); return; }
      if(typeof AI==='undefined' || !AI.hayIA()){ APP.toast('Falta la API key de la IA (pestaña IA)'); return; }
      const btn=document.getElementById('aiSmartBtn');
      btn.disabled=true; aiSmartPrev=ta.value;
      const aviso=m=>{ st.textContent=m; APP.busy(m); };
      try{
        const r=await AI.apuntesInteligentes(texto, val('aiSmartInstr')||'', aviso);
        ta.value=r.texto;
        document.getElementById('optFormat').value='completo';   // ya vienen estructurados
        const p=r.plan||{};
        st.textContent='✓ '+(p.tipo?('Detectó: '+p.tipo+'. '):'')+(p.formato?('Formato: '+p.formato+'.'):'')+
                       (r.revisor?(' Revisado por '+r.revisor+'.'):'')+(p.razon?(' '+p.razon):'');
        APP.idle(); APP.toast('Apuntes listos ✨');
        await run();
      }catch(e){ APP.idle(); st.textContent='✗ '+String(e.message||e).slice(0,120);
        APP.toast('IA: '+String(e.message||e).slice(0,60)); }
      finally{ btn.disabled=false; }
    }
    document.getElementById('aiSmartBtn').addEventListener('click', apuntesIA);

    /* ── Aplicar a UNA PARTE: que, como y donde ──────────────────────────────
       El usuario elige el trozo, la accion y el sitio donde cae el resultado.
       Hasta ahora el formato se aplicaba al documento entero o reemplazaba
       todo; esto permite trabajar por secciones como en Word.               */
    const ACCIONES={
      resumen:  'Resume esta parte en vinetas "• ", conservando los datos concretos.',
      ideas:    'Extrae las ideas clave de esta parte, una por linea, empezando por "• ".',
      esquema:  'Convierte esta parte en esquema: "• " para ideas y "    – " para subideas.',
      preguntas:'Crea preguntas de repaso de esta parte. Cada pregunta en una linea que empieza por "¿". Debajo, la respuesta en una linea que empieza por "    – ".',
      glosario: 'Extrae los terminos de esta parte, uno por linea, con el formato "Termino: definicion clara".',
      tabla:    'Convierte esta parte en una TABLA. Una linea por fila, celdas separadas por "|", la cabecera empieza por "|=". Ejemplo:\n|= Concepto | Definicion | Ejemplo\n| ... | ... | ...\nNo escribas nada fuera de la tabla.',
      formulas: 'Extrae TODAS las formulas y calculos de esta parte. Cada una en su linea empezando por "$$ ", en texto plano legible sin LaTeX. Debajo de cada una, una linea "    – " explicando que significa cada simbolo.',
      pasos:    'Convierte esta parte en pasos numerados, uno por linea: "1. ", "2. "...',
      ampliar:  'Amplia esta parte con ejemplos concretos y aclaraciones, manteniendo su estructura. No inventes datos que contradigan el texto.',
      simplificar:'Explica esta parte de forma mucho mas simple, como a alguien que empieza, en vinetas "• ".',
      mapa:     'Convierte esta parte en un MAPA MENTAL. Devuelve EXACTAMENTE este formato y nada mas:\n@@mapa\nCentro: <el tema central en 1-3 palabras>\n- <Rama>: <idea breve>\n- <Rama>: <idea breve>\n@@\nEntre 4 y 8 ramas, cada idea de menos de 12 palabras.'
    };
    let selPrev=null;
    function marcaSeleccion(){
      const ta=document.getElementById('genText');
      const n=Math.abs(ta.selectionEnd-ta.selectionStart);
      const el=document.getElementById('selEstado');
      el.textContent = n? ('Seleccionados '+n.toLocaleString()+' caracteres')
                        : 'Selecciona texto en el cuadro de la izquierda';
    }
    ['select','keyup','mouseup','input','focus'].forEach(ev=>
      document.getElementById('genText').addEventListener(ev, marcaSeleccion));

    async function aplicarASeleccion(){
      const ta=document.getElementById('genText');
      const a=Math.min(ta.selectionStart,ta.selectionEnd), b=Math.max(ta.selectionStart,ta.selectionEnd);
      const res=document.getElementById('selResultado');
      if(a===b){ APP.toast('Selecciona primero la parte que quieres transformar'); return; }
      const parte=ta.value.slice(a,b);
      const accion=val('selAccion'), donde=val('selDonde');
      const btn=document.getElementById('selAplicar'); btn.disabled=true; selPrev=ta.value;
      try{
        let salida='';
        if(typeof AI!=='undefined' && AI.hayIA()){
          APP.busy('La IA está trabajando sobre lo seleccionado…');
          salida=await AI.chat(parte, ACCIONES[accion]||ACCIONES.resumen);
        } else {
          salida=SUMMARIZE.format(parte, accion==='tabla'?'esquema':(accion in {resumen:1,ideas:1,esquema:1,preguntas:1,glosario:1}?accion:'resumen'));
          APP.toast('Sin API key: hecho con el resumidor local');
        }
        salida=String(salida||'').trim();
        if(AI.limpiaApuntes) salida=AI.limpiaApuntes(salida);   // markdown y viñetas sueltas
        if(!salida) throw new Error('No devolvió nada');
        const v=ta.value;
        if(donde==='reemplazar') ta.value=v.slice(0,a)+salida+v.slice(b);
        else if(donde==='despues') ta.value=v.slice(0,b)+'\n\n'+salida+'\n'+v.slice(b);
        else if(donde==='final')  ta.value=v.replace(/\s*$/,'')+'\n\n'+salida+'\n';
        else                       ta.value=v.replace(/\s*$/,'')+'\n\n===\n'+salida+'\n';   // hoja nueva
        document.getElementById('optFormat').value='completo';
        res.textContent='✓ '+accion+' → '+(donde==='hoja'?'hoja nueva':donde)+' ('+salida.length+' caracteres)';
        APP.idle(); await run();
      }catch(e){ APP.idle(); res.textContent='✗ '+String(e.message||e).slice(0,110);
        APP.toast('No se pudo: '+String(e.message||e).slice(0,50)); }
      finally{ btn.disabled=false; }
    }
    document.getElementById('selAplicar').addEventListener('click', aplicarASeleccion);
    document.getElementById('selDeshacer').addEventListener('click', ()=>{
      if(selPrev===null){ APP.toast('Nada que deshacer'); return; }
      document.getElementById('genText').value=selPrev; selPrev=null;
      document.getElementById('selResultado').textContent=''; run(); APP.toast('Deshecho'); });
    document.getElementById('aiSmartUndo').addEventListener('click', ()=>{
      if(aiSmartPrev===null){ APP.toast('Nada que deshacer'); return; }
      document.getElementById('genText').value=aiSmartPrev; aiSmartPrev=null;
      document.getElementById('aiSmartState').textContent=''; run(); APP.toast('Deshecho'); });
    setupDropzone();

    // retoques por palabra: envuelve la selección del textarea con marcas {c:..}/{i:..}
    const OBJ_FMTS=['cornell','flashcards','boxing','mapa'];
    function preRetouch(){
      const fmt=val('optFormat'), ta=document.getElementById('genText');
      if(OBJ_FMTS.includes(fmt)){
        // convierte el layout a texto plano para poder retocarlo a mano
        const d=SUMMARIZE.format(ta.value,fmt);
        let txt='';
        if(fmt==='cornell'&&d) txt=(d.cues||[]).map((c,i)=>c+'\n'+((d.notes||[])[i]||'')).join('\n\n')+(d.summary?'\n\n'+d.summary:'');
        else if(fmt==='flashcards'&&Array.isArray(d)) txt=d.map(c=>c.q+'\n'+c.a).join('\n\n');
        else if(fmt==='boxing'&&Array.isArray(d)) txt=d.join('\n\n');
        else if(fmt==='mapa'&&d) txt=(d.center||'')+'\n\n'+(d.branches||[]).map(b=>b.term+': '+(b.frag||'')).join('\n');
        if(txt){ ta.value=txt; document.getElementById('optFormat').value='completo';
          APP.toast('Convertido a texto editable — ahora podés retocarlo'); return ta; }
        APP.toast('Genera primero el contenido'); return null;
      }
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
    document.getElementById('rtSizeBtn').addEventListener('click', ()=>wrapSel('{s:'+val('rtSize')+'}','{/s}'));
    document.getElementById('rtClearBtn').addEventListener('click', ()=>{
      const ta=document.getElementById('genText'); const s=ta.selectionStart,e=ta.selectionEnd;
      const rx=/\{\/?[ciu](:[^}]*)?\}/g;
      if(s!==e){ ta.value=ta.value.slice(0,s)+ta.value.slice(s,e).replace(rx,'')+ta.value.slice(e); }
      else ta.value=ta.value.replace(rx,'');
      APP.toast('Retoques quitados');
    });

    // mezcla de fuentes elegidas por el usuario (si no hay guardada → las 16 predeterminadas)
    try{ mixList=JSON.parse(localStorage.getItem('manuscrito_mix')||'null')||FONTS.DEFAULT_MIX.slice(); }
    catch(e){ mixList=FONTS.DEFAULT_MIX.slice(); }
    try{ mixOff=new Set(JSON.parse(localStorage.getItem('manuscrito_mixoff')||'[]')); }catch(e){ mixOff=new Set(); }
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
    const sb=document.getElementById('saveSetBtn'); if(sb) sb.addEventListener('click', saveSettings);

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
    document.getElementById('printBtn').addEventListener('click', ()=>{
      if(!lastPages.length){APP.toast('Genera los apuntes primero');return;}
      // vista previa de impresión: ventana con las hojas tal cual saldrán
      const w=window.open('','_blank');
      if(!w){ window.print(); return; }
      const mm=paperDims({paper:val('optPaper')}).mm;
      const imgs=lastPages.map((pg,i)=>{ let src=pg.canvas;
        const where=val('sigWhere');
        const targ = sigData && (where==='all' || i===lastPages.length-1);
        const hasObj = objects.length && i===lastPages.length-1;
        if(targ||hasObj){ const t=document.createElement('canvas'); t.width=src.width; t.height=src.height;
          const c=t.getContext('2d'); c.drawImage(src,0,0); if(targ) bakeSigOn(c,t); if(hasObj) bakeObjectsOn(c,t); src=t; }
        return '<img src="'+src.toDataURL('image/png')+'">'; }).join('');
      w.document.write('<!doctype html><meta charset="utf-8"><title>Vista previa de impresión</title>'+
        '<style>@page{size:'+mm[0]+'mm '+mm[1]+'mm;margin:0}'+
        'body{margin:0;background:#666;font-family:Inter,sans-serif}'+
        '.bar{position:sticky;top:0;background:#fff;padding:10px;display:flex;gap:8px;align-items:center;box-shadow:0 2px 8px rgba(0,0,0,.2)}'+
        'button{font:inherit;padding:8px 16px;border:none;border-radius:8px;background:#3b5bdb;color:#fff;cursor:pointer}'+
        'img{display:block;width:'+mm[0]+'mm;height:'+mm[1]+'mm;margin:14px auto;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.35)}'+
        '@media print{.bar{display:none}img{margin:0;box-shadow:none;page-break-after:always}}</style>'+
        '<div class="bar"><button onclick="window.print()">🖨️ Imprimir</button>'+
        '<span>'+lastPages.length+' hoja(s) · '+mm[0]+'×'+mm[1]+' mm</span></div>'+imgs);
      w.document.close();
    });
    document.getElementById('pdfBtn').addEventListener('click', exportPDF);

    // vista previa de realismo en vivo
    ['optInstrument','optColor','optSize','optLine','optPressure','optTone','optTransp',
     'optSmooth','optFall','optJitter','optDrift','optBlots','optWear','optRetrace','optStrikes','optSlant','optFontKind','optPaper'].forEach(id=>{
      const el=document.getElementById(id); if(el){ el.addEventListener('input',schedulePreview); el.addEventListener('change',schedulePreview); }
    });

    loadFontLibrary().then(()=>{
      loadSettings();                             // restaura ajustes guardados
      // si hay mezcla activa (p. ej. las 16 predeterminadas), enciéndela
      if(!localStorage.getItem('manuscrito_settings') && activeMix().length>=2)
        document.getElementById('mixUse').checked=true;
    });
  }
  function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
  // vista en vivo: si el toggle está activo y hay texto, regenera con retardo
  const scheduleLive=debounce(()=>{ const lv=document.getElementById('optLive');
    if(lv&&lv.checked && document.getElementById('genText').value.trim()) run(); }, 130);

  function saveMix(){ try{ localStorage.setItem('manuscrito_mix',JSON.stringify(mixList));
    localStorage.setItem('manuscrito_mixoff',JSON.stringify([...mixOff])); }catch(e){} renderMixChips(); }
  function renderMixChips(){
    const host=document.getElementById('mixChips'); if(!host) return;
    host.innerHTML='';
    mixList.forEach((f,i)=>{ const chip=document.createElement('span');
      chip.className='mix-chip'+(mixOff.has(f)?' off':'');
      chip.style.fontFamily=`"${f}", cursive`; chip.textContent=f+' ';
      chip.title='Clic: activar/desactivar en la mezcla · ×: quitar';
      chip.onclick=e=>{ if(e.target.tagName==='BUTTON') return;
        mixOff.has(f)?mixOff.delete(f):mixOff.add(f); saveMix(); schedulePreview(); };
      const del=document.createElement('button'); del.textContent='×';
      del.onclick=()=>{ mixList.splice(i,1); mixOff.delete(f); saveMix(); schedulePreview(); };
      chip.appendChild(del); host.appendChild(chip); });
    if(!mixList.length) host.innerHTML='<span class="muted sm">— añade 2 o más fuentes y marca "usar mezcla" —</span>';
  }
  function activeMix(){ return mixList.filter(f=>!mixOff.has(f)); }

  /* ---------- guardado total de ajustes ---------- */
  const SETTINGS_IDS=['optPaper','optRuling','optHoles','optSize','optLine','optInstrument','optColor',
    'aiSmartInstr','optFormat','optFontKind','optFont','optFontSearch','optPressure','optTone','optTransp','optSmooth',
    'optFall','optJitter','optDrift','optBlots','optWear','optRetrace','optStrikes','optSlant',
    'cpTop','cpBottom','cpLeft','cpRight','cpGrid','cpBox','cpW','cpH','cpStyle','optInk','optFlip',
    'sigSize','sigColor','sigWhere','sigTint','sigWear','sigPress','sigGrid','sigColorSolo','sigInk','sigThick','sigQuitaNeutro','sigTolerancia','sigMinAlpha','sigSoloPick','aiUse','aiRevisar','optMixLetter','optObjRough','aiProvider','sigWhat','sigAI','aiDepth','optAlign','optIndent','optParaGap','optMapStyle','optTablaAlin','optTablaInter','optTablaTam','optTablaAncho'];
  function saveSettings(){
    const s={};
    SETTINGS_IDS.forEach(id=>{ const e=document.getElementById(id); if(e) s[id]=e.value; });
    s._mixUse=document.getElementById('mixUse').checked;
    try{ localStorage.setItem('manuscrito_settings',JSON.stringify(s)); }catch(e){}
    saveMix();   // también persiste mezcla + apagadas
    APP.toast('Todos los ajustes guardados 💾');
  }
  function loadSettings(){
    let s=null; try{ s=JSON.parse(localStorage.getItem('manuscrito_settings')||'null'); }catch(e){}
    if(!s) return;
    // primero el grupo de fuente (repobla la lista), luego el resto
    const kind=document.getElementById('optFontKind');
    if(s.optFontKind){ kind.value=s.optFontKind; }
    populateFonts();
    SETTINGS_IDS.forEach(id=>{ if(id==='optFontKind'||s[id]===undefined) return;
      const e=document.getElementById(id); if(!e) return;
      if(id==='optFont'){
        let o=[...e.options].find(o=>o.value===s.optFont);
        if(!o && s.optFont && s.optFont.startsWith('font:')){   // fuente fuera de la lista visible
          o=document.createElement('option'); o.value=s.optFont; o.textContent=s.optFont.slice(5);
          o.style.fontFamily=`"${s.optFont.slice(5)}", cursive`; e.appendChild(o); FONTS.ensure(s.optFont.slice(5));
        }
        if(o) e.value=s.optFont;
      } else e.value=s[id];
      e.dispatchEvent(new Event('input'));   // sincroniza etiquetas de sliders
    });
    if(typeof s._mixUse==='boolean') document.getElementById('mixUse').checked=s._mixUse;
    updateFontPreview(); schedulePreview();
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
    // grupos por parecido real: mezclar dentro de un grupo se ve coherente
    const grupo=kind.startsWith('g:')&&FONTS.GRUPOS&&FONTS.GRUPOS[kind.slice(2)];
    const base=(grupo? grupo.fams
               : kind==='similar'?FONTS.SIMILAR
               : kind==='hand'?fontHand
               : kind==='display'?(FONTS.display||[])
               : fontPrint);
    const list=base.filter(f=>!q||f.toLowerCase().includes(q)).slice(0,120);
    list.forEach(f=>{ const o=document.createElement('option'); o.value='font:'+f;
      o.textContent=(f===RECOMMENDED?'⭐ '+f+' (parecida a tu letra)':f);
      o.style.fontFamily=`"${f}", cursive`;       // se ve en su propia letra (tipo Word)
      sel.appendChild(o);
    });
    /* Antes solo se cargaban las 28 primeras y el resto se veia con la letra
       por defecto: leias el nombre pero no la letra. Ahora se cargan TODAS las
       de la lista, por tandas y en una sola peticion cada tanda.            */
    if(list.length && FONTS.ensureVarias) FONTS.ensureVarias(list);
    else list.slice(0,28).forEach(f=>FONTS.ensure(f));
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
      if(typeof AI!=='undefined' && AI.hayIA())
        APP.toast('Documento leído. Pulsa ✨ Apuntes inteligentes para que la IA lo organice');
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
  /* ── LECTURA DE PDF CON ESTRUCTURA ───────────────────────────────────────
     pdf.js devuelve trozos sueltos con su posicion. Leerlos en orden aplasta
     las tablas: "Variable Tipo Edad Sexo Carrera" pierde filas y columnas.
     Aqui se agrupan por linea (misma Y) y se detecta cuando varias lineas
     seguidas comparten los mismos cortes en X: eso es una tabla, y se emite
     con la marca "|" para que el apunte la dibuje a mano.                    */
  function lineasDePagina(items){
    const filas=[];
    for(const it of items){
      const t=it.str; if(!t||!t.trim()) continue;
      const x=it.transform[4], y=it.transform[5], w=it.width||0;
      let f=filas.find(o=>Math.abs(o.y-y)<=3.2);
      if(!f){ f={y, trozos:[]}; filas.push(f); }
      f.trozos.push({x, x1:x+w, t});
    }
    filas.sort((a,b)=>b.y-a.y);                 // el PDF cuenta la Y hacia arriba
    for(const f of filas) f.trozos.sort((a,b)=>a.x-b.x);
    return filas;
  }
  function huecosDeFila(f, minHueco){
    // cortes = separaciones anchas entre trozos; son las columnas
    const cortes=[];
    for(let i=1;i<f.trozos.length;i++){
      const hueco=f.trozos[i].x - f.trozos[i-1].x1;
      if(hueco>=minHueco) cortes.push((f.trozos[i].x + f.trozos[i-1].x1)/2);
    }
    return cortes;
  }
  function celdasPorCortes(f, cortes){
    const cel=new Array(cortes.length+1).fill('');
    for(const tr of f.trozos){
      let c=0; while(c<cortes.length && tr.x>=cortes[c]) c++;
      cel[c]=(cel[c]? cel[c]+' ':'')+tr.t.trim();
    }
    return cel.map(c=>c.replace(/\s+/g,' ').trim());
  }
  /* Una lista con viñetas tambien alinea sus huecos: el "•" cae siempre en el
     mismo sitio. Sin este filtro, cualquier lista se convertia en tabla.     */
  function esTablaDeVerdad(bloque, nc){
    if(nc<2) return false;
    for(let c=0;c<nc;c++){
      const col=bloque.map(b=>b[c]||'');
      const unicos=new Set(col.map(v=>v.trim()));
      const cortos=col.every(v=>v.trim().length<=2);
      // columna entera igual y de un solo caracter = viñeta o numeracion
      if(cortos && unicos.size<=2) return false;
    }
    // al menos dos columnas con contenido real en la mayoria de las filas
    let utiles=0;
    for(let c=0;c<nc;c++){
      const llenas=bloque.filter(b=>(b[c]||'').trim().length>0).length;
      if(llenas>=Math.ceil(bloque.length*0.6)) utiles++;
    }
    return utiles>=2;
  }
  function cabeceraPlausible(bloque){
    if(bloque.length<2) return false;
    const num=v=>/^[\d.,%\s-]+$/.test(String(v||'').trim()) && /\d/.test(String(v||''));
    const cab=bloque[0], resto=bloque.slice(1);
    if(cab.some(num)) return false;                       // una cabecera no son numeros
    const hayNum=resto.some(f=>f.some(num));
    const textoResto=resto.some(f=>f.some(v=>v && !num(v)));
    return hayNum || textoResto;
  }
  function textoConTablas(filas, anchoPag){
    const minHueco=Math.max(12, anchoPag*0.022);
    const info=filas.map(f=>({f, cortes:huecosDeFila(f,minHueco)}));
    const out=[]; let i=0;
    while(i<info.length){
      const cortes=info[i].cortes;
      if(cortes.length>=1){
        // ¿cuantas lineas seguidas comparten estos mismos cortes?
        let j=i+1;
        const parecidos=(a,b)=>a.length===b.length && a.every((v,k)=>Math.abs(v-b[k])<anchoPag*0.05);
        while(j<info.length && info[j].cortes.length>=1 && parecidos(cortes, info[j].cortes)) j++;
        if(j-i>=2){                              // 2+ filas alineadas: candidata a tabla
          const bloque=[];
          for(let k=i;k<j;k++) bloque.push(celdasPorCortes(info[k].f, cortes));
          const nc=Math.max(...bloque.map(b=>b.length));
          for(const b of bloque) while(b.length<nc) b.push('');
          if(esTablaDeVerdad(bloque, nc)){
            out.push('');
            bloque.forEach((cel,k)=>out.push((k===0&&cabeceraPlausible(bloque)?'|= ':'| ')+cel.join(' | ')));
            out.push('');
            i=j; continue;
          }
          // no era tabla (lista con viñetas, texto a dos columnas): texto normal
          for(const b of bloque) out.push(b.filter(Boolean).join(' ').trim());
          i=j; continue;
        }
      }
      out.push(info[i].f.trozos.map(t=>t.t).join(' ').replace(/\s+/g,' ').trim());
      i++;
    }
    return out.join('\n');
  }
  const paginasPDF={};
  async function readPDF(f){
    APP.busy('Cargando lector de PDF…');
    const pdfjs=await LIBS.pdfjs();
    if(!pdfjs) throw new Error('No se pudo cargar el lector de PDF');
    const buf=await f.arrayBuffer(); const pdf=await pdfjs.getDocument({data:buf}).promise;
    const partes=[]; let conTabla=0; const flacas=[];
    for(let p=1;p<=pdf.numPages;p++){ APP.busy(`Leyendo PDF… página ${p}/${pdf.numPages}`);
      const page=await pdf.getPage(p);
      const vp=page.getViewport({scale:1});
      const c=await page.getTextContent();
      const filas=lineasDePagina(c.items);
      const txt=textoConTablas(filas, vp.width||600);
      if(/^\|/m.test(txt)) conTabla++;
      // una diapositiva que es solo imagen no devuelve texto: su contenido
      // (formulas, tablas, graficos) esta DENTRO del pixel y hoy se perdia
      if(txt.replace(/\s/g,'').length<40) flacas.push(p);
      partes.push(txt);
      paginasPDF[p]=page;                      // se guarda por si hay que rasterizar
    }
    APP.idle();
    if(flacas.length){
      /* Hibrido: las paginas que ya se leen bien van por texto; solo las que
         son imagen pura necesitan ayuda. Y de esas, MIRARLAS es mejor que
         pasarlas por OCR: el OCR convierte una tabla en numeros sueltos en
         fila, mientras que el modelo la ve y la devuelve como tabla.        */
      const hayVision = (typeof AI!=='undefined') && AI.leePaginaVisual && AI.proveedoresDisponibles().includes('gemini');
      const seg=Math.round(flacas.length*(hayVision?5:6.5));
      const tiempo=(seg>90? Math.ceil(seg/60)+' minutos' : seg+' segundos');
      const hacer = confirm(flacas.length+' página(s) de este PDF son solo imagen '+
        '(fórmulas, tablas o gráficos dentro del dibujo) y su contenido se perdería.\n\n'+
        (hayVision
          ? ('¿Leerlas con la IA mirándolas? Tarda unos '+tiempo+'.\nConserva las tablas; si la IA falla en alguna, se intenta con OCR.')
          : ('¿Leerlas con OCR? Tarda unos '+tiempo+'.\nLos títulos y el texto salen bien; los números pequeños de las tablas, regular.\n(Con una clave de Gemini se leerían mucho mejor.)')));
      if(hacer){
        let T=null, n=0, porVision=0, porOCR=0;
        for(const p of flacas){ n++;
          let hecho=false;
          if(hayVision){
            APP.busy(`La IA está mirando las páginas… ${n}/${flacas.length} (página ${p})`);
            try{
              const png=await rasterizaPaginaPDF(paginasPDF[p], 2.0);
              const t=await AI.leePaginaVisual(png, p);
              if(t && t.replace(/\s/g,'').length>25){
                partes[p-1]=(partes[p-1]+'\n'+t).trim(); hecho=true; porVision++;
              }
            }catch(e){ console.warn('visión pág '+p, e); }
          }
          if(!hecho){                                  // respaldo: OCR
            APP.busy(`OCR de páginas-imagen… ${n}/${flacas.length} (página ${p})`);
            try{
              if(!T) T=await LIBS.tesseract();
              const t=await ocrDePaginaPDF(paginasPDF[p], T);
              if(t && t.replace(/\s/g,'').length>25){ partes[p-1]=(partes[p-1]+'\n'+t).trim(); porOCR++; }
            }catch(e){ console.warn('OCR pág '+p, e); }
          }
        }
        APP.idle();
        APP.toast('Recuperadas '+(porVision+porOCR)+' página(s)'+
          (porVision? ' ('+porVision+' mirándolas'+(porOCR? ', '+porOCR+' por OCR':'')+')' : ' por OCR'));
      } else {
        APP.toast('Saltadas '+flacas.length+' página(s) de solo imagen');
      }
    }
    const out=partes.join('\n\n');
    if(out.replace(/\s/g,'').length<3) throw new Error('El PDF no tiene texto (parece escaneado). Súbelo como imagen para OCR.');
    if(conTabla) APP.toast('Reconstruí '+conTabla+' página(s) con tablas');
    return out;
  }
  /* Rasteriza una pagina del PDF y la pasa por OCR. Se renderiza a 2,2x
     porque tesseract acierta mucho mas con texto grande, y se sube el
     contraste igual que en el OCR de imagenes sueltas.                      */
  /* El render de pdf.js puede COLGARSE en una pagina concreta y no volver
     nunca: medido en la pagina 5 de un PDF real, dejaba la importacion parada
     para siempre. Se le pone plazo y se cancela la tarea, para que el flujo
     siga con la siguiente pagina o caiga a OCR.                             */
  async function rasterizaPaginaPDF(page, escala, plazo){
    if(!page) return '';
    const vp=page.getViewport({scale:escala||2.0});
    const c=document.createElement('canvas');
    c.width=Math.round(vp.width); c.height=Math.round(vp.height);
    const cx=c.getContext('2d');
    cx.fillStyle='#fff'; cx.fillRect(0,0,c.width,c.height);
    const tarea=page.render({canvasContext:cx, viewport:vp});
    let temporizador;
    try{
      await Promise.race([ tarea.promise,
        new Promise((_,rej)=>{ temporizador=setTimeout(()=>rej(new Error('El dibujo de la página tardó demasiado')), plazo||15000); }) ]);
    }catch(e){
      try{ tarea.cancel(); }catch(_){}
      throw e;
    }finally{ clearTimeout(temporizador); }
    return c.toDataURL('image/jpeg',0.88);     // jpeg: la mitad de peso que png
  }
  async function ocrDePaginaPDF(page, T){
    if(!page) return '';
    const vp=page.getViewport({scale:3.1});
    const c=document.createElement('canvas');
    c.width=Math.round(vp.width); c.height=Math.round(vp.height);
    const cx=c.getContext('2d',{willReadFrequently:true});
    cx.fillStyle='#fff'; cx.fillRect(0,0,c.width,c.height);
    const tarea=page.render({canvasContext:cx, viewport:vp});
    let temp2;
    try{
      await Promise.race([ tarea.promise,
        new Promise((_,rej)=>{ temp2=setTimeout(()=>rej(new Error('render lento')), 15000); }) ]);
    }catch(e){ try{ tarea.cancel(); }catch(_){} throw e; }
    finally{ clearTimeout(temp2); }
    const id=cx.getImageData(0,0,c.width,c.height), d=id.data;
    let mn=255,mx=0; const g=new Float32Array(d.length/4);
    for(let i=0,j=0;i<d.length;i+=4,j++){ const v=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; g[j]=v; if(v<mn)mn=v; if(v>mx)mx=v; }
    const rg=Math.max(1,mx-mn);
    for(let i=0,j=0;i<d.length;i+=4,j++){ let v=(g[j]-mn)/rg;
      v=v<0.5? v*v*1.3 : 1-(1-v)*(1-v)*1.3; v=clamp(v,0,1)*255; d[i]=d[i+1]=d[i+2]=v; }
    cx.putImageData(id,0,0);
    const res=await T.recognize(c,'spa',{logger:()=>{}});
    return ((res&&res.data&&res.data.text)||'').replace(/[ \t]+/g,' ').trim();
  }
  /* Word marca sus tablas, titulos y listas EN EL PROPIO FICHERO. Leerlo con
     extractRawText() los aplastaba a texto corrido y luego habia que adivinar
     que era una tabla — justo el trabajo que en PDF cuesta tanto y aqui viene
     regalado. Se lee como HTML y se traduce a las marcas del apunte.        */
  function docxHtmlAMarcas(html){
    const doc=new DOMParser().parseFromString(html,'text/html');
    const out=[];
    const limpio=t=>String(t||'').replace(/\s+/g,' ').trim();
    const recorre=(el)=>{
      for(const nodo of el.children){
        const tag=nodo.tagName.toLowerCase();
        if(/^h[1-6]$/.test(tag)){
          const t=limpio(nodo.textContent); if(!t) continue;
          out.push('', +tag[1]<=2 ? t.toUpperCase() : t);      // seccion o subtitulo
        } else if(tag==='table'){
          const filas=[...nodo.querySelectorAll('tr')];
          if(!filas.length) continue;
          const celdas=f=>[...f.querySelectorAll('td,th')].map(c=>limpio(c.textContent)||' ');
          const nc=Math.max(...filas.map(f=>celdas(f).length));
          out.push('');
          filas.forEach((f,i)=>{
            const c=celdas(f); while(c.length<nc) c.push('');
            // cabecera: la fila de <th>, o la primera si no hay
            const esCab=(i===0) && (f.querySelector('th') || filas.length>1);
            out.push((esCab?'|= ':'| ')+c.join(' | '));
          });
          out.push('');
        } else if(tag==='ul'||tag==='ol'){
          for(const li of nodo.querySelectorAll(':scope > li')){
            const t=limpio(li.textContent); if(t) out.push('• '+t);
          }
          out.push('');
        } else if(tag==='p'){
          const t=limpio(nodo.textContent); if(t) out.push(t);
        } else if(nodo.children.length){ recorre(nodo); }
        else { const t=limpio(nodo.textContent); if(t) out.push(t); }
      }
    };
    recorre(doc.body);
    return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  async function readDOCX(f){
    APP.busy('Cargando lector de Word…');
    const mammoth=await LIBS.mammoth(); const buf=await f.arrayBuffer();
    try{
      const r=await mammoth.convertToHtml({arrayBuffer:buf});
      const txt=docxHtmlAMarcas(r.value||'');
      if(txt && txt.replace(/\s/g,'').length>3){
        const nT=(txt.match(/^\|/gm)||[]).length;
        APP.idle();
        if(nT) APP.toast('Conservé '+nT+' fila(s) de tabla del documento de Word');
        return txt;
      }
    }catch(e){ console.warn('docx html:', e); }
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
    ink:+(val('optInk')||0)/100, flip:val('optFlip')==='1',
    mixLetter:!!(document.getElementById('optMixLetter')&&document.getElementById('optMixLetter').checked),
    align:val('optAlign')||'left', indent:+(val('optIndent')||0), paraGap:+(val('optParaGap')||0)/100,
    slant:+val('optSlant'), instr:INSTRUMENTS[val('optInstrument')]||INSTRUMENTS['boli-azul'],
    format:val('optFormat'), fontVal:val('optFont')||'',
    mix:(document.getElementById('mixUse')&&document.getElementById('mixUse').checked&&activeMix().length>=2)?activeMix():null,
    paperCustom: val('optPaper')==='custom' || val('optRuling')==='custom',
    custom:{ top:+val('cpTop')||16, bottom:+val('cpBottom')||16, left:+val('cpLeft')||20, right:+val('cpRight')||12,
             grid:+val('cpGrid')||0, box:val('cpBox')==='box', style:val('cpStyle')||'traper' },
    sig:{ pos:'br', size:+val('sigSize')||55, color:val('sigColor'), where:val('sigWhere'), tint:val('sigTint') },
    _seed:renderSeed }; }

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

  /* ---------- firma: extrae SOLO la tinta, conserva colores. Funciona con firma limpia de internet
       (fondo blanco) y con foto sobre cuaderno (quita papel+cuadrícula). ---------- */
  let sigRawImg=null;
  function loadImg(src){ return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=()=>rej(new Error('Imagen inválida')); im.src=src; }); }
  async function extractSignature(fileOrBlob){
    const img=await loadImg(URL.createObjectURL(fileOrBlob)); sigRawImg=img;
    return extractSigFromImg(img, +val('sigThresh')||50, {all:!!(document.getElementById('sigAll')&&document.getElementById('sigAll').checked)});
  }
  function extractSigFromImg(img, sens, opts){
    opts=opts||{};
    const nw=img.naturalWidth||img.width, nh=img.naturalHeight||img.height;
    const sc=Math.min(1,1200/nw), w=Math.max(1,Math.round(nw*sc)), h=Math.max(1,Math.round(nh*sc));
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const cx=c.getContext('2d',{willReadFrequently:true}); cx.drawImage(img,0,0,w,h);
    const d=cx.getImageData(0,0,w,h).data, N=w*h;
    // fondo (papel/pantalla) por percentil de luminancia y saturación
    const hist=new Uint32Array(256), shist=new Uint32Array(256);
    for(let i=0;i<d.length;i+=4){ hist[(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2])|0]++;
      shist[Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2])]++; }
    let acc=0, bg=245; for(let L=255;L>=0;L--){ acc+=hist[L]; if(acc>=N*0.15){ bg=L; break; } } bg=Math.max(bg,140);
    let sacc=0, bgSat=0; for(let sv=0;sv<256;sv++){ sacc+=shist[sv]; if(sacc>=N*0.5){ bgSat=sv; break; } }
    const S=new Float32Array(N);
    for(let p=0,i=0;p<N;p++,i+=4){ const r=d[i],g=d[i+1],b=d[i+2];
      const lum=0.299*r+0.587*g+0.114*b, sat=Math.max(r,g,b)-Math.min(r,g,b);
      S[p]=Math.min(1,Math.max((bg-lum)/(bg*0.5),(sat-bgSat-16)/55)); }
    let k=clamp((sens-20)/70,0,1);
    let seedT=0.72-0.42*k, weakT=0.28-0.18*k;
    if(opts.tight){ seedT=0.38-0.16*k; weakT=0.16-0.07*k; }   // el recorte ya es la firma: no seas exigente
    // --- componentes conectados con estadísticas (para separar FIRMA de texto/ruido) ---
    const vis=new Uint8Array(N), lab=new Int32Array(N).fill(-1), st=new Int32Array(N);
    const comps=[];
    for(let p0=0;p0<N;p0++){
      if(vis[p0]||S[p0]<seedT) continue;
      let sp=0; st[sp++]=p0; vis[p0]=1; const px=[];
      let x0=w,y0=h,x1=0,y1=0, sumC=[0,0,0];
      while(sp){ const q=st[--sp]; px.push(q); const x=q%w,y=(q/w)|0;
        if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
        const i4=q*4; sumC[0]+=d[i4]; sumC[1]+=d[i4+1]; sumC[2]+=d[i4+2];
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue; const nx=x+dx,ny=y+dy;
          if(nx<0||ny<0||nx>=w||ny>=h)continue; const nq=ny*w+nx;
          if(!vis[nq]&&S[nq]>=weakT){ vis[nq]=1; st[sp++]=nq; } } }
      if(px.length<12) continue;
      const bw2=x1-x0+1, bh2=y1-y0+1, area=bw2*bh2;
      const id=comps.length;
      for(const q of px) lab[q]=id;
      const n=px.length;
      comps.push({id,px,x0,y0,x1,y1,bw:bw2,bh:bh2,n,
        fill:n/Math.max(1,area),                       // trazo fino ⇒ relleno bajo
        diag:Math.hypot(bw2,bh2),
        col:[sumC[0]/n|0, sumC[1]/n|0, sumC[2]/n|0]});
    }
    if(!comps.length) throw new Error('No detecté trazos (sube el "recorte de firma")');
    // quita renglones/rayas del cuaderno: componentes muy alargados, planos y de poca altura
    if(opts.delines && comps.length>1){
      const filtered=comps.filter(o=>{
        const ratio=o.bw/Math.max(1,o.bh);
        const flat = ratio>7 && o.bh<h*0.06;          // línea horizontal larga y fina
        const tall = (o.bh/Math.max(1,o.bw))>7 && o.bw<w*0.06;
        return !(flat||tall);
      });
      if(filtered.length) comps.length=0, Array.prototype.push.apply(comps, filtered);
    }
    // --- filtro por tamano estadistico (metodo de ahmetozlu/signature_extractor) ---
    // quita componentes muy pequenos (texto, puntos, ruido) y muy grandes (renglones, bordes)
    if(comps.length>2){
      let tot=0,cnt=0;
      for(const o of comps){ if(o.n>10){ tot+=o.n; cnt++; } }
      if(cnt){
        const avg=tot/cnt;
        const small=((avg/84)*250)+100;      // umbral inferior (constantes del repo)
        const big=small*18;                  // umbral superior
        const keepC=comps.filter(o=>o.n>=small*0.35 && o.n<=big);
        if(keepC.length) comps.length=0, Array.prototype.push.apply(comps, keepC);
      }
    }
    // --- puntuación: la FIRMA es el trazo grande, extenso y fino ---
    const maxDiag=Math.max(...comps.map(o=>o.diag));
    for(const o of comps){
      const sizeSc=o.diag/maxDiag;                     // qué tan grande/extenso
      const thinSc=1-Math.min(1,o.fill/0.35);          // fino (firma) vs macizo (texto grueso/manchas)
      o.score=sizeSc*0.75+thinSc*0.25;
    }
    comps.sort((a,b)=>b.score-a.score);
    const main=comps[0];
    let chosen;
    if(opts.all){ chosen=comps; }                      // modo "todo lo oscuro"
    else {
      // conserva el trazo principal + los que lo tocan/solapan o son claramente parte de la firma
      const mx0=main.x0-main.diag*0.10, mx1=main.x1+main.diag*0.10;
      const my0=main.y0-main.diag*0.10, my1=main.y1+main.diag*0.10;
      const sameCol=o=>Math.abs(o.col[0]-main.col[0])+Math.abs(o.col[1]-main.col[1])+Math.abs(o.col[2]-main.col[2])<150;
      chosen=comps.filter(o=> o===main ||
        (o.x1>=mx0&&o.x0<=mx1&&o.y1>=my0&&o.y0<=my1 && o.diag>main.diag*0.06 && sameCol(o)));
    }
    const keep=new Uint8Array(N);
    for(const o of chosen) for(const q of o.px) keep[q]=1;
    let minX=w,minY=h,maxX=0,maxY=0,has=false; const out=cx.createImageData(w,h);
    for(let p=0,i=0;p<N;p++,i+=4){ if(!keep[p]) continue;
      const a=Math.min(1,S[p]*1.6+0.3);
      out.data[i]=d[i];out.data[i+1]=d[i+1];out.data[i+2]=d[i+2];out.data[i+3]=Math.round(a*255);
      has=true; const x=p%w,y=(p/w)|0; if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y; }
    if(!has) throw new Error('No detecté la firma (mueve el "recorte de firma")');
    cx.putImageData(out,0,0);
    const bw=maxX-minX+1, bh=maxY-minY+1, t=document.createElement('canvas'); t.width=bw; t.height=bh;
    t.getContext('2d').drawImage(c,minX,minY,bw,bh,0,0,bw,bh);
    return {canvas:t, w:bw, h:bh, url:t.toDataURL('image/png')};
  }
  // Recorte YA acotado por la IA: umbral de Otsu (automatico) y se queda con el trazo oscuro.
  // Localiza la firma SIN IA: descarta zonas oscuras (teclado/sombra) y busca el bloque de
  // trazo mas denso sobre papel claro. Devuelve un recuadro {x0,y0,x1,y1} en px de la imagen.
  function findInkRegion(img){
    const W=img.naturalWidth||img.width, H=img.naturalHeight||img.height;
    const gw=Math.min(160, W), gh=Math.round(gw*H/W);
    const t=document.createElement('canvas'); t.width=gw; t.height=gh;
    const q=t.getContext('2d',{willReadFrequently:true});
    q.fillStyle='#fff'; q.fillRect(0,0,gw,gh); q.drawImage(img,0,0,gw,gh);
    const d=q.getImageData(0,0,gw,gh).data, n=gw*gh, L=new Float32Array(n);
    for(let i=0,p=0;i<d.length;i+=4,p++) L[p]=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
    // color del papel (percentil 75 global)
    const hist=new Uint32Array(256); for(let p=0;p<n;p++) hist[L[p]|0]++;
    let acc=0, paper=230; for(let v=255;v>=0;v--){ acc+=hist[v]; if(acc>=n*0.25){ paper=v; break; } }
    paper=Math.max(paper,110);
    // marca tinta: mas oscuro que el papel, pero NO zonas casi negras (teclado)
    const isInk=new Uint8Array(n);
    for(let p=0;p<n;p++){ const v=L[p]; if(v<paper-40 && v>paper*0.18) isInk[p]=1; }
    // integral por filas/columnas -> ventana con mas tinta
    let best=null;
    const stepY=Math.max(2,Math.round(gh/60)), stepX=Math.max(2,Math.round(gw/60));
    for(let y0=0;y0<gh;y0+=stepY) for(let hh=Math.round(gh*0.12); hh<=Math.round(gh*0.7); hh+=Math.round(gh*0.08)){
      if(y0+hh>gh) break;
      for(let x0=0;x0<gw;x0+=stepX) for(let ww=Math.round(gw*0.15); ww<=Math.round(gw*0.9); ww+=Math.round(gw*0.12)){
        if(x0+ww>gw) break;
        let ink=0, lightBg=0, cells=ww*hh;
        for(let y=y0;y<y0+hh;y+=2) for(let x=x0;x<x0+ww;x+=2){
          const p=y*gw+x; if(isInk[p]) ink++; if(L[p]>paper-25) lightBg++; }
        const sampled=Math.ceil(hh/2)*Math.ceil(ww/2);
        const fi=ink/sampled, fb=lightBg/sampled;
        if(fi<0.02||fi>0.5||fb<0.35) continue;      // necesita trazo Y papel claro alrededor
        const score=fi*fb*Math.sqrt(cells/(gw*gh));
        if(!best||score>best.score) best={score,x0,y0,x1:x0+ww,y1:y0+hh};
      }
    }
    if(!best) return null;
    const kx=W/gw, ky=H/gh;
    return {x0:best.x0*kx, y0:best.y0*ky, x1:best.x1*kx, y1:best.y1*ky};
  }
  /* ── Segmentacion local de tinta ──────────────────────────────────────────
     Encuentra la HOJA y agrupa los trazos en manchas (clusters) sin usar IA.
     La IA solo elige DESPUES cual mancha es la firma: si se equivoca de
     recuadro, el cluster igual encaja el recorte sobre tinta real.          */
  function blobs(mask,w,h,keepPx,minPx){
    const N=w*h, vis=new Uint8Array(N), st=new Int32Array(N), out=[];
    for(let s0=0;s0<N;s0++){
      if(vis[s0]||!mask[s0]) continue;
      let sp=0; st[sp++]=s0; vis[s0]=1;
      let n=0,x0=w,y0=h,x1=0,y1=0; const px=keepPx?[]:null;
      while(sp){ const p=st[--sp]; n++; if(px) px.push(p);
        const x=p%w, y=(p/w)|0;
        if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy) continue; const nx=x+dx, ny=y+dy;
          if(nx<0||ny<0||nx>=w||ny>=h) continue; const np=ny*w+nx;
          if(!vis[np]&&mask[np]){ vis[np]=1; st[sp++]=np; } } }
      if(n>=(minPx||1)) out.push({n,x0,y0,x1,y1,px});
    }
    return out;
  }
  /* Ejes de una rejilla periodica (cuadricula o renglones) dentro de una
     mascara de tinta. Devuelve las posiciones de las rayas, no los pixeles:
     quien llama decide que hacer con ellas. Lo usan inkClusters (para
     localizar) y extractTight (para no copiar la hoja).
     Una raya cruza casi toda la hoja y esta a distancia regular de la
     siguiente; un trazo de firma no cumple ni una cosa ni la otra.          */
  function ejesPeriodicos(mask, w, h, x0, y0, x1, y1){
    const anchoS=x1-x0+1, altoS=y1-y0+1;
    const colN=new Int32Array(w), filN=new Int32Array(h);
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) if(mask[y*w+x]){ colN[x]++; filN[y]++; }
    const eje=(cuenta, ini, fin, largo)=>{
      const cand=[];
      for(let i=ini;i<=fin;i++) if(cuenta[i] > largo*0.55) cand.push(i);
      if(cand.length<4) return null;
      // una raya ocupa 2-3 px: se aglutinan las contiguas en un solo eje
      const ejes=[]; let a=cand[0], b=cand[0];
      for(let k=1;k<cand.length;k++){
        if(cand[k]-b<=2){ b=cand[k]; continue; }
        ejes.push((a+b)>>1); a=b=cand[k];
      }
      ejes.push((a+b)>>1);
      if(ejes.length<4) return null;
      const hu=[]; for(let k=1;k<ejes.length;k++) hu.push(ejes[k]-ejes[k-1]);
      const or=hu.slice().sort((u,v)=>u-v), med=or[or.length>>1];
      if(med<6) return null;
      let ok=0; for(const g of hu) if(Math.abs(g-med) <= Math.max(2, med*0.25)) ok++;
      if(ok < hu.length*0.7) return null;                  // huecos irregulares: no es rejilla
      return {ejes, periodo:med};
    };
    const V=eje(colN, x0, x1, altoS), H=eje(filN, y0, y1, anchoS);
    return (V||H)? {V,H} : null;
  }
  function inkClusters(img){
    const W=img.naturalWidth||img.width, H=img.naturalHeight||img.height;
    const sc=Math.min(1, 900/Math.max(W,H));
    const w=Math.max(8,Math.round(W*sc)), h=Math.max(8,Math.round(H*sc));
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const q=c.getContext('2d',{willReadFrequently:true});
    q.fillStyle='#fff'; q.fillRect(0,0,w,h); q.drawImage(img,0,0,w,h);
    const d=q.getImageData(0,0,w,h).data, N=w*h;
    const L=new Float32Array(N);
    for(let p=0,i=0;p<N;p++,i+=4) L[p]=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];

    // color del papel: percentil 80 de luminancia + tono medio de esos pixeles
    const hist=new Uint32Array(256); for(let p=0;p<N;p++) hist[L[p]|0]++;
    let acc=0, paperL=230; for(let v=255;v>=0;v--){ acc+=hist[v]; if(acc>=N*0.20){ paperL=v; break; } }
    let pr=0,pg=0,pb=0,pn=0;
    for(let p=0,i=0;p<N;p++,i+=4) if(L[p]>paperL-14){ pr+=d[i]; pg+=d[i+1]; pb+=d[i+2]; pn++; }
    pn=pn||1; pr/=pn; pg/=pn; pb/=pn;
    const pRG=pr-pg, pGB=pg-pb;

    // mascara de HOJA: claro y del mismo tono que el papel
    const isPaper=new Uint8Array(N);
    for(let p=0,i=0;p<N;p++,i+=4){
      const dc=Math.abs((d[i]-d[i+1])-pRG)+Math.abs((d[i+1]-d[i+2])-pGB);
      if(L[p]>paperL-55 && dc<46) isPaper[p]=1;
    }
    /* NOTA: probe a definir la hoja como la UNION de las islas de papel, en
       vez del mayor trozo, porque los bordes impresos de un formulario parten
       el papel y la 'hoja' salia del tamano de una casilla (498x141 sobre
       520x340). En el banco sintetico funcionaba: el caso del formulario
       subia de 38%/50% a 97%/90% y las tres variantes localizaban la firma
       con un pixel de error.
       PERO en las fotos REALES del usuario es un desastre: con fondo oscuro
       (teclado, sombras) la union se dispara y el recorte pasa de 245x198 con
       82% de transparencia a 720x875 con 29% — media foto pegada. Las fotos
       de verdad mandan sobre el caso sintetico, asi que se revierte.
       Para hacerlo bien habria que acotar la union a las islas que compartan
       nivel de gris y esten pegadas, no a todas las grandes.               */
    const pbig=blobs(isPaper,w,h,false,Math.round(N*0.02)).sort((a,b)=>b.n-a.n)[0];
    const sheet=pbig||{x0:0,y0:0,x1:w-1,y1:h-1,n:N};
    const sx0=sheet.x0, sy0=sheet.y0, sx1=sheet.x1, sy1=sheet.y1;
    const sw=sx1-sx0+1, sh=sy1-sy0+1, Ns=sw*sh;

    /* PAPEL LOCAL, no global. Con luz desigual (viñeteado, sombra de la mano,
       flash) el papel no vale lo mismo en toda la foto: las esquinas oscuras
       quedan por debajo del nivel global y pasan por tinta. Medido en el caso
       'azul claro' del banco: nitida acertaba la firma exacta, y en cuanto se
       anadia luz desigual la mancha se iba a la esquina equivocada o abarcaba
       la imagen entera.
       Se estima el papel por bloques (percentil 75 de cada uno, que es papel
       porque la tinta es minoria), se suaviza la rejilla para que no haya
       escalones, y se interpola. La tinta pasa a medirse contra el papel de SU
       zona.                                                                  */
    const B=Math.max(12, Math.round(Math.min(sw,sh)/10));
    const gw=Math.max(2,Math.ceil(sw/B)+1), gh=Math.max(2,Math.ceil(sh/B)+1);
    const rej=new Float32Array(gw*gh);
    for(let by=0;by<gh;by++) for(let bx=0;bx<gw;bx++){
      const ax=sx0+bx*B, ay=sy0+by*B;
      const bxx=Math.min(sx1, ax+B-1), byy=Math.min(sy1, ay+B-1);
      const vs=[];
      for(let y=ay;y<=byy;y+=2) for(let x=ax;x<=bxx;x+=2){
        if(x<sx0||y<sy0) continue; vs.push(L[y*w+x]);
      }
      if(!vs.length){ rej[by*gw+bx]=paperL; continue; }
      vs.sort((a,b2)=>a-b2);
      /* Percentil 85: barrido en el banco de 0,65 a 0,92 — practicamente plano
         (85/86, 84/86, 85/86, 84/85). Se elige el mejor, que ademas es el
         menos influido por el texto impreso dentro del bloque. */
      rej[by*gw+bx]=vs[Math.min(vs.length-1, Math.floor(vs.length*0.85))];
    }
    // suavizado 3x3: sin el, los bloques dejan escalones que se ven como tinta
    const rej2=new Float32Array(rej);
    for(let by=0;by<gh;by++) for(let bx=0;bx<gw;bx++){
      let sma=0,n2=0;
      for(let j=-1;j<=1;j++) for(let i2=-1;i2<=1;i2++){
        const yy=by+j, xx=bx+i2;
        if(yy<0||xx<0||yy>=gh||xx>=gw) continue;
        sma+=rej[yy*gw+xx]; n2++;
      }
      rej2[by*gw+bx]=sma/n2;
    }
    const papelEn=(x,y)=>{                       // interpolacion bilineal
      const fx=(x-sx0)/B, fy=(y-sy0)/B;
      const x0b=Math.max(0,Math.min(gw-2,Math.floor(fx))), y0b=Math.max(0,Math.min(gh-2,Math.floor(fy)));
      const tx=Math.max(0,Math.min(1,fx-x0b)), ty=Math.max(0,Math.min(1,fy-y0b));
      const a=rej2[y0b*gw+x0b], b2=rej2[y0b*gw+x0b+1];
      const c2=rej2[(y0b+1)*gw+x0b], d2=rej2[(y0b+1)*gw+x0b+1];
      return (a+(b2-a)*tx)*(1-ty) + (c2+(d2-c2)*tx)*ty;
    };
    // distancia al papel = oscuridad O desviacion de tono (capta tinta verde/azul)
    const dist=new Float32Array(N), dh=new Uint32Array(256);
    for(let y=sy0;y<=sy1;y++) for(let x=sx0;x<=sx1;x++){
      const p=y*w+x, i=p*4;
      const dl=papelEn(x,y)-L[p];
      const dc=Math.abs((d[i]-d[i+1])-pRG)+Math.abs((d[i+1]-d[i+2])-pGB);
      const v=Math.max(dl, dc*1.15);
      dist[p]=v; dh[v<0?0:(v>255?255:v|0)]++;
    }
    let tot=0; for(let t=0;t<256;t++) tot+=t*dh[t];
    let sumB=0,wB=0,bv=0,thr=40;
    for(let t=0;t<256;t++){ wB+=dh[t]; if(!wB) continue; const wF=Ns-wB; if(wF<=0) break;
      sumB+=t*dh[t]; const mB=sumB/wB, mF=(tot-sumB)/wF, bt=wB*wF*(mB-mF)*(mB-mF);
      if(bt>bv){ bv=bt; thr=t; } }
    thr=Math.max(22, Math.min(thr, 110));

    /* NOTA — OTSU DE DOS NIVELES: probado y REVERTIDO, pero lo que dejo
       averiguado importa mas que el propio intento.
       El caso "azul sobre formulario" es el peor del banco (73/72) y se
       comporta al reves de lo esperable: con la foto NITIDA sale 17/34 y con
       las degradadas 97/91. La explicacion parecia clara: Otsu parte el
       histograma en DOS clases y aqui hay TRES (papel, boligrafo, impreso),
       asi que el corte cae entre lo impreso y el resto, y el boligrafo se
       queda del lado del papel. En la foto sucia el ruido rellena el centro
       del histograma y arrastra el umbral de 87 a 74, por debajo de la tinta.
       Se implemento el segundo corte sobre la sub-poblacion de debajo. Hubo
       que moverlo DESPUES de quitar la rejilla (antes veia los 17.700 px de
       rayas impresas y no saltaba nunca) y bajar el suelo del segundo umbral
       de 22 a 10 (se descartaba en silencio). Con eso ya se activa bien:
         nitida        654 px -> 1307 px en 8 componentes
         foto de movil 639 px -> 6916 px en 11 componentes
       Y aun asi inkClusters SIGUE devolviendo null, y la media del banco no
       se mueve: 80/81 antes y despues, con los 17 casos identicos.

       LO QUE SE DESCUBRIO, que es el verdadero hallazgo:
       en este caso lineasPeriodicas se come el 65% de la tinta, porque los
       bordes del formulario son periodicos y la firma va pegada a ellos. Lo
       que sobrevive se agrupa en una mancha de ~31x31 con fill=0,63, que
       choca contra la guarda fill<0,55 del scoring, nadie puntua, y se
       devuelve null. Es decir: TRES de las cuatro condiciones de este caso
       nunca han pasado por el motor — el banco cae al recuadro de la imagen
       entera y ese 73/72 es la nota del respaldo, no de un acierto.
       Por ahi hay que atacar: o la rejilla no debe tocar los bordes de una
       casilla (que son cuatro rectas, no una trama), o la guarda de fill
       tiene que mirar la forma del trazo y no solo cuanto llena su caja.   */
    const ink=new Uint8Array(N);
    for(let y=sy0;y<=sy1;y++) for(let x=sx0;x<=sx1;x++){ const p=y*w+x; if(dist[p]>thr) ink[p]=1; }

    const diag=Math.hypot(sw,sh);
    /* RECTAS IMPRESAS (bordes de recuadro, renglones, marcos).
       Una firma que toca el borde de su casilla se funde con el en un solo
       componente que cruza la hoja, y el filtro de 'atraviesa la hoja' lo
       descarta ENTERO, firma incluida.
       Se quitan con una APERTURA: se marca el final de cada tirada de K
       pixeles seguidos y luego se repinta la ventana completa hacia atras.
       Asi desaparece la linea ENTERA con sus extremos. El intento anterior
       borraba solo las tiradas y dejaba muñones que luego colaban como
       tinta; y ademas exigia el 45% del alto, cuando el lateral del recuadro
       medía el 44%: se salvaba por tres pixeles.                            */
    /* RECTAS IMPRESAS (bordes de casilla, renglones, marcos).
       Una firma que toca el borde de su casilla se funde con el en un solo
       componente que cruza la hoja, y el filtro de 'atraviesa la hoja' lo
       descarta ENTERO, firma incluida.
       NO se aplica siempre: barrido en el banco de K=0,22 a 0,50 — o no se
       activa (>=0,34) o hunde la media de 0,897/0,936 a 0,845/0,887, porque
       se come rasgos rectos de la propia firma y el subrayado del sello.
       Se reserva como RESCATE, cuando no aparece ni un componente.          */
    function quitaRectas(mask, tope){
      const Kh=Math.max(20, Math.round(sw*0.30)), Kv=Math.max(20, Math.round(sh*0.30));
      const lin=new Uint8Array(N);
      // la tirada se marca UNA vez al terminar; repintarla en cada pixel era
      // cuadratico y llegaba a congelar la pestana
      for(let y=sy0;y<=sy1;y++){
        let ini=-1;
        for(let x=sx0;x<=sx1+1;x++){
          const on=(x<=sx1) && mask[y*w+x];
          if(on){ if(ini<0) ini=x; }
          else { if(ini>=0 && (x-ini)>=Kh) for(let k=ini;k<x;k++) lin[y*w+k]=1; ini=-1; }
        }
      }
      for(let x=sx0;x<=sx1;x++){
        let ini=-1;
        for(let y=sy0;y<=sy1+1;y++){
          const on=(y<=sy1) && mask[y*w+x];
          if(on){ if(ini<0) ini=y; }
          else { if(ini>=0 && (y-ini)>=Kv) for(let k=ini;k<y;k++) lin[k*w+x]=1; ini=-1; }
        }
      }
      let nl=0, ni=0;
      for(let p=0;p<N;p++){ if(mask[p]) ni++; if(lin[p]) nl++; }
      /* Si casi TODA la tinta es 'recta', normalmente no eran rectas y no hay
         que tocar nada. Pero en el rescate ya venimos de no haber encontrado
         nada, y ahi si son rectas de verdad: un formulario con dos recuadros
         grandes y una firma fina llega al 85% facil, y la guarda bloqueaba el
         rescate justo en el caso para el que se escribio.                   */
      if(!ni || nl/ni >= (tope||0.85)) return 0;
      for(let p=0;p<N;p++) if(lin[p]) mask[p]=0;
      return nl;
    }
    const edge=6;
    const filtroComp=(o)=>{
      const bw=o.x1-o.x0+1, bh=o.y1-o.y0+1;
      if(Math.hypot(bw,bh) < diag*0.012) return false;      // mota de ruido
      // ninguna firma ni sello atraviesa la hoja entera: eso es fondo, sombra o el borde de la foto
      if(bw>sw*0.80 || bh>sh*0.80) return false;
      // tiras pegadas al borde de la foto (marco oscuro, dedo, mesa)
      const borde=(o.x0<=edge)||(o.y0<=edge)||(o.x1>=w-1-edge)||(o.y1>=h-1-edge);
      if(borde && (bw<sw*0.06 || bh<sh*0.06)) return false;
      return true;
    };
    /* ── LA CUADRICULA CUANDO PESA TANTO COMO LA FIRMA ──────────────────
       Caso limite: firma del MISMO tono e intensidad que las rayas de la
       hoja. Ningun umbral las separa, porque no hay diferencia de nivel que
       medir. Lo unico que las distingue es que la hoja es PERIODICA y la
       firma no.
       Donde se aplica importa mas que como. Un intento anterior quito la
       rejilla dentro de extractTight, que es la funcion que copia los
       pixeles FINALES: cortaba la firma en cada cruce y la media se hundio
       de 79/80 a 31/23. Aqui se hace en inkClusters, que solo devuelve
       CAJAS: extractTight vuelve al recorte original para los pixeles. Los
       trozos en que la rejilla parte la firma se vuelven a unir despues, en
       el agrupador por cajas dilatadas, porque el corte mide 3 px y el hueco
       que tolera es mayor. Asi la rejilla informa el DONDE y nunca el QUE.
       No se aplica siempre: solo cuando la rejilla DOMINA la tinta (>=30%),
       que es justo la senal de que esta al mismo nivel que la firma. Con una
       cuadricula mas floja que el boligrafo casi no cruza el umbral y este
       bloque ni se activa.                                                  */
    function lineasPeriodicas(mask){
      const E=ejesPeriodicos(mask, w, h, sx0, sy0, sx1, sy1);
      if(!E) return null;
      const rej=new Uint8Array(N); let nr=0;
      const marca=(vert,e)=>{
        for(let j=-1;j<=1;j++){ const i=e+j;
          if(vert){ if(i<sx0||i>sx1) continue;
            for(let y=sy0;y<=sy1;y++){ const q=y*w+i; if(mask[q]&&!rej[q]){ rej[q]=1; nr++; } } }
          else    { if(i<sy0||i>sy1) continue;
            for(let x=sx0;x<=sx1;x++){ const q=i*w+x; if(mask[q]&&!rej[q]){ rej[q]=1; nr++; } } }
        }
      };
      if(E.V) for(const e of E.V.ejes) marca(true,  e);
      if(E.H) for(const e of E.H.ejes) marca(false, e);
      return {rej, nr, periodoV:E.V?E.V.periodo:0, periodoH:E.H?E.H.periodo:0};
    }
    let nInk=0; for(let p=0;p<N;p++) if(ink[p]) nInk++;
    const R=nInk? lineasPeriodicas(ink) : null;
    if(R && R.nr >= nInk*0.30){
      for(let p=0;p<N;p++) if(R.rej[p]) ink[p]=0;
      nInk=0; for(let p=0;p<N;p++) if(ink[p]) nInk++;
      anotaDiag('rejilla', 'periodo v='+R.periodoV+' h='+R.periodoH+
                ' — quitados '+R.nr+' px, quedan '+nInk);
    }
    const crudos=blobs(ink,w,h,false,Math.max(8,Math.round(Ns*0.00004)));
    let comps=crudos.filter(filtroComp);
    anotaDiag('etapas', 'tinta='+nInk+'px hoja='+sw+'x'+sh+' umbral='+Math.round(thr)+
      ' blobs='+crudos.length+' tras filtro='+comps.length);
    if(!comps.length){
      /* Rescate: la firma iba pegada a una recta impresa (borde de casilla o
         renglon) y se fue con ella al filtrar. Solo aqui, porque quitar las
         rectas SIEMPRE sale peor: barrido en el banco de K=0,22 a 0,50 —
         o no se activa o hunde la media de 0,897/0,936 a 0,845/0,887, porque
         se come rasgos rectos de la propia firma y el subrayado del sello.  */
      const quitados=quitaRectas(ink, 0.98);
      if(quitados){
        comps=blobs(ink,w,h,false,Math.max(8,Math.round(Ns*0.00004))).filter(filtroComp);
        anotaDiag('rescateRectas', quitados+' px de recta -> '+comps.length+' componentes');
      }
    }
    if(!comps.length) return null;

    /* Agrupa trazos cercanos (union-find sobre cajas dilatadas).
       El emparejado es CUADRATICO, asi que con cientos de componentes la
       pestana se cuelga — ya paso una vez con quitaRectas. Ninguna firma
       tiene 400 trozos: si los hay, es texto impreso o ruido, y quedarse con
       los mayores no pierde firma pero si evita la congelacion.            */
    if(comps.length>400){
      comps.sort((a,b)=>b.n-a.n); comps=comps.slice(0,400);
      anotaDiag('recorteComps', 'habia demasiados componentes; me quedo con los 400 mayores');
    }
    const gap=Math.max(3, diag*0.022), par=comps.map((_,i)=>i);
    const find=a=>{ while(par[a]!==a){ par[a]=par[par[a]]; a=par[a]; } return a; };
    for(let i=0;i<comps.length;i++) for(let j=i+1;j<comps.length;j++){
      const A=comps[i], B=comps[j];
      // el rasgo que sube queda mas lejos en vertical que en horizontal
      const gapY=gap*2.1;
      if(A.x0-gap<=B.x1 && B.x0-gap<=A.x1 && A.y0-gapY<=B.y1 && B.y0-gapY<=A.y1){
        const ra=find(i), rb=find(j); if(ra!==rb) par[ra]=rb; }
    }
    const gm=new Map();
    comps.forEach((o,i)=>{ const r=find(i); let g=gm.get(r);
      if(!g){ g={id:gm.size,x0:o.x0,y0:o.y0,x1:o.x1,y1:o.y1,n:0,parts:0}; gm.set(r,g); }
      g.x0=Math.min(g.x0,o.x0); g.y0=Math.min(g.y0,o.y0);
      g.x1=Math.max(g.x1,o.x1); g.y1=Math.max(g.y1,o.y1);
      g.n+=o.n; g.parts++; o.g=g; });          // cada trazo recuerda a que grupo pertenece

    let cl=[...gm.values()];
    for(const g of cl){
      const bw=g.x1-g.x0+1, bh=g.y1-g.y0+1, area=bw*bh;
      g.fill=g.n/area;
      // el anillo alrededor de una firma es papel claro; el de un teclado no
      const mx=Math.round(bw*0.15), my=Math.round(bh*0.15);
      const hx0=Math.max(0,g.x0-mx), hx1=Math.min(w-1,g.x1+mx);
      const hy0=Math.max(0,g.y0-my), hy1=Math.min(h-1,g.y1+my);
      let hp=0,hn=0;
      for(let y=hy0;y<=hy1;y++) for(let x=hx0;x<=hx1;x++){
        if(x>=g.x0&&x<=g.x1&&y>=g.y0&&y<=g.y1) continue;
        hn++; if(isPaper[y*w+x]) hp++; }
      g.halo=hn?hp/hn:0;
      const rel=area/Ns;
      let s=0;
      if(g.fill>0.02 && g.fill<0.55) s=1-Math.abs(g.fill-0.16)/0.4;
      /* El halo (cuanto papel rodea la mancha) descarta bien el teclado, pero
         multiplicar por el lo convertia en VETO: una firma dentro de una
         casilla impresa no tiene halo de papel, su nota caia a cero, ninguna
         mancha puntuaba y inkClusters devolvia null — a ciegas. Ahora es un
         indicio con suelo: pesa, pero no anula.                             */
      s=Math.max(0,s)*Math.max(0.25, g.halo)*Math.min(1, rel/0.02);
      if(rel>0.75) s*=0.25;
      g.score=s;
    }
    const kx=W/w, ky=H/h;
    const box=g=>({ id:g.id, x0:g.x0*kx, y0:g.y0*ky, x1:(g.x1+1)*kx, y1:(g.y1+1)*ky,
                    score:g.score, fill:g.fill, halo:g.halo });
    const byId=new Map(); for(const g of cl) byId.set(g.id, box(g));
    let buenos=cl.filter(g=>g.score>0).sort((a,b)=>b.score-a.score);
    /* Una firma es UN objeto aunque sus lazos no se toquen. Con trazo fino y
       bucles grandes se parte en varias manchas y antes se usaba solo la
       mejor: en una firma real del usuario se encontraron 8 manchas y se
       recortaba uicamente uxxna de 155x220 sobre una foto de 466x772.
       Ahora la mejor ABSORBE a las que tiene cerca — cerca en proporcion a su
       propio tamano — siempre que sean de tinta parecida. El texto impreso ya
       lo descarta antes el filtro de color, asi que absorber no lo recupera. */
    if(buenos.length>1){
      const m=buenos[0];
      const mw=m.x1-m.x0, mh=m.y1-m.y0, mdiag=Math.hypot(mw,mh);
      const cerca=mdiag*0.55;
      let x0=m.x0,y0=m.y0,x1=m.x1,y1=m.y1, absorbidas=0;
      for(const g of buenos.slice(1)){
        const dx=Math.max(0, Math.max(x0-g.x1, g.x0-x1));
        const dy=Math.max(0, Math.max(y0-g.y1, g.y0-y1));
        if(Math.hypot(dx,dy)>cerca) continue;              // lejos: es otra cosa
        const ga=(g.x1-g.x0)*(g.y1-g.y0), ma=mw*mh;
        if(ga>ma*3) continue;                              // enorme al lado: sospechoso
        /* Absorber vale para FRAGMENTOS de la misma firma, no para otra firma
           entera. Dos firmas del mismo boligrafo comparten relleno y halo, asi
           que cumplian todas las condiciones y se fusionaban: el caso 'dos
           firmas' del banco daba 27/42. Un fragmento es claramente menor y
           puntua menos que el cuerpo principal; una segunda firma, no.      */
        const esFragmento = (ga < ma*0.45) || (g.score < m.score*0.5);
        if(!esFragmento) continue;
        /* Y que sea la MISMA clase de tinta. Sin esto, una sombra fuerte junto
           a la firma se absorbia y el recorte se iba al traste: medido en el
           banco, 'firma negra con sombra' caia de 93/97 a 19/39. Una sombra es
           una mancha rellena; un trazo de boligrafo no. */
        if(!(g.fill>m.fill*0.45 && g.fill<m.fill*2.2)) continue;
        if(g.halo < m.halo*0.5) continue;                  // rodeada de otra cosa
        x0=Math.min(x0,g.x0); y0=Math.min(y0,g.y0);
        x1=Math.max(x1,g.x1); y1=Math.max(y1,g.y1); absorbidas++;
      }
      if(absorbidas){
        anotaDiag('absorbidas', absorbidas+' manchas unidas a la principal');
        buenos=[Object.assign({}, m, {x0,y0,x1,y1})].concat(buenos.slice(1));
      }
    }
    if(!buenos.length && cl.length){
      // por que no puntuo ninguna: sin esto solo se ve 'null' y no se sabe donde murio
      const g=cl.slice().sort((a,b)=>((b.x1-b.x0)*(b.y1-b.y0))-((a.x1-a.x0)*(a.y1-a.y0)))[0];
      const area=(g.x1-g.x0+1)*(g.y1-g.y0+1);
      anotaDiag('nadiePuntua', cl.length+' manchas; la mayor: fill='+g.fill.toFixed(3)+
        ' halo='+g.halo.toFixed(2)+' rel='+(area/Ns).toFixed(3)+' partes='+g.parts);
    }
    if(!buenos.length) return null;
    return { clusters: buenos.slice(0,8).map(box),
             byId,
             comps: comps.map(o=>({ x0:o.x0*kx, y0:o.y0*ky, x1:(o.x1+1)*kx, y1:(o.y1+1)*ky,
                                    n:o.n, cid:o.g?o.g.id:-1 })),
             sheet:{x0:sx0*kx, y0:sy0*ky, x1:(sx1+1)*kx, y1:(sy1+1)*ky} };
  }
  /* Ajusta el recuadro de la IA a los TRAZOS reales que contiene.
     Toma cada componente cuya mayor parte cae dentro del recuadro y devuelve
     la caja que los envuelve enteros: si la IA corto el sello por la mitad,
     el trazo cortado entra completo y el recorte deja de salir incompleto.   */
  function refineBox(b, seg){
    if(!seg||!seg.comps||!seg.comps.length) return b;
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,got=0; const ids=new Set();
    for(const o of seg.comps){
      const ix=Math.max(0, Math.min(b.x1,o.x1)-Math.max(b.x0,o.x0));
      const iy=Math.max(0, Math.min(b.y1,o.y1)-Math.max(b.y0,o.y0));
      const inter=ix*iy; if(!inter) continue;
      // 0,35 dejaba fuera el rasgo alto de una firma (el bucle que sube y solo
      // roza la caja por abajo). Con 0,18 entra, y el tope de mas abajo evita
      // que se dispare.
      if(inter/Math.max(1,(o.x1-o.x0)*(o.y1-o.y0)) < 0.18) continue;   // apenas lo roza
      if(o.x0<x0)x0=o.x0; if(o.y0<y0)y0=o.y0;
      if(o.x1>x1)x1=o.x1; if(o.y1>y1)y1=o.y1; got++;
      if(o.cid>=0) ids.add(o.cid);
    }
    if(!got) return b;
    // amplia a los grupos completos: si la IA marco solo una letra, entra la firma entera
    if(seg.byId){
      let gx0=x0, gy0=y0, gx1=x1, gy1=y1;
      for(const id of ids){ const g=seg.byId.get(id); if(!g) continue;
        if(g.x0<gx0)gx0=g.x0; if(g.y0<gy0)gy0=g.y0;
        if(g.x1>gx1)gx1=g.x1; if(g.y1>gy1)gy1=g.y1; }
      const sw2=Math.max(1,seg.sheet.x1-seg.sheet.x0), sh2=Math.max(1,seg.sheet.y1-seg.sheet.y0);
      if((gx1-gx0)<sw2*0.75 && (gy1-gy0)<sh2*0.5){ x0=gx0; y0=gy0; x1=gx1; y1=gy1; }
    }
    const bw=Math.max(1,b.x1-b.x0), bh=Math.max(1,b.y1-b.y0);
    const sw3=seg.sheet?Math.max(1,seg.sheet.x1-seg.sheet.x0):Infinity;
    // solo desconfia si ademas se comio media hoja (una caja chica DEBE poder crecer)
    if(((x1-x0)>bw*2.4 || (y1-y0)>bh*2.4) && (x1-x0)>sw3*0.7) return b;
    return {x0,y0,x1,y1};
  }
  /* Una firma o un sello son TRAZOS sobre papel: ocupan poco de su caja. Una
     mancha maciza (teclado, sombra, borde de la mesa) llena media caja.
     MEDIDO sobre los casos reales del usuario:
        firma f1  relleno 0,134 | firma f2  relleno 0,193
        bloque    relleno 0,502 | bloque    relleno 0,467
     El relleno separa con holgura (factor 2,4). Antes habia ademas un test de
     erosion que NO separaba nada (la firma f2 daba 0,685 de nucleo y un bloque
     malo 0,480) porque los recortes pequenos se amplian y engordan el trazo:
     rechazaba firmas buenas. Fuera.                                          */
  function esTrazo(pz){
    if(!pz||!pz.canvas) return false;
    const c=pz.canvas, w=c.width, h=c.height, N=w*h;
    if(N<100) return false;
    const d=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
    let tinta=0;
    for(let p=0;p<N;p++) if(d[p*4+3]>60) tinta++;
    if(tinta<40) return false;
    return (tinta/N) < 0.34;
  }
  function extractTight(img, sens){
    const nw=img.naturalWidth||img.width, nh=img.naturalHeight||img.height;
    // no achicar recortes chicos; si son diminutos, AMPLIAR para conservar el trazo
    let sc=Math.min(1,1400/Math.max(nw,nh));
    if(Math.max(nw,nh)<420) sc=Math.min(3, 420/Math.max(nw,nh));
    const w=Math.max(1,Math.round(nw*sc)), h=Math.max(1,Math.round(nh*sc));
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const cx=c.getContext('2d',{willReadFrequently:true});
    cx.imageSmoothingQuality='high';
    cx.fillStyle='#fff'; cx.fillRect(0,0,w,h);           // fondo blanco: soporta PNG con transparencia
    cx.drawImage(img,0,0,w,h);
    const d=cx.getImageData(0,0,w,h).data, N=w*h;
    const lum=new Float32Array(N), hist=new Uint32Array(256);
    for(let p=0,i=0;p<N;p++,i+=4){ const L=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; lum[p]=L; hist[L|0]++; }
    // Otsu
    let sum=0; for(let t=0;t<256;t++) sum+=t*hist[t];
    let sumB=0,wB=0,best=0,thr=128;
    for(let t=0;t<256;t++){ wB+=hist[t]; if(!wB) continue; const wF=N-wB; if(!wF) break;
      sumB+=t*hist[t]; const mB=sumB/wB, mF=(sum-sumB)/wF, between=wB*wF*(mB-mF)*(mB-mF);
      if(between>best){ best=between; thr=t; } }
    // componentes conectados sobre lo oscuro; descarta ruido pequeno y lineas rectas
    // sens 20..90 (50 = normal): mas alto conserva mas trazo, mas bajo solo lo mas oscuro
    const k=(typeof sens==='number'? clamp((sens-20)/70,0,1) : 0.43);
    let cut=thr*(0.80+0.30*k);
    /* Otsu se adapta al CONTENIDO del recorte: si trae poca firma y mucha hoja,
       el umbral sube y la CUADRICULA pasa por tinta (medido: papel 136 vs
       umbral 121, solo 15 de diferencia).
       Un tope absoluto (papel-45) mataba la cuadricula PERO tambien las firmas
       de tinta clara: medido en la firma del usuario, papel 174 y Otsu 145
       correcto, pero el tope lo bajaba a 127 y solo sobrevivia el 2% mas
       oscuro (recorte de 63x93 en vez de la firma entera).
       Lo que de verdad distingue una cosa de otra es el CONTRASTE de lo que se
       ha marcado como tinta: una firma esta muy por debajo del papel (aqui 34);
       las rayas del cuaderno, apenas (15). Solo si el contraste es ridiculo se
       aprieta el umbral.                                                       */
    let pacc=0, papel=255;
    for(let v=255;v>=0;v--){ pacc+=hist[v]; if(pacc>=N*0.20){ papel=v; break; } }
    const tope=Math.ceil(Math.max(0,Math.min(255,cut)));
    let nT=0; for(let v=0;v<tope;v++) nT+=hist[v];
    if(nT){
      let a2=0, medT=0;
      for(let v=0;v<tope;v++){ a2+=hist[v]; if(a2>=nT/2){ medT=v; break; } }
      if((papel-medT)<22) cut=Math.min(cut, papel-45);   // no habia tinta: era la hoja
    }
    // saturacion del papel (mediana) para no confundir papel de color con tinta
    const shist=new Uint32Array(256);
    for(let i=0;i<d.length;i+=4) shist[Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2])]++;
    let sacc=0,bgSat=0; for(let v=0;v<256;v++){ sacc+=shist[v]; if(sacc>=N*0.55){ bgSat=v; break; } }
    /* ── PERFIL DE LA FOTO: medir antes de decidir ───────────────────────
       Hasta ahora se aplicaban los mismos filtros a toda foto, con guardas
       puestas a ojo, y por eso unas salian bien y otras se rompian. Aqui se
       mide primero como es ESTA imagen y cada filtro se activa (o no) segun
       lo que se ha medido, no por costumbre.                                */
    const perfil=(()=>{
      // contraste real de la tinta respecto al papel
      const tope2=Math.ceil(Math.max(0,Math.min(255,cut)));
      let nT2=0; for(let v=0;v<tope2;v++) nT2+=hist[v];
      let medT2=papel;
      if(nT2){ let a3=0; for(let v=0;v<tope2;v++){ a3+=hist[v]; if(a3>=nT2/2){ medT2=v; break; } } }
      const contraste=papel-medT2;
      // cuanta de la tinta lleva color, y si su tono esta concentrado
      let conColor=0, tot=0;
      for(let p2=0,i2=0;p2<N;p2++,i2+=4){ if(lum[p2]>=cut) continue; tot++;
        const sat=Math.max(d[i2],d[i2+1],d[i2+2])-Math.min(d[i2],d[i2+1],d[i2+2]);
        if(sat>=34) conColor++; }
      const fracColor=tot? conColor/tot : 0;
      return { papel, contraste, fracColor, tinta:tot,
               densidad: tot/N };
    })();
    anotaDiag('perfil', 'papel='+perfil.papel+' contraste='+Math.round(perfil.contraste)+
      ' color='+Math.round(perfil.fracColor*100)+'% densidad='+Math.round(perfil.densidad*100)+'%');

    /* NOTA: probe a aflojar el umbral cuando el contraste es flojo, para
       rescatar las firmas de tinta clara. MEDIDO en el banco: el caso 'azul
       claro casi del color del papel' EMPEORA de 86/71 a 71/42 — aflojar
       arrastra papel, y la limpieza se hunde. Media 81/82 -> 80/80. La
       medicion del perfil se conserva porque sirve para el diagnostico, pero
       la decision que saque de ella era mala.                               */
    const satCut=bgSat+22+18*(1-k);
    const ink=new Uint8Array(N);
    // tinta = mas oscura que el papel  O  mas saturada que el papel (firma verde/azul)
    for(let p=0,i=0;p<N;p++,i+=4){ const sat=Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2]);
      ink[p]= (lum[p]<cut || sat>satCut) ?1:0; }

    /* NOTA — RESTAR LA REJILLA AQUI: probado en tres versiones y REVERTIDO.
       La idea: donde la firma cruza una raya hay dos capas de tinta, y por
       composicion alfa el cruce es mas oscuro que la raya sola (a=0,85 da
       0,85 frente a 0,978). Se midio el nivel de cada raya y se quito lo que
       estaba a ese nivel, conservando lo que estaba por debajo.
         v1 nivel = mediana de la raya entera .... 36/22 -> 32/25
         v2 + nivel propio de los cruces de rejilla ... 32/25 (sin cambio)
         v3 + mediana movil, ventana 24 ......... 32/25 -> 31/27
       Media del banco: 80/81 en las tres. Cambia dos o tres puntos de un solo
       caso y no mueve nada mas: es ruido, no una mejora, y costaba 70 lineas.
       Lo que revelo la medicion es que el cuello de botella NO esta aqui. En
       ese caso 'conserva' se queda en 31: se pierde el 69% de la firma, y eso
       no es suciedad que sobra sino trazo que no llega. La salida mide 221x155
       sobre un recorte de 386x212 con 11 componentes, asi que el sospechoso es
       el 'keep' de mas abajo — conserva el componente mayor y lo que cae a
       diag*0,25 de el, y con la firma partida en trozos los lejanos se caen.
       Ahi es donde hay que mirar, no en el nivel de las rayas.
       La deteccion de rejilla SI vale en inkClusters (localizar), donde subio
       la media de 79/80 a 80/81 sin tocar ningun otro caso.                 */
    /* ── SEPARAR LA FIRMA DE LO IMPRESO POR COLOR ────────────────────────────
       Una firma sobre un formulario convive con texto impreso, rayas y
       recuadros. Distinguirlos por oscuridad es imposible: lo impreso suele
       ser MAS negro que el boligrafo. Pero el boligrafo casi siempre tiene
       COLOR (verde, azul, rojo) y lo impreso es neutro.
       Se busca el tono dominante entre la tinta con color; si existe y ademas
       hay bastante tinta neutra (el impreso), se conserva solo el tono del
       boligrafo. Si toda la tinta es neutra (lapiz, boli negro) no se toca
       nada: no habria con que separar.                                       */
    if(!(document.getElementById('sigColorSolo')&&!document.getElementById('sigColorSolo').checked)){
      const tono=(r,g,b)=>{ const mx=Math.max(r,g,b), mn=Math.min(r,g,b), c2=mx-mn;
        if(!c2) return -1;
        let h; if(mx===r) h=((g-b)/c2+6)%6; else if(mx===g) h=(b-r)/c2+2; else h=(r-g)/c2+4;
        return h*60; };
      const BINS=24, hb=new Float64Array(BINS);
      let conColor=0, neutra=0;
      for(let p=0,i=0;p<N;p++,i+=4){ if(!ink[p]) continue;
        const r=d[i],g=d[i+1],b=d[i+2];
        const sat=Math.max(r,g,b)-Math.min(r,g,b);
        if(sat>=34){ const h=tono(r,g,b); if(h>=0){ hb[Math.floor(h/360*BINS)%BINS]+=sat; conColor++; } }
        else neutra++;
      }
      const total=conColor+neutra;
      /* Solo separa por color si de verdad HAY dos poblaciones: bastante
         tinta con color y bastante neutra. Si casi todo lleva color (firma de
         color sobre papel limpio) no hay nada que separar y filtrar solo
         quita bordes del propio trazo.                                       */
      if(total>200 && conColor>total*0.10 && neutra>total*0.12){
        let mejor=0; for(let i2=1;i2<BINS;i2++) if(hb[i2]>hb[mejor]) mejor=i2;
        const totPeso=hb.reduce((a,v)=>a+v,0)||1;
        /* Un boligrafo es UN color: casi todo su peso cae en un solo tono. El
           ruido de compresion sobre grafito tambien tiene tono dominante, pero
           REPARTIDO. MEDIDO: pico de un solo bin = 0,955 con boligrafo rojo y
           0,414 con el lapiz del usuario. Mirar el pico con sus vecinos no
           servia (0,82 frente a 1,00, demasiado juntos).                      */
        const pico=hb[mejor]/totPeso;
        anotaDiag('picoTono', pico.toFixed(3));
        if(pico>0.65){
          const centro=(mejor+0.5)/BINS*360;
          const dist=(h)=>{ let x=Math.abs(h-centro)%360; return x>180?360-x:x; };
          const filtrada=new Uint8Array(N); let quedan=0, habia=0;
          for(let p=0,i=0;p<N;p++,i+=4){ if(!ink[p]) continue; habia++;
            const r=d[i],g=d[i+1],b=d[i+2];
            const sat=Math.max(r,g,b)-Math.min(r,g,b);
            if(sat<20) continue;                     // neutro = impreso: fuera
            const h=tono(r,g,b);
            if(h<0 || dist(h)>52) continue;          // otro color: fuera
            filtrada[p]=1; quedan++;
          }
          // red de seguridad: si se lleva casi todo, lo neutro ERA la firma
          anotaDiag('filtroColor', !!(habia && quedan/habia>0.35));
          if(habia && quedan/habia>0.35){ ink.set(filtrada); }
        }
      }
    }
    /* Quita la CUADRICULA del cuaderno por GROSOR, no por tono: las rayas
       son de 1-2 px y no sobreviven a una erosion; el boligrafo si. Luego se
       reconstruye el trazo dilatando el nucleo dentro de la propia tinta, asi
       la firma conserva su ancho real y solo queda un muñon donde cruzaba.   */
    if(!(document.getElementById('sigGrid')&&!document.getElementById('sigGrid').checked)){
      const core=new Uint8Array(N);
      for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const p=y*w+x;
        if(ink[p]&&ink[p-1]&&ink[p+1]&&ink[p-w]&&ink[p+w]) core[p]=1; }
      let nc=0,ni=0; for(let p=0;p<N;p++){ if(core[p])nc++; if(ink[p])ni++; }
      const grueso = ni? nc/ni : 0;
      anotaDiag('grosorTrazo', Math.round(grueso*100)+'% del trazo sobrevive a la erosion');
      /* Este filtro quita lo FINO. Solo tiene sentido si hay trazo grueso que
         conservar: entonces lo fino que queda son las rayas del cuaderno. Si
         la tinta es fina en su mayoria (boligrafo de punta fina, foto de
         lejos), no puede distinguir la firma de una raya y la parte a trozos
         — que es lo que le pasaba al usuario con una firma roja de trazo
         fino. La guarda estaba en un 5%, tan baja que se aplicaba siempre. */
      if(grueso>0.35){
        let cur=core;
        for(let it=0; it<3; it++){
          const nxt=new Uint8Array(cur);
          for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const p=y*w+x;
            if(!ink[p]||cur[p]) continue;
            if(cur[p-1]||cur[p+1]||cur[p-w]||cur[p+w]||cur[p-w-1]||cur[p-w+1]||cur[p+w-1]||cur[p+w+1]) nxt[p]=1; }
          cur=nxt;
        }
        for(let p=0;p<N;p++) if(!cur[p]) ink[p]=0;
      }
    }
    /* NOTA — CUADRICULA POR PERIODICIDAD: probado y REVERTIDO.
       Para el caso limite (firma del mismo tono e intensidad que las rayas)
       lo unico que las distingue es que la rejilla es periodica y la firma no.
       Se implemento: proyeccion de la tinta por filas y columnas,
       autocorrelacion para hallar el periodo, y borrado de las lineas que caen
       en esa rejilla.
       MEDIDO en el banco de 68 pruebas: la media se hunde de 85/86 a 31/23.
       Borrar la linea entera corta la firma en cada cruce. Se intento
       conservar los cruces (no borrar donde hay tinta a ambos lados de la
       raya) y el resultado no mejoro: un trazo casi paralelo a la raya no
       cumple esa condicion y se pierde igual.
       La idea sigue siendo la correcta para ese caso limite, pero necesita
       trabajar sobre la ESTRUCTURA (seguir el trazo y decidir por continuidad
       y curvatura), no sobre filas y columnas sueltas.                      */
    const vis=new Uint8Array(N), st=new Int32Array(N), comps=[];
    for(let p0=0;p0<N;p0++){
      if(vis[p0]||!ink[p0]) continue;
      let sp=0; st[sp++]=p0; vis[p0]=1; const px=[]; let x0=w,y0=h,x1=0,y1=0;
      while(sp){ const q=st[--sp]; px.push(q); const x=q%w,y=(q/w)|0;
        if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue;
          const nx=x+dx,ny=y+dy; if(nx<0||ny<0||nx>=w||ny>=h)continue; const nq=ny*w+nx;
          if(!vis[nq]&&ink[nq]){ vis[nq]=1; st[sp++]=nq; } } }
      const bw=x1-x0+1, bh=y1-y0+1;
      if(px.length<Math.max(20,N*0.00015)) continue;                 // ruido
      if(bw>w*0.9 && bh<h*0.05) continue;                            // renglon horizontal
      if(bh>h*0.9 && bw<w*0.05) continue;                            // linea vertical
      comps.push({px,n:px.length,x0,y0,x1,y1,diag:Math.hypot(bw,bh)});
    }
    anotaDiag('compsAntes', comps.length);
    if(!comps.length) throw new Error('No detecte trazo en el recorte');
    // conserva el trazo principal y lo que lo rodea de cerca (la firma suele ser 1-3 componentes)
    comps.sort((a,b)=>b.diag-a.diag);
    /* Que trozos son de la firma: los que caen cerca del componente MAYOR.
       NOTA — probe a hacer crecer la caja (cierre transitivo: cada vuelta
       admite lo que este cerca de lo ya admitido, hasta que no entre nada).
       La idea era reconstruir una firma partida en cadena, porque en el caso
       limite se pierde el 69% del trazo.
       MEDIDO: media 80/81 -> 79/80. Empeora justo el caso que queria arreglar
       (cuadricula 31/27 -> 24/15) y ademas 'verde + sello' 73/95 -> 70/86.
       Al crecer la caja crece el radio, y el radio mayor alcanza el fondo:
       una vez entra el primer trozo de sombra, la cadena no para.
       Si se vuelve a intentar, el paso tiene que ser de radio FIJO (medido
       contra el componente mayor, no contra la caja) y exigir ademas que el
       trozo sea de la misma clase de tinta, como ya se hace al absorber
       manchas en inkClusters.                                               */
    const m=comps[0], mx0=m.x0-m.diag*0.25, mx1=m.x1+m.diag*0.25, my0=m.y0-m.diag*0.25, my1=m.y1+m.diag*0.25;
    const keepC=comps.filter(o=>o===m || (o.x1>=mx0&&o.x0<=mx1&&o.y1>=my0&&o.y0<=my1&&o.diag>m.diag*0.05));
    const keep=new Uint8Array(N); for(const o of keepC) for(const q of o.px) keep[q]=1;
    /* COLOR REAL DE LA TINTA.
       La tinta fotografiada sobre papel de color sale MEZCLADA con el papel:
       un boligrafo verde sobre hoja amarilla no da verde, da un verde sucio
       tirando a marron. Un trazo fino es ademas medio transparente, asi que
       el pixel observado es  obs = a*tinta + (1-a)*papel.
       Aqui se despeja la tinta:  tinta = (obs - (1-a)*papel) / a.
       Es la inversa de la composicion alfa, y devuelve el color que tendria
       ese boligrafo sobre papel blanco.                                      */
    let prS=0,pgS=0,pbS=0,pnS=0;
    for(let p=0,i=0;p<N;p++,i+=4) if(lum[p]>papel-12){ prS+=d[i]; pgS+=d[i+1]; pbS+=d[i+2]; pnS++; }
    pnS=pnS||1; const paR=prS/pnS, paG=pgS/pnS, paB=pbS/pnS;
    const desmezcla=(obs,pap,a)=>{
      const v=(obs-(1-a)*pap)/Math.max(0.12,a);
      return v<0?0:(v>255?255:v);
    };
    let minX=w,minY=h,maxX=0,maxY=0,has=false; const out=cx.createImageData(w,h);
    for(let p=0,i=0;p<N;p++,i+=4){ if(!keep[p]) continue;
      const satP=Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2]);
      const a=Math.min(1,Math.max((cut-lum[p])/(cut*0.45), (satP-bgSat)/60)+0.55);  // trazo nitido (tambien a color)
      // fuerza de cobertura para despejar: cuanto mas oscuro respecto al papel, mas tinta pura
      const cob=Math.min(1, Math.max(0.18, (papel-lum[p])/Math.max(1,papel*0.62)));
      let R=desmezcla(d[i],  paR, cob),
          G=desmezcla(d[i+1],paG, cob),
          B=desmezcla(d[i+2],paB, cob);
      // sin esto los trazos claros quedan lavados; oscurece SIN tocar el tono
      const dk=Math.max(0,1-lum[p]/Math.max(1,cut))*0.32;
      out.data[i]=Math.round(R*(1-dk));
      out.data[i+1]=Math.round(G*(1-dk));
      out.data[i+2]=Math.round(B*(1-dk));
      out.data[i+3]=Math.round(Math.max(0.45,a)*255);
      has=true; const x=p%w,y=(p/w)|0; if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y; }
    if(!has) throw new Error('Recorte vacio');
    cx.putImageData(out,0,0);
    const bw=maxX-minX+1, bh=maxY-minY+1, t=document.createElement('canvas'); t.width=bw; t.height=bh;
    t.getContext('2d').drawImage(c,minX,minY,bw,bh,0,0,bw,bh);
    return {canvas:t,w:bw,h:bh,url:t.toDataURL('image/png')};
  }
  function cloneCanvas(src){ const c=document.createElement('canvas'); c.width=src.width; c.height=src.height; c.getContext('2d').drawImage(src,0,0); return c; }
  function punchGaps(canvas, amt){ const cx=canvas.getContext('2d'); cx.save(); cx.globalCompositeOperation='destination-out';
    const n=Math.round(amt*canvas.width/12);
    for(let i=0;i<n;i++){ const r=canvas.width*(0.006+0.01*Math.random());
      cx.beginPath(); cx.ellipse(Math.random()*canvas.width, Math.random()*canvas.height, r, r*0.7, Math.random()*3, 0, 7); cx.fill(); }
    cx.restore();
  }
  function tintCanvas(src,color){ const c=document.createElement('canvas'); c.width=src.width; c.height=src.height;
    const cx=c.getContext('2d'); cx.drawImage(src,0,0); cx.globalCompositeOperation='source-in';
    cx.fillStyle=color; cx.fillRect(0,0,c.width,c.height); return c; }
  let sigProc=null;
  /* Desgaste de tinta realista.
     Un boligrafo que se seca NO pierde tinta en manchas redondas al azar: se
     va primero por los BORDES del trazo y deja rayas finas siguiendo el
     recorrido. Por eso el desgaste se pondera con la distancia al borde
     (cuantos vecinos de tinta tiene el pixel) y se le suma un ruido suave de
     baja frecuencia, que ademas sirve de "presion" de la mano.               */
  let sigSeed=12345;
  function ruidoSuave(w,h,celda,rnd){
    // ruido de valor interpolado: manchas grandes y blandas, sin grano de TV
    const gw=Math.max(2,Math.ceil(w/celda)+1), gh=Math.max(2,Math.ceil(h/celda)+1);
    const g=new Float32Array(gw*gh);
    for(let i=0;i<g.length;i++) g[i]=rnd();
    const suave=t=>t*t*(3-2*t);
    return (x,y)=>{
      const fx=x/celda, fy=y/celda;
      const x0=Math.min(gw-2,Math.floor(fx)), y0=Math.min(gh-2,Math.floor(fy));
      const tx=suave(fx-x0), ty=suave(fy-y0);
      const a=g[y0*gw+x0], b2=g[y0*gw+x0+1], c=g[(y0+1)*gw+x0], d2=g[(y0+1)*gw+x0+1];
      return (a+(b2-a)*tx)*(1-ty) + (c+(d2-c)*tx)*ty;
    };
  }
  function aplicarDesgaste(canvas, wear, press, seed){
    if(wear<=0 && press<=0) return canvas;
    const w=canvas.width, h=canvas.height, cx=canvas.getContext('2d',{willReadFrequently:true});
    const im=cx.getImageData(0,0,w,h), d=im.data, N=w*h;
    const rnd=(typeof RENDER!=='undefined'&&RENDER.makeRng)? RENDER.makeRng(seed) : (()=>{ let t=seed>>>0;
      return ()=>{ t=(t+0x6D2B79F5)|0; let r=Math.imul(t^(t>>>15),1|t); r=(r+Math.imul(r^(r>>>7),61|r))^r;
        return ((r^(r>>>14))>>>0)/4294967296; }; })();
    // 1) que tan "interior" es cada pixel: 0 = borde del trazo, 1 = centro
    const dentro=new Float32Array(N);
    for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const p=y*w+x;
      if(d[p*4+3]<20) continue;
      let n=0;
      if(d[(p-1)*4+3]>20)n++; if(d[(p+1)*4+3]>20)n++;
      if(d[(p-w)*4+3]>20)n++; if(d[(p+w)*4+3]>20)n++;
      if(d[(p-w-1)*4+3]>20)n++; if(d[(p-w+1)*4+3]>20)n++;
      if(d[(p+w-1)*4+3]>20)n++; if(d[(p+w+1)*4+3]>20)n++;
      dentro[p]=n/8;
    }
    const lado=Math.max(w,h);
    const manchas=ruidoSuave(w,h,Math.max(6,lado*0.16),rnd);   // presion de la mano
    const rayas  =ruidoSuave(w,h,Math.max(3,lado*0.035),rnd);  // barrido seco, mas fino
    const kw=wear/100, kp=press/100;
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){
      const p=y*w+x, i=p*4; const a0=d[i+3]; if(!a0) continue;
      const borde=1-dentro[p];                       // 1 en el filo del trazo
      let f=1;
      // presion: zonas enteras mas flojas, sin llegar a desaparecer
      if(kp>0) f *= 1 - kp*0.55*(1-manchas(x,y));
      // desgaste: se come el filo y abre rayas donde el ruido fino baja
      if(kw>0){
        const seco=Math.max(0, 0.68-rayas(x,y))/0.68;            // franjas secas anchas
        f *= 1 - kw*(0.85*borde*(0.30+0.70*seco) + 0.80*seco*seco);
        // el filo se rompe del todo: es lo que hace que se lea como boligrafo seco
        if(borde>0.45 && rnd() < kw*0.60*(0.25+seco)) f=0;
      }
      d[i+3]=Math.max(0, Math.min(255, Math.round(a0*f)));
    }
    cx.putImageData(im,0,0);
    return canvas;
  }
  /* Grosor: engorda o adelgaza el trazo. Engordar = pintar la imagen varias
     veces desplazada un pixel (dilatacion barata sobre alpha). Adelgazar =
     borrar el filo, o sea los pixeles con pocos vecinos de tinta.            */
  function aplicarGrosor(canvas, grosor){
    const k=(grosor-50)/50;                         // -1 .. 1
    if(Math.abs(k)<0.06) return canvas;
    const w=canvas.width, h=canvas.height, cx=canvas.getContext('2d',{willReadFrequently:true});
    if(k>0){
      const paso=Math.max(1, Math.round(k*2.4));
      const prev=cloneCanvas(canvas);
      for(let dy=-paso;dy<=paso;dy++) for(let dx=-paso;dx<=paso;dx++){
        if(!dx&&!dy) continue;
        if(dx*dx+dy*dy > paso*paso+0.5) continue;   // circulo, no cuadrado
        cx.drawImage(prev,dx,dy);
      }
      return canvas;
    }
    const im=cx.getImageData(0,0,w,h), d=im.data, N=w*h;
    const a0=new Uint8Array(N); for(let p=0;p<N;p++) a0[p]=d[p*4+3];
    const veces=Math.max(1, Math.round(-k*2.2));
    let cur=a0;
    for(let it=0; it<veces; it++){
      const nx=new Uint8Array(cur);
      for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const p=y*w+x;
        if(!cur[p]) continue;
        if(cur[p-1]<25||cur[p+1]<25||cur[p-w]<25||cur[p+w]<25) nx[p]=0; }
      cur=nx;
    }
    for(let p=0;p<N;p++) d[p*4+3]=cur[p];
    cx.putImageData(im,0,0);
    return canvas;
  }
  /* Intensidad: 50 = tal cual la foto. Por encima la tinta se vuelve mas
     opaca Y mas oscura (no basta subir alpha: un gris claro al 100% sigue
     leyendose flojo). Por debajo se aclara, como boligrafo que apenas marca. */
  function aplicarIntensidad(canvas, fuerza){
    const k=(fuerza-50)/50;                         // -1 .. 1
    if(Math.abs(k)<0.04) return canvas;
    const cx=canvas.getContext('2d',{willReadFrequently:true});
    const im=cx.getImageData(0,0,canvas.width,canvas.height), d=im.data;
    const gamma = k>0 ? 1/(1+1.1*k) : 1+1.4*(-k);   // curva sobre el alpha
    for(let i=0;i<d.length;i+=4){
      const a=d[i+3]; if(!a) continue;
      d[i+3]=Math.max(0,Math.min(255, Math.round(255*Math.pow(a/255, gamma))));
      if(k>0){ const f=1-0.42*k;                    // acerca el color al negro
        d[i]=Math.round(d[i]*f); d[i+1]=Math.round(d[i+1]*f); d[i+2]=Math.round(d[i+2]*f); }
      else { const f=-k*0.35;                       // lo aclara hacia el papel
        d[i]=Math.round(d[i]+(255-d[i])*f); d[i+1]=Math.round(d[i+1]+(255-d[i+1])*f);
        d[i+2]=Math.round(d[i+2]+(255-d[i+2])*f); }
    }
    cx.putImageData(im,0,0);
    return canvas;
  }
  /* ── LIMPIEZA MANUAL DE LA FIRMA ─────────────────────────────────────────
     La deteccion automatica falla en fotos que no puedo medir, asi que estos
     controles dan mando directo. Se aplican SOBRE el recorte ya hecho, en
     vivo y sin destruirlo: mover un mando rehace el filtro desde la firma
     original, nunca encadena perdidas.                                      */
  let sigPick=null;                 // color de tinta elegido con el cuentagotas
  /* ── DIAGNOSTICO DE LA FIRMA ─────────────────────────────────────────────
     Cuando un recorte sale mal no sirve de nada adivinar: hace falta saber
     que decidio cada paso. Esto reune las cifras reales del ultimo recorte
     para poder pegarlas en una consulta, sin tener que mandar la foto.     */
  let sigDiag={};
  function anotaDiag(k,v){ try{ sigDiag[k]=v; }catch(e){} }
  function informeFirma(){
    const d=sigDiag, L=[];
    L.push('DIAGNOSTICO DE FIRMA — Manuscrito');
    L.push('foto: '+(d.foto||'?')+'   modo: '+(d.modo||'?')+'   IA: '+(d.ia||'?'));
    if(d.clusters!=null) L.push('manchas de tinta encontradas: '+d.clusters+(d.cluster0?('   principal '+d.cluster0):''));
    if(d.cajasIA!=null) L.push('cajas de la IA: '+d.cajasIA+'   validas: '+(d.cajasOK!=null?d.cajasOK:'?'));
    if(d.origen) L.push('origen del recorte: '+d.origen);
    if(d.papel!=null) L.push('papel(lum): '+d.papel+'   umbral tinta: '+d.cut+'   contraste: '+(d.papel-d.cut));
    if(d.picoTono!=null) L.push('pico de tono: '+d.picoTono+'   (>0,65 = tinta de color -> se descarta lo neutro)');
    if(d.filtroColor!=null) L.push('filtro por color aplicado: '+(d.filtroColor?'SI':'no'));
    if(d.compsAntes!=null) L.push('componentes: '+d.compsAntes+' -> '+d.compsDespues+' tras filtrar');
    if(d.tam) L.push('recorte final: '+d.tam+'   transparente: '+d.transp+'%');
    if(d.tinta) L.push('tinta: '+d.tinta+' px   con color: '+d.color+'   neutra: '+d.neutro);
    if(d.error) L.push('ERROR: '+d.error);
    // cualquier dato suelto que no tenga linea propia, para no perderlo
    for(const k of Object.keys(d))
      if(!/^(foto|modo|ia|clusters|cluster0|cajasIA|cajasOK|origen|papel|cut|picoTono|filtroColor|compsAntes|compsDespues|tam|transp|tinta|color|neutro|error)$/.test(k))
        L.push(k+': '+d[k]);
    L.push('ajustes: recorte='+val('sigThresh')+' quitaNegros='+val('sigQuitaNeutro')+
           ' tolerancia='+val('sigTolerancia')+' halos='+val('sigMinAlpha')+
           ' soloColor='+(document.getElementById('sigColorSolo')||{}).checked+
           ' cuadricula='+(document.getElementById('sigGrid')||{}).checked);
    return L.join('\n');
  }
  function limpiaFirma(canvas){
    const quitarNeutro=(()=>{ const v=+(val('sigQuitaNeutro')); return isNaN(v)?0:clamp(v,0,100); })();
    const tol=(()=>{ const v=+(val('sigTolerancia')); return isNaN(v)?45:clamp(v,10,120); })();
    const minAlpha=(()=>{ const v=+(val('sigMinAlpha')); return isNaN(v)?0:clamp(v,0,90); })();
    const usaPick=sigPick && document.getElementById('sigSoloPick') && document.getElementById('sigSoloPick').checked;
    if(!quitarNeutro && !usaPick && !minAlpha) return canvas;
    const cx=canvas.getContext('2d',{willReadFrequently:true});
    const im=cx.getImageData(0,0,canvas.width,canvas.height), d=im.data;
    const umbralSat=quitarNeutro*0.55;      // 0..55 de saturacion minima
    for(let i=0;i<d.length;i+=4){
      const a=d[i+3]; if(!a) continue;
      const r=d[i],g=d[i+1],b=d[i+2];
      // 1) fuera lo poco opaco (halos y restos de papel)
      if(minAlpha && a < minAlpha*2.55){ d[i+3]=0; continue; }
      // 2) fuera lo NEUTRO: el texto impreso y las rayas son grises o negros;
      //    un boligrafo de color no lo es
      if(quitarNeutro){
        const sat=Math.max(r,g,b)-Math.min(r,g,b);
        if(sat<umbralSat){ d[i+3]=0; continue; }
      }
      // 3) solo el color senalado con el cuentagotas
      if(usaPick){
        const dr=r-sigPick.r, dg=g-sigPick.g, db=b-sigPick.b;
        if(Math.sqrt(dr*dr+dg*dg+db*db)>tol){ d[i+3]=0; continue; }
      }
    }
    cx.putImageData(im,0,0);
    return canvas;
  }
  function rebuildTint(){
    if(!sigData){ sigTintURL=''; sigProc=null; return; }
    let base = (val('sigTint')==='one') ? tintCanvas(sigData.canvas, val('sigColor')) : cloneCanvas(sigData.canvas);
    limpiaFirma(base);                                   // antes de teñir o gastar
    const amt=+(val('optInk')||0)/100; if(amt>0) punchGaps(base, amt);
    aplicarGrosor(base, +(val('sigThick')!==''?val('sigThick'):50));
    aplicarDesgaste(base, +(val('sigWear')||0), +(val('sigPress')||0), sigSeed);
    aplicarIntensidad(base, +(val('sigInk')!==''?val('sigInk'):50));
    sigProc=base; sigTintURL=base.toDataURL('image/png');
  }
  function initSigPlace(pos){
    if(!sigData) return; const P=paperDims({paper:val('optPaper')});
    const wf=(+val('sigSize')/100)*0.5, hf=(wf*P.w*(sigData.h/sigData.w))/P.h, mg=0.07;
    let xf,yf;
    if(pos==='bl'){xf=mg;yf=1-mg-hf;} else if(pos==='bc'){xf=(1-wf)/2;yf=1-mg-hf;}
    else if(pos==='tr'){xf=1-mg-wf;yf=mg;} else {xf=1-mg-wf;yf=1-mg-hf;}
    sigPlace={xf,yf,wf,rot:0};
  }
  function updateSigImgs(){ document.querySelectorAll('.sig-overlay img').forEach(im=>im.src=sigTintURL); }
  function repositionAll(){ lastPages.forEach(p=>{ if(p._sigov) posSig(p._sigov,p.canvas); }); }
  function posSig(ov,canvas){
    if(!sigData) return;
    const cw=canvas.clientWidth||canvas.width, chh=canvas.clientHeight||canvas.height;
    const w=sigPlace.wf*cw, h=w*(sigData.h/sigData.w);
    ov.style.left=(sigPlace.xf*cw)+'px'; ov.style.top=(sigPlace.yf*chh)+'px';
    ov.style.width=w+'px'; ov.style.height=h+'px'; ov.style.transform='rotate('+sigPlace.rot+'deg)';
  }
  function makeSigOverlay(canvas){
    const ov=document.createElement('div'); ov.className='sig-overlay';
    const img=document.createElement('img'); img.src=sigTintURL; img.draggable=false; ov.appendChild(img);
    const hbr=document.createElement('div'); hbr.className='sig-h sig-h-br'; hbr.title='Redimensionar'; ov.appendChild(hbr);
    const hrot=document.createElement('div'); hrot.className='sig-h sig-h-rot'; hrot.title='Rotar'; ov.appendChild(hrot);
    const hdel=document.createElement('div'); hdel.className='sig-h sig-h-del'; hdel.textContent='×'; hdel.title='Quitar firma';
    hdel.addEventListener('pointerdown',e=>e.stopPropagation());
    hdel.addEventListener('click',e=>{ e.stopPropagation(); document.getElementById('sigClear').click(); });
    ov.appendChild(hdel);
    const sw=()=>canvas.clientWidth||canvas.width, sh=()=>canvas.clientHeight||canvas.height;
    const drag=(el,onMove)=>{ el.addEventListener('pointerdown',e=>{ e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId);
      const s={x:e.clientX,y:e.clientY, p:{...sigPlace}};
      const mv=ev=>{ onMove(ev,s); repositionAll(); };
      const up=()=>{ el.removeEventListener('pointermove',mv); el.removeEventListener('pointerup',up); };
      el.addEventListener('pointermove',mv); el.addEventListener('pointerup',up); }); };
    drag(ov,(ev,s)=>{ if(sigPlace.wf<0) return;
      sigPlace.xf=clamp(s.p.xf+(ev.clientX-s.x)/sw(), -0.1, 0.98);
      sigPlace.yf=clamp(s.p.yf+(ev.clientY-s.y)/sh(), -0.05, 0.99); });
    drag(hbr,(ev,s)=>{ sigPlace.wf=clamp(s.p.wf+(ev.clientX-s.x)/sw(), 0.05, 0.95);
      const sl=document.getElementById('sigSize'); if(sl) sl.value=Math.round(sigPlace.wf/0.5*100); });
    drag(hrot,(ev)=>{ const r=ov.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
      sigPlace.rot=Math.atan2(ev.clientY-cy,ev.clientX-cx)*180/Math.PI+90; });
    return ov;
  }
  function layoutSignatureOverlays(){
    document.querySelectorAll('.sig-overlay').forEach(o=>o.remove());
    lastPages.forEach(p=>p._sigov=null);
    if(!sigData || !lastPages.length) return;
    if(!sigTintURL) rebuildTint();
    const targets = val('sigWhere')==='all' ? lastPages : [lastPages[lastPages.length-1]];
    targets.forEach(p=>{ const ov=makeSigOverlay(p.canvas); p.wrap.appendChild(ov); p._sigov=ov; posSig(ov,p.canvas); });
  }
  function bakeSigOn(ctx,canvas){ if(!sigData) return; if(!sigProc) rebuildTint();
    const w=sigPlace.wf*canvas.width, h=w*(sigData.h/sigData.w), x=sigPlace.xf*canvas.width, y=sigPlace.yf*canvas.height;
    ctx.save(); ctx.globalAlpha=0.95; ctx.translate(x+w/2,y+h/2); ctx.rotate(sigPlace.rot*Math.PI/180);
    ctx.drawImage(sigProc,-w/2,-h/2,w,h); ctx.restore();
  }

  /* ---------- Insertar: objetos editables (tabla, cuadro, formas) tipo Word ---------- */
  let objects=[], objSeq=0;
  let reflowT=null;
  function reflowSoon(){ clearTimeout(reflowT); reflowT=setTimeout(()=>{
    const lv=document.getElementById('optLive');
    if(lv&&lv.checked && document.getElementById('genText').value.trim()) run();
  }, 700); }
  function saveObjects(){ try{ localStorage.setItem('manuscrito_objs', JSON.stringify(objects)); }catch(e){} }
  function loadObjects(){ try{ const a=JSON.parse(localStorage.getItem('manuscrito_objs')||'[]');
    if(Array.isArray(a)){ objects=a; objSeq=objects.reduce((m,o)=>Math.max(m,o.id||0),0); } }catch(e){} }
  function curHandFont(){ const v=val('optFont')||''; return v.startsWith('font:')?v.slice(5):'Homemade Apple'; }
  function addObject(type){
    const fam=curHandFont(); FONTS.ensure(fam);
    const o={id:++objSeq, type, xf:0.26, yf:0.30, rot:0, fam};
    if(type==='table'){ o.rows=3; o.cols=3; o.wf=0.42; o.hf=0.16; o.cells=Array(9).fill(''); }
    else if(type==='box'){ o.wf=0.38; o.hf=0.12; o.text=''; }
    else if(type==='line'||type==='arrow'){ o.wf=0.30; o.hf=0.05; }
    else { o.wf=0.24; o.hf=0.16; }
    objects.push(o); saveObjects(); layoutObjects();
    APP.toast('Insertado — arrástralo por la barra ⠿');
  }
  function delObject(id){ objects=objects.filter(o=>o.id!==id); saveObjects(); layoutObjects(); reflowSoon(); }
  function delRow(o){ if(o.rows<=1) return; o.cells.splice((o.rows-1)*o.cols, o.cols); o.rows--; }
  function delCol(o){ if(o.cols<=1) return; const nc=o.cols-1, out=[];
    for(let r=0;r<o.rows;r++) for(let c=0;c<nc;c++) out.push(o.cells[r*o.cols+c]||'');
    o.cols=nc; o.cells=out; }
  function insertCol(o){ const nc=o.cols+1, nCells=[]; for(let r=0;r<o.rows;r++){ for(let c=0;c<o.cols;c++) nCells.push(o.cells[r*o.cols+c]||''); nCells.push(''); } o.cols=nc; o.cells=nCells; }
  function posObj(ov,canvas,o){ const cw=canvas.clientWidth||canvas.width, chh=canvas.clientHeight||canvas.height;
    ov.style.left=(o.xf*cw)+'px'; ov.style.top=(o.yf*chh)+'px'; ov.style.width=(o.wf*cw)+'px'; ov.style.height=(o.hf*chh)+'px'; ov.style.transform='rotate('+o.rot+'deg)'; }
  function objStyle(){ const instr=INSTRUMENTS[val('optInstrument')]||INSTRUMENTS['boli-azul'];
    const rough=+(val('optObjRough')||55)/100;
    return { color:val('optColor')||'#1a2a6c', lw:Math.max(1.6,instr.brush*0.7), jit:9*rough, rough }; }
  function layoutObjects(){
    document.querySelectorAll('.obj-overlay').forEach(e=>e.remove());
    if(!objects.length || !lastPages.length) return;
    const st=objStyle();
    objects.forEach(o=>{ const pi=Math.min(o.page||0, lastPages.length-1); const pg=lastPages[pi];
      const ov=buildObj(o,pg.canvas,st); pg.wrap.appendChild(ov); posObj(ov,pg.canvas,o); });
  }
  function dragObj(el,o,canvas,mode){
    el.addEventListener('pointerdown',e=>{ e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId);
      const sw=canvas.clientWidth||canvas.width, sh=canvas.clientHeight||canvas.height, s={x:e.clientX,y:e.clientY,o:{xf:o.xf,yf:o.yf,wf:o.wf,hf:o.hf}};
      const ov=el.closest('.obj-overlay');
      const mv=ev=>{ if(mode==='move'){ o.xf=clamp(s.o.xf+(ev.clientX-s.x)/sw,-0.05,0.98); o.yf=clamp(s.o.yf+(ev.clientY-s.y)/sh,-0.02,0.98); }
        else if(mode==='rotate'){ const r=ov.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
          o.rot=Math.atan2(ev.clientY-cy,ev.clientX-cx)*180/Math.PI+90; }
        else { o.wf=clamp(s.o.wf+(ev.clientX-s.x)/sw,0.05,0.98); o.hf=clamp(s.o.hf+(ev.clientY-s.y)/sh,0.02,0.98); }
        posObj(ov,canvas,o); };
      const up=()=>{ el.removeEventListener('pointermove',mv); el.removeEventListener('pointerup',up); saveObjects(); reflowSoon(); };
      el.addEventListener('pointermove',mv); el.addEventListener('pointerup',up); });
  }
  function roughD(pts,jit){ let d='M'+pts[0][0].toFixed(1)+' '+pts[0][1].toFixed(1);
    for(let i=1;i<pts.length;i++){ const midx=(pts[i-1][0]+pts[i][0])/2+(Math.random()-0.5)*jit, midy=(pts[i-1][1]+pts[i][1])/2+(Math.random()-0.5)*jit;
      d+=' Q'+midx.toFixed(1)+' '+midy.toFixed(1)+' '+(pts[i][0]+(Math.random()-0.5)*jit).toFixed(1)+' '+(pts[i][1]+(Math.random()-0.5)*jit).toFixed(1); }
    return d; }
  function svgShape(o,st){ const NS='http://www.w3.org/2000/svg'; const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('class','obj-svg'); svg.setAttribute('viewBox','0 0 200 100'); svg.setAttribute('preserveAspectRatio','none');
    const path=d=>{ const e=document.createElementNS(NS,'path'); e.setAttribute('d',d); e.setAttribute('fill','none');
      e.setAttribute('stroke',st.color); e.setAttribute('stroke-width',st.lw); e.setAttribute('stroke-linecap','round'); e.setAttribute('stroke-linejoin','round'); e.setAttribute('vector-effect','non-scaling-stroke'); svg.appendChild(e); };
    const j=st.jit+2;
    if(o.type==='rect'){ path(roughD([[6,6],[194,6],[194,94],[6,94],[6,6]],j)); }
    else if(o.type==='ellipse'){ const pts=[]; for(let a=0;a<=24;a++){const t=a/24*Math.PI*2; pts.push([100+Math.cos(t)*93,50+Math.sin(t)*45]);} path(roughD(pts,j*0.6)); }
    else if(o.type==='line'){ path(roughD([[6,50],[100,50],[194,50]],j)); }
    else if(o.type==='arrow'){ path(roughD([[6,50],[100,50],[178,50]],j)); path(roughD([[150,32],[186,50],[150,68]],j*0.5)); }
    return svg;
  }
  function handTableSvg(o,st){ const NS='http://www.w3.org/2000/svg'; const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('class','obj-svg obj-svg-bg'); svg.setAttribute('viewBox','0 0 200 200'); svg.setAttribute('preserveAspectRatio','none');
    const j=st.jit+2.2;
    const add=d=>{ const e=document.createElementNS(NS,'path'); e.setAttribute('d',d); e.setAttribute('fill','none');
      e.setAttribute('stroke',st.color); e.setAttribute('stroke-width',st.lw); e.setAttribute('stroke-linecap','round');
      e.setAttribute('stroke-opacity','.9'); e.setAttribute('vector-effect','non-scaling-stroke'); svg.appendChild(e); };
    for(let r=0;r<=o.rows;r++){ const y=r/o.rows*200; add(roughD([[0,y],[100,y],[200,y]],j)); }
    for(let c=0;c<=o.cols;c++){ const x=c/o.cols*200; add(roughD([[x,0],[x,100],[x,200]],j)); }
    return svg; }
  function handBoxSvg(o,st){ const NS='http://www.w3.org/2000/svg'; const svg=document.createElementNS(NS,'svg');
    svg.setAttribute('class','obj-svg obj-svg-bg'); svg.setAttribute('viewBox','0 0 200 200'); svg.setAttribute('preserveAspectRatio','none');
    const e=document.createElementNS(NS,'path'); e.setAttribute('d',roughD([[3,3],[197,3],[197,197],[3,197],[3,3]],st.jit+2.2));
    e.setAttribute('fill','none'); e.setAttribute('stroke',st.color); e.setAttribute('stroke-width',st.lw);
    e.setAttribute('stroke-linecap','round'); e.setAttribute('stroke-opacity','.9'); e.setAttribute('vector-effect','non-scaling-stroke');
    svg.appendChild(e); return svg; }
  function buildObj(o,canvas,st){
    const ov=document.createElement('div'); ov.className='obj-overlay obj-'+o.type;
    const bar=document.createElement('div'); bar.className='obj-move'; bar.textContent='⠿ mover'; ov.appendChild(bar);
    if(o.type==='table'){
      ov.appendChild(handTableSvg(o,st));       // bordes dibujados a mano (detrás)
      const t=document.createElement('table'); t.className='obj-table';
      for(let r=0;r<o.rows;r++){ const tr=document.createElement('tr');
        for(let c=0;c<o.cols;c++){ const td=document.createElement('td'); td.contentEditable=true;
          td.style.fontFamily=`"${o.fam}", cursive`; td.style.color=st.color; td.style.border='none';
          const idx=r*o.cols+c; td.textContent=o.cells[idx]||''; td.addEventListener('input',()=>{o.cells[idx]=td.textContent;saveObjects();}); tr.appendChild(td); }
        t.appendChild(tr); }
      ov.appendChild(t);
      const ab=document.createElement('div'); ab.className='obj-tbtns';
      const bf=document.createElement('button'); bf.textContent='+fila'; bf.onclick=e=>{e.stopPropagation();
        o.rows++; while(o.cells.length<o.rows*o.cols) o.cells.push('');
        o.hf=Math.min(0.92, Math.max(o.hf, 0.042*o.rows));      // que quepan: la caja crece con las filas
        saveObjects();layoutObjects();};
      const bf10=document.createElement('button'); bf10.textContent='+10'; bf10.title='Añadir diez filas de golpe';
      bf10.onclick=e=>{e.stopPropagation(); o.rows+=10; while(o.cells.length<o.rows*o.cols) o.cells.push('');
        o.hf=Math.min(0.92, Math.max(o.hf, 0.042*o.rows)); saveObjects();layoutObjects();};
      const bc=document.createElement('button'); bc.textContent='+col'; bc.onclick=e=>{e.stopPropagation();
        insertCol(o); o.wf=Math.min(0.94, Math.max(o.wf, 0.13*o.cols)); saveObjects();layoutObjects();};
      const bmf=document.createElement('button'); bmf.textContent='−fila'; bmf.title='Quitar última fila'; bmf.onclick=e=>{e.stopPropagation();delRow(o);saveObjects();layoutObjects();};
      const bmc=document.createElement('button'); bmc.textContent='−col'; bmc.title='Quitar última columna'; bmc.onclick=e=>{e.stopPropagation();delCol(o);saveObjects();layoutObjects();};
      ab.appendChild(bf); ab.appendChild(bf10); ab.appendChild(bmf); ab.appendChild(bc); ab.appendChild(bmc); ov.appendChild(ab);
    } else if(o.type==='box'){
      const d=document.createElement('div'); d.className='obj-box'; d.contentEditable=true;
      d.style.fontFamily=`"${o.fam}", cursive`; d.style.color=st.color; d.style.border='none';
      ov.appendChild(handBoxSvg(o,st));
      d.textContent=o.text||''; d.addEventListener('input',()=>{o.text=d.textContent;saveObjects();}); ov.appendChild(d);
    } else ov.appendChild(svgShape(o,st));
    const hbr=document.createElement('div'); hbr.className='obj-h obj-h-br'; hbr.title='Redimensionar'; ov.appendChild(hbr);
    const hrot=document.createElement('div'); hrot.className='obj-h obj-h-rot'; hrot.title='Rotar'; ov.appendChild(hrot);
    const hdel=document.createElement('div'); hdel.className='obj-h obj-h-del'; hdel.textContent='×'; hdel.title='Borrar'; ov.appendChild(hdel);
    hdel.addEventListener('pointerdown',e=>e.stopPropagation()); hdel.addEventListener('click',e=>{e.stopPropagation();delObject(o.id);});
    dragObj(bar,o,canvas,'move'); dragObj(hbr,o,canvas,'resize'); dragObj(hrot,o,canvas,'rotate');
    return ov;
  }
  /* ---- hornear objetos en el canvas (para PDF) ---- */
  function drawTextWrap(ctx,text,x,y,maxW,fam,fsz,color){ ctx.fillStyle=color||'#1a2a6c'; ctx.font=`${fsz}px "${fam}", cursive`; ctx.textBaseline='top';
    const words=(text||'').split(/\s+/); let line='',yy=y;
    for(const wd of words){ const t=line?line+' '+wd:wd; if(ctx.measureText(t).width>maxW&&line){ ctx.fillText(line,x,yy); line=wd; yy+=fsz*1.3; } else line=t; }
    if(line) ctx.fillText(line,x,yy); }
  function bakeObjectsOn(ctx,canvas){
    const W=canvas.width,H=canvas.height, st=objStyle();
    const ink=RENDER.rgbToHsl(RENDER.hexToRgb(st.color)), rng=RENDER.makeRng(4242);
    const lw=Math.max(2, W*0.0018);
    for(const o of objects){ const x=o.xf*W,y=o.yf*H,w=o.wf*W,h=o.hf*H;
      ctx.save(); ctx.translate(x+w/2,y+h/2); ctx.rotate(o.rot*Math.PI/180); ctx.translate(-w/2,-h/2);
      if(o.type==='table'){ const cw=w/o.cols,ch=h/o.rows;
        for(let r=0;r<=o.rows;r++) sketchLine(ctx,0,r*ch,w,r*ch,ink,rng,lw);
        for(let c=0;c<=o.cols;c++) sketchLine(ctx,c*cw,0,c*cw,h,ink,rng,lw);
        const fsz=Math.min(ch*0.5,26);
        for(let r=0;r<o.rows;r++)for(let c=0;c<o.cols;c++){ const txt=o.cells[r*o.cols+c]; if(!txt)continue;
          ctx.save(); ctx.beginPath(); ctx.rect(c*cw+3,r*ch,cw-6,ch); ctx.clip(); drawTextWrap(ctx,txt,c*cw+6,r*ch+5,cw-10,o.fam,fsz,st.color); ctx.restore(); }
      } else if(o.type==='box'){ sketchLine(ctx,0,0,w,0,ink,rng,lw); sketchLine(ctx,w,0,w,h,ink,rng,lw); sketchLine(ctx,w,h,0,h,ink,rng,lw); sketchLine(ctx,0,h,0,0,ink,rng,lw);
        ctx.save(); ctx.beginPath(); ctx.rect(0,0,w,h); ctx.clip(); drawTextWrap(ctx,o.text||'',12,10,w-20,o.fam,Math.min(h*0.18,26),st.color); ctx.restore();
      } else if(o.type==='rect'){ sketchLine(ctx,3,3,w-3,3,ink,rng,lw); sketchLine(ctx,w-3,3,w-3,h-3,ink,rng,lw); sketchLine(ctx,w-3,h-3,3,h-3,ink,rng,lw); sketchLine(ctx,3,h-3,3,3,ink,rng,lw); }
      else if(o.type==='ellipse'){ ctx.strokeStyle=`hsla(${ink.h},${ink.s}%,${ink.l}%,.9)`; ctx.lineWidth=lw; ctx.lineJoin='round'; ctx.beginPath();
        for(let a=0;a<=30;a++){const t=a/30*Math.PI*2, px=w/2+Math.cos(t)*(w/2-3)+(rng()-0.5)*3, py=h/2+Math.sin(t)*(h/2-3)+(rng()-0.5)*3; a?ctx.lineTo(px,py):ctx.moveTo(px,py);} ctx.stroke(); }
      else if(o.type==='line'){ sketchLine(ctx,3,h/2,w-3,h/2,ink,rng,lw); }
      else if(o.type==='arrow'){ sketchLine(ctx,3,h/2,w-16,h/2,ink,rng,lw); sketchLine(ctx,w-26,h/2-10,w-4,h/2,ink,rng,lw); sketchLine(ctx,w-4,h/2,w-26,h/2+10,ink,rng,lw); }
      ctx.restore(); }
  }

  function restoreSig(){
    let s=null; try{ s=localStorage.getItem('manuscrito_sig'); }catch(e){}
    if(!s) return;
    // si tenemos el recorte original, se vuelve a extraer con el algoritmo de HOY
    let raw=null; try{ raw=localStorage.getItem('manuscrito_sig_raw'); }catch(e){}
    if(raw){
      loadImg(raw).then(ri=>{
        sigRawImg=ri;
        try{
          sigData=extractTight(ri, +val('sigThresh')||50);
          const th=document.getElementById('sigThumb');
          if(th){ th.hidden=false; th.innerHTML=''; const i2=new Image(); i2.src=sigData.url; th.appendChild(i2); }
          ['sigClear','sigThreshRow','sigAllRow','sigGridRow'].forEach(id=>{
            const el=document.getElementById(id); if(el) el.hidden=false; });
          initSigPlace('br'); rebuildTint(); if(lastPages.length) layoutSignatureOverlays();
        }catch(e){ restoreSigProcesada(s); }
      }).catch(()=>restoreSigProcesada(s));
      return;
    }
    // sin el recorte original no se puede rehacer: la firma guardada es la de
    // ANTES, con sus fallos, y el usuario no tiene forma de saberlo
    restoreSigProcesada(s, true);
  }
  function restoreSigProcesada(s, vieja){
    const [url,w,h]=s.split('|'); const im=new Image();
    im.onload=()=>{ const c=document.createElement('canvas'); c.width=+w; c.height=+h; c.getContext('2d').drawImage(im,0,0);
      sigData={canvas:c,w:+w,h:+h,url}; const th=document.getElementById('sigThumb');
      if(th){ th.hidden=false; th.innerHTML=''; const i2=new Image(); i2.src=url; th.appendChild(i2); }
      const sc=document.getElementById('sigClear'); if(sc) sc.hidden=false;
      initSigPlace('br'); rebuildTint(); if(lastPages.length) layoutSignatureOverlays();
      if(vieja){
        const av=document.getElementById('sigVieja');
        if(av){ av.hidden=false;
          av.textContent='⚠ Esta firma se guardó con una versión anterior y no conservo la foto original, '+
                         'así que las mejoras del recorte no se le pueden aplicar. Vuelve a subir la foto.'; }
      } };
    im.src=url;
  }

  function mkBlot(ink,fs,opt){ return (ctx,x,y)=>{ ctx.save();
    ctx.fillStyle=`hsla(${ink.h},${ink.s}%,${Math.max(0,ink.l-8)}%,${0.45*(1-opt.transp)})`;
    const r=fs*(0.05+0.06*Math.random()); ctx.beginPath(); ctx.ellipse(x+fs*0.05,y-fs*0.18,r,r*0.8,0,0,7); ctx.fill(); ctx.restore(); }; }

  async function makeEngine(opt, fsOverride){
    // el dibujo es sincrono: rough.js tiene que estar antes de la primera hoja
    try{ if(!window.rough && typeof LIBS!=='undefined' && LIBS.rough) await LIBS.rough(); }catch(e){}
    const P=paperDims(opt), scale=P.w/820;
    const ink=RENDER.rgbToHsl(RENDER.hexToRgb(opt.color));
    const seed=(0x9e37 ^ (opt._seed||1234))>>>0;
    // rngs DEDICADOS por subsistema → agregar texto no desplaza la secuencia de lo ya escrito
    const rngFont=RENDER.makeRng((seed^0x1111)>>>0);   // fuente/escala por palabra (fase de medición)
    const rngWear=RENDER.makeRng((seed^0x2222)>>>0);   // desgaste por palabra
    const rngR   =RENDER.makeRng((seed^0x3333)>>>0);   // RENDER: jitter/tono/manchas/tachones (fase de dibujo)
    const rng=rngR;                                     // composePages usa este
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
      const wear=makeWear(opt,rngWear);
      const inkCache={};
      const inkFor=c=>inkCache[c]||(inkCache[c]=RENDER.rgbToHsl(RENDER.hexToRgb(c)));
      // estado por palabra: fuente de la mezcla (nunca repite la anterior) + tamaño levemente distinto
      let curFam=families[0], wordScale=1, lastLetterFam='';
      const onWord=()=>{
        lastLetterFam='';
        if(families.length>1){ const prev=curFam;
          do{ curFam=families[Math.floor(rngFont()*families.length)%families.length]; }while(curFam===prev); }
        wordScale=1+(rngFont()-0.5)*0.09*opt.jitter; };
      onWord();
      // fuente para CORRECCIONES de tachón: otra de la mezcla, o una alternativa de SIMILAR
      const altFam=FONTS.SIMILAR.find(f=>!families.includes(f))||families[0];
      await FONTS.ensure(altFam);
      if(FONTS.prepara) await FONTS.prepara([...families, altFam]);   // mide antes de escribir
      const beginAlt=()=>{
        if(families.length>1){ const opts=families.filter(f=>f!==curFam);
          curFam=opts[Math.floor(rngFont()*opts.length)%opts.length]; }
        else curFam=altFam;
      };
      const perLetter=!!(opt.mixLetter && families.length>1);
      const mkItem=(ch,st)=>{
        // mezcla inteligente: si está activa, alterna fuente por LETRA (sin repetir seguida),
        // manteniendo el MISMO tamaño y tono en toda la palabra para que se vea natural.
        let fam=curFam;
        if(perLetter && /[a-zA-Záéíóúñü]/.test(ch)){
          const alt=families.filter(f=>f!==lastLetterFam);
          fam=alt[Math.floor(rngFont()*alt.length)%alt.length]||curFam;
          lastLetterFam=fam;
        }
        // cada fuente se escala para que su altura de minuscula sea la MISMA:
        // sin esto, mezclar por letra hacia saltar el tamaño hasta 3,5 veces
        const kFam=(FONTS.escala? FONTS.escala(fam) : 1);
        const fsW=fs*wordScale*((st&&st.s)||1)*kFam, fstr=`${fsW}px "${fam}", cursive`;
        m.font=fstr; const w=m.measureText(ch).width;
        const useInk=(st&&st.c)?inkFor(st.c):ink;
        const useInstr=(st&&st.ins)?INSTRUMENTS[st.ins]:null;
        // engorde medido a partir de la densidad real del trazo; la tabla fija
        // solo cubria unas pocas fuentes
        const boost=Math.max(THIN_BOOST[fam]||0, (FONTS.engorde? FONTS.engorde(fam) : 0));
        return {adv:w+gap*0.4, render:(ctx,x,y)=>drawFontChar(ctx,ch,x,y,fstr,fsW,useInk,opt,rngR,wear,useInstr,boost)}; };
      return {ok:true, useFont:true, fs, spaceW, mkItem, onWord, beginAlt, inkFor, ink, rng, blot:mkBlot(ink,fs,opt), stepWord:wear.step};
    }
    // caligrafía capturada
    let prof=null;
    if(opt.fontVal.startsWith('profile:')) prof=(hooks.getProfiles()||[]).find(p=>p.id===opt.fontVal.slice(8));
    prof=prof||hooks.getProfile();
    if(!prof || !Object.keys(prof.glyphs).length) return {ok:false, noGlyphs:true};
    await RENDER.preloadAll(prof.glyphs);
    const fs=fsOverride || opt.size*scale, gap=fs*0.04;
    const wear=makeWear(opt,rngWear);
    const R={pressure:opt.pressure,tone:opt.tone,jitter:opt.jitter,slantDeg:opt.slant,
      brush:opt.instr.brush,widthSpan:opt.instr.widthSpan,opacity:opt.instr.opacity,
      grain:opt.instr.grain,pooling:opt.instr.pooling,spacing:1,rng:rngR,
      transp:opt.transp, smooth:opt.smooth, hotspot:opt.pressure };   // transparencia/disimulo por letra + presión intra-letra
    const stepWord=()=>{ wear.step(); R.widthMul=wear.widthMul; R.alphaMul=wear.alphaMul; };
    stepWord();
    const inkCache={};
    const inkFor=c=>inkCache[c]||(inkCache[c]=RENDER.rgbToHsl(RENDER.hexToRgb(c)));
    const INSTR_KEYS=['brush','widthSpan','opacity','grain','pooling'];
    let wordScale=1;
    const onWord=()=>{ wordScale=1+(rngFont()-0.5)*0.09*opt.jitter; };
    const mkItem=(ch,st)=>{ const v=pickVariant(prof,ch,rngFont); if(!v) return {adv:fs*0.45,render:()=>{}};
      const fsW=fs*wordScale*((st&&st.s)||1);
      const useInk=(st&&st.c)?inkFor(st.c):ink;
      const useInstr=(st&&st.ins)?INSTRUMENTS[st.ins]:null;
      return {adv:RENDER.advance(v,fsW,1)+gap, render:(ctx,x,y)=>{
        const save={}; if(useInstr) for(const k of INSTR_KEYS){ save[k]=R[k]; R[k]=useInstr[k]; }
        RENDER.glyph(ctx,v,x,y,fsW,useInk,R);
        // repintado: segunda pasada levemente corrida (como reforzar/corregir el trazo)
        if(opt.retrace>0 && rngR()<opt.retrace*0.3)
          RENDER.glyph(ctx,v,x+(rngR()-0.5)*fsW*0.07,y+(rngR()-0.5)*fsW*0.06,fsW,useInk,R);
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
    // peso de trazo variable por presión (cada letra pesa distinto, como pluma real)
    const pr=0.5+(rng()-0.5)*opt.pressure;
    ctx.strokeStyle=fill; ctx.lineJoin='round';
    ctx.lineWidth=fontPx*(0.006*(0.3+pr) + 0.014*(boost||0));
    ctx.strokeText(ch,0,0);
    // repintado: segunda pasada levemente corrida
    if(opt.retrace>0 && rng()<opt.retrace*0.3){
      ctx.globalAlpha=0.75;
      ctx.fillText(ch,(rng()-0.5)*fontPx*0.06,(rng()-0.5)*fontPx*0.05);
      ctx.globalAlpha=1;
    }
    // fallo de tinta: mini-espacios sin pintar + repintada discreta sobre esa zona
    if(opt.ink>0){
      const w=ctx.measureText(ch).width;
      if(rng()<opt.ink*0.5){ ctx.fillStyle='rgba(255,253,248,0.96)';
        const n=1+(rng()<opt.ink?1:0);
        for(let g=0;g<n;g++){ ctx.beginPath(); ctx.ellipse(w*(0.1+0.8*rng()), -fontPx*(0.05+0.55*rng()), fontPx*0.028, fontPx*0.05, rng()*3,0,7); ctx.fill(); } }
      if(rng()<opt.ink*0.3){ ctx.fillStyle=fill; ctx.globalAlpha=0.55;
        ctx.fillText(ch,(rng()-0.5)*fontPx*0.05,(rng()-0.5)*fontPx*0.04); ctx.globalAlpha=1; }
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
    const out=[]; let c=null, ins=null, u=false, s=null;
    for(let i=0;i<text.length;i++){
      const rest=text.slice(i); let m;
      if((m=rest.match(/^\{c:(#[0-9a-fA-F]{3,8})\}/))){ c=m[1]; i+=m[0].length-1; continue; }
      if(rest.startsWith('{/c}')){ c=null; i+=3; continue; }
      if((m=rest.match(/^\{i:([\w-]+)\}/))){ ins=INSTRUMENTS[m[1]]?m[1]:ins; i+=m[0].length-1; continue; }
      if(rest.startsWith('{/i}')){ ins=null; i+=3; continue; }
      if((m=rest.match(/^\{s:([\d.]+)\}/))){ s=+m[1]||null; i+=m[0].length-1; continue; }
      if(rest.startsWith('{/s}')){ s=null; i+=3; continue; }
      if(rest.startsWith('{u}')){ u=true; i+=2; continue; }
      if(rest.startsWith('{/u}')){ u=false; i+=3; continue; }
      out.push({ch:text[i], c, ins, u, s, si:i});   // si = índice en el texto original
    }
    return out;
  }

  /* ---------- maquetación ---------- */
  /* Marcas de estructura que la IA (o el lector de PDF) puede emitir:
       | celda | celda      → fila de tabla (varias seguidas = una tabla)
       |= cab  | cab        → fila de cabecera
       $$ formula           → formula centrada y mas grande
     Se sacan del texto ANTES de convertirlo en letras, porque no se dibujan
     como palabras sueltas sino como bloques con su propia geometria.         */
  function esFilaTabla(l){ return /^\s*\|/.test(l); }
  function celdasDe(l){
    return l.replace(/^\s*\|=?/,'').replace(/\|\s*$/,'').split('|').map(c=>c.trim());
  }
  function partirEstructura(text){
    const lineas=String(text||'').replace(/\r/g,'').split('\n');
    const bloques=[]; let buf=[], tabla=null, mapa=null;
    const cierraTexto=()=>{ if(buf.length){ bloques.push({tipo:'texto', texto:buf.join('\n')}); buf=[]; } };
    const cierraTabla=()=>{ if(tabla&&tabla.filas.length){ bloques.push(tabla); } tabla=null; };
    for(const l of lineas){
      // bloque de mapa mental: ocupa su propia hoja, en el sitio donde este
      if(mapa!==null){
        if(/^\s*@@\s*$/.test(l)){ bloques.push({tipo:'mapa', mm:mapaDeTexto(mapa)}); mapa=null; }
        else mapa.push(l);
        continue;
      }
      if(/^\s*@@\s*mapa\s*$/i.test(l)){ cierraTabla(); cierraTexto(); mapa=[]; continue; }
      if(esFilaTabla(l)){
        cierraTexto();
        if(!tabla) tabla={tipo:'tabla', filas:[], cab:-1};
        if(/^\s*\|=/.test(l)) tabla.cab=tabla.filas.length;
        tabla.filas.push(celdasDe(l));
        continue;
      }
      cierraTabla();
      if(/^\s*={3,}\s*$/.test(l)){ cierraTexto(); bloques.push({tipo:'salto'}); continue; }
      const md=l.match(/^\s*@@\s*dibujo\s*:\s*([\w-]+)\s*$/i);
      if(md){ cierraTexto(); bloques.push({tipo:'dibujo', id:md[1]}); continue; }
      const mf=l.match(/^\s*\$\$\s*(.+?)\s*\$?\$?\s*$/);
      if(mf){ cierraTexto(); bloques.push({tipo:'formula', texto:mf[1]}); continue; }
      buf.push(l);
    }
    if(mapa!==null && mapa.length) bloques.push({tipo:'mapa', mm:mapaDeTexto(mapa)});
    cierraTabla(); cierraTexto();
    return bloques;
  }
  /* El mapa se escribe en texto plano para que se pueda retocar a mano:
       @@mapa
       Centro: Estadistica
       - Descriptiva: resume la muestra
       - Inferencial: generaliza al total
       @@                                                                     */
  /* Las imagenes no caben en el texto, asi que se guardan en un registro y en
     el apunte queda una marca "@@dibujo:id". Asi el usuario puede moverla,
     duplicarla o borrarla como una linea mas.                               */
  const dibujos={}; let dibujoSeq=0;
  function registraDibujo(img){ const id='d'+(++dibujoSeq); dibujos[id]=img; return id; }
  function mapaDeTexto(lineas){
    let center=''; const branches=[];
    for(const l of lineas){
      const t=l.trim(); if(!t) continue;
      const mr=t.match(/^[-•*]\s*(.+)$/);
      if(mr){
        const p2=mr[1].split(':');
        branches.push({term:(p2.shift()||'').trim(), frag:p2.join(':').trim()});
      } else if(!center){
        center=t.replace(/^centro\s*:\s*/i,'').trim();
      }
    }
    return {center:center||'Tema', branches};
  }
  function buildParas(text, mkItem, onWord){
    const ann=parseStyled(text.replace(/\r/g,''));
    const paras=[]; let words=[], items=[], w=0, wu=false, wc=null, si0=-1, si1=-1;
    const endWord=()=>{ if(items.length){ words.push({items,w,u:wu,c:wc,si0,si1}); items=[]; w=0; wu=false; wc=null; si0=-1; si1=-1; } };
    const endPara=()=>{ endWord();
      // "▸ " al principio de la linea = dato clave que va dentro de un recuadro
      let boxed=false;
      if(words.length && words[0].items.length===1 && words[0].items[0].ch==='▸'){ boxed=true; words.shift(); }
      paras.push(words.length?{words,boxed}:{blank:true}); words=[]; };
    for(const a of ann){
      if(a.ch==='\n'){ endPara(); continue; }
      if(/\s/.test(a.ch)){ endWord(); continue; }
      if(!items.length && onWord) onWord();           // inicio de palabra: fuente/tamaño de esta palabra
      if(a.u) wu=true; if(a.c&&!wc) wc=a.c;
      if(si0<0) si0=a.si; si1=a.si+1;                  // rango en el texto original
      const st=(a.c||a.ins||a.s)?{c:a.c,ins:a.ins,s:a.s}:null;
      const it=mkItem(a.ch, st); it.ch=a.ch; items.push(it); w+=it.adv;
    }
    endPara();
    return paras;
  }
  /* ── TABLA DIBUJADA A MANO CON SU CONTENIDO ──────────────────────────────
     Mide cada celda con la MISMA letra del apunte, reparte el ancho segun lo
     que pide cada columna (no a partes iguales: una columna de numeros no
     necesita lo mismo que una de frases), parte el texto que no cabe y traza
     la reja con lineas temblorosas. La cabecera va subrayada dos veces.     */
  function medirTexto(txt, eng){
    let w=0; for(const ch of String(txt||'')) w+=eng.mkItem(ch).adv; return w;
  }
  function partirCelda(txt, eng, maxW){
    const pal=String(txt||'').split(/\s+/).filter(Boolean);
    if(!pal.length) return [''];
    // una palabra mas ancha que la columna hay que partirla por letras, o se
    // sale y pisa la columna de al lado ("Poblacioel conjunto")
    const trocea=(w)=>{
      if(medirTexto(w,eng)<=maxW) return [w];
      const out=[]; let cur='';
      for(const ch of w){
        if(cur && medirTexto(cur+ch,eng)>maxW){ out.push(cur+'-'); cur=ch; }
        else cur+=ch;
      }
      if(cur) out.push(cur);
      return out;
    };
    const lineas=[]; let cur='';
    for(const p of pal){
      for(const trozo of trocea(p)){
        const prueba=cur? cur+' '+trozo : trozo;
        if(cur && medirTexto(prueba,eng)>maxW){ lineas.push(cur); cur=trozo; }
        else cur=prueba;
      }
    }
    if(cur) lineas.push(cur);
    return lineas;
  }
  function planTabla(tabla, eng, maxW, lineH){
    const nc=Math.max(...tabla.filas.map(f=>f.length));
    const filas=tabla.filas.map(f=>{ const r=[...f]; while(r.length<nc) r.push(''); return r; });
    const pad=eng.fs*0.45;
    // ancho que PIDE cada columna = la celda mas ancha
    const piden=[];
    for(let c=0;c<nc;c++){
      let m=0; for(const f of filas) m=Math.max(m, medirTexto(f[c], eng));
      // 12% de holgura: la fuente y la escala de cada palabra varian entre
      // medir y pintar, y sin margen el texto rozaba el borde
      piden.push(m*1.12+pad*2);
    }
    const total=piden.reduce((a,b)=>a+b,0);
    let anchos;
    if(total<=maxW){
      // sobra sitio: se reparte el resto proporcionalmente
      const extra=(maxW-total)/nc;
      anchos=piden.map(w=>w+extra);
    } else {
      // no cabe: se encoge, pero ninguna columna baja de un minimo legible
      const min=Math.min(maxW/nc, eng.fs*3.2);
      let libre=maxW, flex=[], fijo=0;
      piden.forEach((w,i)=>{ if(w<=min){ fijo+=w; } else flex.push(i); });
      libre-=fijo;
      const sumaFlex=flex.reduce((a,i)=>a+piden[i],0)||1;
      anchos=piden.map((w,i)=> w<=min? w : Math.max(min, libre*piden[i]/sumaFlex));
    }
    // altura de cada fila segun lo que ocupe su celda mas alta
    const lineas=filas.map((f,ri)=>f.map((c,ci)=>partirCelda(c, eng, anchos[ci]-pad*2)));
    const inter0=(()=>{ const v=+(val('optTablaInter')); return isNaN(v)?100:clamp(v,70,180); })()/100;
    const altos=lineas.map(ls=>Math.max(1,...ls.map(l=>l.length))*lineH*inter0+pad*1.1);
    return {nc, filas, lineas, anchos, altos, pad,
            alto:altos.reduce((a,b)=>a+b,0), ancho:anchos.reduce((a,b)=>a+b,0)};
  }
  function dibujaTabla(ctx, plan, x0, yTop, tabla, eng, rng, lineH){
    const {nc, lineas, anchos, altos, pad}=plan;
    const gw=Math.max(1.3, eng.fs*0.045);
    const xs=[x0]; for(let c=0;c<nc;c++) xs.push(xs[c]+anchos[c]);
    const ys=[yTop]; for(let r=0;r<altos.length;r++) ys.push(ys[r]+altos[r]);
    /* Imperfeccion: el MISMO ajuste que las tablas que se insertan a mano
       (Insertar > Imperfeccion). 0 = reglada; 100 = claramente a pulso.     */
    const ru=(()=>{ const v=+(val('optObjRough')); return isNaN(v)?55:clamp(v,0,100); })()/100;
    const o=()=>(rng()-0.5)*eng.fs*0.16*ru;
    const tb=1+7*ru;                                  // temblor del trazo
    const gr=()=>gw*(1+(rng()-0.5)*0.5*ru);           // grosor disparejo
    // reja: cada trazo entero de lado a lado, como se dibuja una tabla a mano
    for(let r=0;r<ys.length;r++)
      sketchLine(ctx, xs[0]+o(), ys[r]+o(), xs[nc]+o(), ys[r]+o(), eng.ink, rng, gr(), tb);
    for(let c=0;c<xs.length;c++)
      sketchLine(ctx, xs[c]+o(), ys[0]+o(), xs[c]+o(), ys[altos.length]+o(), eng.ink, rng, gr(), tb);
    // la cabecera se remarca con un segundo trazo por debajo
    if(tabla.cab>=0 && ys[tabla.cab+1]!=null){
      const yy=ys[tabla.cab+1]+eng.fs*0.06;
      sketchLine(ctx, xs[0]+o(), yy+o(), xs[nc]+o(), yy+o(), eng.ink, rng, gr()*0.9, tb);
    }
    // contenido
    const alin=val('optTablaAlin')||'izq';
    const inter=(()=>{ const v=+(val('optTablaInter')); return isNaN(v)?100:clamp(v,70,180); })()/100;
    for(let r=0;r<lineas.length;r++) for(let c=0;c<nc;c++){
      const ls=lineas[r][c]; if(!ls||!ls.length) continue;
      const alto=altos[r], usado=ls.length*lineH*inter;
      // vertical: centrado en su celda, que es como queda bien en una tabla
      let yy=ys[r]+Math.max(pad*0.55,(alto-usado)/2)+eng.fs*0.78;
      ctx.save();                                            // nada puede salirse de su celda
      ctx.beginPath(); ctx.rect(xs[c]+1, ys[r]+1, anchos[c]-2, alto-2); ctx.clip();
      ls.forEach((linea,li)=>{
        if(eng.stepWord) eng.stepWord();
        const anchoL=medirTexto(linea,eng);
        const libre=Math.max(0, anchos[c]-pad*2-anchoL);
        let xx=xs[c]+pad, extra=0;
        const esCab=(tabla.cab===r);
        const modo=esCab?'centro':alin;
        if(modo==='centro') xx+=libre/2;
        else if(modo==='der') xx+=libre;
        else if(modo==='just' && li<ls.length-1 && linea.indexOf(' ')>0){
          const huecos=linea.split(' ').length-1;             // reparte el sobrante
          extra=huecos? libre/huecos : 0;
        }
        const inc=(rng()-0.5)*eng.fs*0.06*ru;                 // la fila no sale recta
        for(const ch of linea){ const it=eng.mkItem(ch);
          it.render(ctx, xx, yy+inc*(xx-xs[c])/Math.max(1,anchos[c]));
          xx+=it.adv*(1+(rng()-0.5)*0.07*ru) + (ch===' '?extra:0); }
        yy+=lineH*inter;
      });
      ctx.restore();
    }
    return ys[altos.length];
  }
  /* Formula: se escribe centrada, mas grande y con mas aire. Una formula
     copiada dentro del parrafo se pierde; a mano siempre se destaca.        */
  function dibujaFormula(ctx, txt, x0, x1, y, eng, rng){
    const esc=1.22;
    let w=0; const its=[];
    for(const ch of txt){ const it=eng.mkItem(ch); its.push(it); w+=it.adv*esc; }
    let x=x0+Math.max(0,((x1-x0)-w)/2);
    const inc=(rng()-0.5)*0.02;
    for(const it of its){
      ctx.save(); ctx.translate(x, y+inc*(x-x0)); ctx.scale(esc,esc);
      it.render(ctx,0,0); ctx.restore(); x+=it.adv*esc;
    }
    return w;
  }
  /* ── CROQUIS: una imagen redibujada como si fuera a mano ─────────────────
     No se pega la foto: se le sacan los BORDES (Sobel), se adelgazan, se
     siguen como caminos y cada camino se vuelve a trazar con la misma pluma
     temblorosa del texto. El resultado parece un dibujo a lapiz, no una
     captura pegada, que es justo lo que se pide para que todo sea casero.   */
  function bordesDe(img, ancho){
    const W=img.naturalWidth||img.width, H=img.naturalHeight||img.height;
    const w=Math.max(24, Math.min(ancho|0 || 320, 460)), h=Math.max(16, Math.round(w*H/W));
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const q=c.getContext('2d',{willReadFrequently:true});
    q.fillStyle='#fff'; q.fillRect(0,0,w,h); q.drawImage(img,0,0,w,h);
    const d=q.getImageData(0,0,w,h).data, N=w*h;
    const g=new Float32Array(N);
    for(let p=0,i=0;p<N;p++,i+=4) g[p]=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
    // suavizado 3x3 para que el ruido de compresion no genere garabatos
    const sm=new Float32Array(N);
    for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const p=y*w+x;
      sm[p]=(g[p]*4+g[p-1]+g[p+1]+g[p-w]+g[p+w])/8; }
    const mag=new Float32Array(N); let mx=0;
    for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const p=y*w+x;
      const gx=(sm[p-w+1]+2*sm[p+1]+sm[p+w+1])-(sm[p-w-1]+2*sm[p-1]+sm[p+w-1]);
      const gy=(sm[p+w-1]+2*sm[p+w]+sm[p+w+1])-(sm[p-w-1]+2*sm[p-w]+sm[p-w+1]);
      const m=Math.hypot(gx,gy); mag[p]=m; if(m>mx)mx=m; }
    // umbral por percentil: se queda el 12% de pixeles con mas borde
    const hist=new Uint32Array(257);
    for(let p=0;p<N;p++) hist[Math.min(256,(mag[p]/Math.max(1,mx)*256)|0)]++;
    let acc=0, corte=90;
    for(let v=256;v>=0;v--){ acc+=hist[v]; if(acc>=N*0.12){ corte=v/256*mx; break; } }
    const on=new Uint8Array(N);
    for(let p=0;p<N;p++) if(mag[p]>=corte) on[p]=1;
    return {on, w, h};
  }
  function caminosDe(on, w, h, minLargo){
    // sigue cada borde como un camino continuo (8 vecinos), sin repetir pixel
    const N=w*h, visto=new Uint8Array(N), caminos=[];
    const vec=[-w-1,-w,-w+1,-1,1,w-1,w,w+1];
    for(let s=0;s<N;s++){
      if(visto[s]||!on[s]) continue;
      let p=s; const cam=[];
      while(p>=0 && !visto[p] && on[p]){
        visto[p]=1; cam.push([p%w,(p/w)|0]);
        let sig=-1;
        for(const dv of vec){ const q=p+dv;
          if(q<0||q>=N||visto[q]||!on[q]) continue;
          const x1=q%w, x0=p%w; if(Math.abs(x1-x0)>1) continue;   // no saltar de fila
          sig=q; break; }
        p=sig;
      }
      if(cam.length>=minLargo) caminos.push(cam);
    }
    return caminos;
  }
  function dibujaCroquis(ctx, img, x0, y, maxW, eng, rng){
    const b=bordesDe(img, Math.min(420, Math.round(maxW/3)));
    const cam=caminosDe(b.on, b.w, b.h, 6);
    const k=maxW/b.w, alto=b.h*k;
    ctx.save();
    // la tinta del motor es un objeto {h,s,l}, no una cadena: asignarla tal cual
    // a strokeStyle es invalido y el navegador lo ignora sin avisar
    const tinta=(eng.ink&&typeof eng.ink==='object')
      ? (a)=>`hsla(${eng.ink.h},${eng.ink.s}%,${eng.ink.l}%,${a})`
      : (a)=>String(eng.ink||'#222');
    ctx.lineCap='round'; ctx.lineJoin='round';
    for(const c of cam){
      ctx.beginPath();
      ctx.lineWidth=Math.max(0.9, eng.fs*0.035*(0.7+rng()*0.6));
      ctx.strokeStyle=tinta((0.55+rng()*0.4).toFixed(2));
      // el trazo se aparta un poco del borde exacto: mano, no maquina
      const t=eng.fs*0.05;
      for(let i=0;i<c.length;i+=2){
        const X=x0+c[i][0]*k+(rng()-0.5)*t, Y=y+c[i][1]*k+(rng()-0.5)*t;
        if(i===0) ctx.moveTo(X,Y); else ctx.lineTo(X,Y);
      }
      ctx.stroke();
    }
    ctx.restore();
    return alto;
  }
  function newPage(P){ const c=document.createElement('canvas'); c.width=P.w; c.height=P.h;
    c.className='page-canvas'; const cx=c.getContext('2d'); cx.fillStyle='#fffdf8'; cx.fillRect(0,0,P.w,P.h); return {canvas:c,ctx:cx}; }

  function composePages(paras, opt, eng, cfg){
    const P=paperDims(opt), rng=eng.rng;
    const pages=[]; let pg=newPage(P), pageIndex=0; cfg.paint(pg.ctx,P,pageIndex);
    // caída de renglón: mayormente hacia abajo, a veces sube un poco; + temblor aleatorio
    function slp(){ const dir = rng()<0.72 ? 1 : -(0.35+rng()*0.45);
      return (cfg.drift?(rng()-0.5)*0.05*opt.drift:0) + 0.035*(opt.fall||0)*dir; }
    // onda suave dentro del renglón (la mano no escribe en línea recta)
    let wavePh=rng()*7, waveF=(0.5+rng())*Math.PI*2/Math.max(200,(cfg.x1-cfg.x0));
    let x=cfg.x0, y=cfg.top, slope=slp(), dirty=false;
    function by(xx){ return y + slope*(xx-cfg.x0) + Math.sin(xx*waveF+wavePh)*eng.fs*0.06*opt.jitter; }
    function nl(){ x=cfg.x0; y+=cfg.lineH; slope=slp(); wavePh=rng()*7; waveF=(0.5+rng())*Math.PI*2/Math.max(200,(cfg.x1-cfg.x0));
      if(y>cfg.bottom){ pages.push(pg); pageIndex++; pg=newPage(P); cfg.paint(pg.ctx,P,pageIndex); y=cfg.top; dirty=false; } }
    const advJit=()=>1+(rng()-0.5)*0.05*opt.jitter;   // avance por letra levemente disparejo
    // objetos insertados = obstáculos: el texto fluye alrededor (ni encima ni tapado)
    const obs=(cfg.obstacles||[]);
    function jumpX(xStart,wtot,yy){
      for(const ob of obs){ if(ob.page!==pageIndex) continue;
        if(yy < ob.y0 - cfg.lineH*0.55 || yy > ob.y1) continue;
        if(xStart < ob.x1 && xStart+wtot > ob.x0) return ob.x1+8; }
      return xStart;
    }
    // ALINEACIÓN tipo Word: agrupa las palabras en líneas y calcula el desplazamiento
    const AL=opt.align||'left', IND=(opt.indent||0)*PXMM*0.35, PGAP=(opt.paraGap||0);
    function lineWidth(ws,from,to,extraSp){ let t=0;
      for(let i=from;i<to;i++){ t+=ws[i].w; if(i<to-1) t+=eng.spaceW+(extraSp||0); } return t; }
    for(const para of paras){
      if(para.blank){ nl(); continue; }
      if(para.dibujo){                      // croquis: la imagen redibujada a mano
        const img=dibujos[para.dibujo];
        if(img){
          if(x>cfg.x0) nl();
          y+=cfg.lineH*0.4;
          const anchoMax=(cfg.x1-cfg.x0)*0.72;
          const alto=(()=>{ const b=bordesDe(img, 300); return b.h*(anchoMax/b.w); })();
          if(y+alto>cfg.bottom && alto<(cfg.bottom-cfg.top)){
            pages.push(pg); pageIndex++; pg=newPage(P); cfg.paint(pg.ctx,P,pageIndex); y=cfg.top; dirty=false;
          }
          const xd=cfg.x0+((cfg.x1-cfg.x0)-anchoMax)/2;
          try{ y+=dibujaCroquis(pg.ctx, img, xd, y, anchoMax, eng, rng); }catch(e){ console.warn('croquis',e); }
          y+=cfg.lineH*0.7; x=cfg.x0; dirty=true;
          if(y>cfg.bottom){ pages.push(pg); pageIndex++; pg=newPage(P); cfg.paint(pg.ctx,P,pageIndex); y=cfg.top; dirty=false; }
        }
        continue;
      }
      if(para.mapa){                        // el mapa mental ocupa su propia hoja
        if(dirty) pages.push(pg);
        // renderMindmap devuelve [canvas]; aqui se manejan objetos {canvas,ctx}
        try{ const mc=renderMindmap(para.mapa, opt, eng);
             const cv=Array.isArray(mc)?mc[0]:(mc&&mc.canvas?mc.canvas:mc);
             if(cv) pages.push({canvas:cv, ctx:cv.getContext('2d')});
        }catch(e){ console.warn('mapa',e); }
        pageIndex=pages.length; pg=newPage(P); cfg.paint(pg.ctx,P,pageIndex);
        x=cfg.x0; y=cfg.top; dirty=false; continue;
      }
      if(para.salto){                       // "===" = empezar hoja nueva
        pages.push(pg); pageIndex++; pg=newPage(P); cfg.paint(pg.ctx,P,pageIndex);
        x=cfg.x0; y=cfg.top; dirty=false; continue;
      }
      if(para.tabla){
        /* Ancho y tamano de letra de la tabla los manda el usuario. Al cambiar
           cualquiera de los dos se REPARTE otra vez: el texto se reajusta a la
           nueva anchura de columna, las filas cambian de alto y la tabla entera
           crece o encoge. La letra se escala con el lienzo (translate+scale) en
           vez de rehacer la fuente, asi la reja y el texto encogen a la par.  */
        const kT=(()=>{ const v=+(val('optTablaTam')); return isNaN(v)?100:clamp(v,60,140); })()/100;
        const anchoT=(()=>{ const v=+(val('optTablaAncho')); return isNaN(v)?100:clamp(v,40,100); })()/100;
        const disponible=(cfg.x1-cfg.x0)*anchoT;
        const plan=planTabla(para.tabla, eng, disponible/kT, cfg.lineH);
        const altoReal=plan.alto*kT, anchoReal=plan.ancho*kT;
        if(x>cfg.x0) nl();
        y+=cfg.lineH*0.35;
        // una tabla no se parte por la mitad: si no cabe, pasa a la hoja siguiente
        if(y+altoReal>cfg.bottom && altoReal<(cfg.bottom-cfg.top)){
          pages.push(pg); pageIndex++; pg=newPage(P); cfg.paint(pg.ctx,P,pageIndex); y=cfg.top; dirty=false;
        }
        const x0t=cfg.x0+Math.max(0,((cfg.x1-cfg.x0)-anchoReal)/2);
        pg.ctx.save(); pg.ctx.translate(x0t, y); pg.ctx.scale(kT,kT);
        dibujaTabla(pg.ctx, plan, 0, 0, para.tabla, eng, rng, cfg.lineH);
        pg.ctx.restore();
        y+=altoReal+cfg.lineH*0.55; x=cfg.x0; dirty=true;
        if(y>cfg.bottom){ pages.push(pg); pageIndex++; pg=newPage(P); cfg.paint(pg.ctx,P,pageIndex); y=cfg.top; dirty=false; }
        continue;
      }
      if(para.formula){
        if(x>cfg.x0) nl();
        y+=cfg.lineH*0.55;
        if(y>cfg.bottom){ pages.push(pg); pageIndex++; pg=newPage(P); cfg.paint(pg.ctx,P,pageIndex); y=cfg.top; dirty=false; }
        dibujaFormula(pg.ctx, para.formula, cfg.x0, cfg.x1, y, eng, rng);
        y+=cfg.lineH*1.35; x=cfg.x0; dirty=true;
        if(y>cfg.bottom){ pages.push(pg); pageIndex++; pg=newPage(P); cfg.paint(pg.ctx,P,pageIndex); y=cfg.top; dirty=false; }
        continue;
      }
      // parte el párrafo en líneas según el ancho disponible
      const W=para.words, lines=[]; let cur=[], accW=0, first=true;
      for(let i=0;i<W.length;i++){
        const avail=(cfg.x1-cfg.x0)-(first&&IND?IND:0);
        const add=(cur.length? eng.spaceW:0)+W[i].w;
        if(cur.length && accW+add>avail){ lines.push({idx:cur,first}); cur=[i]; accW=W[i].w; first=false; }
        else { cur.push(i); accW+=add; }
      }
      if(cur.length) lines.push({idx:cur,first});
      const boxed=para.boxed;
      let bxMinX=Infinity, bxMaxX=-Infinity, bxY0=null, bxY1=null, bxPage=pageIndex;
      lines.forEach((ln,li)=>{
        const isLast=li===lines.length-1;
        const indent=(ln.first&&IND)?IND:0;
        const avail=(cfg.x1-cfg.x0)-indent;
        let used=0; ln.idx.forEach((wi,k)=>{ used+=W[wi].w; if(k<ln.idx.length-1) used+=eng.spaceW; });
        let startX=cfg.x0+indent, extraSp=0;
        if(AL==='center') startX+=Math.max(0,(avail-used)/2);
        else if(AL==='right') startX+=Math.max(0,avail-used);
        else if(AL==='justify' && !isLast && ln.idx.length>1) extraSp=Math.max(0,(avail-used)/(ln.idx.length-1));
        x=startX;
        if(boxed){ if(bxY0===null){ bxY0=y; bxPage=pageIndex; } if(startX<bxMinX) bxMinX=startX; }
        for(const wi of ln.idx){ drawWord(W[wi], extraSp); }
        if(boxed){ if(x>bxMaxX) bxMaxX=x; bxY1=y; }
        if(li<lines.length-1) nl();
      });
      if(boxed && bxY0!==null && bxPage===pageIndex && bxMaxX>bxMinX)
        roughRect(pg.ctx, bxMinX, bxY0, bxMaxX, bxY1, eng, rng);
      nl();
      if(PGAP>0){ y+=cfg.lineH*PGAP; if(y>cfg.bottom) nl(); }
      continue;
    }
    function drawWord(word, extraSp){
      {
        if(eng.stepWord) eng.stepWord();                       // desgaste: tajado / tinta
        if(obs.length){ let jx=jumpX(x,word.w,y);
          if(jx!==x){ x=jx; if(x+word.w>cfg.x1){ nl(); const j2=jumpX(x,word.w,y); if(j2+word.w<=cfg.x1) x=j2; } } }
        // tachón: palabra con ERROR real de letras, rayada, y corregida (en otra fuente si hay)
        const doStrike = opt.strikes>0 && word.items.length>2 && word.w<(cfg.x1-cfg.x0)*0.4 && rng()<0.16*opt.strikes;
        if(x>cfg.x0 && x+word.w*(doStrike?2.25:1)>cfg.x1){
          const rem=cfg.x1-x;
          // continuación con barra baja: parte la palabra y sigue en el renglón siguiente
          if(!doStrike && rem>(cfg.x1-cfg.x0)*0.22 && word.items.length>3 && rng()<0.6){
            const dash=eng.mkItem('_');
            let wxA=x; const wS=((rng()-0.42)*0.05)*opt.jitter; const wyA=xx=>by(xx)+wS*(xx-wxA);
            let k=0;
            while(k<word.items.length-1 && x+word.items[k].adv+dash.adv<=cfg.x1){
              word.items[k].render(pg.ctx,x,wyA(x)); x+=word.items[k].adv*advJit(); k++;
            }
            dash.render(pg.ctx,x,wyA(x)); nl();
            let wxB=x; const wyB=xx=>by(xx)+wS*(xx-wxB);
            for(;k<word.items.length;k++){ word.items[k].render(pg.ctx,x,wyB(x)); x+=word.items[k].adv*advJit(); }
            x+=eng.spaceW*(1+(rng()-0.4)*0.5*opt.jitter); dirty=true; return;
          }
          nl();
        }
        // inclinación propia de la palabra (sube o baja levemente → asimetría natural)
        let wx0=x; const wSlope=((rng()-0.42)*0.055)*opt.jitter;
        const wy=xx=>by(xx)+wSlope*(xx-wx0);
        if(doStrike){
          const sx0=x;
          const wInk=(word.c&&eng.inkFor)?eng.inkFor(word.c):eng.ink;   // el tachón respeta el color
          // 1) la palabra "mal escrita": letras mutadas de forma plausible
          const badChars=mutateChars(word.items.map(it=>it.ch||'a'),rng);
          for(const ch of badChars){ const it=eng.mkItem(ch); it.render(pg.ctx,x,wy(x)); x+=it.adv*advJit(); }
          // 2) el rayado encima (uno de cientos de estilos)
          scribbleWord(pg.ctx,sx0,x,wy((sx0+x)/2)+eng.fs*0.32,eng.fs,wInk,rng,0.9*(1-opt.transp*0.5));
          x+=eng.spaceW*0.6; wx0=x;
          // 3) la corrección, con OTRA fuente si hay mezcla/alternativa
          if(eng.beginAlt) eng.beginAlt();
          for(const it0 of word.items){ const it=eng.mkItem(it0.ch||'a'); it.render(pg.ctx,x,wy(x)); x+=it.adv*advJit(); }
          dirty=true;
        }
        else if(word.w>(cfg.x1-cfg.x0)){ for(const it of word.items){ if(x+it.adv>cfg.x1){ nl(); wx0=x; } it.render(pg.ctx,x,wy(x)); x+=it.adv*advJit(); dirty=true; } }
        else { let first=true; for(const it of word.items){ it.render(pg.ctx,x,wy(x));
            if(first&&opt.blots&&rng()<0.012*opt.blots) eng.blot(pg.ctx,x,wy(x)); first=false; x+=it.adv*advJit(); } dirty=true; }
        // subrayado imperfecto (marca {u})
        if(word.u && x>wx0){
          const uInk=(word.c&&eng.inkFor)?eng.inkFor(word.c):eng.ink;
          sketchLine(pg.ctx, wx0-eng.fs*0.04, wy(wx0)+eng.fs*0.3, x-eng.fs*0.06, wy(x)+eng.fs*0.3+(rng()-0.5)*eng.fs*0.12, uInk, rng, Math.max(1.6,eng.fs*0.055));
        }
        // registra la caja de la palabra → clic en el papel selecciona su texto (tipo Word)
        if(word.si0>=0) lastWordRects.push({page:pageIndex, x0:wx0, x1:x, yb:wy((wx0+x)/2), fs:eng.fs, si0:word.si0, si1:word.si1});
        // espacio entre palabras disparejo
        x+=(eng.spaceW+(extraSp||0))*(1+(rng()-0.4)*0.5*opt.jitter);
      }
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
    const P=paperDims(opt), lineH=eng.fs*opt.line;
    let ml,mr,mt,mb,pad=0, mtop=0;
    if(opt.paperCustom){ const c=opt.custom, k=PXMM;
      ml=c.left*k; mr=c.right*k; mt=c.top*k; mb=c.bottom*k; pad=c.box?16:2;
      if(c.style==='traper') mtop=lineH*0.7;   // aire para materia/fecha
    } else { ml=95+(opt.holes!=='none'?42:0)+(opt.ruling==='college'?70:0); mr=90; mt=120; mb=110; }
    // el texto se parte en bloques: texto normal, tablas y formulas, EN ORDEN
    const paras=[];
    for(const b of partirEstructura(text)){
      if(b.tipo==='texto'){ paras.push(...buildParas(b.texto, eng.mkItem, eng.onWord)); }
      else if(b.tipo==='tabla'){ paras.push({tabla:b}); }
      else if(b.tipo==='formula'){ paras.push({formula:b.texto}); }
      else if(b.tipo==='salto'){ paras.push({salto:true}); }
      else if(b.tipo==='mapa'){ paras.push({mapa:b.mm}); }
      else if(b.tipo==='dibujo'){ paras.push({dibujo:b.id}); }
    }
    const obstacles=objects.map(o=>({ page:(o.page||0),
      x0:o.xf*P.w-10, y0:o.yf*P.h-8, x1:(o.xf+o.wf)*P.w+10, y1:(o.yf+o.hf)*P.h+8 }));
    const cfg={ x0:ml+pad, x1:P.w-mr-pad, top:mt+mtop+lineH*0.85, bottom:P.h-mb-pad, lineH, drift:opt.drift>0, obstacles,
      paint:(ctx,Pp,idx)=>paintPaper(ctx,Pp,opt,ml,mr,mt,mb,lineH,idx) };
    return composePages(paras, opt, eng, cfg).pages.map(p=>p.canvas);
  }

  /* ---- tachones: 5 estilos paramétricos (líneas/zigzag/bucles/onda/X) ×
     pasadas, alturas, fases y amplitudes aleatorias = cientos de formas ---- */
  function scribbleWord(ctx,x0,x1,yBase,fs,ink,rng,alpha){
    const style=Math.floor(rng()*5);
    ctx.save();
    ctx.strokeStyle=`hsla(${ink.h},${ink.s}%,${ink.l}%,${alpha??0.9})`;
    ctx.lineCap='round'; ctx.lineJoin='round';
    const yMid=yBase-fs*0.32, w=Math.max(1.4,fs*0.055);
    const seg=(fn,steps)=>{ ctx.beginPath(); for(let i=0;i<=steps;i++){ const t=i/steps;
      const [px,py]=fn(t); i?ctx.lineTo(px,py):ctx.moveTo(px,py); } ctx.stroke(); };
    if(style===0){                                  // rayas horizontales 1-4
      const n=1+Math.floor(rng()*4);
      for(let k=0;k<n;k++){ const yy=yMid+(rng()-0.5)*fs*0.5; ctx.lineWidth=w*(0.8+rng()*0.6);
        seg(t=>[x0-3+(x1-x0+6)*t, yy+(rng()-0.5)*3+Math.sin(t*9+rng()*7)*1.5],7); }
    } else if(style===1){                           // zigzag
      const amp=fs*(0.18+rng()*0.25), n=4+Math.floor((x1-x0)/(fs*0.5));
      ctx.lineWidth=w;
      seg(t=>[x0+(x1-x0)*t, yMid+((Math.round(t*n)%2)?amp:-amp)+(rng()-0.5)*2],n*2);
    } else if(style===2){                           // bucles (eeee)
      const n=Math.max(3,Math.floor((x1-x0)/(fs*0.45))), r=fs*(0.16+rng()*0.14);
      ctx.lineWidth=w*0.9;
      seg(t=>{ const a=t*n*Math.PI*2; return [x0+(x1-x0)*t+Math.cos(a)*r*0.7, yMid+Math.sin(a)*r]; },n*10);
    } else if(style===3){                           // onda apretada
      const f=6+rng()*8, amp=fs*(0.12+rng()*0.2);
      ctx.lineWidth=w;
      const passes=1+Math.floor(rng()*2);
      for(let k=0;k<passes;k++){ const ph=rng()*7, yy=yMid+(rng()-0.5)*fs*0.3;
        seg(t=>[x0+(x1-x0)*t, yy+Math.sin(t*f*Math.PI+ph)*amp],24); }
    } else {                                        // X + garabato encima
      ctx.lineWidth=w;
      seg(t=>[x0+(x1-x0)*t, yBase-fs*0.75+fs*0.8*t+(rng()-0.5)*3],6);
      seg(t=>[x0+(x1-x0)*t, yBase+fs*0.05-fs*0.8*t+(rng()-0.5)*3],6);
      if(rng()<0.6){ const f=5+rng()*6, ph=rng()*7;
        ctx.lineWidth=w*0.8;
        seg(t=>[x0+(x1-x0)*t, yMid+Math.sin(t*f*Math.PI+ph)*fs*0.2],20); }
    }
    ctx.restore();
  }

  /* ---- trazos "a mano" para marcos/líneas (temblor leve) ---- */
  /* Recuadro a mano alrededor de un dato clave. Cuatro trazos sueltos con las
     esquinas pasadas de largo: un rectangulo perfecto delata que es impreso.  */
  function roughRect(ctx, x0, yTop, x1, yBot, eng, rng){
    const fs=eng.fs, ink=eng.ink;
    const px=fs*0.42, pyT=fs*1.02, pyB=fs*0.40;
    const ax=x0-px, ay=yTop-pyT, bx=x1+px, by2=yBot+pyB;
    const ru=(()=>{ const v=+(val('optObjRough')); return isNaN(v)?55:clamp(v,0,100); })()/100;
    const o=()=>(rng()-0.5)*fs*0.28*ru;              // esquinas que se pasan o se quedan cortas
    const gw=Math.max(1.4, fs*0.045);
    const R=rc(ctx);
    if(R){
      /* Un recuadro de una sola pieza, no cuatro lineas pegadas: rough.js ya
         hace que las esquinas se pasen y que el trazo se repase, que es lo
         que el bucle de abajo imitaba a mano.                              */
      R.rectangle(ax,ay,bx-ax,by2-ay,{ stroke:tinta(ink), strokeWidth:gw,
        roughness:clamp(0.6+2.4*ru,0.5,3.2), bowing:clamp(0.6+1.4*ru,0.5,2.4),
        seed:(rng()*1e6)|0 });
      return;
    }
    sketchLine(ctx, ax+o(), ay+o(), bx+o(), ay+o(), ink, rng, gw);
    sketchLine(ctx, bx+o(), ay+o(), bx+o(), by2+o(), ink, rng, gw);
    sketchLine(ctx, bx+o(), by2+o(), ax+o(), by2+o(), ink, rng, gw);
    sketchLine(ctx, ax+o(), by2+o(), ax+o(), ay+o(), ink, rng, gw);
  }
  /* ── DIBUJO A MANO CON rough.js ──────────────────────────────────────
     Antes el trazo "a mano" era una linea recta partida en 6 tramos con un
     desplazamiento al azar en cada vertice. Se nota que es una recta con
     ruido: no tiene el doble repaso, ni las esquinas que se pasan, ni el
     grosor que cambia a lo largo del trazo.
     rough.js hace justo eso, y es lo que usan Excalidraw y compania. Aqui se
     enchufa como MOTOR de las primitivas que ya existian, no como codigo
     nuevo en paralelo: todo lo que dibujaba con sketchLine/sketchRect/
     sketchEllipse (tablas, mapas mentales, formulas, croquis) mejora de una
     vez, y si la libreria no ha cargado se sigue dibujando como antes.
     La semilla sale del rng del documento, asi que la misma hoja se vuelve a
     dibujar igual: sin eso el banco de pruebas dejaria de ser comparable.  */
  let _rcCanvas=null, _rc=null;
  function rc(ctx){
    if(typeof rough==='undefined' || !rough) return null;
    const cv=ctx&&ctx.canvas; if(!cv) return null;
    if(_rcCanvas!==cv){ _rc=rough.canvas(cv); _rcCanvas=cv; }
    return _rc;
  }
  const tinta=(ink,a)=>`hsla(${ink.h},${ink.s}%,${ink.l}%,${a==null?0.85:a})`;
  /* 'temblor' venia en pixeles de desvio; rough.js lo pide como roughness
     (cuanto se desvia) y bowing (cuanto se arquea la linea entre extremos).
     Se traduce en vez de inventar numeros nuevos, para que el mando de
     Imperfeccion que ya existe siga significando lo mismo.                 */
  const rugosidad=tb=>clamp((tb==null?3:tb)*0.42, 0.5, 3.2);
  const arqueo   =tb=>clamp(0.5+(tb==null?3:tb)*0.16, 0.5, 2.4);
  function sketchLine(ctx,x0,y0,x1,y1,ink,rng,w,temblor){
    const R=rc(ctx);
    if(R){ R.line(x0,y0,x1,y1,{ stroke:tinta(ink), strokeWidth:w||2,
             roughness:rugosidad(temblor), bowing:arqueo(temblor),
             seed:(rng()*1e6)|0 }); return; }
    ctx.strokeStyle=`hsla(${ink.h},${ink.s}%,${ink.l}%,0.85)`; ctx.lineWidth=w||2; ctx.lineCap='round';
    const tb=(temblor==null?3:temblor);
    const n=6; ctx.beginPath(); ctx.moveTo(x0,y0);
    for(let i=1;i<=n;i++){ const t=i/n;
      ctx.lineTo(x0+(x1-x0)*t+(rng()-0.5)*tb, y0+(y1-y0)*t+(rng()-0.5)*tb); }
    ctx.stroke();
  }
  function sketchRect(ctx,x0,y0,x1,y1,ink,rng){
    const R=rc(ctx);
    if(R){ R.rectangle(x0,y0,x1-x0,y1-y0,{ stroke:tinta(ink), strokeWidth:2,
             roughness:1.3, bowing:1, seed:(rng()*1e6)|0 }); return; }
    // esquinas con leve remate (como trazo a mano que se pasa un poquito)
    const o=()=> (rng()-0.5)*4;
    sketchLine(ctx,x0-2,y0+o(),x1+2,y0+o(),ink,rng,2);
    sketchLine(ctx,x1+o(),y0-2,x1+o(),y1+2,ink,rng,2);
    sketchLine(ctx,x1+2,y1+o(),x0-2,y1+o(),ink,rng,2);
    sketchLine(ctx,x0+o(),y1+2,x0+o(),y0-2,ink,rng,2);
  }
  function sketchEllipse(ctx,cx,cy,rx,ry,ink,rng){
    const R=rc(ctx);
    if(R){ R.ellipse(cx,cy,rx*2,ry*2,{ stroke:tinta(ink), strokeWidth:2.4,
             roughness:1.2, bowing:1, seed:(rng()*1e6)|0 }); return; }
    ctx.strokeStyle=`hsla(${ink.h},${ink.s}%,${ink.l}%,0.85)`; ctx.lineWidth=2.4; ctx.beginPath();
    for(let i=0;i<=26;i++){ const a=i/26*Math.PI*2;
      const x=cx+Math.cos(a)*(rx+(rng()-0.5)*4), y=cy+Math.sin(a)*(ry+(rng()-0.5)*4);
      i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
    ctx.stroke();
  }

  /* ---- flashcards: 6 tarjetas por hoja con borde de recorte ---- */
  function renderFlashcards(cards, opt, eng){
    const P=paperDims(opt), lineH=eng.fs*opt.line;
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
    const P=paperDims(opt), lineH=eng.fs*opt.line;
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
    const P=paperDims(opt), lineH=eng.fs*opt.line;
    const pg=newPage(P), ctx=pg.ctx, rng=eng.rng;
    /* 'auto' reparte los estilos de verdad: se elige por la SEMILLA del render
       y por el numero de ramas, asi que dos mapas distintos del mismo apunte
       no salen iguales, pero el mismo mapa no baila al re-renderizar.
       Ademas se sortea la variante (a que lado crece, si las cajas van con
       recuadro o subrayadas, la inclinacion), que es lo que hacia que
       'siempre pareciera el mismo'.                                          */
    const ESTILOS=['radial','arbol','columnas','espina','burbujas','escalera'];
    let style=val('optMapStyle')||'radial';
    if(style==='auto'){
      const nb=(mm.branches||[]).length;
      const semilla=Math.abs((mm.center||'').split('').reduce((a,c)=>((a*31+c.charCodeAt(0))|0),nb));
      style=ESTILOS[semilla%ESTILOS.length];
    }
    const branches=(mm.branches||[]).slice(0,10), n=branches.length||1;
    const wrapTxt=(t,x0,x1,y,lh)=>drawBlock(ctx,t,{x0,x1,top:y,bottom:y+lh*3},eng,lh);

    if(style==='arbol'){                       // ÁRBOL: tronco a la izquierda, ramas a la derecha
      const cx=P.w*0.20, cy=P.h*0.12, rx=P.w*0.16, ry=lineH*1.5;
      sketchEllipse(ctx,cx,cy,rx,ry,eng.ink,rng);
      wrapTxt(mm.center||'Tema', cx-rx+18, cx+rx-14, cy+eng.fs*0.3, lineH);
      const top=P.h*0.26, step=Math.min(lineH*3.2,(P.h*0.66)/n);
      branches.forEach((b,i)=>{
        const y=top+i*step, x=P.w*0.42;
        sketchLine(ctx,cx,cy+ry,cx,y,eng.ink,rng,2);            // tronco
        sketchLine(ctx,cx,y,x-10,y,eng.ink,rng,2);              // rama
        const yT=wrapTxt(b.term,x,P.w*0.72,y-eng.fs*0.1,lineH);
        if(b.frag) drawBlock(ctx,b.frag,{x0:x,x1:P.w*0.94,top:yT-lineH*0.25,bottom:yT+lineH*2},eng,lineH*0.88);
      });
    } else if(style==='columnas'){             // COLUMNAS: título arriba, temas en 2 columnas
      const cx=P.w/2, cy=P.h*0.11;
      sketchRect(ctx,P.w*0.28,cy-lineH,P.w*0.72,cy+lineH*0.9,eng.ink,rng);
      wrapTxt(mm.center||'Tema', P.w*0.30, P.w*0.70, cy+eng.fs*0.25, lineH);
      const cols=2, rows=Math.ceil(n/cols);
      branches.forEach((b,i)=>{
        const c=i%cols, r=(i/cols)|0;
        const x0=P.w*(c?0.53:0.08), x1=P.w*(c?0.94:0.47);
        const y=P.h*0.24+r*Math.min(lineH*3.4,(P.h*0.68)/rows);
        sketchRect(ctx,x0,y-lineH*0.8,x1,y+lineH*1.9,eng.ink,rng);
        const yT=wrapTxt(b.term,x0+14,x1-12,y-eng.fs*0.1,lineH);
        if(b.frag) drawBlock(ctx,b.frag,{x0:x0+14,x1:x1-12,top:yT-lineH*0.3,bottom:y+lineH*1.8},eng,lineH*0.85);
      });
    } else if(style==='espina'){               // ESPINA DE PESCADO
      const yMid=P.h*0.5, x0=P.w*0.08, x1=P.w*0.80;
      sketchLine(ctx,x0,yMid,x1,yMid,eng.ink,rng,3);
      sketchLine(ctx,x1-26,yMid-16,x1,yMid,eng.ink,rng,3);
      sketchLine(ctx,x1,yMid,x1-26,yMid+16,eng.ink,rng,3);
      wrapTxt(mm.center||'Tema', x1+8, P.w-30, yMid+eng.fs*0.3, lineH);
      branches.forEach((b,i)=>{
        const up=i%2===0, k=(i/2)|0;
        const bx=x0+P.w*0.10+k*((x1-x0)*0.78/Math.max(1,Math.ceil(n/2)));
        const by=up? yMid-P.h*0.20 : yMid+P.h*0.20;
        sketchLine(ctx,bx,yMid,bx+ (up?60:-60), by,eng.ink,rng,2);
        const tx=bx+(up?40:-140);
        const yT=wrapTxt(b.term, tx, tx+P.w*0.22, by+(up?-lineH*0.2:lineH*0.6), lineH);
        if(b.frag) drawBlock(ctx,b.frag,{x0:tx,x1:tx+P.w*0.24,top:yT-lineH*0.3,bottom:yT+lineH*2},eng,lineH*0.82);
      });
    } else if(style==='burbujas'){             // BURBUJAS: globos sueltos unidos al centro
      const cx=P.w*0.5, cy=P.h*0.22, rx=P.w*0.17, ry=lineH*1.7;
      sketchEllipse(ctx,cx,cy,rx,ry,eng.ink,rng);
      wrapTxt(mm.center||'Tema', cx-rx+18, cx+rx-14, cy+eng.fs*0.3, lineH);
      const cols=Math.min(3,Math.max(2,Math.ceil(Math.sqrt(n))));
      branches.forEach((b,i)=>{
        const c=i%cols, r=(i/cols)|0;
        const bw=P.w*0.80/cols, bx=P.w*0.10+c*bw+bw*0.5;
        const by=P.h*0.42+r*Math.min(lineH*4.2,(P.h*0.50)/Math.max(1,Math.ceil(n/cols)));
        const brx=bw*0.42, bry=lineH*1.5;
        sketchLine(ctx,cx,cy+ry,bx,by-bry,eng.ink,rng,1.8);
        sketchEllipse(ctx,bx,by,brx,bry,eng.ink,rng);
        const yT=wrapTxt(b.term, bx-brx+14, bx+brx-12, by-eng.fs*0.15, lineH);
        if(b.frag) drawBlock(ctx,b.frag,{x0:bx-brx+14,x1:bx+brx-12,top:yT-lineH*0.25,bottom:by+bry},eng,lineH*0.8);
      });
    } else if(style==='escalera'){             // ESCALERA: cada idea un peldano
      const yT0=P.h*0.14;
      wrapTxt(mm.center||'Tema', P.w*0.10, P.w*0.90, yT0, lineH*1.15);
      sketchLine(ctx,P.w*0.10,yT0+lineH*0.4,P.w*0.62,yT0+lineH*0.4,eng.ink,rng,2.4);
      branches.forEach((b,i)=>{
        const paso=Math.min(lineH*3.2,(P.h*0.66)/Math.max(1,n));
        const y=P.h*0.26+i*paso;
        const x0=P.w*(0.10+0.055*Math.min(i,5));      // se va escalonando
        const x1=Math.min(P.w*0.94, x0+P.w*0.62);
        sketchLine(ctx,x0,y+lineH*0.55,x1,y+lineH*0.55,eng.ink,rng,1.6);
        sketchLine(ctx,x0,y-lineH*0.55,x0,y+lineH*0.55,eng.ink,rng,1.6);
        const yT=wrapTxt(b.term, x0+14, x1-10, y, lineH);
        if(b.frag) drawBlock(ctx,b.frag,{x0:x0+22,x1:x1-10,top:yT-lineH*0.25,bottom:y+lineH*1.6},eng,lineH*0.8);
      });
    } else {                                   // RADIAL (por defecto), mejor repartido
      const cx=P.w/2, cy=P.h*0.46, rx=P.w*0.15, ry=lineH*1.6;
      sketchEllipse(ctx,cx,cy,rx,ry,eng.ink,rng);
      wrapTxt(mm.center||'Tema', cx-rx+20, cx+rx-14, cy+eng.fs*0.3, lineH);
      branches.forEach((b,i)=>{
        const a=(i/n)*Math.PI*2 - Math.PI/2;
        const R=Math.min(P.w*0.36,P.h*0.30);
        const bx=cx+Math.cos(a)*R, by=cy+Math.sin(a)*R;
        sketchLine(ctx, cx+Math.cos(a)*rx*1.05, cy+Math.sin(a)*ry*1.05, bx, by, eng.ink, rng, 2.2);
        const half=P.w*0.14;
        const bx0=Math.max(20,Math.min(P.w-2*half-20,bx-half));
        const yT=wrapTxt(b.term, bx0, bx0+2*half, by+eng.fs*0.2, lineH);
        sketchLine(ctx,bx0,yT-lineH*0.5,bx0+2*half*0.9,yT-lineH*0.5,eng.ink,rng,1.5);
        if(b.frag) drawBlock(ctx,b.frag,{x0:bx0,x1:bx0+2*half,top:yT-lineH*0.15,bottom:yT+lineH*2.4},eng,lineH*0.88);
      });
    }
    return [pg.canvas];
  }

  function renderCornell(data, opt, eng){
    const P=paperDims(opt), lineH=eng.fs*opt.line;
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

  // clic sobre el papel → selecciona esa palabra en el cuadro de texto (para retocarla tipo Word)
  function attachClickSelect(canvas, pageIndex){
    canvas.style.cursor='text';
    canvas.addEventListener('click', e=>{
      const rect=canvas.getBoundingClientRect();
      const px=(e.clientX-rect.left)*canvas.width/rect.width, py=(e.clientY-rect.top)*canvas.height/rect.height;
      let hit=null;
      for(const wr of lastWordRects){ if(wr.page!==pageIndex) continue;
        if(px>=wr.x0-4 && px<=wr.x1+4 && py>=wr.yb-wr.fs*1.15 && py<=wr.yb+wr.fs*0.55){ hit=wr; break; } }
      if(hit){ const ta=document.getElementById('genText'); ta.focus(); ta.setSelectionRange(hit.si0,hit.si1);
        APP.toast('Palabra seleccionada ✎ — usa 🖍/▁/↕ arriba'); }
    });
  }

  /* ---------- generación principal ---------- */
  let engCache=null, engKey='';
  function optKey(o){ return [o.fontVal,o.size,o.line,o.color,val('optInstrument'),o.paper,o._seed,
    o.mix?o.mix.join(','):'',o.mixLetter,o.pressure,o.tone,o.transp,o.smooth,o.jitter,o.wear,o.ink].join('|'); }
  async function run(srcOverride){
    const src=(typeof srcOverride==='string'&&srcOverride)||document.getElementById('genText').value;
    if(!src.trim()){ APP.toast('Escribe, pega o arrastra un texto'); return; }
    const opt=buildOpt();   // _seed = renderSeed (estable mientras escribes)
    APP.busy('Componiendo…'); await tick();
    try{
      const k=optKey(opt);
      let eng;
      if(engCache && engKey===k){ eng=engCache; }        // reusa el motor: evita recargar fuentes al teclear
      else { eng=await makeEngine(opt); engCache=eng; engKey=k; }
      if(!eng.ok){ engCache=null; APP.idle(); APP.toast(eng.noGlyphs?'Esa caligrafía no tiene letras: captúrala o elige una fuente':'No se pudo preparar la letra'); return; }
      lastWordRects=[];
      let data;
      if(typeof AI!=='undefined' && AI.enabled() && opt.format!=='completo'){
        APP.busy('Redactando apuntes con IA…');
        try{ data=await AI.format(src, opt.format); }
        catch(e){ console.error(e); APP.toast('IA falló ('+(e.message||e).slice(0,60)+') — uso el modo sin IA'); data=SUMMARIZE.format(src,opt.format); }
        APP.busy('Componiendo…');
      } else data=SUMMARIZE.format(src,opt.format);
      let canvases;
      if(opt.format==='cornell')         canvases=renderCornell(data, opt, eng);
      else if(opt.format==='flashcards') canvases=renderFlashcards(data, opt, eng);
      else if(opt.format==='boxing')     canvases=renderBoxing(data, opt, eng);
      else if(opt.format==='mapa')       canvases=renderMindmap(data, opt, eng);
      else                               canvases=renderNormal(data, opt, eng);
      const host=document.getElementById('pages'); host.innerHTML='';
      document.getElementById('emptyPreview').style.display='none';
      lastPages=canvases.map((c,pi)=>{ const wrap=document.createElement('div'); wrap.className='page-wrap';
        wrap.appendChild(c); host.appendChild(wrap);
        if(opt.format==='completo') attachClickSelect(c, pi);   // clic en el papel → selecciona texto
        return {canvas:c, wrap, _sigov:null}; });
      layoutSignatureOverlays();   // firma editable (imagen tipo Word)
      layoutObjects();             // objetos insertados (tablas/formas/cuadros)
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
          scribbleWord(ctx,sx0,x,wy((sx0+x)/2)+fs*0.32,fs,eng.ink,rng,0.9);
          x+=eng.spaceW*0.6; wx0=x; }
        let first=true; for(const it of word.items){ it.render(ctx,x,wy(x));
          if(first&&opt.blots&&rng()<0.012*opt.blots) eng.blot(ctx,x,wy(x)); first=false; x+=it.adv; }
        x+=eng.spaceW*(1+(rng()-0.4)*0.5*opt.jitter);
      }
      x=x0; y+=lineH; slope=slp(); if(y>bottom) stop=true;
    }
  }

  /* ---------- papel ---------- */
  function paintPaper(ctx,P,opt,ml,mr,mt,mb,lineH,idx){
    const flip = opt.flip && ((idx||0)%2===1);
    ctx.fillStyle='#fffdf8'; ctx.fillRect(0,0,P.w,P.h); const right=P.w-mr;
    if(opt.paperCustom){
      const c=opt.custom, bx0=ml, by0=mt, bx1=P.w-mr, by1=P.h-mb;
      ctx.save(); ctx.beginPath(); ctx.rect(bx0,by0,bx1-bx0,by1-by0); ctx.clip();
      if(c.grid>0){ const step=Math.max(6,c.grid*PXMM); ctx.strokeStyle='#d3e2cf'; ctx.lineWidth=1;
        for(let y=by0;y<=by1;y+=step){ ctx.beginPath(); ctx.moveTo(bx0,y); ctx.lineTo(bx1,y); ctx.stroke(); }
        for(let x=bx0;x<=bx1;x+=step){ ctx.beginPath(); ctx.moveTo(x,by0); ctx.lineTo(x,by1); ctx.stroke(); }
      } else { ctx.strokeStyle='#cfe0ee'; ctx.lineWidth=1.2;
        for(let y=by0+lineH*0.85;y<=by1;y+=lineH){ ctx.beginPath(); ctx.moveTo(bx0,y); ctx.lineTo(bx1,y); ctx.stroke(); } }
      ctx.restore();
      if(c.box){ ctx.strokeStyle='#9fb0c8'; ctx.lineWidth=2; ctx.strokeRect(bx0,by0,bx1-bx0,by1-by0); }
      if(c.style==='traper'){
        ctx.fillStyle='#8a8f96'; ctx.font=Math.round(mt*0.32)+'px Inter,sans-serif'; ctx.textBaseline='alphabetic';
        const yh=by0-lineH*0.2, xa=flip?bx1:bx0;
        ctx.textAlign=flip?'right':'left';
        ctx.fillText('materia:', xa+(flip?-4:4), yh);
        ctx.fillText('fecha', bx0+(bx1-bx0)*(flip?0.30:0.55), yh);
        ctx.textAlign='left'; ctx.strokeStyle='#c9ccd2'; ctx.lineWidth=1.4;
        const mw=ctx.measureText('materia:').width;
        ctx.beginPath(); ctx.moveTo(bx0+mw+22, yh+2); ctx.lineTo(bx0+(bx1-bx0)*0.42, yh+2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx0+(bx1-bx0)*0.62, yh+2); ctx.lineTo(bx1, yh+2); ctx.stroke();
      }
      paintHoles(ctx,P,opt,flip,true);
      return;
    }
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
    } else if(opt.ruling==='custom'){
      const c=opt.custom, k=P.w/(opt.paper==='letter'?215.9:210);
      const bx0=ml, by0=mt, bx1=P.w-mr, by1=P.h-mb;
      ctx.save(); ctx.beginPath(); ctx.rect(bx0,by0,bx1-bx0,by1-by0); ctx.clip();
      if(c.grid>0){ const step=Math.max(6,c.grid*k); ctx.strokeStyle='#dfeaf3'; ctx.lineWidth=1;
        for(let y=by0;y<=by1;y+=step){ ctx.beginPath(); ctx.moveTo(bx0,y); ctx.lineTo(bx1,y); ctx.stroke(); }
        for(let x=bx0;x<=bx1;x+=step){ ctx.beginPath(); ctx.moveTo(x,by0); ctx.lineTo(x,by1); ctx.stroke(); }
      } else { ctx.strokeStyle='#cfe0ee'; ctx.lineWidth=1.2;
        for(let y=by0+lineH*0.85;y<=by1;y+=lineH){ ctx.beginPath(); ctx.moveTo(bx0,y); ctx.lineTo(bx1,y); ctx.stroke(); } }
      ctx.restore();
      if(c.box){ ctx.strokeStyle='#aab6d6'; ctx.lineWidth=2; ctx.strokeRect(bx0,by0,bx1-bx0,by1-by0); }
    }
    paintHoles(ctx,P,opt,flip,false);
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
  function paintHoles(ctx,P,opt,flip,traper){
    const sx = flip ? P.w-34 : 34;
    if(traper){   // 4 agujeros alternados redondo/ovalado (como su hoja)
      ctx.fillStyle='#f4f5f6'; ctx.strokeStyle='#d4d8dd'; ctx.lineWidth=1.4;
      for(let i=0;i<4;i++){ const cy=P.h*(0.15+i*0.235);
        ctx.beginPath();
        if(i%2===0) ctx.ellipse(sx,cy,9,9,0,0,7);
        else ctx.ellipse(sx,cy,8,17,0,0,7);
        ctx.fill(); ctx.stroke(); }
      return;
    }
    if(opt.holes==='3'){ ctx.fillStyle='#eef0f2'; ctx.strokeStyle='#d4d8dd'; ctx.lineWidth=1.5;
      for(const fy of[0.2,0.5,0.8]){const cy=P.h*fy;ctx.beginPath();ctx.arc(sx,cy,15,0,7);ctx.fill();ctx.stroke();} }
    else if(opt.holes==='spiral'){ ctx.strokeStyle='#c8ccd1'; ctx.lineWidth=4;
      for(let y=60;y<P.h-40;y+=46){ ctx.beginPath(); ctx.ellipse(flip?P.w-30:30,y,9,16,0,0,7); ctx.stroke(); } }
  }

  /* ---------- exportar PDF ---------- */
  async function exportPDF(){
    if(!lastPages.length){ APP.toast('Genera los apuntes primero'); return; }
    APP.busy('Creando PDF…');
    try{ const {jsPDF}=await LIBS.jspdf(); const paper=val('optPaper'); const mm=paperDims({paper}).mm;
      const fmt = paper==='a4'?'a4' : paper==='letter'?'letter' : [mm[0],mm[1]];
      const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:fmt});
      const where=val('sigWhere');
      lastPages.forEach((pg,i)=>{ if(i>0) pdf.addPage();
        let src=pg.canvas;
        const targ = sigData && (where==='all' || i===lastPages.length-1);
        const hasObj = objects.length && i===lastPages.length-1;
        if(targ || hasObj){ const t=document.createElement('canvas'); t.width=src.width; t.height=src.height;
          const c=t.getContext('2d'); c.drawImage(src,0,0); if(targ) bakeSigOn(c,t); if(hasObj) bakeObjectsOn(c,t); src=t; }
        pdf.addImage(src.toDataURL('image/jpeg',0.92),'JPEG',0,0,mm[0],mm[1]); });
      pdf.save('apuntes-manuscritos.pdf'); APP.idle(); APP.toast('PDF descargado ⬇');
    }catch(e){ console.error(e); APP.idle(); APP.toast('No se pudo crear el PDF'); }
  }

  window.__MT=Object.assign(window.__MT||{},{inkClusters,informeFirma,verDiag:()=>JSON.parse(JSON.stringify(sigDiag)),refineBox,extractTight,esTrazo,partirEstructura,planTabla,lineasDePagina,textoConTablas,ocrDePaginaPDF,rasterizaPaginaPDF,docxHtmlAMarcas,bordesDe,caminosDe,dibujaCroquis,registraDibujo,findInkRegion,aplicarDesgaste,aplicarIntensidad,aplicarGrosor,limpiaFirma,rebuildTint});
  return { init, bind, populateFonts };
})();
