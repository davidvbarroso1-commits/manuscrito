/* charset.js — los glifos que se pueden capturar.
   Pensado para español: ~108 glifos. */
const CHARSET = (() => {
  const lower = 'abcdefghijklmnñopqrstuvwxyz'.split('');
  const lowerAcc = 'áéíóúü'.split('');
  const upper = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'.split('');
  const upperAcc = 'ÁÉÍÓÚÜ'.split('');
  const digit = '0123456789'.split('');
  const punct = '.,;:¿?¡!\'"()[]-–—/%&@#*+=<>$'.split('');

  const groups = [
    { key:'lower', label:'Minúsculas', chars:[...lower, ...lowerAcc] },
    { key:'upper', label:'Mayúsculas', chars:[...upper, ...upperAcc] },
    { key:'digit', label:'Números',    chars:digit },
    { key:'punct', label:'Signos',     chars:punct },
  ];

  const all = groups.flatMap(g => g.chars);

  // categoría de un carácter
  function catOf(ch){
    for (const g of groups) if (g.chars.includes(ch)) return g.key;
    return 'punct';
  }

  // caracteres que NO necesitan glifo propio (se sintetizan/sustituyen)
  // mapa de sustitución para cuando falte un glifo al generar
  const fallback = {
    'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u',
    'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ü':'U',
    'ñ':'n','Ñ':'N',
    '–':'-','—':'-','«':'"','»':'"','“':'"','”':'"','‘':'\'','’':'\'',
    '\t':' ',
  };

  // métricas verticales por carácter en unidades de altura-x (baseline=0, arriba +).
  // Permite colocar bien un glifo escaneado SIN guías, porque sabemos qué letra es.
  const ASC = new Set('bdfhklt'.split(''));
  const DESC = new Set('gpqy'.split(''));
  const PUNCT_M = {
    '.':{top:0.18,bottom:0}, ',':{top:0.18,bottom:-0.24},
    ';':{top:0.58,bottom:-0.24}, ':':{top:0.58,bottom:0},
    "'":{top:1.45,bottom:1.0}, '"':{top:1.45,bottom:1.0},
    '¿':{top:1.0,bottom:-0.4}, '?':{top:1.42,bottom:0},
    '¡':{top:1.0,bottom:-0.4}, '!':{top:1.42,bottom:0},
    '-':{top:0.6,bottom:0.45}, '–':{top:0.6,bottom:0.45}, '—':{top:0.6,bottom:0.45},
    '(':{top:1.42,bottom:-0.3}, ')':{top:1.42,bottom:-0.3},
    '[':{top:1.42,bottom:-0.3}, ']':{top:1.42,bottom:-0.3},
    '<':{top:1.0,bottom:0}, '>':{top:1.0,bottom:0},
    '/':{top:1.42,bottom:-0.2}, '%':{top:1.42,bottom:0}, '&':{top:1.42,bottom:0},
    '@':{top:1.3,bottom:-0.2}, '#':{top:1.3,bottom:0}, '*':{top:1.42,bottom:0.55},
    '+':{top:1.0,bottom:0.1}, '=':{top:0.9,bottom:0.2}, '$':{top:1.45,bottom:-0.2},
  };
  function metricsFor(ch){
    if(/[A-ZÁÉÍÓÚÜÑ]/.test(ch)) return {top:1.4, bottom:0};
    if(/[0-9]/.test(ch))        return {top:1.35, bottom:0};
    if(ch==='f')                return {top:1.45, bottom:-0.25};
    if(ASC.has(ch))             return {top:1.45, bottom:0};
    if(ch==='j')                return {top:1.0,  bottom:-0.5};
    if(DESC.has(ch))            return {top:1.0,  bottom:-0.5};
    if(/[a-zñáéíóúü]/.test(ch)) return {top:1.0,  bottom:0};
    return PUNCT_M[ch] || {top:1.2, bottom:0};
  }

  return { groups, all, catOf, fallback, metricsFor, count: all.length };
})();
