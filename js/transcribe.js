/* transcribe.js — foto de apuntes largos + transcripción (texto o voz)
   → segmenta líneas y letras, las empareja con la transcripción y crea un nuevo tipo de letra. */
const TRANSCRIBE = (() => {
  let hooks = { createProfile:async()=>{}, getProfile:()=>null };
  function bind(h){ hooks=Object.assign(hooks,h); }

  let file=null, analysis=null, flat=[], assign=[];
  let recog=null, listening=false;

  function init(){
    document.getElementById('ntInput').addEventListener('change', e=>{ file=e.target.files[0]||null;
      document.getElementById('ntStatus').textContent = file?('Foto lista: '+file.name):''; });
    document.getElementById('ntMicBtn').addEventListener('click', toggleMic);
    document.getElementById('ntAnalyzeBtn').addEventListener('click', analyze);
    document.getElementById('ntSaveBtn').addEventListener('click', save);
  }

  /* ---- dictado por voz ---- */
  function toggleMic(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const st=document.getElementById('ntMicStatus'), btn=document.getElementById('ntMicBtn');
    if(!SR){ st.textContent='Tu navegador no soporta dictado por voz (usa Chrome o Edge).'; return; }
    if(listening){ recog.stop(); return; }
    recog=new SR(); recog.lang='es-ES'; recog.continuous=true; recog.interimResults=true;
    const ta=document.getElementById('ntText'); let base=ta.value;
    recog.onresult=e=>{ let fin=''; for(let i=e.resultIndex;i<e.results.length;i++) if(e.results[i].isFinal) fin+=e.results[i][0].transcript;
      if(fin){ base=(base+' '+fin).replace(/\s+/g,' ').trim(); ta.value=base; } };
    recog.onerror=e=>{ st.textContent='Error de micrófono: '+e.error; };
    recog.onend=()=>{ listening=false; btn.textContent='🎤 Dictar por voz'; st.textContent='Dictado detenido.'; };
    recog.start(); listening=true; btn.textContent='⏹ Detener dictado'; st.textContent='Escuchando… habla ahora.';
  }

  /* ---- análisis + emparejamiento ---- */
  async function analyze(){
    if(!file){ APP.toast('Sube primero la foto de tus apuntes'); return; }
    const text=document.getElementById('ntText').value.trim();
    if(!text){ APP.toast('Escribe o dicta la transcripción'); return; }
    APP.busy('Analizando la página…');
    try{
      const T=+document.getElementById('ntThresh').value;
      analysis=await SEGMENT.analyze(file, T, 1900);
      flat=analysis.flat;
      if(!flat.length){ APP.idle(); APP.toast('No detecté letras. Ajusta el umbral o mejora la foto.'); return; }
      // secuencia de caracteres de la transcripción (sin espacios)
      const chars=[...text].filter(c=>!/\s/.test(c));
      assign=flat.map((g,i)=> chars[i]||'');
      renderReview();
      const info=document.getElementById('ntSaveInfo');
      info.textContent=`${flat.length} recortes · ${chars.length} caracteres en la transcripción`;
      APP.idle();
    }catch(err){ console.error(err); APP.idle(); APP.toast('No pude analizar la foto'); }
  }

  function renderReview(){
    const host=document.getElementById('ntLines'); host.innerHTML='';
    document.getElementById('ntReview').hidden=false;
    let idx=0;
    analysis.lines.forEach((line,li)=>{
      const row=document.createElement('div'); row.className='nt-line';
      const tag=document.createElement('div'); tag.className='nt-line-tag muted sm'; tag.textContent='Línea '+(li+1);
      row.appendChild(tag);
      const strip=document.createElement('div'); strip.className='nt-strip';
      line.glyphs.forEach(g=>{
        const k=idx++;
        const cell=document.createElement('div'); cell.className='nt-cell';
        const cv=g.canvas; cv.className='nt-thumb'; cell.appendChild(cv);
        const inp=document.createElement('input'); inp.maxLength=2; inp.value=assign[k]||'';
        inp.oninput=()=>{ assign[k]=inp.value; };
        cell.appendChild(inp);
        strip.appendChild(cell);
      });
      row.appendChild(strip); host.appendChild(row);
    });
    document.getElementById('ntReview').scrollIntoView({block:'start'});
  }

  /* ---- crear nuevo tipo de letra ---- */
  async function save(){
    if(!flat.length){ APP.toast('Analiza la foto primero'); return; }
    const name=(document.getElementById('ntProfileName').value.trim())||'Tipo escaneado';
    const glyphs={}; let n=0;
    flat.forEach((g,i)=>{ const ch=(assign[i]||'').trim(); if(!ch) return;
      (glyphs[ch]=glyphs[ch]||[]).push(SEGMENT.toVariant(g,ch)); n++; });
    if(!n){ APP.toast('No hay letras etiquetadas para guardar'); return; }
    APP.busy('Creando tipo de letra…');
    await hooks.createProfile(name, glyphs);
    APP.idle();
    APP.toast(`Tipo de letra "${name}" creado con ${n} letras ✓`);
    document.getElementById('ntReview').hidden=true;
    document.getElementById('ntLines').innerHTML='';
    document.getElementById('ntText').value=''; document.getElementById('ntProfileName').value='';
    document.getElementById('ntInput').value=''; file=null; flat=[]; assign=[]; analysis=null;
    document.getElementById('ntStatus').textContent='';
  }

  return { init, bind };
})();
