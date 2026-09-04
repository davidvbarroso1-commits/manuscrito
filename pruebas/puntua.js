/* puntua.js — la regla de medir, compartida por todos los bancos.

   Estaba dentro de firmas.html. Se saca aparte para que cualquier motor
   nuevo (RMBG, modnet, lo que venga) se mida EXACTAMENTE igual que el motor
   actual. Si cada banco lleva su copia, tarde o temprano divergen y las
   cifras dejan de ser comparables, que es justo lo que hace inutil un banco.

   Se comparan FORMAS NORMALIZADAS, no pixel a pixel: el extractor recorta
   ajustado a la tinta y ademas amplia los recortes pequenos, asi que un mapeo
   directo daba 27% en todos los casos por igual — incluido el trivial, y esa
   uniformidad fue lo que delato que el fallo estaba en la medicion.          */
const PUNTUA = (() => {

  function mascara(canvas, umbralAlpha){
    const {width:w,height:h}=canvas;
    const d=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
    const m=new Uint8Array(w*h);
    for(let p=0;p<w*h;p++) if(d[p*4+3]>umbralAlpha) m[p]=1;
    return {m,w,h};
  }

  function cajaDe(mk){
    let x0=mk.w,y0=mk.h,x1=-1,y1=-1;
    for(let y=0;y<mk.h;y++) for(let x=0;x<mk.w;x++) if(mk.m[y*mk.w+x]){
      if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
    if(x1<0) return null;
    return {x0,y0,x1,y1,w:x1-x0+1,h:y1-y0+1};
  }

  /* Cada mascara se encuadra en su propia caja y se lleva a una rejilla
     comun, asi da igual el desplazamiento y la escala. Se muestrea un BLOQUE
     por celda, no un punto: un trazo fino no se pierde entre pixeles.       */
  function aRejilla(mk, N){
    const c=cajaDe(mk); const g=new Uint8Array(N*N);
    if(!c) return g;
    for(let j=0;j<N;j++) for(let i=0;i<N;i++){
      const ax=c.x0+Math.floor(i*c.w/N), bx=c.x0+Math.max(1,Math.ceil((i+1)*c.w/N));
      const ay=c.y0+Math.floor(j*c.h/N), by=c.y0+Math.max(1,Math.ceil((j+1)*c.h/N));
      let hay=0;
      for(let y=ay;y<by&&!hay;y++) for(let x=ax;x<bx&&!hay;x++)
        if(x<mk.w&&y<mk.h&&mk.m[y*mk.w+x]) hay=1;
      g[j*N+i]=hay;
    }
    return g;
  }

  /* La verdad se toma en el NUCLEO del trazo (alpha>110). Con alpha>40
     entraban los bordes suavizados, que estan al 15% de opacidad y ningun
     umbralizador conserva ni debe conservar: penalizaba un 20% sin que
     faltara nada.                                                           */
  function puntua(recorte, tintaVerdad, umbralRecorte){
    const N=128;
    const V=aRejilla(mascara(tintaVerdad,110), N);
    const R=aRejilla(mascara(recorte, umbralRecorte==null?60:umbralRecorte), N);
    let acierto=0, falso=0, perdido=0;
    for(let p=0;p<V.length;p++){
      if(R[p]&&V[p]) acierto++;
      else if(R[p]&&!V[p]) falso++;
      else if(!R[p]&&V[p]) perdido++;
    }
    return { conserva:(acierto+perdido)? acierto/(acierto+perdido) : 0,
             limpieza:(acierto+falso)? acierto/(acierto+falso) : 0,
             acierto, falso, perdido };
  }

  return { mascara, cajaDe, aRejilla, puntua };
})();
