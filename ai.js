/* ---------- ИИ-тренер: панель поверх приложения, выбор ИИ, голос, действия ----------
   ИИ на выбор:
   • Gemini (Google) — бесплатный ключ из Google AI Studio, дневной лимит бесплатных запросов;
   • Claude — ключ Anthropic API (платно);
   • Claude по подписке — только в версии на claude.ai, ключ не нужен.
   Ключи хранятся только на этом устройстве. */
"use strict";
const AI={turns:[],busy:false,ctl:null,sheet:null,rec:null,listening:false,dict:null,sample:null,done:[],state:"closed",unread:false};
const AI_KEY_LS="podhod:ai-key",AI_MODEL_LS="podhod:ai-model",AI_GKEY_LS="podhod:ai-gkey",AI_GMODEL_LS="podhod:ai-gmodel",AI_GLIST_LS="podhod:ai-glist",AI_PROV_LS="podhod:ai-provider";
const AI_MODELS=[["claude-sonnet-5-5","Sonnet 5.5 — быстрый и умный"],["claude-haiku-5-5","Haiku 5.5 — самый дешёвый"],["claude-opus-5-5","Opus 5.5 — самый умный, дороже"]];
const AI_GFALLBACK=["gemini-2.5-flash","gemini-2.5-pro","gemini-2.5-flash-lite"];
const AI_HAS_CLAUDE=!!(window.claude&&typeof window.claude.use==="function");
if(AI_HAS_CLAUDE){
  window.claude.use("sample").then(s=>{AI.sample=s;aiRefreshAll()}).catch(()=>{});
  window.claude.use("dictation").then(d=>{AI.dict=d;aiRefreshButtons()}).catch(()=>{});
}
function lsGet(k,d=""){try{return localStorage.getItem(k)||d}catch(e){return d}}
function lsSet(k,v){try{v?localStorage.setItem(k,v):localStorage.removeItem(k)}catch(e){}}
function aiKey(){return lsGet(AI_KEY_LS)}
function aiModel(){return lsGet(AI_MODEL_LS,AI_MODELS[0][0])}
function aiGKey(){return lsGet(AI_GKEY_LS)}
function aiGList(){try{const l=JSON.parse(lsGet(AI_GLIST_LS,"null"));if(Array.isArray(l)&&l.length)return l}catch(e){}return AI_GFALLBACK}
function aiGModel(){const m=lsGet(AI_GMODEL_LS);return m||aiGList()[0]}
function aiProviders(){const p=[];if(AI.sample)p.push(["claude-sub","Claude (подписка)"]);p.push(["gemini","Gemini"],["claude","Claude (ключ)"]);return p}
function aiProvider(){const p=lsGet(AI_PROV_LS);const ids=aiProviders().map(x=>x[0]);return ids.includes(p)?p:ids[0]}
function aiReady(){const p=aiProvider();return p==="claude-sub"?!!AI.sample:p==="gemini"?!!aiGKey():!!aiKey()}
const AI_SR=window.SpeechRecognition||window.webkitSpeechRecognition;
function aiCanVoice(){return!!(AI.dict||AI_SR)}

