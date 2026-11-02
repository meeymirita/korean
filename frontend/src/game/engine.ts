// @ts-nocheck
// Логика игры «Хлебушек», перенесена из Hlebushek_Game.html. Работает с разметкой GameView.vue.
import { D } from './words'
import { iconImg, MODE_ICON } from './icons'
import { makeBuild, parseBuildKey } from './build'
import { analyze } from '@/data/korean/parse'
import { EXCHANGES } from './dialogs'
import { syllableRows, syllableVowels } from '@/data/alphabet'
import { askConfirm } from '@/composables/useConfirm'
import { gsap } from 'gsap'
import { burst, cascade, pop } from '@/lib/fx'
import { motionCalm } from '@/lib/motion'

/** Запускает игру на уже отрисованной разметке; возвращает функцию очистки. */
/** hooks: общий прогресс сайта (record, importXp, state) — передаёт GameView. */
export function initGame(hooks) {
'use strict';
/* ---------- данные ---------- */
const CATS=[
  {id:'v',name:'Глаголы'},{id:'a',name:'Прилагательные'},{id:'q',name:'Вопросительные'},
  {id:'p',name:'Местоимения'},{id:'d',name:'Наречия и время'},{id:'n',name:'Числа и счёт'},
  {id:'l',name:'Над / под / рядом'},{id:'s',name:'Существительные'},
  {id:'w',name:'Время и дни'}
];
const W={v:[],a:[],q:[],p:[],d:[],n:[],l:[],s:[],w:[]};
D.V.forEach(r=>W.v.push({ko:r[0],rd:r[1],ru:r[2],pres:r[3],past:r[4],note:r[5],cat:'v'}));
D.A.forEach(r=>W.a.push({ko:r[0],rd:r[1],ru:r[2],pres:r[3],past:r[4],note:r[5],cat:'a'}));
['Q:q','P:p','D:d','N:n','L:l','S:s','W:w'].forEach(s=>{const [k,c]=s.split(':');D[k].forEach(r=>W[c].push({ko:r[0],rd:r[1],ru:r[2],cat:c}));});
const ALLW=Object.values(W).flat();
const FORMS=W.v.concat(W.a);
const byKo={};W.v.forEach(e=>byKo[e.ko]=e);

const MODES=[
  {id:'mix',icon:'🎲',name:'Микс'},{id:'word',icon:'🔤',name:'Слово → перевод'},
  {id:'rev',icon:'🔁',name:'Перевод → слово'},{id:'form',icon:'🔧',name:'Выбери форму'},
  {id:'qw',icon:'❓',name:'Вопросы'},{id:'part',icon:'🧩',name:'Частицы и счёт'},
  {id:'build',icon:'🏗️',name:'Собери предложение'},
  {id:'spot',icon:'🔍',name:'Найди верное'},{id:'type',icon:'⌨️',name:'Напиши правильную форму'},
  {id:'err',icon:'🕵️',name:'Найди ошибку'},{id:'pair',icon:'⚖️',name:'Пара или нет'},
  {id:'ord',icon:'↔️',name:'Порядок слов'},{id:'dlg',icon:'💬',name:'Диалог'},
  {id:'han',icon:'ㅎ',name:'Хангыль-блиц'},
  {id:'days',icon:'📅',name:'Дни недели'},{id:'when',icon:'🕒',name:'Когда? (에)'},{id:'too',icon:'➕',name:'Тоже (도)'},
  {id:'num',icon:'🔢',name:'Числа'},{id:'price',icon:'💴',name:'Сколько стоит?'},{id:'count',icon:'🥤',name:'Счётные слова'},
  {id:'neg',icon:'🙅',name:'Это или не это'},{id:'place',icon:'📍',name:'Куда, где'},{id:'dem',icon:'👉',name:'Этот, тот, вон тот'},{id:'polite',icon:'🙇',name:'Уровень вежливости'}
];

/* ---------- подсказки по режимам: кнопка «?» рядом с заданием раскрывает, что делать, и пример ---------- */
const MODE_HELP={
  word:['Видишь корейское слово — выбери его перевод на русский.','Пример: 마시다 → «пить».'],
  rev:['Видишь русское слово — выбери его по-корейски.','Пример: «пить» → 마시다.'],
  form:['Выбери верную форму глагола или прилагательного: настоящее или прошедшее время, вежливый стиль. Иногда форма стоит в предложении со словом «вчера» или «сейчас»: смотри на него.','Пример: 마시다 → настоящее 마셔요, прошедшее 마셨어요; «вчера» → 먹다 → 먹었어요.'],
  qw:['В предложении пропущено вопросительное слово: 어디 (где), 누구 (кто), 뭐 (что), 얼마 (сколько стоит), 몇 (сколько штук). Выбери подходящее по смыслу, ориентируйся на русский перевод.','Пример: 카페가 ___예요? «Где кафе?» → 어디.'],
  part:['Вставь пропущенную частицу (에, 에서, 을/를, 은/는…) или счётное слово. Смотри на русский перевод и на последнюю букву слова перед пропуском.','Пример: 저는 학교 ___ 가요. «Иду в школу» → 에.'],
  build:['Собери предложение из плиток: нажимай слова по порядку (или клавишами 1–9). Среди плиток есть лишние: с неверной частицей, временем или местом. Enter — проверить, Backspace — убрать последнее слово.','Пример: «Иду в парк» → 공원에 가요.'],
  spot:['Перед тобой несколько корейских предложений, верное только одно. Выбери его по русскому переводу.','Пример: «Иду в школу» → 학교에 가요 (верно), 학교에서 가요 (неверно).'],
  type:['Напиши форму глагола или прилагательного с клавиатуры (настоящее или прошедшее время) и нажми «Проверить» (или Enter). Не знаешь — «Подсказка» открывает ответ по одной букве.','Пример: «Напиши форму: 마시다» → 마셔요.'],
  err:['В предложении одно слово стоит неверно: не та частица или не то вопросительное слово. Нажми на это слово (оно подписано кнопкой с цифрой). Сравнивай с русским переводом под предложением.','Пример: 저는 빵이 먹어요 — «Я ем хлеб». Ошибка в слове «빵이»: объект действия требует 을, правильно «저는 빵을 먹어요». Значит, нажимаешь на 2 빵이.'],
  pair:['Из двух вариантов выбери верный: частицу, которая подходит к слову, или нужную форму.','Пример: 책 ___ → 을 (после согласной), а 커피 ___ → 를 (после гласной).'],
  ord:['Слово нужно поставить на своё место в предложении: выбери вариант, где порядок слов правильный. В корейском глагол стоит в конце.','Пример: «Я иду в школу» → 저는 학교에 가요, а не 가요 저는 학교에.'],
  dlg:['Прочитай реплику собеседника и выбери подходящий ответ.','Пример: «이름이 뭐예요?» → «저는 나나예요.»'],
  han:['Хангыль-блиц: собери слог из букв или выбери, как слог читается.','Пример: ㅂ + ㅏ → 바 [па/ба]; 가 читается «ка/га».'],
  days:['Дни недели, части дня и недели. Выбери перевод или корейское слово; иногда нужно сказать, какой день будет завтра или был вчера, или будни это или выходные.','Пример: 금요일 → «пятница»; сегодня 수요일, завтра → 목요일.'],
  when:['Частица 에 («когда?») ставится к слову, которое отвечает на вопрос «когда»: дни недели, утро, вечер, выходные. Но 오늘, 내일, 지금, 언제 без 에. Выбери нужную частицу или «ничего не нужно».','Пример: 금요일___ 친구를 만나요 → 에; 오늘___ 학교에 가요 → без частицы.'],
  too:['Частица 도 значит «тоже». Она ставится вместо 은/는, 이/가, 을/를 (вместе с ними не бывает), а с 에 и 에서 даёт 에도 и 에서도.','Пример: 저는 학생이에요. 나나 씨도 학생이에요; 토요일에 만나요. 일요일에도 만나요.'],
  num:['Числа бывают двух видов: корейские (하나, 둘, 셋…) для счёта вещей и китайские (일, 이, 삼…) для цен, дат, номеров. Выбери число или цифру.','Пример: 3 по-корейски (счёт) → 셋; 일곱 → 7; 100 → 백.'],
  price:['Цены читаются китайскими числами + 원: 천 (1000), 만 (10 000). Перед 만 цифру 일 не говорят. Выбери верное чтение цены или цену.','Пример: 3 500원 → 삼천오백 원; 10 000원 → 만 원.'],
  count:['Перед счётным словом (개, 병, 잔, 그릇) стоит корейское число в короткой форме: 한, 두, 세, 네. Выбери счётное слово или форму числа.','Пример: 물 한 병 주세요; 사과 세 개.'],
  neg:['Скажи по-корейски «это …» или «это не …». Есть 받침 (согласная внизу) → 이에요 и 이 아니에요, нет 받침 → 예요 и 가 아니에요. Смотри и на смысл: «это» или «не это».','Пример: «Это книга» → 책이에요; «Это не кофе» → 커피가 아니에요.'],
  place:['Выбери частицу при месте. 에 — куда идёшь (가요) и где находишься (있어요). 에서 — где что-то делаешь (공부해요, 운동해요, 먹어요).','Пример: 학교___ 가요 → 에; 도서관___ 공부해요 → 에서.'],
  dem:['이 / 그 / 저 («этот / тот / вон тот»), 이것 / 그것 / 저것 («эта вещь…») и 여기 / 거기 / 저기 («здесь / там / вон там»). Первое рядом со мной, второе рядом с собеседником, третье далеко от обоих.','Пример: «вон тот» → 저; «здесь» → 여기.'],
  polite:['«Спасибо» говорят по-разному: от друзей до начальника. Выбери форму для нужного собеседника или скажи, кому такая форма подходит.','Пример: другу → 고마워; начальнику → 감사합니다.']
};
function labelWithHelp(q){
  const wrap=el('div','labelrow');
  const lb=el('div','label',q.label);wrap.appendChild(lb);
  const h=MODE_HELP[q.mode];
  if(h){
    const b=el('button','qhelp','?');b.type='button';b.title='Что делать в этом задании';b.setAttribute('aria-label','Что делать в этом задании');b.setAttribute('aria-expanded','false');
    // первый раз в каждом режиме подсказка раскрыта сама, дальше только по «?»
    const first=!S.modeHelp[q.mode];if(first){S.modeHelp[q.mode]=1;save();}
    const box=el('div','mhelp');box.hidden=!first;if(first){b.classList.add('on');b.setAttribute('aria-expanded','true');}
    box.appendChild(el('div','',h[0]));box.appendChild(el('div','mex',h[1]));
    b.addEventListener('click',()=>{box.hidden=!box.hidden;b.setAttribute('aria-expanded',String(!box.hidden));b.classList.toggle('on',!box.hidden);});
    wrap.appendChild(b);wrap.appendChild(box);
  }
  return wrap;
}

/* ---------- утилиты ---------- */
const $=(s,r)=>(r||document).querySelector(s);
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;};
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const rnd=a=>a[Math.floor(Math.random()*a.length)];
const head=x=>String(x.ru).split(/[ ,(]/)[0].toLowerCase();

/* ---------- состояние ---------- */
const LS='hleb_game_v1';
const S={
  mode:'mix',level:'any',gloss:false,cats:{v:1,a:1,q:1,p:1,d:1,n:1,l:1,s:0,w:1},reading:true,tense:'both',
  ses:{ok:0,bad:0,streak:0,best:0},all:{ok:0,bad:0,best:0,bestBlitz:0,bestSurv:0,xp:0},miss:{},hints:3,
  surv:{on:false,lives:3,ok:0},lastOver:'blitz',
  seenHelp:false,modeHelp:{},hist:[],cur:null,answered:false,tab:'hist',lastKey:null,timer:null,
  blitz:{on:false,left:60,ok:0,bad:0,iv:null}
};
function save(){try{localStorage.setItem(LS,JSON.stringify({level:S.level,gloss:S.gloss,cats:S.cats,reading:S.reading,tense:S.tense,mode:S.mode,all:S.all,miss:S.miss,seenHelp:S.seenHelp,modeHelp:S.modeHelp}));}catch(e){}}
function load(){try{const j=JSON.parse(localStorage.getItem(LS)||'null');if(!j)return;
  if(j.cats)Object.assign(S.cats,j.cats);
  ['reading','tense','mode','seenHelp','modeHelp','level','gloss'].forEach(k=>{if(j[k]!==undefined)S[k]=j[k];});
  if(j.all)Object.assign(S.all,j.all);if(j.miss)S.miss=j.miss;}catch(e){}}
load();
/* очки старой версии игры переходят в общий прогресс сайта */
if(S.all.xp>0){hooks.importXp(S.all.xp);S.all.xp=0;save();}
/* группы слов можно выбрать в кабинете: они хранятся в общих настройках */
const sharedCats=hooks.cats&&hooks.cats();
if(sharedCats)Object.assign(S.cats,sharedCats);
const wantMode=hooks.mode&&hooks.mode();
if(wantMode&&MODES.some(m=>m.id===wantMode))S.mode=wantMode;
if(!MODES.some(m=>m.id===S.mode))S.mode='mix';
if(![1,2,3,'any'].includes(S.level))S.level='any';

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
  return {type:'choice',mode:'word',key:'w:'+w.ko,word:w.ko,label:'Выбери перевод',prompt:w.ko,promptKo:true,reading:w.rd,
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
  return {type:'choice',mode:'rev',key:'r:'+w.ko,word:w.ko,label:'Выбери слово по-корейски',prompt:w.ru,promptKo:false,
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
  return {type:'choice',mode:'form',key:'f:'+e.ko,word:e.ko,label:'Поставь в форму: '+tn,prompt:e.ko,promptKo:true,
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
const LEVEL_NAME={1:'простой',2:'средний',3:'сложный'};
/* перевод плитки: «дедушка + 는 — тема» */
const PART_ROLE={'은':'тема','는':'тема','이':'подлежащее','가':'подлежащее','을':'объект','를':'объект','에':'куда / где','에서':'где (действие)',
  '하고':'и / с','이에요':'быть','예요':'быть','도':'тоже','의':'чей','로':'чем / куда','으로':'чем / куда','와':'и / с','과':'и / с',
  '에게':'кому','한테':'кому','께':'кому','들':'мн. число','부터':'с','까지':'до'};
const TOKEN_OVERRIDE={'안':'не (отрицание)','제':'мой','내':'мой'};
const glossCache=new Map();
function tileGloss(tok){
  if(glossCache.has(tok))return glossCache.get(tok);
  let out;
  if(TOKEN_OVERRIDE[tok])out=TOKEN_OVERRIDE[tok];
  else out=analyze(tok).map(function(sg){
    if(sg.type==='unknown')return '?';
    if(sg.type==='particle'||sg.type==='ending')return sg.text+' — '+(PART_ROLE[sg.text]||'частица');
    let g=sg.gloss.replace(/ \(.*$/,'');
    if(/настоящее время/.test(sg.gloss))g+=' (наст.)';else if(/прошедшее время/.test(sg.gloss))g+=' (прош.)';
    return g;
  }).join(' + ');
  glossCache.set(tok,out);return out;
}
function genBuild(){
  const mode=S.tense==='pres'?'p':S.tense==='past'?'a':'b';
  let level,seed,tm=mode;
  const missed=Object.keys(S.miss).filter(k=>/^b:/.test(k)&&k!==S.lastKey);
  if(missed.length&&Math.random()<.3){
    const p=parseBuildKey(rnd(missed));
    if(p){level=p.level;tm=p.mode;seed=p.seed;}
  }
  if(!seed){level=S.level==='any'?rnd([1,2,2,3]):S.level;seed=1+Math.floor(Math.random()*2147483000);}
  const b=makeBuild(level,tm,seed);
  return {type:'build',mode:'build',key:b.key,level:level,label:'Собери предложение · '+LEVEL_NAME[level],ru:b.ru,tiles:b.tiles,
    accept:b.accept,right:b.right,note:b.note,explain:[b.right+'.',b.note],hp:b.ru,hr:b.right,icon:'🏗️'};
}

/* ---------- «Найди верное»: четыре предложения, верное одно ---------- */
function genSpot(){
  let key,ru,right,opts,note;
  if(Math.random()<.4){
    const i=pickW(D.QB.map((x,k)=>k),k=>'o:q'+k);const q=D.QB[i];
    const words=shuffle([q[2],...shuffle(D.QPOOL.filter(x=>x!==q[2])).slice(0,3)]);
    opts=words.map(w=>q[0].replace('___',w));right=q[0].replace('___',q[2]);ru=q[1];key='o:q'+i;note=q[1];
  }else{
    const i=pickW(D.PB.map((x,k)=>k),k=>'o:p'+k);const p=D.PB[i];
    opts=shuffle(p[3]).map(t=>p[0].replace('___',t));right=p[0].replace('___',p[2]);ru=p[1];key='o:p'+i;note=p[4];
  }
  const options=opts.map(t=>({text:t,ko:true}));
  return {type:'choice',mode:'spot',key:key,label:'Какое предложение верное?',prompt:ru,promptKo:false,
    options:options,correct:opts.indexOf(right),right:right,explain:[right,note],hp:ru,hr:right,icon:'🔍'};
}

/* ---------- «Напиши»: ответ вводится с клавиатуры ---------- */
function normRu(s){return String(s).toLowerCase().replace(/ё/g,'е').replace(/\([^)]*\)/g,' ').replace(/[^a-zа-я0-9가-힣 ]/g,' ').replace(/\s+/g,' ').trim();}
function ruAnswers(e){
  const out=new Set();
  e.ru.split(/[,;/]/).forEach(p=>{const n=normRu(p);if(n)out.add(n);});
  (e.ru.match(/\(([^)]*)\)/g)||[]).forEach(m=>{const n=normRu(m.slice(1,-1));if(n&&n.split(' ').length<=2)out.add(n);});
  return [...out];
}
function genType(){
  const forms=formsPool();
  /* «Напиши правильную форму»: только формы; перевод слова вводят в тренажёре «Напиши перевод» (запасной вариант, если форм нет) */
  if(forms.length){
    const e=pickW(forms,x=>'t:'+x.ko);
    const tense=S.tense==='both'?rnd(['pres','past']):S.tense;
    const right=tense==='pres'?e.pres:e.past;
    const tn=tense==='pres'?'настоящее время (-아요/어요)':'прошедшее время (-았어요/었어요)';
    return {type:'type',mode:'type',key:'t:'+e.ko+':'+tense,word:e.ko,label:'Напиши форму: '+tn,prompt:e.ko,promptKo:true,
      reading:e.rd,sub:e.ru,answers:[right],squash:true,right:right,placeholder:'한글로…',
      explain:[e.ko+' → '+right,e.note],hp:e.ko+' ('+(tense==='pres'?'наст.':'прош.')+')',hr:right,icon:'⌨️'};
  }
  const pool=activePool();
  const w=pickW(pool,x=>'t:'+x.ko);
  return {type:'type',mode:'type',key:'t:'+w.ko,word:w.ko,label:'Напиши перевод по-русски',prompt:w.ko,promptKo:true,
    reading:w.rd,answers:ruAnswers(w),right:w.ru,placeholder:'перевод…',
    explain:[w.ko+' · '+w.rd+' — '+w.ru],hp:w.ko,hr:w.ru,icon:'⌨️'};
}

/* ---------- «Найди ошибку»: нажми на слово, где ошибка ---------- */
function genErr(){
  let key,wrong,right,ru,note;
  if(Math.random()<.65){
    // варианты из двух слов («삼만 오천») не годятся: сломалась бы разбивка предложения на слова
    const i=pickW(D.PB.map((x,k)=>k).filter(k=>!/\s/.test(D.PB[k][2])),k=>'e:p'+k);const p=D.PB[i];
    const bad=rnd(p[3].filter(t=>t!==p[2]&&!/\s/.test(t)));
    wrong=p[0].replace('___',bad);right=p[0].replace('___',p[2]);ru=p[1];note=p[4];key='e:p'+i;
  }else{
    const i=pickW(D.QB.map((x,k)=>k),k=>'e:q'+k);const q=D.QB[i];
    const bad=rnd(D.QPOOL.filter(x=>x!==q[2]));
    wrong=q[0].replace('___',bad);right=q[0].replace('___',q[2]);ru=q[1];note='Нужно по смыслу: '+q[2];key='e:q'+i;
  }
  const a=wrong.split(' '),b=right.split(' ');
  const idx=a.findIndex((t,k)=>t!==b[k]);
  const opts=a.map(t=>({text:t,ko:true}));
  return {type:'choice',mode:'err',key:key,label:'Найди слово с ошибкой: нажми на него',prompt:wrong,promptKo:true,sub:'Нужно сказать: '+ru,
    options:opts,correct:idx,right:a[idx]+' → '+b[idx],explain:['Правильно: '+right,note],hp:wrong,hr:right,icon:'🕵️'};
}

/* ---------- «Пара или нет»: две частицы на выбор ---------- */
const PAIRS=[
  {a:'은',b:'는',role:'тема',ex:n=>n+'___ 뭐예요?',exRu:r=>'А что такое «'+r+'»?'},
  {a:'이',b:'가',role:'подлежащее',ex:n=>n+'___ 있어요.',exRu:r=>'Есть: '+r+'.'},
  {a:'을',b:'를',role:'объект действия',ex:n=>n+'___',exRu:r=>'«'+r+'» как объект (что?)'},
  {a:'이에요',b:'예요',role:'«это…»',ex:n=>n+'___.',exRu:r=>'Это «'+r+'».'}
];
const hasFinal=ch=>jong(ch)>0;
function genPair(){
  if(Math.random()<.35){
    const PP=D.PB.map((x,k)=>k).filter(k=>['에','에서','을','를','는','은'].includes(D.PB[k][2]));
    const i=pickW(PP,k=>'pr:p'+k);const p=D.PB[i];
    const twin={'에':'에서','에서':'에','을':'를','를':'을','는':'은','은':'는'}[p[2]];
    const opts=shuffle([p[2],twin]).map(t=>({text:t,ko:true}));
    const parts=p[0].split('___');
    return {type:'choice',mode:'pair',key:'pr:p'+i,label:'Какая частица? Выбери одну из двух',sentence:{pre:parts[0],post:parts[1]},ru:p[1],
      options:opts,correct:opts.findIndex(o=>o.text===p[2]),right:p[2],explain:[p[0].replace('___',p[2]),p[4]],
      hp:p[0].replace('___','…'),hr:p[2],icon:'⚖️'};
  }
  const nouns=W.s.filter(e=>/^[가-힣]+$/.test(e.ko));
  const e=pickW(nouns,x=>'pr:'+x.ko);
  const pr=rnd(PAIRS);
  const fin=hasFinal(e.ko[e.ko.length-1]);
  const right=fin?pr.a:pr.b;
  const opts=shuffle([pr.a,pr.b]).map(t=>({text:t,ko:true}));
  const parts=pr.ex(e.ko).split('___');
  const why=fin?'есть 받침 (согласная внизу) → '+pr.a:'нет 받침 (слог кончается на гласную) → '+pr.b;
  return {type:'choice',mode:'pair',key:'pr:'+e.ko+':'+pr.a,word:e.ko,label:'Выбери форму: '+pr.a+' или '+pr.b+' ('+pr.role+')',
    sentence:{pre:parts[0],post:parts[1]},ru:pr.exRu(e.ru),options:opts,correct:opts.findIndex(o=>o.text===right),right:right,
    explain:[pr.ex(e.ko).replace('___',right),e.ko+': '+why],hp:pr.ex(e.ko).replace('___','…'),hr:right,icon:'⚖️'};
}

/* ---------- «Порядок слов»: куда поставить слово ---------- */
function genOrd(){
  for(let t=0;t<30;t++){
    const level=rnd([2,2,3]);
    const seed=1+Math.floor(Math.random()*2147483000);
    const tm=S.tense==='pres'?'p':S.tense==='past'?'a':'b';
    const b=makeBuild(level,tm,seed);
    const toks=b.right.split(' ');
    if(toks.length<3)continue;
    const k=Math.floor(Math.random()*toks.length);
    const word=toks[k],rest=toks.filter((x,i)=>i!==k);
    const seen=new Set(),good=[],bad=[];
    for(let p=0;p<=rest.length;p++){
      const arr=rest.slice();arr.splice(p,0,word);
      const sent=arr.join(' ');
      if(seen.has(sent))continue;seen.add(sent);
      (b.accept.includes(sent)?good:bad).push(sent);
    }
    if(bad.length<2)continue;
    const right=good.includes(b.right)?b.right:good[0];
    const texts=shuffle([right,...shuffle(bad).slice(0,3)]);
    return {type:'choice',mode:'ord',key:'od:'+b.key+'|'+k,label:'Куда поставить слово «'+word+'»? Выбери верный порядок',
      prompt:b.ru,promptKo:false,options:texts.map(x=>({text:x,ko:true})),correct:texts.indexOf(right),right:right,
      explain:[right+'.',b.note],hp:b.ru,hr:right,icon:'↔️'};
  }
  return genSpot();
}

/* ---------- «Диалог»: выбери ответ на реплику ---------- */
function genDlg(){
  const i=pickW(EXCHANGES.map((x,k)=>k),k=>'d:'+k);
  const x=EXCHANGES[i];
  const dis=shuffle(EXCHANGES.filter(y=>y[4]!==x[4])).slice(0,2);
  const texts=shuffle([x[2],...dis.map(y=>y[2])]);
  return {type:'choice',mode:'dlg',key:'d:'+i,label:'Выбери подходящий ответ',prompt:x[0],promptKo:true,sub:x[1],
    options:texts.map(t=>({text:t,ko:true})),correct:texts.indexOf(x[2]),right:x[2],
    explain:[x[0]+' → '+x[2],x[3]],hp:x[0],hr:x[2],icon:'💬'};
}

/* ---------- «Прошедшее время»: вчера или сейчас ---------- */
const TIME_PAST=[['어제','Вчера']];
const TIME_PRES=[['지금','Сейчас'],['오늘','Сегодня'],['매일','Каждый день']];
function genPast(){
  const e=pickW(FORMS,x=>'ps:'+x.ko);
  const past=Math.random()<.7;
  const tw=rnd(past?TIME_PAST:TIME_PRES);
  const right=past?e.past:e.pres,other=past?e.pres:e.past;
  const set=[right,other];
  const nv=naive(e,past?'past':'pres');if(!set.includes(nv))set.push(nv);
  let guard=0;
  while(set.length<4&&guard++<80){const x=rnd(FORMS);const f=past?x.past:x.pres;if(x.ko!==e.ko&&!set.includes(f))set.push(f);}
  const opts=shuffle(set).map(t=>({text:t,ko:true}));
  const kind=e.cat==='a'?'прилагательное':'глагол';
  return {type:'choice',mode:'form',key:'ps:'+e.ko+':'+(past?'a':'p'),word:e.ko,label:'Выбери форму: '+tw[0]+' — '+(past?'прошедшее (-았어요/었어요)':'настоящее (-아요/어요)'),
    sentence:{pre:tw[0]+' ',post:''},ru:tw[1]+': '+e.ru+' ('+kind+' '+e.ko+')',options:opts,correct:opts.findIndex(o=>o.text===right),
    right:right,explain:[tw[0]+' '+right,e.ko+' → '+right,e.note],hp:tw[0]+' '+e.ko,hr:right,icon:'⏳'};
}

/* ---------- «Хангыль-блиц»: слог из букв и чтение слога ---------- */
const HAN_C=[0,2,3,5,6,7,9,11,12,14,15,16,17,18],HAN_V=[0,2,4,6,8,12,13,17,18,20];
const HAN=[];
HAN_C.forEach(c=>HAN_V.forEach(v=>{const cell=syllableRows[c].cells[v];HAN.push({ch:cell.char,rd:cell.reading,hint:cell.hint,c:c,v:v});}));
function genHan(){
  const h=pickW(HAN,x=>'h:'+x.ch);
  const near=shuffle(HAN.filter(x=>x.ch!==h.ch&&(x.c===h.c||x.v===h.v)));
  if(Math.random()<.5){
    const dis=near.slice(0,3);
    const opts=shuffle([h,...dis]).map(x=>({text:x.ch,ko:true}));
    return {type:'choice',mode:'han',key:'h:'+h.ch,label:'Собери слог из букв',prompt:h.hint,promptKo:true,
      options:opts,correct:opts.findIndex(o=>o.text===h.ch),right:h.ch,explain:[h.hint+' = '+h.ch+' ('+h.rd+')'],
      hp:h.hint,hr:h.ch,icon:'ㅎ'};
  }
  const dis=[];const used=new Set([h.rd]);
  for(const x of near.concat(shuffle(HAN))){if(dis.length>=3)break;if(used.has(x.rd))continue;used.add(x.rd);dis.push(x);}
  const opts=shuffle([h,...dis]).map(x=>({text:x.rd}));
  return {type:'choice',mode:'han',key:'h:'+h.ch,label:'Как читается слог?',prompt:h.ch,promptKo:true,
    options:opts,correct:opts.findIndex(o=>o.text===h.rd),right:h.rd,explain:[h.ch+' = '+h.hint+' → '+h.rd,
    (h.v===4||h.v===8)?'ㅓ — среднее «о» (머, 서), ㅗ — глубокое «о» (고, 보)':''],hp:h.ch,hr:h.rd,icon:'ㅎ'};
}
/* ---------- «Время и дни»: дни недели, частицы 에 («когда») и 도 («тоже») ---------- */
const DAYS=[['월요일','понедельник','ворёиль'],['화요일','вторник','хваёиль'],['수요일','среда','суёиль'],['목요일','четверг','мокёиль'],['금요일','пятница','кымнёиль'],['토요일','суббота','тхоёиль'],['일요일','воскресенье','ильёиль']];
const DAY_TIME=[['아침','утро','ачим'],['점심','день, обед','чомсим'],['저녁','вечер','чонёк'],['밤','ночь','пам']];
const DAY_WEEK=[['지난주','прошлая неделя','чинанджу'],['이번 주','эта неделя','ибон чу'],['다음 주','следующая неделя','таым чу'],['주','неделя','чу']];
function genDays(){
  const t=rnd(['ko2ru','ru2ko','ko2ru','ru2ko','near','kind']);
  if(t==='near'){
    const i=pickW(DAYS.map((x,k)=>k),k=>'dn:'+k);
    const back=Math.random()<.5,r=DAYS[(i+(back?6:1))%7];
    const set=shuffle(DAYS.filter(x=>x!==r)).slice(0,3).concat([r]);
    const opts=shuffle(set).map(x=>({text:x[0],ko:true}));
    return {type:'choice',mode:'days',key:'dn:'+i+':'+(back?'b':'f'),word:r[0],label:'Сегодня «'+DAYS[i][0]+'» ('+DAYS[i][1]+'). Какой день '+(back?'был вчера?':'будет завтра?'),
      prompt:(back?'어제':'내일')+' = ?',promptKo:true,options:opts,correct:opts.findIndex(o=>o.text===r[0]),right:r[0],
      explain:[DAYS[i][0]+' → '+(back?'вчера ':'завтра ')+r[0]+' ('+r[1]+')','Неделя идёт по кругу: 월 화 수 목 금 토 일'],hp:DAYS[i][0]+' → '+(back?'вчера':'завтра'),hr:r[0],icon:'📅'};
  }
  if(t==='kind'){
    const d=pickW(DAYS,x=>'dk:'+x[0]);const wk=d[0]==='토요일'||d[0]==='일요일';
    const opts=shuffle([{text:'평일',sub:'будни'},{text:'주말',sub:'выходные'}]).map(o=>({text:o.text+' — '+o.sub,ko:false,k:o.text}));
    const right=wk?'주말':'평일';
    return {type:'choice',mode:'days',key:'dk:'+d[0],word:d[0],label:'Будни или выходные?',prompt:d[0],promptKo:true,reading:d[2],sub:d[1],
      options:opts,correct:opts.findIndex(o=>o.k===right),right:right+' — '+(wk?'выходные':'будни'),explain:[d[0]+' ('+d[1]+') — '+(wk?'выходные: 토요일 и 일요일':'будний день: с 월요일 по 금요일')],hp:d[0],hr:right,icon:'📅'};
  }
  const grp=rnd([DAYS,DAYS,DAYS,DAY_TIME,DAY_WEEK]);
  const w=pickW(grp,x=>'dy:'+x[0]+':'+t);
  const others=shuffle(grp.filter(x=>x!==w)).slice(0,3);
  while(others.length<3){const x=rnd(DAYS);if(x!==w&&!others.includes(x))others.push(x);}
  if(t==='ko2ru'){
    const opts=shuffle([w,...others]).map(x=>({text:x[1]}));
    return {type:'choice',mode:'days',key:'dy:'+w[0]+':'+t,word:w[0],label:'Выбери перевод',prompt:w[0],promptKo:true,reading:w[2],options:opts,correct:opts.findIndex(o=>o.text===w[1]),
      right:w[1],explain:[w[0]+' · '+w[2]+' — '+w[1]],hp:w[0],hr:w[1],icon:'📅'};
  }
  const opts=shuffle([w,...others]).map(x=>({text:x[0],ko:true,sub:x[2]}));
  return {type:'choice',mode:'days',key:'dy:'+w[0]+':'+t,word:w[0],label:'Выбери слово по-корейски',prompt:w[1],promptKo:false,options:opts,correct:opts.findIndex(o=>o.text===w[0]),
    right:w[0],explain:[w[0]+' · '+w[2]+' — '+w[1]],hp:w[1],hr:w[0],icon:'📅'};
}

/* «Когда?»: к слову времени ставится 에, но не к 오늘, 내일, 지금, 언제 */
const WHEN_ON=[['월요일','в понедельник'],['화요일','во вторник'],['수요일','в среду'],['목요일','в четверг'],['금요일','в пятницу'],['토요일','в субботу'],['일요일','в воскресенье'],
  ['아침','утром'],['저녁','вечером'],['밤','ночью'],['점심','днём'],['주말','на выходных'],['평일','в будни'],['이번 주','на этой неделе'],['다음 주','на следующей неделе']];
const WHEN_OFF=[['오늘','сегодня'],['내일','завтра'],['지금','сейчас']];
const WHEN_ACT=[['친구를 만나요','встречаюсь с другом','Когда ты встречаешься с другом?'],['운동해요','занимаюсь спортом','Когда ты занимаешься спортом?'],
  ['한국어를 공부해요','занимаюсь корейским','Когда ты занимаешься корейским?'],['도서관에 가요','иду в библиотеку','Когда ты идёшь в библиотеку?'],
  ['영화를 봐요','смотрю фильм','Когда ты смотришь фильм?'],['쇼핑해요','хожу по магазинам','Когда ты ходишь по магазинам?'],
  ['요리를 배워요','учусь готовить','Когда ты учишься готовить?'],['집에 있어요','я дома','Когда ты дома?']];
const NONE='ничего не нужно';
const cap1=s=>s.charAt(0).toUpperCase()+s.slice(1);
function genWhen(){
  const act=rnd(WHEN_ACT);
  const r=Math.random();
  const q=r<.12,off=q||r<.3;
  const time=q?['언제','когда']:off?rnd(WHEN_OFF):rnd(WHEN_ON);
  const post=' '+act[0]+(q?'?':'.');
  const ru=q?act[2]:cap1(time[1])+' '+act[1]+'.';
  const opts=shuffle(['에','에서','는',NONE]).map(t=>({text:t,ko:t!==NONE}));
  const right=off?NONE:'에';
  return {type:'choice',mode:'when',key:'wh:'+time[0]+':'+act[0],word:null,label:'Нужна ли частица, которая отвечает на вопрос «когда»?',sentence:{pre:time[0],post:post},ru:ru,
    options:opts,correct:opts.findIndex(o=>o.text===right),right:right,
    explain:[(off?time[0]:time[0]+'에')+post,off?'С 오늘, 내일, 지금, 언제 частицу 에 не ставят.':'Слово отвечает на вопрос «когда» → к нему добавляется 에.'],
    hp:time[0]+' ___'+post,hr:right,icon:'🕒'};
}

/* «Тоже»: 도 вместо 은/는, 이/가, 을/를; с 에 и 에서 получается 에도, 에서도 */
/** [начало, конец, перевод, какая частица стояла бы без «тоже»] */
const TOO=[
  ['민우 씨는 한국 사람이에요. 유진 씨',' 한국 사람이에요.','Мину из Кореи. Ючжин тоже из Кореи.','는'],
  ['저는 학교에 가요. 제 친구',' 학교에 가요.','Я иду в школу. Мой друг тоже идёт в школу.','가'],
  ['나나 씨는 비빔밥을 먹어요. 김치',' 먹어요.','Нана ест бибимбап. Кимчи тоже ест.','를'],
  ['저는 모자를 사요. 가방',' 사요.','Я покупаю шапку. Сумку тоже покупаю.','을'],
  ['교실에 중국 학생이 있어요. 미국 학생',' 있어요.','В классе есть китайский ученик. Американский ученик тоже есть.','이'],
  ['저는 불고기를 좋아해요. 비빔밥',' 좋아해요.','Я люблю пулькоги. Бибимбап тоже люблю.','를'],
  ['크리스 씨는 커피를 안 마셔요. 콜라',' 안 마셔요.','Крис не пьёт кофе. Колу тоже не пьёт.','는'],
  ['하이 씨는 파티에 가요. 나나 씨',' 파티에 가요.','Хай идёт на вечеринку. Нана тоже идёт.','는'],
];
/** [начало, конец, перевод, правильная форма: 에도 или 에서도] */
const TOO_AT=[
  ['저는 토요일에 친구를 만나요. 일요일',' 친구를 만나요.','В субботу я встречаюсь с другом. И в воскресенье тоже.','에도'],
  ['저는 도서관에 가요. 학교',' 가요.','Я иду в библиотеку. И в школу тоже.','에도'],
  ['저는 도서관에서 공부해요. 카페',' 공부해요.','Я занимаюсь в библиотеке. И в кафе тоже.','에서도'],
  ['저는 집에서 쉬어요. 공원',' 쉬어요.','Я отдыхаю дома. И в парке тоже.','에서도'],
];
function genToo(){
  const at=Math.random()<.4;
  const pool=at?TOO_AT:TOO;
  const i=pickW(pool.map((x,k)=>k),k=>(at?'ta:':'to:')+k);
  const x=pool[i];
  const right=at?x[3]:'도';
  let set;
  if(at)set=x[3]==='에도'?['에도','도','에','에서도']:['에서도','도','에서','에도'];
  else{const other=rnd(['이','가','은','는','을','를'].filter(t=>t!==x[3]));set=['도',x[3],x[3]+'도',other];}
  const opts=shuffle(set).map(t=>({text:t,ko:true}));
  return {type:'choice',mode:'too',key:(at?'ta:':'to:')+i,word:null,label:'Вставь частицу «тоже»',sentence:{pre:x[0],post:x[1]},ru:x[2],
    options:opts,correct:opts.findIndex(o=>o.text===right),right:right,
    explain:[x[0]+right+x[1],at?'С 에 и 에서 частица 도 добавляется: 에도, 에서도.':'도 заменяет 은/는, 이/가, 을/를: вместе с ними её не ставят.'],hp:x[0]+' ___'+x[1],hr:right,icon:'➕'};
}

/* ---------- «Числа и деньги»: числа, цены, счётные слова ---------- */
const NAT=['하나','둘','셋','넷','다섯','여섯','일곱','여덟','아홉','열'];
const SINO=['일','이','삼','사','오','육','칠','팔','구','십'];
const SINO_BIG=[[100,'백'],[1000,'천'],[10000,'만']];
function genNum(){
  const nat=Math.random()<.5;
  const list=nat?NAT.map((k,i)=>[i+1,k]):SINO.map((k,i)=>[i+1,k]).concat(SINO_BIG);
  const x=pickW(list,y=>'nu:'+(nat?'n':'s')+y[0]);
  const toKo=Math.random()<.5;
  const others=shuffle(list.filter(y=>y!==x)).slice(0,3);
  const sys=nat?'Корейские числа (하나, 둘, 셋…)':'Китайские числа (일, 이, 삼…)';
  const fmt=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
  const note=nat?'Корейские числа считают вещи, людей, животных; после 열 (10) — 열하나, 열둘…':'Китайские числа нужны для цен, дат, номеров и минут.';
  const set=shuffle([x,...others]);
  if(toKo){
    return {type:'choice',mode:'num',key:'nu:'+(nat?'n':'s')+x[0],word:nat?x[1]:null,label:sys+': как будет «'+fmt(x[0])+'»?',prompt:fmt(x[0]),promptKo:false,
      options:set.map(y=>({text:y[1],ko:true})),correct:set.indexOf(x),right:x[1],explain:[fmt(x[0])+' = '+x[1],note],hp:fmt(x[0])+(nat?' (корейское)':' (китайское)'),hr:x[1],icon:'🔢'};
  }
  return {type:'choice',mode:'num',key:'nu:'+(nat?'n':'s')+x[0],word:nat?x[1]:null,label:sys+': какое это число?',prompt:x[1],promptKo:true,
    options:set.map(y=>({text:fmt(y[0])})),correct:set.indexOf(x),right:fmt(x[0]),explain:[x[1]+' = '+fmt(x[0]),note],hp:x[1],hr:fmt(x[0]),icon:'🔢'};
}
const SDIG=['','일','이','삼','사','오','육','칠','팔','구'];
function sinoPart(x){let o='';const th=Math.floor(x/1000),h=Math.floor(x%1000/100),t=Math.floor(x%100/10),u=x%10;
  if(th)o+=(th>1?SDIG[th]:'')+'천';if(h)o+=(h>1?SDIG[h]:'')+'백';if(t)o+=(t>1?SDIG[t]:'')+'십';if(u)o+=SDIG[u];return o;}
/** Сумма 1..99999 китайскими числами: 3500 → 삼천오백, 10000 → 만 (일 перед 만, 천, 백, 십 не говорят) */
function sinoNum(n){const man=Math.floor(n/10000),r=n%10000;return (man?(man>1?sinoPart(man):'')+'만':'')+sinoPart(r);}
const fmtMoney=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'원';
function genPrice(){
  const kind=rnd(['t','t','h','m','mix']);
  const n=kind==='t'?(1+Math.floor(Math.random()*9))*1000:kind==='h'?(1+Math.floor(Math.random()*9))*1000+500:kind==='m'?(1+Math.floor(Math.random()*9))*10000:(1+Math.floor(Math.random()*4))*10000+(1+Math.floor(Math.random()*9))*1000;
  const key='pr:'+n;
  const cands=[n*10<100000?n*10:n/10,n+1000<100000?n+1000:n-1000,n>=10000?(n%10000===0?n/10:n-(n%10000)):n+500,n+10000<100000?n+10000:n-10000,n>1000?n-1000:n+2000];
  const bad=[];for(const c of cands){const v=Math.round(c);if(v>0&&v<100000&&v!==n&&!bad.includes(v))bad.push(v);if(bad.length>=3)break;}
  let g=0;while(bad.length<3&&g++<50){const v=(1+Math.floor(Math.random()*19))*500;if(v!==n&&!bad.includes(v))bad.push(v);}
  const set=shuffle([n,...bad]);
  const readable=n=>sinoNum(n)+' 원';
  const parts=[];if(n>=10000)parts.push(Math.floor(n/10000)===1?'만 (10 000)':sinoPart(Math.floor(n/10000))+'만');if(n%10000)parts.push(sinoPart(n%10000));
  const how=fmtMoney(n)+' = '+parts.join(' + ');
  if(Math.random()<.5){
    return {type:'choice',mode:'price',key:key,word:null,label:'Прочитай цену по-корейски',prompt:fmtMoney(n),promptKo:false,options:set.map(v=>({text:readable(v),ko:true})),correct:set.indexOf(n),
      right:readable(n),explain:[readable(n),how,'Перед 만 цифру 일 не говорят: 10 000 = 만, а не 일만.'],hp:fmtMoney(n),hr:readable(n),icon:'💴'};
  }
  return {type:'choice',mode:'price',key:key,word:null,label:'Сколько это стоит?',prompt:readable(n),promptKo:true,options:set.map(v=>({text:fmtMoney(v)})),correct:set.indexOf(n),
    right:fmtMoney(n),explain:[readable(n)+' = '+fmtMoney(n),how],hp:readable(n),hr:fmtMoney(n),icon:'💴'};
}
const COUNTERS=['병','잔','개','그릇','명','마리','권','장'];
function countPool(){return D.PB.map((x,k)=>k).filter(k=>{const p=D.PB[k];return COUNTERS.includes(p[2])||/^Перед счётным/.test(p[4]);});}
function genCount(){
  const pool=countPool();
  const i=pickW(pool,k=>'cn:'+k);
  const p=D.PB[i];
  const opts=shuffle(p[3]).map(t=>({text:t,ko:true}));
  const parts=p[0].split('___');
  return {type:'choice',mode:'count',key:'cn:'+i,label:'Вставь счётное слово или число',sentence:{pre:parts[0],post:parts[1]},ru:p[1],
    options:opts,correct:opts.findIndex(o=>o.text===p[2]),right:p[2],explain:[p[0].replace('___',p[2]),p[4]],hp:p[0].replace('___','…'),hr:p[2],icon:'🥤'};
}
/* ---------- по разделам грамматики: «Быть и отрицание», «Место и направление», «Указатели», «Вежливость» ---------- */
/** «Это …» и «это не …»: 이에요/예요 и 이/가 아니에요 по 받침 */
function genNeg(){
  const pool=D.S.filter(r=>/^[а-яё]+$/i.test(r[2]));
  const w=pickW(pool,r=>'ng:'+r[0]);
  const ko=w[0],hasB=jong(ko[ko.length-1])>0;
  const neg=Math.random()<.5;
  const aff=ko+(hasB?'이에요':'예요'),affBad=ko+(hasB?'예요':'이에요');
  const no=ko+(hasB?'이':'가')+' 아니에요',noBad=ko+(hasB?'가':'이')+' 아니에요';
  const right=neg?no:aff;
  const set=shuffle(neg?[no,aff,noBad,affBad]:[aff,no,affBad,noBad]);
  return {type:'choice',mode:'neg',key:'ng:'+ko+':'+(neg?'n':'a'),word:ko,label:'Скажи по-корейски',prompt:(neg?'Это не ':'Это ')+w[2]+'.',promptKo:false,
    options:set.map(t=>({text:t,ko:true})),correct:set.indexOf(right),right:right,
    explain:[right+' — '+(neg?'Это не ':'Это ')+w[2],hasB?'У слова «'+ko+'» есть 받침 → '+(neg?'이 아니에요':'이에요'):'У слова «'+ko+'» нет 받침 → '+(neg?'가 아니에요':'예요')],hp:(neg?'не ':'')+w[2],hr:right,icon:'🙅'};
}
const PLACES=[['학교','в школу','в школе',['공부해요','занимаюсь']],['도서관','в библиотеку','в библиотеке',['공부해요','занимаюсь'],['책을 읽어요','читаю книгу']],['공원','в парк','в парке',['운동해요','занимаюсь спортом']],
  ['카페','в кафе','в кафе',['커피를 마셔요','пью кофе']],['시장','на рынок','на рынке',['빵을 사요','покупаю хлеб']],['식당','в столовую','в столовой',['밥을 먹어요','ем']],
  ['백화점','в универмаг','в универмаге',['쇼핑해요','хожу по магазинам']],['집','домой','дома',['쉬어요','отдыхаю']],['은행','в банк','в банке']];
/** 에 (куда, где находишься) или 에서 (где действие) */
function genPlace(){
  const p=pickW(PLACES,x=>'pl:'+x[0]);
  const acts=p.slice(3);
  const t=rnd(acts.length?['go','be','do','do']:['go','be']);
  let pre='저는 '+p[0],post,ru,right,why;
  if(t==='go'){post=' 가요.';ru='Я иду '+p[1]+'.';right='에';why='Куда идёшь (가요) → 에';}
  else if(t==='be'){post=' 있어요.';ru='Я '+p[2]+'.';right='에';why='Где находишься (있어요) → 에';}
  else{const a=rnd(acts);post=' '+a[0]+'.';ru=cap1(p[2])+' '+a[1]+'.';right='에서';why='Где что-то делаешь ('+a[0]+') → 에서';}
  const opts=shuffle(['에','에서','를','는']).map(x=>({text:x,ko:true}));
  return {type:'choice',mode:'place',key:'pl:'+p[0]+':'+t+post,word:null,label:'Вставь частицу места',sentence:{pre:pre,post:post},ru:ru,
    options:opts,correct:opts.findIndex(o=>o.text===right),right:right,explain:[pre+right+post,why],hp:pre+' ___'+post,hr:right,icon:'📍'};
}
const DEM=[
  [['이','этот (рядом со мной)'],['그','тот (рядом с тобой или уже известный)'],['저','вон тот (далеко от обоих)']],
  [['이것','эта вещь (рядом со мной)'],['그것','та вещь (рядом с тобой)'],['저것','вон та вещь (далеко от обоих)']],
  [['여기','здесь (рядом со мной)'],['거기','там (рядом с тобой)'],['저기','вон там (далеко от обоих)']],
];
function genDem(){
  const fam=rnd(DEM);
  const w=pickW(fam,x=>'dm:'+x[0]);
  const toKo=Math.random()<.5;
  const set=shuffle(fam);
  const note='1) близко ко мне, 2) близко к собеседнику, 3) далеко от обоих: '+fam.map(x=>x[0]).join(' / ');
  if(toKo)return {type:'choice',mode:'dem',key:'dm:'+w[0]+':k',word:null,label:'Выбери слово',prompt:w[1],promptKo:false,options:set.map(x=>({text:x[0],ko:true})),correct:set.indexOf(w),right:w[0],explain:[w[0]+' — '+w[1],note],hp:w[1],hr:w[0],icon:'👉'};
  return {type:'choice',mode:'dem',key:'dm:'+w[0]+':r',word:null,label:'Что значит слово?',prompt:w[0],promptKo:true,options:set.map(x=>({text:x[1]})),correct:set.indexOf(w),right:w[1],explain:[w[0]+' — '+w[1],note],hp:w[0],hr:w[1],icon:'👉'};
}
const POLITE=[['고마워','друзьям (самое неформальное)'],['고마워요','знакомым и близким старше тебя'],['감사해요','коллегам, товарищам'],['감사합니다','по работе, начальнику (формально)']];
function genPolite(){
  const w=pickW(POLITE,x=>'po:'+x[0]);
  const toKo=Math.random()<.5;
  const set=shuffle(POLITE);
  const note='От самого неформального к официальному: '+POLITE.map(x=>x[0]).join(' → ');
  if(toKo)return {type:'choice',mode:'polite',key:'po:'+w[0]+':k',word:null,label:'Как сказать «спасибо» этому человеку?',prompt:w[1].replace(/ \(.*$/,''),promptKo:false,options:set.map(x=>({text:x[0],ko:true})),correct:set.indexOf(w),right:w[0],explain:[w[0]+' — '+w[1],note],hp:w[1],hr:w[0],icon:'🙇'};
  return {type:'choice',mode:'polite',key:'po:'+w[0]+':r',word:null,label:'Кому так говорят «спасибо»?',prompt:w[0],promptKo:true,options:set.map(x=>({text:x[1].replace(/ \(.*$/,'')})),correct:set.indexOf(w),right:w[1].replace(/ \(.*$/,''),explain:[w[0]+' — '+w[1],note],hp:w[0],hr:w[1],icon:'🙇'};
}
const GEN={word:genWord,rev:genRev,form:()=>(Math.random()<.5?genForm():genPast()),qw:genQw,part:genPart,build:genBuild,spot:genSpot,type:genType,err:genErr,pair:genPair,ord:genOrd,dlg:genDlg,han:genHan,days:genDays,when:genWhen,too:genToo,num:genNum,price:genPrice,count:genCount,neg:genNeg,place:genPlace,dem:genDem,polite:genPolite};
function genQuestion(){
  let m=S.mode;
  if(m==='mix')m=rnd(['word','word','word','rev','rev','form','form','form','qw','part','part','build','spot','spot','type','type','err','pair','ord','dlg','days','when','too','neg','place','dem','polite']);
  return GEN[m]();
}

/* ---------- отрисовка ---------- */
function renderQuestion(q){
  S.cur=q;S.answered=false;S.lastKey=q.key;
  clearTimeout(S.timer);
  const card=$('#card');card.innerHTML='';
  card.appendChild(labelWithHelp(q));
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
    cascade(opts.children);
    if(q.options.length>2&&!S.blitz.on){
      const acts=el('div','acts');
      const hb=el('button','ghost hint');hb.innerHTML=iconImg('sparkle')+' 50/50 · '+S.hints;hb.type='button';hb.id='hintBtn';hb.disabled=S.hints<=0;
      hb.addEventListener('click',useHint);acts.appendChild(hb);card.appendChild(acts);
    }
  }else if(q.type==='type'){
    card.appendChild(el('div','prompt'+(q.promptKo?' ko':''),q.prompt));
    if(q.reading&&S.reading)card.appendChild(el('div','reading',q.reading));
    if(q.sub)card.appendChild(el('div','ruline',q.sub));
    const form=el('form','tform');
    const inp=document.createElement('input');inp.type='text';inp.id='tinp';inp.autocomplete='off';inp.spellcheck=false;
    inp.placeholder=q.placeholder||'';inp.setAttribute('autocapitalize','off');
    const go=el('button','primary','Проверить');go.type='submit';
    form.append(inp,go);form.addEventListener('submit',e=>{e.preventDefault();checkType(false);});
    card.appendChild(form);
    const acts=el('div','acts');
    const hb=el('button','ghost');hb.innerHTML=iconImg('sparkle')+' Подсказка';hb.type='button';
    hb.addEventListener('click',()=>{q.hintN=(q.hintN||0)+1;$('#thint').textContent='подсказка: '+q.right.slice(0,q.hintN)+'…';});
    const sk=el('button','ghost','Не знаю');sk.type='button';sk.addEventListener('click',()=>checkType(true));
    acts.append(hb,sk);card.appendChild(acts);
    const th=el('div','hintline');th.id='thint';card.appendChild(th);
    setTimeout(()=>inp.focus({preventScroll:true}),0);
  }else{
    const lv=el('div','levels');
    [['any','Любой'],[1,'Простой'],[2,'Средний'],[3,'Сложный']].forEach(function(x){
      const b=el('button','chip'+(S.level===x[0]?' on':''),x[1]);b.type='button';
      b.addEventListener('click',function(){S.level=x[0];save();renderQuestion(genBuild());});
      lv.appendChild(b);
    });
    card.appendChild(lv);
    card.appendChild(el('div','prompt',q.ru));
    const slots=el('div','slots');slots.id='slots';card.appendChild(slots);
    const tiles=el('div','tiles');tiles.id='tiles';
    q.tiles.forEach((t,i)=>{
      const b=el('button','tile',t);b.type='button';b.dataset.i=i;
      if(i<9)b.appendChild(el('sup','',String(i+1)));
      b.appendChild(el('span','tg',tileGloss(t)));b.title=tileGloss(t);
      b.addEventListener('click',()=>pickTile(i));tiles.appendChild(b);
    });
    if(S.gloss)tiles.classList.add('gloss');
    card.appendChild(tiles);
    const acts=el('div','acts');
    const chk=el('button','primary','Проверить');chk.type='button';chk.id='chk';chk.addEventListener('click',checkBuild);
    const clr=el('button','ghost','Очистить');clr.type='button';clr.id='clr';clr.addEventListener('click',()=>{q.sel=[];drawBuild();});
    const hb=el('button','ghost hint');hb.innerHTML=iconImg('sparkle')+' Подсказка · '+S.hints;hb.type='button';hb.id='hintBtn';hb.disabled=S.hints<=0||S.blitz.on;
    hb.addEventListener('click',buildHint);
    const gb=el('button','ghost hint','🔤 '+(S.gloss?'Скрыть переводы':'Показать переводы'));gb.type='button';gb.id='glossBtn';
    gb.addEventListener('click',toggleGloss);
    acts.append(chk,clr,gb);if(!S.blitz.on)acts.appendChild(hb);card.appendChild(acts);
    card.appendChild(el('div','scheme','Не все плитки нужны: среди них есть лишние (с неверной частицей, временем или местом). Не знаешь слово — нажми «Показать переводы» (клавиша T) или наведи на плитку. Клавиши: 1–9 — выбрать слово, Enter — проверить, Backspace — убрать последнее, H — подсказка.'));
    q.sel=[];drawBuild();
  }
  const fb=el('div','feedback');fb.id='fb';fb.setAttribute('aria-live','polite');card.appendChild(fb);
}
function useHint(){
  const q=S.cur;if(!q||S.answered||q.type!=='choice'||S.hints<=0)return;
  const btns=[...document.querySelectorAll('#opts .opt')];
  const wrong=shuffle(btns.map((b,i)=>i).filter(i=>i!==q.correct&&!btns[i].disabled)).slice(0,2);
  if(wrong.length<2)return;
  wrong.forEach(i=>{btns[i].disabled=true;btns[i].classList.add('dim');});
  S.hints--;const hb=$('#hintBtn');hb.innerHTML=iconImg('sparkle')+' 50/50 · '+S.hints;hb.disabled=true;
}
function checkType(skip){
  if(S.answered)return;const q=S.cur;
  const inp=$('#tinp');const val=inp.value.trim();
  const ok=!skip&&!!val&&(q.squash?q.answers.map(a=>a.replace(/\s/g,'')).includes(val.replace(/\s/g,'')):q.answers.includes(normRu(val)));
  inp.disabled=true;inp.classList.add(ok?'ok':'bad');
  finish(ok,val||'—');
}
function drawBuild(){
  const q=S.cur;const slots=$('#slots');slots.innerHTML='';slots.className='slots'+(S.gloss?' gloss':'');
  q.sel.forEach((ti,pos)=>{
    const b=el('button','slot',q.tiles[ti]);b.type='button';b.appendChild(el('span','tg',tileGloss(q.tiles[ti])));
    b.addEventListener('click',()=>{if(S.answered)return;q.sel.splice(pos,1);drawBuild();});
    slots.appendChild(b);
  });
  document.querySelectorAll('#tiles .tile').forEach(b=>b.classList.toggle('used',q.sel.includes(+b.dataset.i)));
}
function pickTile(i){
  if(S.answered)return;const q=S.cur;if(i>=q.tiles.length||q.sel.includes(i))return;
  q.sel.push(i);drawBuild();
}
function toggleGloss(){
  S.gloss=!S.gloss;save();
  const t=$('#tiles'),sl=$('#slots'),b=$('#glossBtn');
  if(t)t.classList.toggle('gloss',S.gloss);
  if(sl)sl.classList.toggle('gloss',S.gloss);
  if(b)b.textContent='🔤 '+(S.gloss?'Скрыть переводы':'Показать переводы');
}
function buildHint(){
  const q=S.cur;if(!q||S.answered||q.type!=='build'||S.hints<=0)return;
  const right=q.right.split(' ');
  let k=0;while(k<q.sel.length&&q.tiles[q.sel[k]]===right[k])k++;
  q.sel.length=k;
  const need=right[k];if(need===undefined)return;
  const ti=q.tiles.findIndex((t,i)=>t===need&&!q.sel.includes(i));
  if(ti<0)return;
  q.sel.push(ti);drawBuild();S.hints--;
  const hb=$('#hintBtn');hb.innerHTML=iconImg('sparkle')+' Подсказка · '+S.hints;hb.disabled=S.hints<=0;
}
function checkBuild(){
  if(S.answered)return;const q=S.cur;
  if(!q.sel.length)return;
  const words=q.sel.map(i=>q.tiles[i]);
  const ans=words.join(' ');
  const ok=q.accept.includes(ans);
  document.querySelectorAll('#tiles .tile').forEach(b=>b.disabled=true);
  const slots=$('#slots');
  if(ok){
    slots.classList.add('ok');
    if(ans!==q.right)q.explain=[ans+' — тоже верно.','Чаще говорят так: '+q.right,q.note];
  }else{
    const canon=q.right.split(' ');
    slots.querySelectorAll('.slot').forEach((b,k)=>b.classList.add(canon[k]===words[k]?'ok':'bad'));
  }
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
  // верный вариант «вскакивает», каждые 5 верных подряд брызги звёзд
  if(ok&&btns[i]){pop(btns[i]);if(S.ses.streak>0&&S.ses.streak%5===0){const r=btns[i].getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2,14);}}
}

/* ---------- ответ, статистика, история ---------- */
function finish(ok,chosen){
  S.answered=true;const q=S.cur;
  const A=S.all,B=S.ses;
  if(ok){B.ok++;A.ok++;B.streak++;if(B.streak>B.best)B.best=B.streak;if(B.streak>A.best)A.best=B.streak;
    const m=S.miss[q.key];if(m){m.n--;if(m.n<=0)delete S.miss[q.key];}
    const msgs=[];
    const pr=hooks.record({word:q.word||null,ok:true,mode:S.mode,detail:{q:q.hp,a:q.hr},xp:(q.level===3?20:q.level===2?15:10)+(B.streak>=5&&B.streak%5===0?5:0)});
    if(pr.bloomed)msgs.push('🌸 Слово «'+q.word+'» расцвело в саду!');
    if(pr.levelUp)msgs.push('⭐ Новый уровень '+pr.level+': '+pr.title+'!');
    if(pr.goalReached)msgs.push('🎯 Цель дня выполнена!');
    if([5,10,20,50].includes(B.streak))msgs.push('🔥 Серия из '+B.streak+' верных подряд!');
    if([50,100,250,500,1000].includes(A.ok))msgs.push('🏅 '+A.ok+' верных ответов за всё время!');
    if(A.ok%10===0){msgs.push('🍞 Испёкся ещё один хлебушек!');const l=$('#nLoaf');l.classList.remove('pop');void l.offsetWidth;l.classList.add('pop');}
    if(msgs.length)toast(msgs[0]);
    if(S.surv.on)S.surv.ok++;
  }else{B.bad++;A.bad++;B.streak=0;
    hooks.record({word:q.word||null,ok:false,mode:S.mode,detail:{q:q.hp,a:q.hr,y:chosen}});
    const m=S.miss[q.key]||{n:0,l:''};m.n=Math.min(5,m.n+1);m.l=q.hp+' — '+q.hr;S.miss[q.key]=m;}
  if(S.blitz.on){if(ok)S.blitz.ok++;else S.blitz.bad++;}
  if(S.surv.on&&!ok){S.surv.lives--;drawLives();if(S.surv.lives<=0)S.timer=setTimeout(endSurv,1300);}
  S.hist.unshift({ok:ok,icon:q.icon,p:q.hp,r:q.hr,you:ok?null:chosen});
  if(S.hist.length>150)S.hist.pop();
  save();updateStats();renderList();
  showFeedback(q,ok);
}
function showFeedback(q,ok){
  const fb=$('#fb');fb.className='feedback show '+(ok?'ok':'bad');fb.innerHTML='';
  if(!motionCalm())gsap.from(fb,{opacity:0,y:12,duration:.32,ease:'power2.out',clearProps:'opacity,transform'});
  const streak=S.ses.streak;
  fb.appendChild(el('div','fbh',ok?('Верно!'+(streak>=3?' 🔥 ×'+streak:'')):'Не так. Правильно: '+q.right));
  q.explain.forEach(t=>{if(t)fb.appendChild(el('div','fbt',t));});
  if(q.type==='build'){
    const box=el('div','mini');
    analyze(q.right).forEach(function(sg){
      const c=el('span','mc '+sg.type);c.appendChild(el('b','',sg.text));
      c.appendChild(el('i','',sg.type==='unknown'?'?':sg.gloss.replace(/ \(.*$/,'')));box.appendChild(c);
    });
    fb.appendChild(box);
  }
  const x=el('div','fbx');const nb=el('button','primary','Дальше →');nb.type='button';nb.id='nextBtn';nb.addEventListener('click',next);
  x.appendChild(nb);fb.appendChild(x);
  nb.focus({preventScroll:true});
  const inB=S.blitz.on;
  if(S.surv.on&&S.surv.lives<=0)return;
  // сам переходит дальше только режим на время; в остальных результат висит, пока не нажмёшь «Дальше»
  if(inB)S.timer=setTimeout(next,ok?450:1100);
}
function next(){
  clearTimeout(S.timer);
  if(S.blitz.on&&S.blitz.left<=0)return;
  if(S.surv.on&&S.surv.lives<=0){endSurv();return;}
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
  $('#allTime').textContent='За всё время: '+A.ok+' верно, '+A.bad+' неверно'+(A.bestBlitz?' · лучший блиц: '+A.bestBlitz:'')+(A.bestSurv?' · выживание: '+A.bestSurv:'');
  const P=hooks.state();
  $('#lvlN').textContent=P.level;$('#lvlName').textContent=P.title;
  $('#xpTxt').textContent=P.max?'максимум':P.into+' / '+P.span;$('#xpBar').style.width=P.pct+'%';
  const g=P.todayOk;
  $('#goalMax').textContent=P.goal;$('#goalN').textContent=Math.min(g,P.goal);$('#goalBar').style.width=Math.min(100,g/P.goal*100)+'%';
  $('#goalTxt').textContent=g>=P.goal?'готово 🎉':'ещё '+(P.goal-g);
}
function renderList(){
  const list=$('#list');list.innerHTML='';
  $('#tabHist').classList.toggle('on',S.tab==='hist');$('#tabWeak').classList.toggle('on',S.tab==='weak');$('#tabWords').classList.toggle('on',S.tab==='words');
  $('#wq').hidden=S.tab!=='words';
  if(S.tab==='words'){
    const w=$('#wq').value.trim().toLowerCase();
    const hit=w?ALLW.filter(x=>[x.ko,x.rd,x.ru].some(s=>s.toLowerCase().includes(w))):ALLW;
    list.appendChild(el('div','empty',w?('Найдено: '+hit.length):('Всего слов в игре: '+hit.length+'. Начни вводить, чтобы найти нужное.')));
    hit.slice(0,60).forEach(x=>{
      const it=el('div','item');it.style.gridTemplateColumns='1fr';
      const row=el('div');row.appendChild(el('span','ko',x.ko));row.append(' · '+x.rd+' — '+x.ru);
      it.appendChild(row);list.appendChild(it);
    });
    if(hit.length>60)list.appendChild(el('div','empty','Показаны первые 60, уточни запрос.'));
    return;
  }
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
  MODES.filter(m=>m.id==='mix').forEach(m=>{
    const b=el('button','chip'+(S.mode===m.id?' on':''));b.innerHTML=iconImg(MODE_ICON[m.id])+'<span>'+m.name+'</span>';b.type='button';
    b.addEventListener('click',()=>{S.mode=m.id;save();drawModes();next();});
    box.appendChild(b);
  });
  const side=$('#sideModes');
  if(side){
    side.innerHTML='';
    const fq=(($('#gameFind')||{}).value||'').trim().toLowerCase();
    const found=MODES.filter(m=>!fq||m.name.toLowerCase().includes(fq));
    if(!found.length)side.appendChild(el('div','empty','Такой игры нет'));
    found.forEach(m=>{
      const b=el('button','sm'+(S.mode===m.id?' on':''));b.type='button';
      {const si=el('span','si');si.innerHTML=iconImg(MODE_ICON[m.id]);b.append(si,el('span','st',m.name));}
      if(S.mode===m.id)b.appendChild(el('span','sa','›'));
      b.addEventListener('click',()=>{S.mode=m.id;save();drawModes();next();});
      side.appendChild(b);
    });
  }
}
function drawCats(){
  const box=$('#cats');box.innerHTML='';
  CATS.forEach(c=>{
    const lb=el('label',S.cats[c.id]?'on':'');
    const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!S.cats[c.id];
    cb.addEventListener('change',()=>{
      S.cats[c.id]=cb.checked?1:0;
      if(!Object.values(S.cats).some(Boolean)){S.cats[c.id]=1;cb.checked=true;}
      save();hooks.saveCats(S.cats);drawCats();
    });
    lb.append(cb,' '+c.name+' ('+W[c.id].length+')');box.appendChild(lb);
  });
}
function syncToggles(){
  $('#cbRead').checked=S.reading;$('#tense').value=S.tense;
  $('#lbRead').classList.toggle('on',S.reading);
}
const findBox=$('#gameFind');
const onFind=()=>drawModes();
findBox?.addEventListener('input',onFind);
$('#cbRead').addEventListener('change',e=>{S.reading=e.target.checked;save();syncToggles();if(S.cur&&!S.answered)renderQuestion(S.cur);});
$('#tense').addEventListener('change',e=>{S.tense=e.target.value;save();});
$('#tabHist').addEventListener('click',()=>{S.tab='hist';renderList();});
$('#tabWeak').addEventListener('click',()=>{S.tab='weak';renderList();});
$('#tabWords').addEventListener('click',()=>{S.tab='words';renderList();$('#wq').focus({preventScroll:true});});
$('#wq').addEventListener('input',renderList);
$('#resetBtn').addEventListener('click',async()=>{
  const yes=await askConfirm({title:'Сбросить статистику игры?',text:'Сбросится только прогресс этой игры: счёт, рекорды, испечённые хлебушки, слабые слова и история ответов. Уровень, цель дня, слова и остальной прогресс сайта останутся как есть.',ok:'Сбросить статистику игры',danger:true});
  if(!yes)return;
  S.all={ok:0,bad:0,best:0,bestBlitz:0,bestSurv:0,xp:0};S.miss={};S.ses={ok:0,bad:0,streak:0,best:0};S.hist=[];S.hints=3;
  save();updateStats();renderList();next();
});

/* ---------- блиц ---------- */
function startBlitz(){
  if(S.surv.on){toast('Сначала закончи выживание');return;}
  clearInterval(S.blitz.iv);
  S.blitz={on:true,left:60,ok:0,bad:0,iv:null};
  $('#timer').classList.add('on');$('#timerBar').style.width='100%';
  $('#blitzBtn').innerHTML='<span class="gi">⏹</span> Остановить блиц';
  S.blitz.iv=setInterval(()=>{
    S.blitz.left--;$('#timerBar').style.width=Math.max(0,S.blitz.left/60*100)+'%';
    if(S.blitz.left<=0)endBlitz();
  },1000);
  next();
}
function endBlitz(){
  clearInterval(S.blitz.iv);clearTimeout(S.timer);
  const b=S.blitz;b.on=false;
  $('#timer').classList.remove('on');$('#blitzBtn').innerHTML=iconImg('rocket')+' Блиц 60 секунд';
  const tot=b.ok+b.bad;
  let rec='';
  if(b.ok>S.all.bestBlitz){S.all.bestBlitz=b.ok;rec=' Новый рекорд!';save();updateStats();}
  S.lastOver='blitz';$('#overT').textContent='Время вышло!';
  $('#overBig').textContent=b.ok;
  $('#overTxt').textContent='верных ответов за минуту. Неверных: '+b.bad+(tot?', точность '+Math.round(b.ok/tot*100)+'%':'')+'.'+rec;
  $('#over').classList.add('on');$('#overAgain').focus();
  if(S.cur)S.answered=true;
}
$('#blitzBtn').addEventListener('click',()=>{if(S.blitz.on)endBlitz();else startBlitz();});

/* ---------- выживание: три жизни ---------- */
function drawLives(){
  const box=$('#lives');
  if(!S.surv.on){box.className='lives';box.textContent='';return;}
  box.className='lives on';
  box.textContent='❤️'.repeat(Math.max(0,S.surv.lives))+'🖤'.repeat(3-Math.max(0,S.surv.lives))+'  ·  верно: '+S.surv.ok;
}
function startSurv(){
  if(S.blitz.on){toast('Сначала закончи блиц');return;}
  S.surv={on:true,lives:3,ok:0};
  $('#survBtn').innerHTML='<span class="gi">⏹</span> Остановить выживание';drawLives();next();
}
function endSurv(){
  clearTimeout(S.timer);
  const sv=S.surv;sv.on=false;
  $('#survBtn').innerHTML=iconImg('heart')+' На выживание';drawLives();
  let rec='';
  if(sv.ok>S.all.bestSurv){S.all.bestSurv=sv.ok;rec=' Новый рекорд!';save();updateStats();}
  S.lastOver='surv';$('#overT').textContent='Жизни закончились';
  $('#overBig').textContent=sv.ok;
  $('#overTxt').textContent='верных ответов до третьей ошибки.'+rec;
  $('#over').classList.add('on');$('#overAgain').focus();
  if(S.cur)S.answered=true;
}
$('#survBtn').addEventListener('click',()=>{if(S.surv.on)endSurv();else startSurv();});
/* «Обновить вопрос»: другой вопрос в том же режиме; ответ не засчитывается ни верным, ни неверным */
$('#refreshBtn').addEventListener('click',()=>{if($('#over').classList.contains('on'))return;next();});
$('#overAgain').addEventListener('click',()=>{$('#over').classList.remove('on');if(S.lastOver==='surv')startSurv();else startBlitz();});
$('#overClose').addEventListener('click',()=>{$('#over').classList.remove('on');next();});

/* ---------- справка ---------- */
let helpFrom=null;
function openHelp(){
  if(S.blitz.on||S.surv.on){toast('Сначала закончи игру на время или выживание');return;}
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
  if(S.cur&&S.cur.type==='choice'&&!S.answered&&(e.key==='h'||e.key==='р')&&$('#hintBtn')){e.preventDefault();useHint();}
  else if(S.cur&&S.cur.type==='choice'&&!S.answered&&/^[1-9]$/.test(e.key)){
    const i=+e.key-1;if(i<S.cur.options.length){e.preventDefault();answerChoice(i);}
  }else if(S.cur&&S.cur.type==='build'&&!S.answered){
    if(e.key==='Enter'){e.preventDefault();checkBuild();}
    else if(e.key==='Backspace'){e.preventDefault();S.cur.sel.pop();drawBuild();}
    else if(/^[1-9]$/.test(e.key)){e.preventDefault();pickTile(+e.key-1);}
    else if(e.key==='h'||e.key==='р'){e.preventDefault();buildHint();}
    else if(e.key==='t'||e.key==='е'){e.preventDefault();toggleGloss();}
  }else if(S.answered&&e.key==='Enter'&&!(t&&t.tagName==='BUTTON')){e.preventDefault();next();}
};
document.addEventListener('keydown',onKeydown);

/* ---------- старт ---------- */
drawModes();drawCats();syncToggles();updateStats();renderList();drawLives();
renderQuestion(genQuestion());
if(!S.seenHelp)openHelp();
return ()=>{
  document.removeEventListener('keydown',onKeydown);
  findBox?.removeEventListener('input',onFind);
  clearInterval(S.blitz.iv);
  clearTimeout(S.timer);
  clearTimeout(toast.t);
};

}
