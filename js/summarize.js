/* summarize.js — analiza el texto y lo convierte a distintos formatos de apuntes
   (resumen, ideas clave, esquema, Cornell, preguntas), sin internet ni IA externa. */
const SUMMARIZE = (() => {
  const STOP = new Set(('de la que el en y a los del se las por un para con no una su al lo como mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos esto antes algunos unos otro otras otra tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mis tus ellas vosotros os mio mia tuyo suya nuestro vuestro es son fue ser sea solo ademas asi cada cuyo segun hacia tras the of to and a in is it you that for on with as at by an be this').split(/\s+/));

  const words = s => (s.toLowerCase().normalize('NFC').match(/[a-záéíóúñü]{3,}/gi) || []);
  const sentencesOf = t => (t.replace(/\s+/g,' ').trim().match(/[^.!?\n]+[.!?]+|\S[^.!?\n]*$/g) || [t])
        .map(s=>s.trim()).filter(s=>s.length>12);

  function freqOf(text){ const f={}; for(const w of words(text)) if(!STOP.has(w)) f[w]=(f[w]||0)+1; return f; }
  const contentWords = s => words(s).filter(w=>!STOP.has(w));

  // bigramas de palabras de contenido → etiquetas más precisas ("pensamiento critico")
  function bigramsOf(text){
    const bg={};
    for(const sent of sentencesOf(text)){
      const cw=contentWords(sent);
      for(let i=1;i<cw.length;i++){ const b=cw[i-1]+' '+cw[i]; bg[b]=(bg[b]||0)+1; }
    }
    return bg;
  }
  // parecido entre oraciones (evita elegir dos casi iguales)
  function similar(a,b){
    const A=new Set(contentWords(a)), B=new Set(contentWords(b));
    let n=0; for(const w of A) if(B.has(w)) n++;
    return n/Math.max(1,Math.min(A.size,B.size));
  }
  function topSentences(text, ratio){
    const sents=sentencesOf(text); if(sents.length<=3) return sents;
    const freq=freqOf(text);
    const scored=sents.map((s,i)=>{ const sw=words(s); let sc=0; for(const w of sw) if(freq[w]) sc+=freq[w];
      sc=sc/Math.sqrt(sw.length||1);
      if(i===0) sc*=1.25; else if(i<3) sc*=1.1;    // el inicio suele traer la tesis
      return {s,i,sc}; });
    const n=Math.min(sents.length, Math.max(3, Math.round(sents.length*ratio)));
    const picked=[];
    for(const o of scored.slice().sort((a,b)=>b.sc-a.sc)){
      if(picked.length>=n) break;
      if(picked.some(p=>similar(p.s,o.s)>0.6)) continue;   // descarta repetidas
      picked.push(o);
    }
    return picked.sort((a,b)=>a.i-b.i).map(o=>o.s);
  }
  const clean = s => s.replace(/^[\s•\-–]+/,'').replace(/[.;,\s]+$/,'');
  const cap = s => s.charAt(0).toUpperCase()+s.slice(1);
  // término clave de una oración (palabra de contenido más frecuente)
  function keyTerm(s, freq){ let best='', bv=-1; for(const w of words(s)) if(!STOP.has(w)&&(freq[w]||0)>bv){bv=freq[w];best=w;} return best; }
  // etiqueta: bigrama frecuente dentro de la oración; si no hay, término clave
  function labelFor(s, freq, bg){
    const cw=contentWords(s); let best=null, bv=1;
    for(let i=1;i<cw.length;i++){ const b=cw[i-1]+' '+cw[i]; if((bg[b]||0)>bv){bv=bg[b];best=b;} }
    return best || keyTerm(s,freq);
  }

  function resumen(text, ratio){ return topSentences(text, ratio||0.5).map(s=>'• '+clean(s)+'.').join('\n'); }

  function esquema(text){
    const tops=topSentences(text, 0.6);
    return tops.map(s=>{ const parts=s.split(/[,;:]/).map(clean).filter(p=>p.length>2);
      let out='› '+cap(parts[0]||clean(s));
      for(let i=1;i<parts.length && i<4;i++) out+='\n    – '+parts[i];
      return out; }).join('\n');
  }

  function preguntas(text){
    const freq=freqOf(text), bg=bigramsOf(text), tops=topSentences(text,0.6), seen=new Set(), out=[];
    for(const s of tops){ const t=labelFor(s,freq,bg); if(!t||seen.has(t)) continue; seen.add(t);
      out.push('• ¿Qué sabes sobre "'+t+'"?\n    '+clean(s)+'.'); }
    return out.join('\n');
  }

  function cornell(text){
    const freq=freqOf(text), bg=bigramsOf(text), tops=topSentences(text,0.6);
    const notes=tops.map(s=>clean(s)+'.');
    const cues=tops.map(s=>{ const t=labelFor(s,freq,bg); return t?('¿'+cap(t)+'?'):'•'; });
    // resumen final = 1-2 oraciones top
    const summ=topSentences(text,0.18).map(clean).join('. ');
    return { cues, notes, summary: (summ?cap(summ)+'.':'') };
  }

  // esquema numerado I. A. 1.
  function outline(text){
    const tops=topSentences(text,0.6); const ROM=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    return tops.map((s,i)=>{ const parts=s.split(/[,;:]/).map(clean).filter(p=>p.length>2);
      let out=(ROM[i]||(i+1))+'. '+cap(parts[0]||clean(s));
      const SUB=['A','B','C','D'];
      for(let j=1;j<parts.length&&j<4;j++) out+='\n    '+SUB[j-1]+'. '+cap(parts[j]);
      return out; }).join('\n');
  }

  // término: definición
  function glosario(text){
    const freq=freqOf(text), bg=bigramsOf(text), tops=topSentences(text,0.65), seen=new Set(), out=[];
    for(const s of tops){ const t=labelFor(s,freq,bg); if(!t||seen.has(t)) continue; seen.add(t);
      out.push(cap(t)+': '+clean(s)+'.'); }
    return out.join('\n');
  }

  // método Feynman: explicación simple + dudas
  function feynman(text){
    const simple=topSentences(text,0.35).map(s=>'• '+clean(s)+'.').join('\n');
    const freq=freqOf(text), bg=bigramsOf(text), seen=new Set(), dudas=[];
    for(const s of topSentences(text,0.5)){ const t=labelFor(s,freq,bg); if(!t||seen.has(t)) continue; seen.add(t);
      dudas.push('• ¿Podría explicar "'+t+'" con mis palabras?'); if(dudas.length>=6) break; }
    return 'EXPLICACIÓN SIMPLE:\n'+simple+'\n\nPARA REPASAR:\n'+dudas.join('\n');
  }

  // tarjetas de estudio [{q,a}]
  function flashcards(text){
    const freq=freqOf(text), bg=bigramsOf(text), tops=topSentences(text,0.65), seen=new Set(), out=[];
    for(const s of tops){ const t=labelFor(s,freq,bg); if(!t||seen.has(t)) continue; seen.add(t);
      out.push({q:'¿Qué es / qué pasa con "'+t+'"?', a:clean(s)+'.'}); }
    return out;
  }

  // ideas para cajas (boxing)
  function boxes(text){ return topSentences(text,0.55).map(s=>clean(s)+'.'); }

  // mapa mental {center, branches:[{term,frag}]} — centro = tema (mejor bigrama global);
  // ramas = sub-temas distintos, cada una con el fragmento de su mejor oración
  function mindmap(text){
    const freq=freqOf(text), bg=bigramsOf(text);
    let center=null, cv=1;
    for(const b in bg) if(bg[b]>cv){ cv=bg[b]; center=b; }
    if(!center){ const t=Object.keys(freq).sort((a,b)=>freq[b]-freq[a])[0]; center=t||'Tema'; }
    // agrupa las mejores oraciones por etiqueta y se queda con la mejor de cada tema
    const groups={};
    for(const s of topSentences(text,0.75)){
      const lab=labelFor(s,freq,bg);
      if(!lab||lab===center) continue;
      const cw=contentWords(s);
      const score=cw.reduce((a,w)=>a+(freq[w]||0),0)/Math.sqrt(cw.length||1);
      if(!groups[lab]||score>groups[lab].score) groups[lab]={s,score};
    }
    const branches=Object.keys(groups)
      .sort((a,b)=>groups[b].score-groups[a].score).slice(0,7)
      .map(lab=>({term:cap(lab), frag:contentWords(clean(groups[lab].s)).slice(0,8).join(' ')}));
    return {center:cap(center), branches};
  }

  // devuelve string u objeto según formato
  function format(text, fmt){
    text=(text||'').trim();
    if(!text) return fmt==='cornell'?{cues:[],notes:[],summary:''}:(fmt==='flashcards'||fmt==='boxing')?[]:fmt==='mapa'?{center:'',branches:[]}:'';
    switch(fmt){
      case 'completo':   return text;
      case 'ideas':      return resumen(text, 0.34);
      case 'esquema':    return esquema(text);
      case 'outline':    return outline(text);
      case 'glosario':   return glosario(text);
      case 'feynman':    return feynman(text);
      case 'preguntas':  return preguntas(text);
      case 'cornell':    return cornell(text);
      case 'flashcards': return flashcards(text);
      case 'boxing':     return boxes(text);
      case 'mapa':       return mindmap(text);
      case 'resumen':
      default:           return resumen(text, 0.5);
    }
  }

  return { format, run:(t,r)=>resumen(t,r) };
})();