/* ---------- what Claude knows about the user ---------- */
function aiSetsText(sets,type){return sets.map(s=>(s.t==="w"?"р:":s.t==="d"?"д:":s.t==="f"?"о:":"")+setText(s,type)).join(", ")}
function aiContext(){
  const L=[];
  L.push("Сегодня: "+new Date().toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long",year:"numeric"}));
  L.push("Отдых по умолчанию: "+S.settings.rest+" с");
  L.push("\n## Каталог упражнений (id | название | мышцы | инвентарь | тип: wr=вес+повторения, bw=повторения, time=время)");
  for(const e of allExercises())L.push(`${e.id} | ${e.name} | ${e.muscle} | ${e.equip||""} | ${e.type}${e.builtin?"":" | своё"}`);
  L.push("\n## Программы пользователя");
  L.push(S.routines.length?S.routines.map(r=>`${r.id}: «${r.name}»${r.note?" ("+r.note+")":""} — `+r.items.map(it=>{const x=exInfo(it);return`${x.name} ${it.sets}×${it.r??"…"}${it.w!=null?" "+fmtN(it.w)+"кг":""}`}).join(", ")).join("\n"):"нет");
  L.push("\n## Текущая тренировка");
  if(S.active){
    L.push(`«${S.active.name}», идёт ${fmtDur((Date.now()-S.active.start)/1000)}`);
    S.active.exercises.forEach((e,i)=>L.push(`${i+1}. ${nm(e)} [${e.exId}] отдых ${e.rest}с — `+e.sets.map(s=>(s.done?"✓":"○")+setText(s,e.type||"wr")).join(", ")));
  }else L.push("не идёт");
  // per-exercise summary over the whole history
  const per=new Map();
  for(const w of S.workouts)for(const e of w.exercises){const k=e.exId;const b=bestOf(e.sets,e.type||"wr");const p=per.get(k)||{name:nm(e),type:e.type||"wr",n:0,last:w.start,w:0,e:0,r:0,s:0};p.n++;p.w=Math.max(p.w,b.w);p.e=Math.max(p.e,b.e);p.r=Math.max(p.r,b.r);p.s=Math.max(p.s,b.s);per.set(k,p)}
  L.push(`\n## Статистика по упражнениям (всего тренировок: ${S.workouts.length})`);
  L.push(per.size?[...per.entries()].map(([id,p])=>`${p.name} [${id}]: ${p.n} раз, последний ${new Date(p.last).toLocaleDateString("ru-RU")}, `+(p.type==="time"?`лучшее ${p.s}с`:p.type==="bw"?`макс. ${p.r} повт.`:`макс. вес ${fmtN(p.w)}кг, расч. 1ПМ ${fmtN(p.e)}кг`)).join("\n"):"нет данных");
  L.push("\n## Последние тренировки (р — разминка, д — дроп-сет, о — до отказа)");
  L.push(S.workouts.length?S.workouts.slice(0,25).map(w=>`${new Date(w.start).toLocaleDateString("ru-RU")} «${w.name}» ${fmtDur((w.end-w.start)/1000)}: `+w.exercises.map(e=>`${nm(e)} ${aiSetsText(e.sets,e.type||"wr")}`).join("; ")).join("\n"):"нет");
  return L.join("\n");
}
function aiSystem(){return`Ты — ИИ-тренер внутри приложения для тренировок «Подход». Пользователь пишет или говорит голосом по-русски.
Отвечай по-русски, коротко и по делу, как опытный тренер. Без таблиц и заголовков; списки — строками с «•»; можно **жирный**.

Ты умеешь менять данные приложения через инструменты:
• add_to_workout — добавить упражнения в текущую тренировку (если тренировки нет, она начнётся сама);
• log_set — записать выполненный подход («жим 80 на 8», «сделал 12 подтягиваний»);
• replace_in_workout, remove_from_workout — заменить или убрать упражнение в текущей тренировке;
• create_exercise — создать своё упражнение, когда подходящего нет в каталоге;
• create_routine — сохранить программу (шаблон тренировки); для плана на неделю создай по программе на каждый день;
• start_routine — начать тренировку по программе.
Правила:
• Если просят что-то сделать — сделай инструментом, а потом одной-двумя фразами скажи, что сделано. Не говори «сделал», если не вызвал инструмент.
• Сначала ищи упражнение в каталоге (с учётом синонимов: «жим лёжа» = Жим штанги лёжа). Создавай своё, только если похожего нет.
• Вес в килограммах. Если вес не назван, при добавлении не придумывай его — приложение само подставит прошлые результаты.
• Анализ прогресса и советы опирай на реальную историю ниже; если данных мало — так и скажи.
• Медицинских диагнозов не ставь; при боли советуй остановиться и обратиться к врачу.

Данные пользователя:
${aiContext()}`}

/* ---------- tools: what Claude can change ---------- */
const EX_ITEM={type:"object",properties:{exercise_id:{type:"string",description:"id из каталога"},sets:{type:"integer",minimum:1,maximum:20},weight:{type:"number",description:"кг"},reps:{type:"integer",description:"повторения (для типа time — секунды)"},rest_seconds:{type:"integer"},note:{type:"string"}},required:["exercise_id"]};
function aiEx(id){const x=exById(id);if(!x)throw new Error("Нет упражнения с id "+id+". Возьми id из каталога или создай упражнение через create_exercise.");return x}
function aiDone(t){AI.done.push(t)}
function aiAfterChange(){if(S.active)saveActive();if(S.tab==="workout"&&S.active)rerenderActive();else render()}
function aiFindInWorkout(id){const a=S.active;if(!a)throw new Error("Тренировка сейчас не идёт.");const i=a.exercises.findIndex(e=>e.exId===id);return i}
function aiStartIfNeeded(){if(!S.active){S.active={id:newId(),name:defaultName(),start:Date.now(),routineId:null,exercises:[]};saveActive(true);wake(true);S.tab="workout";aiDone("Начата тренировка")}}
const AI_TOOLS=[
 {name:"add_to_workout",description:"Добавить упражнения в текущую тренировку. Если тренировка не идёт — начать новую.",
  inputSchema:{type:"object",properties:{items:{type:"array",items:EX_ITEM,minItems:1}},required:["items"]},
  execute({items}){items.forEach(it=>aiEx(it.exercise_id));aiStartIfNeeded();
    for(const it of items){const x=exById(it.exercise_id);S.active.exercises.push(exEntry(x.id,it.sets||null,it.rest_seconds??null,{w:it.weight??null,r:it.reps??null,note:it.note||null}));aiDone("Добавлено: "+x.name)}
    aiAfterChange();return"Готово. В тренировке упражнений: "+S.active.exercises.length}},
 {name:"log_set",description:"Записать выполненный подход в текущую тренировку: заполнить следующий невыполненный подход упражнения и отметить галочкой (запускает таймер отдыха). Если упражнения нет в тренировке — добавить его.",
  inputSchema:{type:"object",properties:{exercise_id:{type:"string"},weight:{type:"number",description:"кг; для упражнений с собственным весом — доп. вес"},reps:{type:"integer"},seconds:{type:"integer"},count:{type:"integer",minimum:1,maximum:10,description:"сколько одинаковых подходов записать, по умолчанию 1"}},required:["exercise_id"]},
  execute({exercise_id,weight,reps,seconds,count}){const x=aiEx(exercise_id);aiStartIfNeeded();
    let i=aiFindInWorkout(x.id);if(i<0){S.active.exercises.push(exEntry(x.id,1,null));i=S.active.exercises.length-1;S.active.exercises[i].sets=[]}
    const e=S.active.exercises[i];const n=Math.max(1,count||1);
    for(let k=0;k<n;k++){let s=e.sets.find(z=>!z.done);if(!s){s={t:"n",w:null,r:null,s:null,done:false};e.sets.push(s)}
      if(weight!=null)s.w=weight;if(reps!=null)s.r=reps;if(seconds!=null)s.s=seconds;
      if((e.type||"wr")==="time"){if(!s.s)throw new Error("Нужны секунды")}else{if(!s.r)throw new Error("Нужно число повторений");if(e.type==="wr"&&s.w==null)s.w=0}
      delete s.auto;s.done=true}
    startRest(e.rest,nm(e));aiDone(`Записано: ${nm(e)} ${n>1?n+"× ":""}${setText(e.sets.filter(z=>z.done).slice(-1)[0],e.type||"wr")}`);
    aiAfterChange();return`Записано. ${nm(e)}: `+e.sets.map(s=>(s.done?"✓":"○")+setText(s,e.type||"wr")).join(", ")}},
 {name:"replace_in_workout",description:"Заменить упражнение в текущей тренировке другим (подходы сохраняются).",
  inputSchema:{type:"object",properties:{old_exercise_id:{type:"string"},new_exercise_id:{type:"string"}},required:["old_exercise_id","new_exercise_id"]},
  execute({old_exercise_id,new_exercise_id}){const i=aiFindInWorkout(old_exercise_id);if(i<0)throw new Error("Этого упражнения нет в тренировке");const x=aiEx(new_exercise_id);const e=S.active.exercises[i];const was=nm(e);
    Object.assign(e,{exId:x.id,name:x.name,muscle:x.muscle,type:x.type});aiDone(`Замена: ${was} → ${x.name}`);aiAfterChange();return"Заменено"}},
 {name:"remove_from_workout",description:"Убрать упражнение из текущей тренировки.",
  inputSchema:{type:"object",properties:{exercise_id:{type:"string"}},required:["exercise_id"]},
  execute({exercise_id}){const i=aiFindInWorkout(exercise_id);if(i<0)throw new Error("Этого упражнения нет в тренировке");const e=S.active.exercises.splice(i,1)[0];aiDone("Убрано: "+nm(e));aiAfterChange();return"Убрано"}},
 {name:"create_exercise",description:"Создать своё упражнение в каталоге. Возвращает его id.",
  inputSchema:{type:"object",properties:{name:{type:"string"},muscle:{type:"string",enum:MUSCLES},equipment:{type:"string",enum:EQUIP},type:{type:"string",enum:["wr","bw","time"],description:"wr — вес и повторения, bw — только повторения, time — время"}},required:["name","muscle","equipment","type"]},
  async execute({name,muscle,equipment,type}){name=String(name).trim().slice(0,80);if(!name)throw new Error("Пустое название");
    const same=allExercises().find(e=>e.name.toLowerCase()===name.toLowerCase());if(same)return{id:same.id,note:"Такое упражнение уже есть"};
    const obj={id:"c:"+newId(),name,muscle:MUSCLES.includes(muscle)?muscle:MUSCLES[0],equip:EQUIP.includes(equipment)?equipment:"Другое",type:["wr","bw","time"].includes(type)?type:"wr"};
    await put("custom",obj);aiDone("Создано упражнение: "+name);softRender();return{id:obj.id}}},
 {name:"create_routine",description:"Сохранить программу (шаблон тренировки) в «Мои программы».",
  inputSchema:{type:"object",properties:{name:{type:"string"},note:{type:"string"},items:{type:"array",items:EX_ITEM,minItems:1}},required:["name","items"]},
  async execute({name,note,items}){items.forEach(it=>aiEx(it.exercise_id));
    const r={id:newId(),name:String(name).trim().slice(0,80)||"Программа",note:note||"",created:Date.now(),items:items.map(it=>{const x=exById(it.exercise_id);return{exId:x.id,name:x.name,muscle:x.muscle,type:x.type,sets:Math.max(1,Math.min(20,it.sets||3)),rest:it.rest_seconds??S.settings.rest,w:it.weight??null,r:it.reps??null,note:it.note||""}})};
    await put("routines",r);aiDone("Создана программа: "+r.name);if(!(S.tab==="workout"&&S.active))render();return{id:r.id}}},
 {name:"start_routine",description:"Начать тренировку по программе пользователя.",
  inputSchema:{type:"object",properties:{routine_id:{type:"string"}},required:["routine_id"]},
  execute({routine_id}){if(S.active)throw new Error("Уже идёт тренировка — сначала её нужно завершить");const r=S.routines.find(x=>x.id===routine_id);if(!r)throw new Error("Нет программы с таким id");
    newActive(r.name,r.items.map(it=>exEntry(it.exId,it.sets,it.rest,it)),r.id);aiDone("Начата тренировка: "+r.name);return"Тренировка начата"}}
];

/* ---------- talking to Claude ---------- */
async function aiViaApi(system,turns,onText,signal){
  const msgs=turns.map(t=>({role:t.role,content:t.content}));
  const tools=AI_TOOLS.map(t=>({name:t.name,description:t.description,input_schema:t.inputSchema}));
  let shown="";
  for(let round=0;round<10;round++){
    let r;
    try{r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",signal,headers:{"content-type":"application/json","x-api-key":aiKey(),"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({model:aiModel(),max_tokens:4096,system,tools,messages:msgs})})}
    catch(e){if(e&&e.name==="AbortError")throw{code:"cancelled"};throw{code:"network",message:"Нет связи с сервером ИИ. Проверьте интернет."}}
    if(!r.ok){let m="";try{m=(await r.json()).error.message}catch(e){}
      throw{code:"http",message:r.status===401?"Ключ API не подходит. Проверьте его в настройках.":r.status===429?"Слишком много запросов — подождите минуту.":r.status===400&&/credit/i.test(m)?"На счёте Anthropic закончились деньги.":"Ошибка ИИ ("+r.status+"): "+m}}
    const d=await r.json();
    const text=d.content.filter(c=>c.type==="text").map(c=>c.text).join("").trim();
    if(text){shown+=(shown?"\n\n":"")+text;onText(shown)}
    msgs.push({role:"assistant",content:d.content});
    const uses=d.content.filter(c=>c.type==="tool_use");
    if(d.stop_reason!=="tool_use"||!uses.length)return shown;
    const results=[];
    for(const u of uses){const t=AI_TOOLS.find(x=>x.name===u.name);let out,err=false;
      try{out=await t.execute(u.input||{})}catch(e){out=(e&&e.message)||String(e);err=true}
      results.push({type:"tool_result",tool_use_id:u.id,content:typeof out==="string"?out:JSON.stringify(out),is_error:err})}
    msgs.push({role:"user",content:results});
  }
  return shown;
}
async function aiViaClaude(system,turns,onText,signal){
  const input=turns.map((t,k)=>k===0?{role:"user",content:system+"\n\n---\nСообщение пользователя:\n"+t.content}:t);
  try{const{text}=await AI.sample(input,{tools:AI_TOOLS,signal,cache:false,onText:({text})=>onText(text)});return text}
  catch(e){if(e&&e.code==="cancelled")throw e;throw{code:e&&e.code,message:e&&e.code==="not_granted"?"Доступ к Claude не разрешён для этой страницы.":e&&e.code==="rate_limited"?"Слишком много запросов — подождите немного.":"Ошибка ИИ: "+((e&&e.message)||"")}}
}

