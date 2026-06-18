/* summarize.js — analiza el texto y lo convierte a distintos formatos de apuntes
   (resumen, ideas clave, esquema, Cornell, preguntas), sin internet ni IA externa. */
const SUMMARIZE = (() => {
  const STOP = new Set(('de la que el en y a los del se las por un para con no una su al lo como mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos esto antes algunos unos otro otras otra tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mis tus ellas vosotros os mio mia tuyo suya nuestro vuestro es son fue ser sea solo ademas asi cada cuyo segun hacia tras the of to and a in is it you that for on with as at by an be this').split(/\s+/));

  const words = s => (s.toLowerCase().normalize('NFC').match(/[a-záéíóúñü]{3,}/gi) || []);
  const sentencesOf = t => (t.replace(/\s+/g,' ').trim().match(/[^.!?\n]+[.!?]+|\S[^.!?\n]*$/g) || [t])
        .map(s=>s.trim()).filter(s=>s.length>12);

  function freqOf(text){ const f={}; for(const w of words(text)) if(!STOP.has(w)) f[w]=(f[w]||0)+1; return f; }
  function scoreSentences(sents, freq){
    return sents.map((s,i)=>{ const sw=words(s); let sc=0; for(const w of sw) if(freq[w]) sc+=freq[w];
      return {s,i,sc:sc/Math.sqrt(sw.length||1)}; });
  }
  function topSentences(text, ratio){
    const sents=sentencesOf(text); if(sents.length<=3) return sents;
    const sc=scoreSentences(sents, freqOf(text));
    const n=Math.min(sents.length, Math.max(3, Math.round(sents.length*ratio)));
    return sc.slice().sort((a,b)=>b.sc-a.sc).slice(0,n).sort((a,b)=>a.i-b.i).map(o=>o.s);
  }
  const clean = s => s.replace(/^[\s•\-–]+/,'').replace(/[.;,\s]+$/,'');
  const cap = s => s.charAt(0).toUpperCase()+s.slice(1);
  // término clave de una oración (palabra de contenido más frecuente)
  function keyTerm(s, freq){ let best='', bv=-1; for(const w of words(s)) if(!STOP.has(w)&&(freq[w]||0)>bv){bv=freq[w];best=w;} return best; }

  function resumen(text, ratio){ return topSentences(text, ratio||0.5).map(s=>'• '+clean(s)+'.').join('\n'); }

  function esquema(text){
    const tops=topSentences(text, 0.6);
    return tops.map(s=>{ const parts=s.split(/[,;:]/).map(clean).filter(p=>p.length>2);
      let out='› '+cap(parts[0]||clean(s));
      for(let i=1;i<parts.length && i<4;i++) out+='\n    – '+parts[i];
      return out; }).join('\n');
  }

  function preguntas(text){
    const freq=freqOf(text), tops=topSentences(text,0.6), seen=new Set(), out=[];
    for(const s of tops){ const t=keyTerm(s,freq); if(!t||seen.has(t)) continue; seen.add(t);
      out.push('• ¿Qué sabes sobre "'+t+'"?\n    '+clean(s)+'.'); }
    return out.join('\n');
  }

  function cornell(text){
    const freq=freqOf(text), tops=topSentences(text,0.6);
    const notes=tops.map(s=>clean(s)+'.');
    const cues=tops.map(s=>{ const t=keyTerm(s,freq); return t?('¿'+cap(t)+'?'):'•'; });
    // resumen final = 1-2 oraciones top
    const summ=topSentences(text,0.18).map(clean).join('. ');
    return { cues, notes, summary: (summ?cap(summ)+'.':'') };
  }

  // devuelve string (la mayoría) u objeto {cues,notes,summary} para cornell
  function format(text, fmt){
    text=(text||'').trim(); if(!text) return fmt==='cornell'?{cues:[],notes:[],summary:''}:'';
    switch(fmt){
      case 'completo':  return text;
      case 'ideas':     return resumen(text, 0.34);
      case 'esquema':   return esquema(text);
      case 'preguntas': return preguntas(text);
      case 'cornell':   return cornell(text);
      case 'resumen':
      default:          return resumen(text, 0.5);
    }
  }

  return { format, run:(t,r)=>resumen(t,r) };
})();
