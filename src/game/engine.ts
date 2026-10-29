// @ts-nocheck
// Логика игры «Хлебушек», перенесена из Hlebushek_Game.html. Работает с разметкой GameView.vue.
import { D } from './words'

/** Запускает игру на уже отрисованной разметке; возвращает функцию очистки. */
export function initGame() {
'use strict';
/* ---------- данные ---------- */
const CATS=[
  {id:'v',name:'Глаголы'},{id:'a',name:'Прилагательные'},{id:'q',name:'Вопросительные'},
  {id:'p',name:'Местоимения'},{id:'d',name:'Наречия и время'},{id:'n',name:'Числа и счёт'},
  {id:'l',name:'Над / под / рядом'},{id:'s',name:'Существительные'}
];
const W={v:[],a:[],q:[],p:[],d:[],n:[],l:[],s:[]};
D.V.forEach(r=>W.v.push({ko:r[0],rd:r[1],ru:r[2],pres:r[3],past:r[4],note:r[5],cat:'v'}));
D.A.forEach(r=>W.a.push({ko:r[0],rd:r[1],ru:r[2],pres:r[3],past:r[4],note:r[5],cat:'a'}));
['Q:q','P:p','D:d','N:n','L:l','S:s'].forEach(s=>{const [k,c]=s.split(':');D[k].forEach(r=>W[c].push({ko:r[0],rd:r[1],ru:r[2],cat:c}));});
const ALLW=Object.values(W).flat();
const FORMS=W.v.concat(W.a);
const byKo={};W.v.forEach(e=>byKo[e.ko]=e);

const MODES=[
  {id:'mix',icon:'🎲',name:'Микс'},{id:'word',icon:'🔤',name:'Слово → перевод'},
  {id:'rev',icon:'🔁',name:'Перевод → слово'},{id:'form',icon:'🔧',name:'Формы'},
  {id:'qw',icon:'❓',name:'Вопросы'},{id:'part',icon:'🧩',name:'Частицы и счёт'},
  {id:'build',icon:'🏗️',name:'Собери предложение'}
];

/* ---------- утилиты ---------- */
const $=(s,r)=>(r||document).querySelector(s);
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;};
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const rnd=a=>a[Math.floor(Math.random()*a.length)];
const head=x=>String(x.ru).split(/[ ,(]/)[0].toLowerCase();

/* ---------- состояние ---------- */
const LS='hleb_game_v1';
const S={
  mode:'mix',cats:{v:1,a:1,q:1,p:1,d:1,n:1,l:1,s:0},reading:true,auto:true,tense:'both',
  ses:{ok:0,bad:0,streak:0,best:0},all:{ok:0,bad:0,best:0,bestBlitz:0},miss:{},
  seenHelp:false,hist:[],cur:null,answered:false,tab:'hist',lastKey:null,timer:null,
  blitz:{on:false,left:60,ok:0,bad:0,iv:null}
};
function save(){try{localStorage.setItem(LS,JSON.stringify({cats:S.cats,reading:S.reading,auto:S.auto,tense:S.tense,mode:S.mode,all:S.all,miss:S.miss,seenHelp:S.seenHelp}));}catch(e){}}
function load(){try{const j=JSON.parse(localStorage.getItem(LS)||'null');if(!j)return;
  if(j.cats)Object.assign(S.cats,j.cats);
  ['reading','auto','tense','mode','seenHelp'].forEach(k=>{if(j[k]!==undefined)S[k]=j[k];});
  if(j.all)Object.assign(S.all,j.all);if(j.miss)S.miss=j.miss;}catch(e){}}
load();
if(!MODES.some(m=>m.id===S.mode))S.mode='mix';

/* ---------- выбор с весами (ошибки возвращаются чаще) ---------- */
function pickW(arr,keyFn){
  let pool=arr;
  if(arr.length>1) pool=arr.filter(x=>keyFn(x)!==S.lastKey);
  const w=pool.map(x=>{const m=S.miss[keyFn(x)];return 1+3*(m?m.n:0);});
  let r=Math.random()*w.reduce((a,b)=>a+b,0);
  for(let i=0;i<pool.length;i++){r-=w[i];if(r<=0)return pool[i];}
  return pool[pool.length-1];
}
function activePool(){
  const p=CATS.filter(c=>S.cats[c.id]).flatMap(c=>W[c.id]);
  return p.length>=4?p:ALLW;
}
function distract(correct,pool,n){
  const bad=[];const used=new Set([head(correct)]);
  const same=shuffle(pool.filter(x=>x.cat===correct.cat));
  const other=shuffle(pool);
  for(const x of same.concat(other,shuffle(ALLW))){
    if(bad.length>=n)break;
    if(x.ko===correct.ko)continue;
    const h=head(x);if(used.has(h))continue;
    used.add(h);bad.push(x);
  }
  return bad;
}
function formsPool(){
  const p=[];if(S.cats.v)p.push(...W.v);if(S.cats.a)p.push(...W.a);
  return p.length?p:FORMS;
}

/* ---------- хангыль: неверные «наивные» формы ---------- */
const jung=ch=>{const c=ch.charCodeAt(0)-0xAC00;return c<0||c>11171?-1:Math.floor((c%588)/28);};
const jong=ch=>{const c=ch.charCodeAt(0)-0xAC00;return c<0||c>11171?-1:c%28;};
function naive(e,tense){
  const stem=e.ko.slice(0,-1),last=stem[stem.length-1];
  const correct=tense==='pres'?e.pres:e.past;
  const eo=tense==='pres'?'어요':'었어요',a=tense==='pres'?'아요':'았어요';
  let c=stem+eo;
  const j=jung(last);
  if(c===correct||(jong(last)===0&&(j===20||j===13||j===16)))c=stem+a;
  return c;
}

/* ---------- генераторы вопросов ---------- */
function genWord(){
  const pool=activePool();
  const w=pickW(pool,x=>'w:'+x.ko);
  const dis=distract(w,pool,3);
  const opts=shuffle([w,...dis]).map(x=>({text:x.ru}));
  const lines=[];
  if(w.pres)lines.push(w.ko+' → '+w.pres+' / '+w.past);
  lines.push(w.ko+' · '+w.rd+' — '+w.ru);
  return {type:'choice',mode:'word',key:'w:'+w.ko,label:'Выбери перевод',prompt:w.ko,promptKo:true,reading:w.rd,
    options:opts,correct:opts.findIndex(o=>o.text===w.ru),right:w.ru,explain:lines,
    hp:w.ko,hr:w.ru,icon:'🔤'};
}
function genRev(){
  const pool=activePool();
  const w=pickW(pool,x=>'r:'+x.ko);
  const dis=distract(w,pool,3);
  const opts=shuffle([w,...dis]).map(x=>({text:x.ko,ko:true,sub:x.rd}));
  const lines=[w.ko+' · '+w.rd+' — '+w.ru];
  if(w.pres)lines.push(w.pres+' / '+w.past);
  return {type:'choice',mode:'rev',key:'r:'+w.ko,label:'Выбери слово по-корейски',prompt:w.ru,promptKo:false,
    options:opts,correct:opts.findIndex(o=>o.text===w.ko),right:w.ko,explain:lines,hp:w.ru,hr:w.ko,icon:'🔁'};
}
function genForm(){
  const pool=formsPool();
  const e=pickW(pool,x=>'f:'+x.ko);
  const tense=S.tense==='both'?rnd(['pres','past']):S.tense;
  const right=tense==='pres'?e.pres:e.past;
  const other=tense==='pres'?e.past:e.pres;
  const set=[right,other];
  const nv=naive(e,tense);if(!set.includes(nv))set.push(nv);
  let guard=0;
  while(set.length<4&&guard++<80){
    const x=rnd(FORMS);const f=tense==='pres'?x.pres:x.past;
    if(x.ko!==e.ko&&!set.includes(f))set.push(f);
  }
  const opts=shuffle(set).map(t=>({text:t,ko:true}));
  const tn=tense==='pres'?'настоящее время (-아요/어요)':'прошедшее время (-았어요/었어요)';
  return {type:'choice',mode:'form',key:'f:'+e.ko,label:'Поставь в форму: '+tn,prompt:e.ko,promptKo:true,
    reading:e.rd,sub:e.ru,options:opts,correct:opts.findIndex(o=>o.text===right),right:right,
    explain:[e.ko+' → '+right,e.note],hp:e.ko+' ('+(tense==='pres'?'наст.':'прош.')+')',hr:right,icon:'🔧'};
}
function genQw(){
  const i=pickW(D.QB.map((x,k)=>k),k=>'q:'+k);
  const q=D.QB[i];
  const dis=shuffle(D.QPOOL.filter(x=>x!==q[2])).slice(0,3);
  const opts=shuffle([q[2],...dis]).map(t=>({text:t,ko:true}));
  const parts=q[0].split('___');
  return {type:'choice',mode:'qw',key:'q:'+i,label:'Вставь вопросительное слово',sentence:{pre:parts[0],post:parts[1]},ru:q[1],
    options:opts,correct:opts.findIndex(o=>o.text===q[2]),right:q[2],explain:[q[0].replace('___',q[2]),q[1]],
    hp:q[0].replace('___','…'),hr:q[2],icon:'❓'};
}
function genPart(){
  const i=pickW(D.PB.map((x,k)=>k),k=>'p:'+k);
  const p=D.PB[i];
  const opts=shuffle(p[3]).map(t=>({text:t,ko:true}));
  const parts=p[0].split('___');
  return {type:'choice',mode:'part',key:'p:'+i,label:'Вставь частицу или слово',sentence:{pre:parts[0],post:parts[1]},ru:p[1],
    options:opts,correct:opts.findIndex(o=>o.text===p[2]),right:p[2],explain:[p[0].replace('___',p[2]),p[4]],
    hp:p[0].replace('___','…'),hr:p[2],icon:'🧩'};
}
function genBuild(){
  const i=pickW(D.T.map((x,k)=>k),k=>'s:'+k);
  const t=D.T[i];const v=byKo[t[3]];
  const tense=rnd(['pres','past']);
  const time=tense==='pres'?'매일':'어제';
  const vf=tense==='pres'?v.pres:v.past,ov=tense==='pres'?v.past:v.pres;
  const toks=[time,t[0]];if(t[1])toks.push(t[1]);toks.push(t[2],vf);
  const place=t[2];
  const sw=place.endsWith('에서')?place.slice(0,-2)+'에':(place.endsWith('에')?place+'서':null);
  const extra=(sw&&Math.random()<.5)?sw:ov;
  const tiles=shuffle(toks.concat([extra]));
  const ru=tense==='pres'?t[4]:t[5];
  return {type:'build',mode:'build',key:'s:'+i,label:'Собери предложение',ru:ru,toks:toks,tiles:tiles,
    right:toks.join(' '),explain:[toks.join(' ')+'.','Порядок: время → кто → что → где → глагол'],
    hp:ru,hr:toks.join(' '),icon:'🏗️'};
}
const GEN={word:genWord,rev:genRev,form:genForm,qw:genQw,part:genPart,build:genBuild};
function genQuestion(){
  let m=S.mode;
  if(m==='mix')m=rnd(['word','word','word','rev','rev','form','form','form','qw','part','part','build']);
  return GEN[m]();
}

/* ---------- отрисовка ---------- */
function renderQuestion(q){
  S.cur=q;S.answered=false;S.lastKey=q.key;
  clearTimeout(S.timer);
  const card=$('#card');card.innerHTML='';
  card.appendChild(el('div','label',q.label));
  if(q.type==='choice'){
    if(q.sentence){
      const p=el('div','sentence');
      p.append(q.sentence.pre);
      const gap=el('span','gap',' ___ ');gap.id='gap';p.append(gap,q.sentence.post);
      card.appendChild(p);card.appendChild(el('div','ruline',q.ru));
    }else{
      card.appendChild(el('div','prompt'+(q.promptKo?' ko':''),q.prompt));
      if(q.reading&&S.reading)card.appendChild(el('div','reading',q.reading));
      if(q.sub)card.appendChild(el('div','ruline',q.sub));
    }
    const opts=el('div','opts');opts.id='opts';
    q.options.forEach((o,i)=>{
      const b=el('button','opt');b.type='button';
      b.appendChild(el('span','k',String(i+1)));
      const tx=el('span','tx');tx.appendChild(el('span','t'+(o.ko?' ko':''),o.text));
      if(o.sub&&S.reading)tx.appendChild(el('span','sub',o.sub));
      b.appendChild(tx);b.addEventListener('click',()=>answerChoice(i));opts.appendChild(b);
    });
    card.appendChild(opts);
  }else{
    card.appendChild(el('div','prompt',q.ru));
    const slots=el('div','slots');slots.id='slots';card.appendChild(slots);
    const tiles=el('div','tiles');tiles.id='tiles';
    q.tiles.forEach((t,i)=>{const b=el('button','tile',t);b.type='button';b.dataset.i=i;b.addEventListener('click',()=>pickTile(i));tiles.appendChild(b);});
    card.appendChild(tiles);
    const acts=el('div','acts');
    const chk=el('button','primary','Проверить');chk.type='button';chk.id='chk';chk.addEventListener('click',checkBuild);
    const clr=el('button','ghost','Очистить');clr.type='button';clr.id='clr';clr.addEventListener('click',()=>{q.sel=[];drawBuild();});
    acts.append(chk,clr);card.appendChild(acts);
    card.appendChild(el('div','scheme','Одно слово лишнее. Порядок: время → кто → что → где → глагол'));
    q.sel=[];drawBuild();
  }
  const fb=el('div','feedback');fb.id='fb';fb.setAttribute('aria-live','polite');card.appendChild(fb);
}
function drawBuild(){
  const q=S.cur;const slots=$('#slots');slots.innerHTML='';slots.className='slots';
  q.sel.forEach((ti,pos)=>{
    const b=el('button','slot',q.tiles[ti]);b.type='button';
    b.addEventListener('click',()=>{if(S.answered)return;q.sel.splice(pos,1);drawBuild();});
    slots.appendChild(b);
  });
  document.querySelectorAll('#tiles .tile').forEach(b=>b.classList.toggle('used',q.sel.includes(+b.dataset.i)));
}
function pickTile(i){
  if(S.answered)return;const q=S.cur;if(q.sel.includes(i))return;
  q.sel.push(i);drawBuild();
}
function checkBuild(){
  if(S.answered)return;const q=S.cur;
  if(!q.sel.length)return;
  const ans=q.sel.map(i=>q.tiles[i]).join(' ');
  const ok=ans===q.right;
  document.querySelectorAll('#tiles .tile').forEach(b=>b.disabled=true);
  $('#slots').classList.add(ok?'ok':'bad');
  finish(ok,ans);
}
function answerChoice(i){
  if(S.answered)return;const q=S.cur;
  const ok=i===q.correct;
  const btns=document.querySelectorAll('#opts .opt');
  btns.forEach((b,k)=>{b.disabled=true;if(k===q.correct)b.classList.add('ok');else if(k===i)b.classList.add('bad');});
  const gap=$('#gap');
  if(gap){gap.textContent=q.right;gap.className='gap '+(ok?'ok':'bad');}
  if(!ok&&btns[i])btns[i].classList.add('shake');
  finish(ok,q.options[i].text);
}

/* ---------- ответ, статистика, история ---------- */
function finish(ok,chosen){
  S.answered=true;const q=S.cur;
  const A=S.all,B=S.ses;
  if(ok){B.ok++;A.ok++;B.streak++;if(B.streak>B.best)B.best=B.streak;if(B.streak>A.best)A.best=B.streak;
    const m=S.miss[q.key];if(m){m.n--;if(m.n<=0)delete S.miss[q.key];}
    if(A.ok%10===0){toast('🍞 Испёкся ещё один хлебушек!');const l=$('#nLoaf');l.classList.remove('pop');void l.offsetWidth;l.classList.add('pop');}
  }else{B.bad++;A.bad++;B.streak=0;
    const m=S.miss[q.key]||{n:0,l:''};m.n=Math.min(5,m.n+1);m.l=q.hp+' — '+q.hr;S.miss[q.key]=m;}
  if(S.blitz.on){if(ok)S.blitz.ok++;else S.blitz.bad++;}
  S.hist.unshift({ok:ok,icon:q.icon,p:q.hp,r:q.hr,you:ok?null:chosen});
  if(S.hist.length>150)S.hist.pop();
  save();updateStats();renderList();
  showFeedback(q,ok);
}
function showFeedback(q,ok){
  const fb=$('#fb');fb.className='feedback show '+(ok?'ok':'bad');fb.innerHTML='';
  const streak=S.ses.streak;
  fb.appendChild(el('div','fbh',ok?('Верно!'+(streak>=3?' 🔥 ×'+streak:'')):'Не так. Правильно: '+q.right));
  q.explain.forEach(t=>{if(t)fb.appendChild(el('div','fbt',t));});
  const x=el('div','fbx');const nb=el('button','primary','Дальше →');nb.type='button';nb.id='nextBtn';nb.addEventListener('click',next);
  x.appendChild(nb);fb.appendChild(x);
  nb.focus({preventScroll:true});
  const inB=S.blitz.on;
  if(ok&&(S.auto||inB)){
    const len=q.explain.join(' ').length;
    S.timer=setTimeout(next,inB?450:Math.min(3200,1000+len*22));
  }else if(!ok&&inB){S.timer=setTimeout(next,1100);}
}
function next(){
  clearTimeout(S.timer);
  if(S.blitz.on&&S.blitz.left<=0)return;
  renderQuestion(genQuestion());
}

function updateStats(){
  const B=S.ses,A=S.all;
  $('#nOk').textContent=B.ok;$('#nBad').textContent=B.bad;
  const tot=B.ok+B.bad;$('#nAcc').textContent=tot?Math.round(B.ok/tot*100)+'%':'–';
  $('#nStreak').textContent=B.streak;$('#nBest').textContent=Math.max(B.best,A.best);
  $('#nLoaf').textContent=Math.floor(A.ok/10);
  $('#loafTxt').textContent=(A.ok%10)+' / 10';
  $('#loafBar').style.width=((A.ok%10)*10)+'%';
  $('#allTime').textContent='За всё время: '+A.ok+' верно, '+A.bad+' неверно'+(A.bestBlitz?' · лучший блиц: '+A.bestBlitz:'');
}
function renderList(){
  const list=$('#list');list.innerHTML='';
  $('#tabHist').classList.toggle('on',S.tab==='hist');$('#tabWeak').classList.toggle('on',S.tab==='weak');
  if(S.tab==='hist'){
    if(!S.hist.length){list.appendChild(el('div','empty','Здесь появятся твои ответы: слово, перевод и что выбрал.'));return;}
    S.hist.forEach(h=>{
      const it=el('div','item '+(h.ok?'ok':'bad'));
      it.appendChild(el('span','mk',h.ok?'✓':'✗'));
      const b=el('div');
      const main=el('div');
      const ko=/[ㄱ-힝]/.test(h.p);
      main.appendChild(el('span',ko?'ko':'',h.p));main.append(' → ');
      main.appendChild(el('span',/[ㄱ-힝]/.test(h.r)?'ko':'',h.r));
      b.appendChild(main);
      if(!h.ok&&h.you)b.appendChild(el('div','you','ты: '+h.you));
      it.appendChild(b);list.appendChild(it);
    });
  }else{
    const ent=Object.values(S.miss).sort((a,b)=>b.n-a.n);
    if(!ent.length){list.appendChild(el('div','empty','Пока нет слабых мест. Ошибся в слове — оно появится здесь и будет выпадать чаще.'));return;}
    ent.forEach(m=>{
      const it=el('div','item bad');it.appendChild(el('span','mk','●'.repeat(Math.min(m.n,3))));
      it.style.gridTemplateColumns='36px 1fr';
      it.appendChild(el('div','',m.l));list.appendChild(it);
    });
  }
}

/* ---------- интерфейс ---------- */
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),1800);}
function drawModes(){
  const box=$('#modes');box.innerHTML='';
  MODES.forEach(m=>{
    const b=el('button','chip'+(S.mode===m.id?' on':''),m.icon+' '+m.name);b.type='button';
    b.addEventListener('click',()=>{S.mode=m.id;save();drawModes();next();});
    box.appendChild(b);
  });
}
function drawCats(){
  const box=$('#cats');box.innerHTML='';
  CATS.forEach(c=>{
    const lb=el('label',S.cats[c.id]?'on':'');
    const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!S.cats[c.id];
    cb.addEventListener('change',()=>{
      S.cats[c.id]=cb.checked?1:0;
      if(!Object.values(S.cats).some(Boolean)){S.cats[c.id]=1;cb.checked=true;}
      save();drawCats();
    });
    lb.append(cb,' '+c.name+' ('+W[c.id].length+')');box.appendChild(lb);
  });
}
function syncToggles(){
  $('#cbRead').checked=S.reading;$('#cbAuto').checked=S.auto;$('#tense').value=S.tense;
  $('#lbRead').classList.toggle('on',S.reading);$('#lbAuto').classList.toggle('on',S.auto);
}
$('#cbRead').addEventListener('change',e=>{S.reading=e.target.checked;save();syncToggles();if(S.cur&&!S.answered)renderQuestion(S.cur);});
$('#cbAuto').addEventListener('change',e=>{S.auto=e.target.checked;save();syncToggles();});
$('#tense').addEventListener('change',e=>{S.tense=e.target.value;save();});
$('#tabHist').addEventListener('click',()=>{S.tab='hist';renderList();});
$('#tabWeak').addEventListener('click',()=>{S.tab='weak';renderList();});
$('#resetBtn').addEventListener('click',()=>{
  if(!confirm('Сбросить весь прогресс: счёт, испечённые хлебушки и слабые слова?'))return;
  S.all={ok:0,bad:0,best:0,bestBlitz:0};S.miss={};S.ses={ok:0,bad:0,streak:0,best:0};S.hist=[];
  save();updateStats();renderList();next();
});