/* ---------- Gemini (Google) ---------- */
function aiGSchema(s){const o={};if(s.type)o.type=String(s.type).toUpperCase();if(s.description)o.description=s.description;if(s.enum)o.enum=s.enum;
  if(s.properties){o.properties={};for(const k in s.properties)o.properties[k]=aiGSchema(s.properties[k])}if(s.required)o.required=s.required;if(s.items)o.items=aiGSchema(s.items);return o}
const AI_G="https://generativelanguage.googleapis.com/v1beta/";
async function aiGErr(r){let m="",st="";try{const e=(await r.json()).error;m=e.message||"";st=e.status||""}catch(e){}
  if(r.status===400&&/API key|API_KEY/i.test(m))return"Ключ Gemini не подходит. Проверьте его в настройках.";
  if(r.status===403)return"Ключ Gemini не работает: "+m;
  if(r.status===429||st==="RESOURCE_EXHAUSTED")return"Бесплатный лимит Gemini на сейчас закончился. Подождите минуту или выберите другую модель в настройках (лимит у каждой свой).";
  if(r.status===404)return"Эта модель Gemini недоступна. Выберите другую в настройках.";
  if(r.status>=500)return"Gemini сейчас перегружен. Попробуйте ещё раз через минуту.";
  return"Ошибка Gemini ("+r.status+"): "+m}
