/* audio.js — transcribe audio a texto con IA Whisper (transformers.js, offline en el navegador).
   Inteligente con palabras confusas: Whisper decodifica por contexto, no letra por letra.
   Da opciones de resumen / apuntes y puede enviarlo a "Generar apuntes". */
const AUDIO = (() => {
  let hooks = { toGenerate:()=>{} };
  function bind(h){ hooks=Object.assign(hooks,h); }
  const val=id=>{ const e=document.getElementById(id); return e?e.value:''; };

  let audioFile=null, recBlob=null, transcript='';
  let mediaRec=null, recChunks=[], recStream=null;
  let asr=null, asrModel=null;

  function init(){
    const el=id=>document.getElementById(id);
    el('audInput').addEventListener('change', e=>{ const f=e.target.files[0]; if(f) setSource(f,'archivo: '+f.name); });
    el('audRecBtn').addEventListener('click', toggleRec);
    el('audRunBtn').addEventListener('click', transcribe);
    el('audFmtResumen').addEventListener('click', ()=>applyFmt('resumen'));
    el('audFmtEsquema').addEventListener('click', ()=>applyFmt('esquema'));
    el('audFmtIdeas').addEventListener('click', ()=>applyFmt('ideas'));
    el('audFmtOrig').addEventListener('click', ()=>{ el('audText').value=transcript; });
    el('audToGen').addEventListener('click', ()=>{
      const t=el('audText').value.trim(); if(!t){ APP.toast('No hay texto que enviar'); return; }
      hooks.toGenerate(t); APP.toast('Enviado a Generar apuntes ✍️');
    });
  }

  function setSource(blob, label){
    audioFile = (blob instanceof File)?blob:null; recBlob=(blob instanceof File)?null:blob;
    const p=document.getElementById('audPlayer');
    p.src=URL.createObjectURL(blob); p.hidden=false;
    document.getElementById('audSrc').textContent=label;
  }

  /* ---------- grabación con micrófono ---------- */
  async function toggleRec(){
    const btn=document.getElementById('audRecBtn');
    if(mediaRec && mediaRec.state==='recording'){ mediaRec.stop(); return; }
    try{
      recStream=await navigator.mediaDevices.getUserMedia({audio:true});
    }catch(e){ APP.toast('No pude acceder al micrófono'); return; }
    recChunks=[]; mediaRec=new MediaRecorder(recStream);
    mediaRec.ondataavailable=e=>{ if(e.data.size) recChunks.push(e.data); };
    mediaRec.onstop=()=>{ const blob=new Blob(recChunks,{type:mediaRec.mimeType||'audio/webm'});
      setSource(blob,'grabación ('+(blob.size/1024|0)+' KB)');
      recStream.getTracks().forEach(t=>t.stop());
      btn.textContent='🎤 Grabar'; btn.classList.remove('rec-on'); };
    mediaRec.start();
    btn.textContent='⏹ Detener'; btn.classList.add('rec-on');
  }

  /* ---------- decodifica cualquier audio a Float32 mono 16 kHz ---------- */
  async function decode(blob){
    const buf=await blob.arrayBuffer();
    const AC=window.AudioContext||window.webkitAudioContext;
    const ctx=new AC();
    const audio=await ctx.decodeAudioData(buf);
    const len=audio.length, ch=audio.numberOfChannels;
    let data=audio.getChannelData(0);
    if(ch>1){ data=new Float32Array(len);
      for(let c=0;c<ch;c++){ const d=audio.getChannelData(c); for(let i=0;i<len;i++) data[i]+=d[i]/ch; } }
    const target=16000;
    if(audio.sampleRate!==target){
      const off=new OfflineAudioContext(1, Math.max(1,Math.ceil(len*target/audio.sampleRate)), target);
      const b=off.createBuffer(1,len,audio.sampleRate); b.copyToChannel(data,0);
      const src=off.createBufferSource(); src.buffer=b; src.connect(off.destination); src.start();
      data=(await off.startRendering()).getChannelData(0);
    }
    ctx.close(); return data;
  }

  /* ---------- carga del modelo Whisper ---------- */
  async function loadASR(model){
    if(asr && asrModel===model) return asr;
    APP.busy('Cargando modelo de voz…');
    const tf=await LIBS.transformers();
    try{ tf.env.allowLocalModels=false; }catch(e){}
    let device='wasm';
    try{ if(navigator.gpu && await navigator.gpu.requestAdapter()) device='webgpu'; }catch(e){}
    asr=await tf.pipeline('automatic-speech-recognition', model, { device,
      progress_callback:p=>{ if(p&&p.status==='progress'&&p.progress!=null) APP.busy(`Descargando modelo… ${Math.round(p.progress)}%`); } });
    asrModel=model; APP.idle(); return asr;
  }

  /* ---------- transcribir ---------- */
  async function transcribe(){
    const blob=audioFile||recBlob;
    if(!blob){ APP.toast('Sube o graba un audio primero'); return; }
    try{
      const pipe=await loadASR(val('audModel'));
      APP.busy('Preparando audio…');
      const audio=await decode(blob);
      const mins=(audio.length/16000/60).toFixed(1);
      APP.busy(`Transcribiendo ${mins} min… (puede tardar)`);
      const opts={ chunk_length_s:30, stride_length_s:5, task:'transcribe' };
      const lang=val('audLang'); if(lang && lang!=='auto') opts.language=lang;
      const out=await pipe(audio, opts);
      transcript=(out.text||'').replace(/\s+/g,' ').trim();
      // limpieza ligera: capitaliza inicio de oración
      transcript=transcript.replace(/(^|[.!?¿¡]\s+)([a-záéíóúñ])/g,(m,a,b)=>a+b.toUpperCase());
      document.getElementById('audText').value=transcript;
      APP.idle(); APP.toast(transcript?'Transcripción lista ✓':'No se detectó voz');
    }catch(e){ console.error(e); APP.idle();
      APP.toast('Error al transcribir: '+(e.message||e)); }
  }

  function applyFmt(fmt){
    if(!transcript.trim()){ APP.toast('Transcribe un audio primero'); return; }
    document.getElementById('audText').value=SUMMARIZE.format(transcript,fmt);
  }

  return { init, bind };
})();