/* ---------- блиц ---------- */
function startBlitz(){
  clearInterval(S.blitz.iv);
  S.blitz={on:true,left:60,ok:0,bad:0,iv:null};
  $('#timer').classList.add('on');$('#timerBar').style.width='100%';
  $('#blitzBtn').textContent='⏹ Остановить блиц';
  S.blitz.iv=setInterval(()=>{
    S.blitz.left--;$('#timerBar').style.width=Math.max(0,S.blitz.left/60*100)+'%';
    if(S.blitz.left<=0)endBlitz();
  },1000);
  next();
}
function endBlitz(){
  clearInterval(S.blitz.iv);clearTimeout(S.timer);
  const b=S.blitz;b.on=false;
  $('#timer').classList.remove('on');$('#blitzBtn').textContent='⏱ Блиц 60 секунд';
  const tot=b.ok+b.bad;
  let rec='';
  if(b.ok>S.all.bestBlitz){S.all.bestBlitz=b.ok;rec=' Новый рекорд!';save();updateStats();}
  $('#overBig').textContent=b.ok;
  $('#overTxt').textContent='верных ответов за минуту. Неверных: '+b.bad+(tot?', точность '+Math.round(b.ok/tot*100)+'%':'')+'.'+rec;
  $('#over').classList.add('on');$('#overAgain').focus();
  if(S.cur)S.answered=true;
}
$('#blitzBtn').addEventListener('click',()=>{if(S.blitz.on)endBlitz();else startBlitz();});
$('#overAgain').addEventListener('click',()=>{$('#over').classList.remove('on');startBlitz();});
$('#overClose').addEventListener('click',()=>{$('#over').classList.remove('on');next();});