async function aiGLoadModels(key){ // the list of models this key can use, newest first
  const r=await fetch(AI_G+"models?pageSize=200",{headers:{"x-goog-api-key":key}});if(!r.ok)throw new Error(await aiGErr(r));
  const d=await r.json();
  const ver=n=>{const m=n.match(/gemini-(\d+(?:\.\d+)?)/);return m?parseFloat(m[1]):0};
  const rank=n=>/flash-lite/.test(n)?1:/flash/.test(n)?0:/pro/.test(n)?2:3;
  const list=(d.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes("generateContent")).map(m=>m.name.replace(/^models\//,""))
    .filter(n=>/^gemini-/.test(n)&&!/embed|tts|image|audio|live|native|learnlm|robotics|computer/.test(n))
    .sort((a,b)=>ver(b)-ver(a)||rank(a)-rank(b)||(/preview|exp/.test(a)?1:0)-(/preview|exp/.test(b)?1:0)||a.localeCompare(b));
  if(list.length)lsSet(AI_GLIST_LS,JSON.stringify(list.slice(0,30)));
  const cur=lsGet(AI_GMODEL_LS);if(!cur||!list.includes(cur)){const stable=list.find(n=>/flash/.test(n)&&!/lite|preview|exp/.test(n))||list[0];if(stable)lsSet(AI_GMODEL_LS,stable)}
  return list;
}
async function aiViaGemini(system,turns,onText,signal){
  const contents=turns.map(t=>({role:t.role==="assistant"?"model":"user",parts:[{text:t.content}]}));
  const tools=[{functionDeclarations:AI_TOOLS.map(t=>({name:t.name,description:t.description,parameters:aiGSchema(t.inputSchema)}))}];
  let shown="";
  for(let round=0;round<10;round++){
    let r;
    try{r=await fetch(AI_G+"models/"+encodeURIComponent(aiGModel())+":generateContent",{method:"POST",signal,headers:{"content-type":"application/json","x-goog-api-key":aiGKey()},
      body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,tools})})}
    catch(e){if(e&&e.name==="AbortError")throw{code:"cancelled"};throw{code:"network",message:"Нет связи с Gemini. Проверьте интернет."}}
    if(!r.ok)throw{code:"http",message:await aiGErr(r)};
    const d=await r.json();const c=d.candidates&&d.candidates[0];
    if(!c||!c.content){if(shown)return shown;throw{code:"blocked",message:"Gemini не ответил"+(d.promptFeedback&&d.promptFeedback.blockReason?" (заблокировано фильтром)":"")+". Переформулируйте вопрос."}}
    const parts=c.content.parts||[];
    const text=parts.filter(p=>p.text&&!p.thought).map(p=>p.text).join("").trim();
    if(text){shown+=(shown?"\n\n":"")+text;onText(shown)}
    contents.push({role:"model",parts});
    const calls=parts.filter(p=>p.functionCall);
    if(!calls.length)return shown;
    const res=[];
    for(const p of calls){const fc=p.functionCall;const t=AI_TOOLS.find(x=>x.name===fc.name);let out;
      try{if(!t)throw new Error("Нет такого инструмента");const v=await t.execute(fc.args||{});out={result:v}}catch(e){out={error:(e&&e.message)||String(e)}}
      res.push({functionResponse:{name:fc.name,response:out}})}
    contents.push({role:"user",parts:res});
  }
  return shown;
}

