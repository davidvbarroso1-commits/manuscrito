/* summarize.js — resumen extractivo en español, sin internet ni IA externa.
   Puntúa oraciones por frecuencia de palabras clave y elige las más representativas,
   conservando el orden original. Devuelve apuntes en viñetas. */
const SUMMARIZE = (() => {
  const STOP = new Set(('de la que el en y a los del se las por un para con no una su al lo como mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos esto antes algunos unos otro otras otra tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mis tus ellas vosotros os mio mia tuyo suya nuestro vuestro es son fue ser sea solo ademas asi cada cuyo cual segun hacia tras the of to and a in is it you that for on with as at by an be this').split(/\s+/));

  function words(s){ return (s.toLowerCase().normalize('NFC').match(/[a-záéíóúñü]{3,}/gi) || []); }

  function run(text, ratio){
    text = (text||'').replace(/\s+/g,' ').trim();
    if (!text) return '';
    // separa en oraciones
    const sentences = (text.match(/[^.!?\n]+[.!?]+|\S[^.!?\n]*$/g) || [text]).map(s=>s.trim()).filter(s=>s.length>15);
    if (sentences.length <= 3) return sentences.map(s=>'• '+s).join('\n');

    // frecuencia de términos (sin stopwords)
    const freq = {};
    for (const w of words(text)) if (!STOP.has(w)) freq[w] = (freq[w]||0) + 1;

    const scored = sentences.map((s,i) => {
      const sw = words(s); let sc = 0;
      for (const w of sw) if (freq[w]) sc += freq[w];
      // penaliza oraciones muy largas; premia las de tamaño medio
      return { s, i, sc: sc / Math.sqrt(sw.length || 1) };
    });

    const n = Math.min(sentences.length, Math.max(3, Math.round(sentences.length * (ratio || 0.5))));
    const top = scored.slice().sort((a,b)=>b.sc-a.sc).slice(0, n).sort((a,b)=>a.i-b.i);
    return top.map(t => '• ' + t.s.replace(/[.;,]+$/,'') + '.').join('\n');
  }

  return { run };
})();