/* ---------- справка ---------- */
let helpFrom=null;
function openHelp(){
  if(S.blitz.on){toast('Сначала закончи блиц');return;}
  helpFrom=document.activeElement;
  clearTimeout(S.timer);
  $('#help').classList.add('on');$('#helpX').focus({preventScroll:true});$('#help .box').scrollTop=0;
}
function closeHelp(){
  $('#help').classList.remove('on');
  if(!S.seenHelp){S.seenHelp=true;save();}
  if(helpFrom&&helpFrom.focus)helpFrom.focus();
}
$('#helpBtn').addEventListener('click',openHelp);
$('#helpX').addEventListener('click',closeHelp);
$('#helpOk').addEventListener('click',closeHelp);
$('#help').addEventListener('click',e=>{if(e.target.id==='help')closeHelp();});

/* ---------- клавиши ---------- */
const onKeydown=e=>{
  if($('#help').classList.contains('on')){if(e.key==='Escape')closeHelp();return;}
  if($('#over').classList.contains('on'))return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const t=e.target;if(t&&(t.tagName==='SELECT'||t.tagName==='INPUT'))return;
  if(S.cur&&S.cur.type==='choice'&&!S.answered&&/^[1-4]$/.test(e.key)){
    const i=+e.key-1;if(i<S.cur.options.length){e.preventDefault();answerChoice(i);}
  }else if(S.cur&&S.cur.type==='build'&&!S.answered){
    if(e.key==='Enter'){e.preventDefault();checkBuild();}
    else if(e.key==='Backspace'){e.preventDefault();S.cur.sel.pop();drawBuild();}
  }else if(S.answered&&e.key==='Enter'&&!(t&&t.tagName==='BUTTON')){e.preventDefault();next();}
};
document.addEventListener('keydown',onKeydown);

/* ---------- старт ---------- */
drawModes();drawCats();syncToggles();updateStats();renderList();
renderQuestion(genQuestion());
if(!S.seenHelp)openHelp();
return ()=>{
  document.removeEventListener('keydown',onKeydown);
  clearInterval(S.blitz.iv);
  clearTimeout(S.timer);
  clearTimeout(toast.t);
};

}