/* ---------- panel UI: floats over the app, can be minimized to a bubble ---------- */
function aiMd(t){return esc(t).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>").replace(/^\s*[-*] /gm,"• ").replace(/\n/g,"<br>")}
const AI_CHIPS=["Составь программу на 3 дня в неделю","Разбери мой прогресс","Тренажёр занят — чем заменить?","Какой вес взять сегодня?","Добавь в тренировку жим лёжа 4 подхода"];
const AI_ICON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
function aiMsgsHtml(){
  if(!AI.turns.length)return`<div class="ai-hello"><p>Пишите или говорите: «добавь присед 5 по 5», «жим 80 на 8», «создай упражнение жим в Смите», «составь программу на массу». Панель можно свернуть кнопкой ⌄ и вернуться в любой момент.</p><div class="ai-chips">${AI_CHIPS.map(c=>`<button class="chip" data-aichip>${esc(c)}</button>`).join("")}</div></div>`;
  return AI.turns.map(t=>t.role==="user"?`<div class="ai-m me">${esc(t.content)}</div>`:`<div class="ai-m bot">${t.content?aiMd(t.content):""}${t.done&&t.done.length?`<div class="ai-done">${t.done.map(d=>`<span>✓ ${esc(d)}</span>`).join("")}</div>`:""}${t.err?`<div class="ai-err">${esc(t.err)}</div>`:""}${t.by?`<div class="ai-by">${esc(t.by)}</div>`:""}</div>`).join("");
}
function aiSetupHtml(){
  const p=aiProvider();
  if(p==="gemini")return`<div class="ai-hello"><b>Подключите Gemini — бесплатно</b>
    <p>1. Откройте <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> и войдите своим аккаунтом Google.<br>2. Нажмите <b>Create API key</b> и скопируйте ключ.<br>3. Вставьте его сюда — один раз, он сохранится на этом устройстве.</p>
    <div class="field" style="width:100%"><label for="ai-key-in">Ключ Gemini</label><input class="input" id="ai-key-in" type="password" autocomplete="off" placeholder="AIza…"></div>
    <button class="btn primary block" data-aisavekey>Сохранить и начать</button>
    <p class="small">Бесплатно, но с лимитом запросов в минуту и в день. Подписка Gemini (Google One) на этот лимит не влияет: Google не даёт другим приложениям пользоваться подпиской.</p></div>`;
  return`<div class="ai-hello"><b>Подключите Claude</b><p>Нужен ключ Anthropic API: console.anthropic.com → API Keys. Оплата с вашего счёта Anthropic, обычно центы за разговор. Ключ хранится только на этом устройстве.</p>
    <div class="field" style="width:100%"><label for="ai-key-in">Ключ Claude (sk-ant-…)</label><input class="input" id="ai-key-in" type="password" autocomplete="off" placeholder="sk-ant-…"></div>
    <button class="btn primary block" data-aisavekey>Сохранить и начать</button>
    <p class="small">Без ключа Claude работает в версии «Подхода» на claude.ai — через вашу подписку. Или выберите вверху бесплатный Gemini.</p></div>`;
}
function aiProvSelect(){return`<select class="ai-prov" data-aiprov aria-label="Какой ИИ">${aiProviders().map(([v,l])=>`<option value="${v}" ${v===aiProvider()?"selected":""}>${esc(l)}</option>`).join("")}</select>`}
function aiDraw(){
  const sh=AI.sheet;if(!sh)return;
  const sel=$("[data-aiprov]",sh.el);if(sel)sel.outerHTML=aiProvSelect();
  if(!aiReady()){sh.body.innerHTML=aiSetupHtml();$(".ai-foot",sh.el).hidden=true;return}
  $(".ai-foot",sh.el).hidden=false;
  sh.body.innerHTML=aiMsgsHtml()+(AI.busy?`<div class="ai-m bot ai-wait" id="ai-live">Думаю…</div>`:"");
  sh.body.scrollTop=sh.body.scrollHeight;
  aiRefreshButtons();
}
function aiRefreshButtons(){
  const sh=AI.sheet;
  if(sh){const mic=$("[data-aimic]",sh.el),send=$("[data-aisend]",sh.el);
    if(mic){mic.hidden=!aiCanVoice();mic.classList.toggle("on",AI.listening);mic.setAttribute("aria-pressed",String(AI.listening))}
    if(send){send.textContent=AI.busy?"Стоп":"Отправить";send.classList.toggle("danger",AI.busy);send.classList.toggle("primary",!AI.busy)}}
  const b=$("#ai-bubble");if(b){b.classList.toggle("busy",AI.busy);b.classList.toggle("unread",AI.unread)}
}
function aiRefreshAll(){aiRefreshButtons();if(AI.sheet)aiDraw()}
function aiBuild(){
  const el=document.createElement("div");el.className="ai-panel";el.setAttribute("role","dialog");el.setAttribute("aria-label","ИИ-тренер");
  el.innerHTML=`<div class="ai-head"><span class="ai-head-ic">${AI_ICON}</span>${aiProvSelect()}<span class="grow"></span><button class="ai-hb" data-aiclear aria-label="Новый разговор" title="Новый разговор"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg></button><button class="ai-hb" data-aimin aria-label="Свернуть" title="Свернуть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></button><button class="ai-hb" data-aiclose aria-label="Закрыть" title="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
  <div class="ai-body"></div>
  <div class="ai-foot"><button class="ai-mic" data-aimic aria-label="Сказать голосом" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg></button><textarea id="ai-in" rows="1" placeholder="Сообщение…" aria-label="Сообщение ИИ-тренеру"></textarea><button class="btn primary sm" data-aisend>Отправить</button></div>`;
  document.body.appendChild(el);
  AI.sheet={el,body:$(".ai-body",el)};
  const inp=$("#ai-in",el);
  const grow=()=>{inp.style.height="auto";inp.style.height=Math.min(120,inp.scrollHeight)+"px"};
  inp.addEventListener("input",grow);
  inp.addEventListener("keydown",ev=>{if(ev.key==="Enter"&&!ev.shiftKey&&!ev.isComposing){ev.preventDefault();aiSend()}});
  el.addEventListener("change",ev=>{if(ev.target.matches("[data-aiprov]")){lsSet(AI_PROV_LS,ev.target.value);aiDraw()}});
  el.addEventListener("click",async ev=>{
    const t=ev.target.closest("button");if(!t)return;
    if(t.hasAttribute("data-aimin")){aiMinimize();return}
    if(t.hasAttribute("data-aiclose")){aiClose();return}
    if(t.hasAttribute("data-aisend")){if(AI.busy){AI.ctl&&AI.ctl.abort();return}aiSend();return}
    if(t.hasAttribute("data-aimic")){aiMicToggle();return}
    if(t.hasAttribute("data-aichip")){inp.value=t.textContent;grow();aiSend();return}
    if(t.hasAttribute("data-aiclear")){if(AI.busy)return;AI.turns=[];aiDraw();return}
    if(t.hasAttribute("data-aisavekey")){await aiSaveKey(aiProvider(),($("#ai-key-in",el).value||"").trim(),t);aiDraw();return}
  });
  const bub=document.createElement("button");bub.id="ai-bubble";bub.hidden=true;bub.setAttribute("aria-label","Открыть ИИ-тренера");bub.innerHTML=AI_ICON;
  bub.addEventListener("click",ev=>{ev.stopPropagation();openAI()});
  document.body.appendChild(bub);
}
async function aiSaveKey(p,v,btn){
  if(p==="gemini"){
    if(!/^AIza[\w-]{20,}$/.test(v)){toast("Ключ Gemini начинается с AIza…");return false}
    if(btn){btn.disabled=true;btn.textContent="Проверяю ключ…"}
    try{await aiGLoadModels(v);lsSet(AI_GKEY_LS,v);toast("Gemini подключён");return true}
    catch(e){toast(e.message||"Ключ не подошёл");return false}
    finally{if(btn){btn.disabled=false;btn.textContent="Сохранить и начать"}}
  }
  if(!/^sk-ant-/.test(v)){toast("Ключ Claude начинается с sk-ant-");return false}
  lsSet(AI_KEY_LS,v);toast("Ключ сохранён");return true;
}
function openAI(opts={}){
  if(!AI.sheet)aiBuild();
  AI.state="open";AI.unread=false;AI.sheet.el.hidden=false;$("#ai-bubble").hidden=true;document.body.classList.add("ai-open");
  aiDraw();
  if(opts.listen&&aiReady())aiMicToggle();
  else if(aiReady()&&matchMedia("(hover:hover)").matches)setTimeout(()=>$("#ai-in").focus({preventScroll:true}),60);
}
function aiMinimize(){if(!AI.sheet)return;aiMicStop();AI.state="min";AI.sheet.el.hidden=true;$("#ai-bubble").hidden=false;document.body.classList.remove("ai-open");aiRefreshButtons()}
function aiClose(){if(!AI.sheet)return;aiMicStop();if(AI.ctl)AI.ctl.abort();AI.state="closed";AI.sheet.el.hidden=true;$("#ai-bubble").hidden=true;document.body.classList.remove("ai-open")}
async function aiSend(){
  const sh=AI.sheet;if(!sh||AI.busy)return;
  const inp=$("#ai-in",sh.el);const text=inp.value.trim();if(!text)return;
  aiMicStop();inp.value="";inp.style.height="auto";
  AI.turns.push({role:"user",content:text});AI.busy=true;AI.done=[];AI.ctl=new AbortController();aiDraw();
  const clean=[];for(const t of AI.turns.filter(t=>t.content).map(t=>({role:t.role,content:t.content}))){if(clean.length&&clean[clean.length-1].role===t.role)clean[clean.length-1].content+="\n\n"+t.content;else clean.push(t)}
  while(clean.length&&clean[0].role!=="user")clean.shift();
  const p=aiProvider();
  const reply={role:"assistant",content:"",done:null,by:p==="gemini"?aiGModel():p==="claude"?aiModel():"Claude"};
  try{
    const fn=p==="claude-sub"?aiViaClaude:p==="gemini"?aiViaGemini:aiViaApi;
    reply.content=await fn(aiSystem(),clean.slice(-20),txt=>{const l=$("#ai-live");if(l){l.innerHTML=aiMd(txt);l.classList.remove("ai-wait")}},AI.ctl.signal);
    if(!reply.content)reply.content=AI.done.length?"Готово.":"…";
  }catch(e){
    if(e&&e.code==="cancelled")reply.err="Остановлено";
    else reply.err=(e&&e.message)||"Не получилось связаться с ИИ";
  }
  reply.done=AI.done.slice();AI.turns.push(reply);AI.busy=false;AI.ctl=null;
  if(AI.state==="open")aiDraw();else{AI.unread=true;aiRefreshButtons();if(AI.state==="min")toast(reply.done.length?reply.done[reply.done.length-1]:"ИИ ответил — нажмите на кружок")}
}

/* ---------- voice ---------- */
function aiVoiceShow(partial){const sh=AI.sheet;if(!sh||!AI.v)return;const inp=$("#ai-in",sh.el);inp.value=AI.v.base+AI.v.finals+(partial||"");inp.dispatchEvent(new Event("input"))}
let aiHooked=false;
function aiDictHooks(){if(aiHooked)return;aiHooked=true;const d=AI.dict;
  d.onPartial(({text})=>aiVoiceShow(text));
  d.onFinal(({text})=>{if(AI.v)AI.v.finals+=text+" ";aiVoiceShow("")});
  d.onState(({state})=>{const was=AI.listening;AI.listening=state==="listening";aiRefreshButtons();if(was&&!AI.listening&&AI.autoSend){AI.autoSend=false;if(AI.sheet&&$("#ai-in",AI.sheet.el).value.trim())aiSend()}});
}
function aiMicToggle(){if(AI.listening)aiMicStop(true);else aiMicStart()}
function aiMicStart(){
  const sh=AI.sheet;if(!sh||AI.busy)return;const inp=$("#ai-in",sh.el);
  AI.v={base:inp.value?inp.value.replace(/\s*$/," "):"",finals:""};
  if(AI.dict){ // claude.ai: dictation capability (call start() synchronously from the tap)
    aiDictHooks();AI.listening=true;AI.autoSend=true;aiRefreshButtons();
    AI.dict.start().catch(e=>{AI.listening=false;aiRefreshButtons();toast(e&&e.code==="not_granted"?"Микрофон не разрешён":"Голосовой ввод недоступен")});
    return;
  }
  if(!AI_SR){toast("Голосовой ввод не поддерживается. Используйте микрофон на клавиатуре.");return}
  const rec=new AI_SR();rec.lang="ru-RU";rec.interimResults=true;rec.continuous=false;
  rec.onresult=ev=>{let part="";for(let k=ev.resultIndex;k<ev.results.length;k++){const r=ev.results[k];if(r.isFinal)AI.v.finals+=r[0].transcript+" ";else part+=r[0].transcript}aiVoiceShow(part)};
  rec.onerror=ev=>{if(ev.error==="not-allowed"||ev.error==="service-not-allowed")toast("Нет доступа к микрофону. Разрешите его в настройках браузера.");else if(ev.error!=="no-speech"&&ev.error!=="aborted")toast("Голосовой ввод: ошибка "+ev.error)};
  rec.onend=()=>{const send=AI.listening&&!AI.cancelVoice;AI.listening=false;AI.rec=null;AI.cancelVoice=false;aiRefreshButtons();if(send&&AI.sheet&&$("#ai-in",AI.sheet.el).value.trim())aiSend()};
  try{rec.start();AI.rec=rec;AI.listening=true;aiRefreshButtons()}catch(e){toast("Не удалось включить микрофон")}
}
function aiMicStop(send){ // send=true: the user tapped the mic to finish — send what was said
  if(!AI.listening)return;
  if(AI.dict){AI.autoSend=!!send;AI.dict.stop().catch(()=>{});return}
  if(AI.rec){AI.cancelVoice=!send;try{AI.rec.stop()}catch(e){}}
}

/* ---------- settings section & entry points ---------- */
function aiSettingsHtml(){
  const p=aiProvider();
  return`<p class="small muted" style="margin:0">Ключи хранятся только на этом устройстве и не уходят в облако «Подхода».${AI.sample?" В этой версии Claude работает через вашу подписку — ключ не нужен.":""}</p>
  <div class="field"><label for="ai-prov-set">Какой ИИ использовать</label><select class="select" id="ai-prov-set">${aiProviders().map(([v,l])=>`<option value="${v}" ${v===p?"selected":""}>${esc(l)}</option>`).join("")}</select></div>
  <div class="field"><label for="ai-gkey">Ключ Gemini — бесплатно на aistudio.google.com/apikey</label><input class="input" id="ai-gkey" type="password" autocomplete="off" placeholder="AIza…" value="${esc(aiGKey())}"></div>
  <div class="field"><label for="ai-gmodel">Модель Gemini</label><select class="select" id="ai-gmodel">${aiGList().map(m=>`<option ${m===aiGModel()?"selected":""}>${esc(m)}</option>`).join("")}</select></div>
  <div class="field"><label for="ai-key">Ключ Claude (Anthropic API, платно)</label><input class="input" id="ai-key" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(aiKey())}"></div>
  <div class="field"><label for="ai-model">Модель Claude</label><select class="select" id="ai-model">${AI_MODELS.map(([v,l])=>`<option value="${v}" ${v===aiModel()?"selected":""}>${esc(l)}</option>`).join("")}</select></div>`;
}
function aiSettingsBind(el){
  const pv=$("#ai-prov-set",el),gk=$("#ai-gkey",el),gm=$("#ai-gmodel",el),k=$("#ai-key",el),m=$("#ai-model",el);
  const fillG=()=>{gm.innerHTML=aiGList().map(x=>`<option ${x===aiGModel()?"selected":""}>${esc(x)}</option>`).join("")};
  pv.addEventListener("change",()=>{lsSet(AI_PROV_LS,pv.value);toast("Сохранено");if(AI.sheet)aiDraw()});
  gk.addEventListener("change",async()=>{const v=gk.value.trim();if(!v){lsSet(AI_GKEY_LS,"");toast("Ключ удалён");return}if(await aiSaveKey("gemini",v))fillG()});
  gm.addEventListener("change",()=>{lsSet(AI_GMODEL_LS,gm.value);toast("Сохранено")});
  k.addEventListener("change",async()=>{const v=k.value.trim();if(!v){lsSet(AI_KEY_LS,"");toast("Ключ удалён");return}await aiSaveKey("claude",v)});
  m.addEventListener("change",()=>{lsSet(AI_MODEL_LS,m.value);toast("Сохранено")});
  if(aiGKey())aiGLoadModels(aiGKey()).then(fillG).catch(()=>{});
}
(function aiMount(){
  if(typeof COACH!=="undefined"&&COACH)return; // the coach's page has no assistant
  // the AI button sits in the tab bar, between «История» and «Упражнения»
  const h=document.querySelector('#tabs [data-tab="history"]');
  if(h){const b=document.createElement("button");b.className="ai-tab";b.dataset.act="ai";b.setAttribute("aria-label","ИИ-тренер");
    b.innerHTML='<span class="ai-tab-ic">'+AI_ICON+'</span>ИИ';
    h.after(b);h.parentNode.classList.add("ai5")}
  document.addEventListener("click",ev=>{const t=ev.target.closest('[data-act="ai"],[data-act="ai-voice"]');if(!t)return;ev.stopPropagation();
    if(t.dataset.act==="ai"&&AI.state==="open"){aiMinimize();return}openAI({listen:t.dataset.act==="ai-voice"})},true);
})();
