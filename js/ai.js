/* ai.js — formatos de apunte con IA (Claude). La API key vive solo en el navegador del usuario. */
const AI = (() => {
  const KEY='manuscrito_aikey';
  function pv(){ const el=document.getElementById('aiProvider'); return (el&&el.value)||'gemini'; }
  function getKey(){ try{ return localStorage.getItem(KEY+'_'+pv())||''; }catch(e){ return ''; } }
  function setKey(k){ try{ k?localStorage.setItem(KEY+'_'+pv(),k):localStorage.removeItem(KEY+'_'+pv()); }catch(e){} }
  // hay IA si CUALQUIER proveedor tiene clave, no solo el seleccionado
  function hayIA(){ try{ return proveedoresDisponibles().length>0; }catch(e){ return !!getKey(); } }
  function enabled(){ const c=document.getElementById('aiUse'); return !!(c&&c.checked&&hayIA()); }

  const PROMPTS={
    resumen:'Resume en viñetas claras y completas (empieza cada línea con "• ").',
    ideas:'Extrae las ideas clave, una por línea, empezando con "• ". Sé conciso.',
    esquema:'Convierte en un esquema jerárquico con "› " para ideas principales y "    – " para subideas.',
    outline:'Convierte en esquema numerado clásico: I., II. para secciones; A., B. para subsecciones; 1., 2. para detalles.',
    feynman:'Aplica el método Feynman. Devuelve exactamente:\nEXPLICACIÓN SIMPLE:\n(explica como a un niño, en viñetas "• ")\n\nPARA REPASAR:\n(preguntas de autoevaluación en viñetas "• ")',
    glosario:'Crea un glosario. Una línea por término con el formato "Término: definición clara".',
    preguntas:'Crea preguntas de estudio con su respuesta. Formato por bloque:\n• ¿Pregunta?\n    Respuesta.',
    completo:'Devuelve el texto limpio y bien puntuado, sin cambiar el contenido.'
  };

  function provider(){ const el=document.getElementById('aiProvider'); return (el&&el.value)||'gemini'; }

  /* ── RELEVO AUTOMATICO ENTRE PROVEEDORES ─────────────────────────────────
     Gemini gratis se satura (503 "high demand") durante ratos largos. En vez
     de dejar la app colgada o fallando, se prueba el siguiente proveedor que
     tenga clave guardada. El usuario no elige nada: solo funciona.
     Se recuerda cual respondio para empezar por ese la proxima vez.         */
  const CLAVE_ULT='manuscrito_ai_ultimo';
  function claveDe(prov){ try{ return localStorage.getItem(KEY+'_'+prov)||''; }catch(e){ return ''; } }
  function proveedoresDisponibles(){
    const orden=[];
    const sel=provider();
    let ult=''; try{ ult=localStorage.getItem(CLAVE_ULT)||''; }catch(e){}
    for(const p of [sel, ult, 'gemini', 'groq', 'cerebras', 'openrouter', 'mistral', 'xai', 'anthropic'])
      if(p && !orden.includes(p) && claveDe(p)) orden.push(p);
    return orden;
  }
  function esReintentable(msg){
    return /\b(503|429|500|502|504)\b|overload|saturad|high demand|unavailable|timeout|tard[oó] demasiado|red:/i.test(String(msg||''));
  }
  function conTope(pr, ms, quien){
    return Promise.race([pr, new Promise((_,rej)=>setTimeout(
      ()=>rej(new Error(quien+' tardó demasiado')), ms))]);
  }

  async function llamaGemini(key, system, user, maxTokens){
    // Google emite claves nuevas (AQ.Ab8...) y viejas (AIza...). Ambas van en cabecera.
    const MODELS=['gemini-flash-lite-latest','gemini-3.1-flash-lite','gemini-flash-latest'];
    let lastErr='';
    for(const mdl of MODELS){
      const url='https://generativelanguage.googleapis.com/v1beta/models/'+mdl+':generateContent';
      let r;
      try{
        r=await fetch(url,{method:'POST',
          headers:{'content-type':'application/json','x-goog-api-key':key},
          body:JSON.stringify({ system_instruction:{parts:[{text:system}]},
            contents:[{role:'user',parts:[{text:user}]}],
            generationConfig:{maxOutputTokens:maxTokens||2000, temperature:0.4} })});
      }catch(e){ lastErr='red: '+String(e.message||e); continue; }
      if(r.ok){
        const j=await r.json();
        const parts=(((j.candidates||[])[0]||{}).content||{}).parts||[];
        const txt=parts.map(p=>p.text||'').join('').trim();
        if(txt) return txt;
        lastErr='respuesta vacia'; continue;
      }
      const t=await r.text(); lastErr=r.status+': '+t.slice(0,120);
      if(r.status===401||r.status===403) break;   // clave mala: no insistir
    }
    if(/429|quota|RESOURCE_EXHAUSTED/i.test(lastErr)) throw new Error('Gemini 429: cuota agotada');
    throw new Error('Gemini '+lastErr);
  }
  async function llamaGroq(key, system, user, maxTokens){
    /* Los llama-3.x de Groq estan RETIRADOS: devolvian 404 y parecia culpa de
       la clave del usuario. Consultado /v1/models con una clave real, estos
       son los que hay. Se piden por orden de capacidad.                     */
    const MODELS=['openai/gpt-oss-120b','qwen/qwen3.8-27b','openai/gpt-oss-20b','groq/compound-mini'];
    let lastErr='';
    for(const mdl of MODELS){
      let r;
      try{
        r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',
          headers:{'content-type':'application/json','authorization':'Bearer '+key},
          body:JSON.stringify({model:mdl, max_tokens:maxTokens||2000, temperature:0.4,
            messages:[{role:'system',content:system},{role:'user',content:user}]})});
      }catch(e){ lastErr='red: '+String(e.message||e); continue; }
      if(r.ok){
        const j=await r.json();
        const txt=(((j.choices||[])[0]||{}).message||{}).content;
        if(txt&&txt.trim()) return txt.trim();
        lastErr='respuesta vacia'; continue;
      }
      const t=await r.text(); lastErr=r.status+': '+t.slice(0,140);
      if(r.status===401||r.status===403) break;
    }
    throw new Error('Groq '+lastErr);
  }
  async function llamaAnthropic(key, system, user, maxTokens){
    const r=await fetch('https://api.anthropic.com/v1/messages',{ method:'POST',
      headers:{'content-type':'application/json','x-api-key':key,
        'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:'claude-sonnet-4-5', max_tokens:maxTokens||2000,
        system, messages:[{role:'user',content:user}]}) });
    if(!r.ok){ const t=await r.text(); throw new Error('Claude '+r.status+': '+t.slice(0,160)); }
    const j=await r.json();
    const txt=(j.content||[]).map(b=>b.text||'').join('').trim();
    if(!txt) throw new Error('Claude respuesta vacia');
    return txt;
  }
  // Cerebras y OpenRouter hablan el mismo dialecto que Groq (OpenAI-compatible)
  function motorOpenAI(url, modelos, cabeceras){
    return async (key, system, user, maxTokens)=>{
      let lastErr='';
      for(const mdl of modelos){
        let r;
        try{
          r=await fetch(url,{method:'POST',
            headers:Object.assign({'content-type':'application/json','authorization':'Bearer '+key}, cabeceras||{}),
            body:JSON.stringify({model:mdl, max_tokens:maxTokens||2000, temperature:0.4,
              messages:[{role:'system',content:system},{role:'user',content:user}]})});
        }catch(e){ lastErr='red: '+String(e.message||e); continue; }
        if(r.ok){
          const j=await r.json();
          const txt=(((j.choices||[])[0]||{}).message||{}).content;
          if(txt&&txt.trim()) return txt.trim();
          lastErr='respuesta vacia'; continue;
        }
        const t=await r.text(); lastErr=r.status+': '+t.slice(0,140);
        if(r.status===401||r.status===403) break;
      }
      throw new Error(lastErr);
    };
  }
  const llamaCerebras=motorOpenAI('https://api.cerebras.ai/v1/chat/completions',
    ['llama-3.3-70b','qwen-3-32b','llama3.1-8b']);
  const llamaOpenRouter=motorOpenAI('https://openrouter.ai/api/v1/chat/completions',
    ['meta-llama/llama-3.3-70b-instruct:free','google/gemma-2-9b-it:free'],
    {'HTTP-Referer':location.origin,'X-Title':'Manuscrito'});
  /* xAI (Grok, con K) no es Groq (con Q): son empresas distintas con nombres
     casi iguales. Su API habla el mismo dialecto OpenAI, asi que comparte
     motor. Es de pago, pero queda lista por si el usuario consigue clave.  */
  const llamaXai=motorOpenAI('https://api.x.ai/v1/chat/completions',
    ['grok-4-fast','grok-3-mini','grok-2-latest']);
  const llamaMistral=motorOpenAI('https://api.mistral.ai/v1/chat/completions',
    ['mistral-small-latest','open-mistral-nemo']);
  const MOTORES={gemini:llamaGemini, groq:llamaGroq, cerebras:llamaCerebras,
                 openrouter:llamaOpenRouter, mistral:llamaMistral,
                 xai:llamaXai, anthropic:llamaAnthropic};
  const NOMBRES={gemini:'Gemini', groq:'Groq', cerebras:'Cerebras',
                 openrouter:'OpenRouter', mistral:'Mistral',
                 xai:'Grok (xAI)', anthropic:'Claude'};

  let avisoRelevo=null;                 // lo pone la app para contar el cambio
  function alRelevar(fn){ avisoRelevo=fn; }

  async function call(system, user, maxTokens){
    const orden=proveedoresDisponibles();
    if(!orden.length) throw new Error('Falta la API key');
    const fallos=[];
    for(let i=0;i<orden.length;i++){
      const prov=orden[i], motor=MOTORES[prov]; if(!motor) continue;
      try{
        const txt=await conTope(motor(claveDe(prov), system, user, maxTokens), 75000, NOMBRES[prov]);
        try{ localStorage.setItem(CLAVE_ULT, prov); }catch(e){}
        if(i>0 && avisoRelevo) avisoRelevo(NOMBRES[prov]);   // avisa que hubo relevo
        return txt;
      }catch(e){
        const msg=String(e.message||e);
        fallos.push(NOMBRES[prov]+': '+msg.slice(0,90));
        console.warn('IA '+prov+' falló:', msg);
        if(!esReintentable(msg) && !/401|403/.test(msg) && i===orden.length-1) break;
        // clave mala o error de verdad: igual se prueba el siguiente proveedor
      }
    }
    throw new Error(fallos.length>1
      ? ('Ningún proveedor respondió — '+fallos.join(' | '))
      : (fallos[0]||'La IA no respondió'));
  }


  function userNotes(){ const el=document.getElementById('aiNotes'); return (el&&el.value.trim())||''; }
  function depth(){ const el=document.getElementById('aiDepth'); return (el&&el.value)||'medio'; }
  const DEPTH_TXT={ corto:'Se breve: quedate con lo esencial.',
    medio:'Cubre los puntos importantes con detalle suficiente para estudiar.',
    completo:'Se exhaustivo: cubre TODO el contenido del documento sin perder temas.' };

  async function analyze(text){
    const out=await call('Eres un experto en analizar documentos de estudio. Responde SOLO JSON, sin markdown.',
      'Analiza este documento y devuelve JSON:' + '\n' +
      '{"tema":"tema principal","tipo":"apuntes|articulo|temario|examen|otro",' +
      '"estructura":["titulos, listas, tablas, definiciones, formulas, ejemplos"],' +
      '"secciones":["titulos o bloques principales, en orden"],' +
      '"sugerido":{"formato":"resumen|esquema|cornell|mapa|glosario|flashcards|boxing|outline|preguntas",' +
      '"tablas":[{"titulo":"","columnas":[""],"filas":[[""]]}],"motivo":"por que"}}' + '\n' +
      'En tablas incluye SOLO datos que en el documento esten claramente tabulados o comparados (max 2 tablas, 5 columnas). Si no hay, deja [].' +
      '\n\nDOCUMENTO:\n' + text.slice(0,14000), 2500);
    return JSON.parse(out.replace(/^```(json)?|```$/g,'').trim());
  }

  function baseSystem(){
    return 'Eres un experto en tomar apuntes de estudio en espanol. Reglas:' + '\n' +
      '- Fidelidad al documento: NO inventes contenido que no este.' + '\n' +
      '- Cubre el documento COMPLETO, no solo el principio.' + '\n' +
      '- Ordena por temas, con coherencia y sin repetir.' + '\n' +
      '- ' + DEPTH_TXT[depth()] + '\n' +
      (userNotes()? '- INSTRUCCIONES DEL USUARIO (maxima prioridad): '+userNotes()+'\n' : '') +
      'Devuelve SOLO el resultado pedido, sin preambulos ni markdown.';
  }

  async function format(text, fmt){
    const long=text.length>2500;
    const DOC='\n\nDOCUMENTO:\n';
    if(fmt==='cornell'){
      const out=await call(baseSystem()+' Responde SOLO JSON valido.',
        'Aplica el metodo Cornell a TODO el documento (no solo el inicio). Devuelve JSON: '+
        '{"cues":["pregunta o palabra clave"],"notes":["nota detallada"],"summary":"resumen final"}. '+
        'cues y notes deben tener la MISMA cantidad y cubrir el documento entero'+(long?' (usa entre 12 y 30 pares)':'')+DOC+text.slice(0,16000), 8000);
      const j=JSON.parse(out.replace(/^```(json)?|```$/g,'').trim());
      return {cues:j.cues||[], notes:j.notes||[], summary:j.summary||''};
    }
    if(fmt==='flashcards'){
      const out=await call(baseSystem()+' Responde SOLO JSON valido.',
        'Crea tarjetas de estudio que cubran TODO el documento. Devuelve JSON: [{"q":"pregunta","a":"respuesta"}]. '+(long?'Entre 12 y 24 tarjetas.':'Hasta 12 tarjetas.')+DOC+text.slice(0,16000), 6000);
      return JSON.parse(out.replace(/^```(json)?|```$/g,'').trim());
    }
    if(fmt==='boxing'){
      const out=await call(baseSystem()+' Responde SOLO JSON valido.',
        'Divide el contenido en ideas independientes, una por caja, cubriendo todo el documento. Cada idea: 1-3 frases con sentido propio. Devuelve JSON: ["idea 1","idea 2"]. '+(long?'Entre 8 y 16 cajas.':'Hasta 8 cajas.')+DOC+text.slice(0,16000), 5000);
      return JSON.parse(out.replace(/^```(json)?|```$/g,'').trim());
    }
    if(fmt==='mapa'){
      const out=await call(baseSystem()+' Responde SOLO JSON valido.',
        'Crea un mapa mental del documento. Devuelve JSON: {"center":"tema central","branches":[{"term":"subtema corto","frag":"idea clave de 4-9 palabras"}]}. Entre 5 y 8 ramas que representen los temas REALES y no se solapen.'+DOC+text.slice(0,16000), 2500);
      const j=JSON.parse(out.replace(/^```(json)?|```$/g,'').trim());
      return {center:j.center||'Tema', branches:j.branches||[]};
    }
    const inst=PROMPTS[fmt]||PROMPTS.resumen;
    return await call(baseSystem(), inst+(long?' Cubre el documento completo aunque ocupe varias paginas.':'')+DOC+text.slice(0,16000), 8000);
  }

  /* --- VISIÓN: localizar firma y/o sello en una foto --- */
  // la vision no depende del proveedor elegido para texto: usa la clave que la tenga
  function claveVision(){ return claveDe('gemini'); }
  async function findSignature(dataUrl, what){
    const key=claveVision();
    if(!key) throw new Error('Ver la foto requiere una clave de Gemini');
    let m=dataUrl.match(/^data:([^;,]*);base64,(.+)$/i);
    if(!m) throw new Error('Imagen no válida');
    let mime=(m[1]||'').toLowerCase();
    if(!mime.startsWith('image/')) mime='image/jpeg';      // algunos navegadores no ponen el tipo
    m=[m[0], mime, m[2]];
    const pedido = what==='both' ? 'la FIRMA manuscrita (garabato a mano) y el SELLO (timbre impreso)'
                 : what==='stamp' ? 'el SELLO (timbre impreso)'
                 : 'la FIRMA manuscrita (garabato a mano)';
    const prompt='Analiza esta foto y localiza '+pedido+'. Devuelve SOLO JSON, sin markdown.' + '\n' +
      'Formato: {"items":[{"type":"firma","box_2d":[ymin,xmin,ymax,xmax]}]}' + '\n' +
      'Coordenadas normalizadas 0-1000 en el orden [ymin, xmin, ymax, xmax].' + '\n' +
      'Un item POR CADA elemento. El recuadro debe cubrir el elemento COMPLETO, incluidas todas sus partes y el texto del sello.' + '\n' +
      'NO incluyas: teclado de laptop, mesa, bordes del cuaderno, renglones, cuadricula, sombras ni texto impreso del formulario.' + '\n' +
      'Si no encuentras nada, devuelve {"items":[]}.';
    const MODELS=['gemini-flash-lite-latest','gemini-3.1-flash-lite','gemini-flash-latest'];
    let r=null, lastErr='';
    const nap=ms=>new Promise(res=>setTimeout(res,ms));
    outer:
    for(const mdl of MODELS){
      const url='https://generativelanguage.googleapis.com/v1beta/models/'+mdl+':generateContent';
      // 503/429 = servidor saturado o cuota momentanea: reintenta con espera creciente
      for(let intento=0; intento<2; intento++){
        if(intento) await nap(600);
        try{
          r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},
            body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inline_data:{mime_type:m[1],data:m[2]}}]}],
              generationConfig:{maxOutputTokens:800,temperature:0}})});
        }catch(e){ lastErr='red: '+String(e.message||e); r=null; continue; }
        if(r.ok) break outer;
        const t=await r.text(); lastErr=r.status+': '+t.slice(0,120);
        const reintentable=(r.status===503||r.status===429||r.status===500);
        r=null;
        if(!reintentable) break;            // 400/403: cambiar de modelo no ayuda con esperas
      }
    }
    if(!r) throw new Error('Gemini vision '+lastErr);
    const j=await r.json();
    const txt=((((j.candidates||[])[0]||{}).content||{}).parts||[]).map(p=>p.text||'').join('').trim();
    const parsed=JSON.parse(txt.replace(/^```(json)?|```$/g,'').trim());
    return parsed.items||[];
  }

  async function chat(text, instruction){
    return await call('Eres un asistente que edita apuntes de estudio en espanol. Aplica EXACTAMENTE lo que pide el usuario sobre el texto dado. Devuelve SOLO el texto resultante, sin comentarios ni markdown.',
      'INSTRUCCION: '+instruction+String.fromCharCode(10)+String.fromCharCode(10)+'TEXTO:'+String.fromCharCode(10)+text.slice(0,16000), 8000);
  }


  /* ── LEER UNA PAGINA MIRANDOLA ───────────────────────────────────────────
     Una diapositiva que es solo imagen pierde su estructura al pasar por OCR:
     una tabla se convierte en numeros sueltos en fila y el diagrama
     desaparece. Aqui la pagina se manda como IMAGEN y el modelo la describe
     con las marcas del apunte, viendo la tabla en vez de adivinarla.
     Solo para las paginas que lo necesitan: mandar las 39 de un PDF dispara
     el consumo sin ganar nada en las que ya se leen bien.                   */
  async function leePaginaVisual(dataUrl, nPag){
    const key=claveVision();
    if(!key) throw new Error('La lectura visual necesita una clave de Gemini');
    let m=String(dataUrl||'').match(/^data:([^;,]*);base64,(.+)$/i);
    if(!m) throw new Error('Imagen no válida');
    let mime=(m[1]||'').toLowerCase(); if(!mime.startsWith('image/')) mime='image/png';
    const prompt=
      'Transcribe esta página de apuntes CONSERVANDO su estructura. Texto plano, sin markdown.\n'+
      'Reglas de formato:\n'+
      '- Título de sección: una línea en MAYÚSCULAS.\n'+
      '- Idea: línea que empieza por "• ". Detalle: línea que empieza por "    – ".\n'+
      '- TABLA: una línea por fila, celdas separadas por "|", cabecera con "|=".\n'+
      '    |= Columna | Columna\n    | dato | dato\n'+
      '  Si ves una tabla o una rejilla de datos, TIENE que salir así, nunca como texto corrido.\n'+
      '- FÓRMULA: línea que empieza por "$$ ", en texto plano legible sin LaTeX.\n'+
      '- Un gráfico o diagrama: una línea que empieza por "▸ " describiendo qué muestra.\n'+
      'No inventes nada que no esté en la imagen. Si la página está vacía, responde con una línea vacía.';
    const MODELS=['gemini-flash-lite-latest','gemini-3.1-flash-lite','gemini-flash-latest'];
    let lastErr='';
    for(const mdl of MODELS){
      const url='https://generativelanguage.googleapis.com/v1beta/models/'+mdl+':generateContent';
      let r;
      try{
        // sin plazo, una pagina lenta cuelga la lectura del PDF entero
        r=await conTope(fetch(url,{method:'POST',
          headers:{'content-type':'application/json','x-goog-api-key':key},
          body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inline_data:{mime_type:mime,data:m[2]}}]}],
            generationConfig:{maxOutputTokens:3000, temperature:0.1}})}), 40000, 'Gemini visión');
      }catch(e){ lastErr='red: '+String(e.message||e); continue; }
      if(r.ok){
        const j=await r.json();
        const parts=(((j.candidates||[])[0]||{}).content||{}).parts||[];
        const txt=parts.map(p2=>p2.text||'').join('').trim();
        if(txt) return limpiaApuntes(txt);
        lastErr='respuesta vacia'; continue;
      }
      const t=await r.text(); lastErr=r.status+': '+t.slice(0,120);
      if(r.status===401||r.status===403) break;
    }
    throw new Error('Gemini visión '+lastErr);
  }

  /* ── APUNTES INTELIGENTES ────────────────────────────────────────────────
     La IA lee el documento, decide QUE es y COMO conviene apuntarlo, y luego
     lo recorre entero por trozos manteniendo el hilo. Dos pasadas separadas
     (planificar y luego escribir) porque pedirle las dos cosas a la vez hace
     que se quede en el principio del documento: al tener el plan delante,
     cada trozo sabe que le toca y no repite ni se salta nada.                */
  function limpiaJSON(t){
    return String(t||'').replace(/^\s*```(json)?/i,'').replace(/```\s*$/,'').trim();
  }
  function trocea(texto, max){
    /* Corta por parrafos, nunca a mitad de frase, y NUNCA por dentro de una
       tabla, una formula o un mapa: partir una tabla deja media en un trozo y
       media en otro, y el modelo recibe filas huerfanas sin cabecera. Un
       bloque indivisible viaja entero aunque pase del tamano. */
    const indivisible=b=>/^\s*\|/m.test(b) || /^\s*\$\$/m.test(b) || /^\s*@@/m.test(b);
    const parr=texto.split(/\n\s*\n/); const trozos=[]; let cur='';
    const cierra=()=>{ if(cur.trim()) trozos.push(cur); cur=''; };
    for(const pz of parr){
      if(indivisible(pz)){
        // va solo, o pegado al trozo actual si cabe holgado
        if(cur && (cur.length+pz.length+2)>max){ cierra(); cur=pz; }
        else cur = cur ? (cur+'\n\n'+pz) : pz;
        continue;
      }
      if(cur && (cur.length+pz.length+2)>max){ cierra(); cur=pz; }
      else cur = cur ? (cur+'\n\n'+pz) : pz;
      while(cur.length>max*1.6 && !indivisible(cur)){   // parrafo gigante: por frases
        const corte=cur.lastIndexOf('. ', max); const at=corte>max*0.5?corte+1:max;
        trozos.push(cur.slice(0,at)); cur=cur.slice(at).trim();
      }
    }
    cierra();
    return trozos.length?trozos:[texto];
  }
  // ninguna llamada debe dejar la app colgada sin decir nada
  function conLimite(pr, ms, queHago){
    return Promise.race([pr, new Promise((_,rej)=>setTimeout(
      ()=>rej(new Error('La IA tardó demasiado '+queHago+' (puede estar saturada). Inténtalo otra vez.')), ms))]);
  }
  async function planApuntes(texto, instruccion){
    const muestra = texto.length>9000
      ? texto.slice(0,6000)+'\n\n[...continua...]\n\n'+texto.slice(-2500) : texto;
    const sys='Eres un estudiante experto en tomar apuntes. Analizas un documento y decides la mejor forma de apuntarlo. Respondes SOLO JSON valido, sin markdown.';
    const u='Analiza este documento y decide como conviene apuntarlo.\n'+
      'Devuelve {"tipo":"","formato":"","titulo":"","razon":"","tablas":false,"formulas":false,"secciones":["",""]}\n'+
      'tipo: que clase de documento es (apunte de clase, articulo cientifico, ley, manual, temario, receta, informe...).\n'+
      'formato: la estructura MAS UTIL para estudiar ESTE documento en concreto (esquema jerarquico, preguntas y respuestas, glosario de terminos, pasos numerados, tabla comparativa, linea de tiempo, casos practicos, ejercicios resueltos...). Elige segun el contenido, no por costumbre.\n'+
      'tablas: true si el contenido pide tablas (comparaciones, clasificaciones, datos con columnas).\n'+
      'formulas: true si el documento tiene formulas o calculos.\n'+
      'titulo: un titulo corto para los apuntes.\n'+
      'razon: en una frase, por que ese formato es el mejor aqui.\n'+
      'secciones: los bloques en que conviene dividir los apuntes, en orden, entre 3 y 12.\n'+
      (instruccion? ('El usuario pide ademas, con maxima prioridad: '+instruccion+'\n') : '')+
      '\nDOCUMENTO:\n'+muestra;
    // si el plan falla o tarda, se sigue igual con un formato razonable
    try{ return JSON.parse(limpiaJSON(await conLimite(call(sys,u,1200), 45000, 'analizando el documento'))); }
    catch(e){ console.warn('plan:',e); return {tipo:'documento', formato:'esquema jerarquico', titulo:'', secciones:[]}; }
  }
  /* ── LIMPIEZA DETERMINISTA ───────────────────────────────────────────────
     Buena parte del desorden no hace falta pedirselo al modelo: se arregla
     con reglas. Markdown que se cuela, vinetas de tres tipos distintos,
     lineas repetidas, titulos duplicados, sangrias descuadradas.            */
  function limpiaApuntes(t){
    let L=String(t||'').replace(/\r/g,'').split('\n');
    L=L.map(l=>{
      let x=l.replace(/^\s*#{1,6}\s*/,'')          // titulos markdown
             .replace(/\*\*(.+?)\*\*/g,'$1')       // negritas
             .replace(/(^|\s)\*(?!\s)(.+?)\*(?=\s|$)/g,'$1$2')
             .replace(/\s+$/,'');
      // OJO al orden: hay que mirar la SANGRIA antes de tocar la vineta, o una
      // subvineta sangrada se convierte en vineta de primer nivel y se pierde
      // la jerarquia del apunte
      const sub=/^(\s{2,}|\t)+[-–—*+·•]\s+/.test(x);
      if(sub) return x.replace(/^(\s|\t)*[-–—*+·•]\s+/,'    – ');
      return x.replace(/^\s*[-*+·]\s+/,'• ')       // toda vineta al mismo simbolo
              .replace(/^\s*•\s*•\s*/,'• ');       // vinetas dobles
    });
    const out=[]; const titulos=new Set(), vistas=new Set();
    const esTitulo=l=>/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 ,.:()\-]{5,}$/.test(l.trim());
    const norm=l=>l.trim().toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ0-9 ]/g,'').replace(/\s+/g,' ');
    for(const l of L){
      const t2=l.trim();
      if(out.length && t2 && t2===out[out.length-1].trim()) continue;
      if(esTitulo(l)){ const k=norm(l); if(titulos.has(k)) continue; titulos.add(k); }
      // una vineta identica repetida lejos tambien sobra (pasa al trocear)
      else if(/^(•|\s{4}–)\s/.test(l) && t2.length>12){
        const k=norm(l); if(vistas.has(k)) continue; vistas.add(k);
      }
      out.push(l);
    }
    return out.join('\n')
      .replace(/\n{3,}/g,'\n\n')                   // como mucho una linea en blanco
      .replace(/^\s+|\s+$/g,'');
  }

  /* ── REVISION CRUZADA ────────────────────────────────────────────────────
     Idea del usuario: que un modelo escriba y OTRO revise. Se usa un
     proveedor distinto al que escribio, y se le pide que devuelva los
     apuntes CORREGIDOS, no una critica: asi el resultado es directamente
     utilizable. Si no hay segundo proveedor, se salta sin ruido.            */
  async function revisaApuntes(texto, plan, instruccion){
    const disp=proveedoresDisponibles();
    let ult=''; try{ ult=localStorage.getItem(CLAVE_ULT)||''; }catch(e){}
    const otro=disp.find(p=>p!==ult);
    if(!otro) return null;                       // solo hay uno: no hay revisor
    const sys='Eres un corrector de apuntes de estudio. Devuelves SOLO los apuntes corregidos, sin comentarios ni preambulos.';
    const u='Revisa estos apuntes y devuelvelos CORREGIDOS. Arregla solo lo que este mal:\n'+
      '1. Apartados repetidos o solapados: fusionalos.\n'+
      '2. Ideas sueltas sin relacion con su apartado: muevelas al que toca.\n'+
      '3. Vinetas que en realidad son una tabla (comparan o clasifican): pasalas a tabla con "|=" y "|".\n'+
      '4. Formulas metidas dentro de un parrafo: sacalas a su linea con "$$ ".\n'+
      '5. Frases cortadas o sin sentido.\n'+
      '6. Orden: lo general antes que el detalle.\n'+
      'NO resumas mas, NO quites contenido, NO cambies las marcas de formato.\n'+
      'Marcas: MAYUSCULAS = seccion, "• " idea, "    – " detalle, "Termino: def", "¿" pregunta, "▸ " dato clave, "|" tabla, "$$ " formula.\n'+
      (instruccion? ('El usuario pidio: '+instruccion+'\n') : '')+
      '\nAPUNTES:\n'+texto;
    try{
      const motor=MOTORES[otro];
      const r=await conTope(motor(claveDe(otro), sys, u, 8000), 70000, NOMBRES[otro]);
      const lim=limpiaApuntes(r);
      // no aceptar una revision que se ha comido el contenido
      if(lim.length < texto.length*0.55) return null;
      return {texto:lim, revisor:NOMBRES[otro]};
    }catch(e){ console.warn('revision:', e); return null; }
  }
  async function apuntesInteligentes(texto, instruccion, aviso){
    const T=String(texto||'').trim();
    if(!T) throw new Error('No hay texto que leer');
    if(aviso) aviso('Leyendo el documento… ('+T.length.toLocaleString()+' caracteres)');
    const plan=await planApuntes(T, instruccion);
    if(aviso) aviso('Es '+(plan.tipo||'un documento')+'. Lo apunto como '+(plan.formato||'esquema')+'.');

    const MARCAS =
      'Formato de salida (texto plano, SIN markdown, SIN asteriscos):\n'+
      '- Titulo de seccion: una linea en MAYUSCULAS.\n'+
      '- Idea principal: linea que empieza por "• ".\n'+
      '- Detalle o ejemplo: linea que empieza por "    – ".\n'+
      '- Termino y definicion: "Termino: definicion".\n'+
      '- Pregunta de repaso: linea que empieza por "¿".\n'+
      '- Dato para recuadrar (fecha clave, definicion critica, regla): linea que empieza por "▸ ".\n'+
      '- TABLA: una linea por fila, celdas separadas por "|". La cabecera empieza por "|=".\n'+
      '    |= Variable | Tipo | Escala\n'+
      '    | Edad | Cuantitativa discreta | Razon\n'+
      '  Usa tabla SIEMPRE que el contenido compare cosas, clasifique, o tenga\n'+
      '  columnas en el original (tipos de variable, ventajas/desventajas,\n'+
      '  parametro vs estimador, tablas de frecuencia). Es mucho mas util que\n'+
      '  describir la comparacion en prosa.\n'+
      '- FORMULA: linea que empieza por "$$ ". Escribela en texto plano legible,\n'+
      '  sin LaTeX: "$$ media = (x1 + x2 + ... + xn) / n". Toda formula del\n'+
      '  documento debe aparecer asi, nunca metida dentro de un parrafo.\n';

    const trozos=trocea(T, 6000);
    const secc=(plan.secciones||[]).length? ('Plan de secciones acordado: '+plan.secciones.join(' | ')+'\n') : '';
    const salida=[];
    const titulos=[];                       // apartados ya escritos, para no repetirlos
    for(let i=0;i<trozos.length;i++){
      if(aviso) aviso('Escribiendo apuntes… parte '+(i+1)+' de '+trozos.length);
      const sys=baseSystem();
      const u='Estas tomando apuntes de un documento largo, por partes.\n'+
        'Tipo de documento: '+(plan.tipo||'documento')+'.\n'+
        'Formato elegido: '+(plan.formato||'esquema jerarquico')+'. Mantenlo en todas las partes.\n'+
        secc+
        (titulos.length? ('Apartados YA escritos, no los repitas ni los vuelvas a titular: '+titulos.join(' | ')+'\n'+
                          'Si uno de ellos continua en esta parte, sigue con sus vinetas SIN repetir el titulo.\n') : '')+
        'Esta es la parte '+(i+1)+' de '+trozos.length+'. Apunta TODO lo relevante de esta parte, '+
        'incluido lo que aparece al FINAL de la parte: no te quedes en los primeros apartados.\n'+
        (i===trozos.length-1? 'Es la ULTIMA parte: cierra el tema, no dejes apartados a medias.\n':'')+
        (i>0? 'No repitas el titulo general ni vuelvas a introducir el tema; continua.\n':
              (plan.titulo? ('Empieza con el titulo: '+plan.titulo+'\n'):''))+
        (instruccion? ('Instruccion del usuario, maxima prioridad: '+instruccion+'\n') : '')+
        (plan.tablas? 'Este documento PIDE tablas: usalas donde aporten.\n':'')+
        (plan.formulas? 'Este documento tiene formulas: recogelas TODAS con "$$ ".\n':'')+
        MARCAS+
        '\nPARTE '+(i+1)+' DEL DOCUMENTO:\n'+trozos[i];
      let r='';
      try{ r=await conLimite(call(sys,u,4000), 90000, 'escribiendo la parte '+(i+1)); }
      catch(e){ if(i===0) throw e;
        if(aviso) aviso('La IA falló en la parte '+(i+1)+'; te dejo lo escrito hasta aquí.');
        break; }                                   // si falla a mitad, guarda lo hecho
      r=String(r||'').trim();
      if(r){
        // el troceado a veces hace que el modelo vuelva a titular una seccion ya
        // empezada: se quita el titulo repetido y se conserva su contenido
        const esTitulo=l=>/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 ,.:()\-]{5,}$/.test(l.trim());
        const norm=l=>l.trim().toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ0-9 ]/g,'').replace(/\s+/g,' ');
        const yaHay=new Set(titulos.map(norm));
        const limpio=r.split('\n').filter(l=>!(esTitulo(l)&&yaHay.has(norm(l))));
        r=limpio.join('\n').replace(/\n{3,}/g,'\n\n').trim();
        if(r){ salida.push(r);
          for(const l of limpio) if(esTitulo(l)) titulos.push(l.trim()); }
      }
    }
    if(!salida.length) throw new Error('La IA no devolvio apuntes');
    let final=limpiaApuntes(salida.join('\n\n'));
    let revisor=null;
    if(document.getElementById('aiRevisar') && document.getElementById('aiRevisar').checked){
      if(aviso) aviso('Un segundo modelo está revisando los apuntes…');
      const rev=await revisaApuntes(final, plan, instruccion);
      if(rev){ final=rev.texto; revisor=rev.revisor; }
    }
    return { texto: final, plan, revisor };
  }

  return { getKey, setKey, enabled, format, findSignature, provider, analyze, chat, apuntesInteligentes,
           proveedoresDisponibles, alRelevar, NOMBRES, hayIA, limpiaApuntes, revisaApuntes, leePaginaVisual, claveVision };
})();
