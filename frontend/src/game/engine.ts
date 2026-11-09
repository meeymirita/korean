// @ts-nocheck
// Логика игры «Хлебушек», перенесена из Hlebushek_Game.html. Работает с разметкой GameView.vue.
import { D } from './words'
import { iconImg, MODE_ICON } from './icons'
import { makeBuild, parseBuildKey } from './build'
import { analyze, SEG_LABEL } from '@/data/korean/parse'
import { D as DICT } from '@/data/korean/words'
import { TRANSLATIONS } from '@/data/korean/translations'
import '@/assets/breakdown.css'
import { EXCHANGES } from './dialogs'
import { STORIES, RULE_SENTENCES } from './stories'
import { PFAMS } from './families'
import { ptextPool } from './ptext-pool'
import { syllableRows, syllableVowels } from '@/data/alphabet'
import { askConfirm } from '@/composables/useConfirm'
import { gsap } from 'gsap'
import { burst, cascade, pop } from '@/lib/fx'
import { motionCalm } from '@/lib/motion'

/** Тяжёлые наборы предложений для текстов считаются один раз на страницу (данные не меняются), а не при каждом запуске игры. */
const POOLS={};

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
  {id:'neg',icon:'🙅',name:'Это или не это'},{id:'place',icon:'📍',name:'Куда, где'},{id:'dem',icon:'👉',name:'Этот, тот, вон тот'},{id:'polite',icon:'🙇',name:'Уровень вежливости'},
  {id:'ptext',icon:'🧩',name:'Тексты по правилу'}
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
  pair:['Из двух вариантов выбери верный: частицу, которая подходит к слову, или нужную форму. Над заданием три уровня: «Простой» (одно предложение), «Рассказ 2–4» и «Длинный 5–10»: несколько предложений с пропусками. Нажми плитку внизу, потом пропуск (нажми на заполненный пропуск, чтобы убрать ответ), в конце «Проверить». Иконка слева от предложения показывает перевод, «Разбор» справа открывается после проверки.','Пример: 책 ___ → 을 (после согласной), а 커피 ___ → 를 (после гласной).'],
  ord:['Слово нужно поставить на своё место в предложении: выбери вариант, где порядок слов правильный. В корейском глагол стоит в конце.','Пример: «Я иду в школу» → 저는 학교에 가요, а не 가요 저는 학교에.'],
  dlg:['Прочитай реплику собеседника и выбери подходящий ответ.','Пример: «이름이 뭐예요?» → «저는 나나예요.»'],
  han:['Хангыль-блиц: собери слог из букв или выбери, как слог читается.','Пример: ㅂ + ㅏ → 바 [па/ба]; 가 читается «ка/га».'],
  days:['Дни недели, части дня и недели. Выбери перевод или корейское слово; иногда нужно сказать, какой день будет завтра или был вчера, или будни это или выходные.','Пример: 금요일 → «пятница»; сегодня 수요일, завтра → 목요일.'],
  when:['Частица 에 («когда?») ставится к слову, которое отвечает на вопрос «когда»: дни недели, утро, вечер, выходные. Но 오늘, 내일, 지금, 언제 без 에. Выбери нужную частицу или «ничего не нужно». Плитка «—» значит: частица не нужна. Над заданием три уровня: «Простой» (одно предложение), «Рассказ 2–4» и «Длинный 5–10»: несколько предложений с пропусками. Нажми плитку внизу, потом пропуск (нажми на заполненный пропуск, чтобы убрать ответ), в конце «Проверить». Иконка слева от предложения показывает перевод, «Разбор» справа открывается после проверки.','Пример: 금요일___ 친구를 만나요 → 에; 오늘___ 학교에 가요 → без частицы.'],
  too:['Частица 도 значит «тоже». Она ставится вместо 은/는, 이/가, 을/를 (вместе с ними не бывает), а с 에 и 에서 даёт 에도 и 에서도. Над заданием три уровня: «Простой» (одно предложение), «Рассказ 2–4» и «Длинный 5–10»: несколько предложений с пропусками. Нажми плитку внизу, потом пропуск (нажми на заполненный пропуск, чтобы убрать ответ), в конце «Проверить». Иконка слева от предложения показывает перевод, «Разбор» справа открывается после проверки.','Пример: 저는 학생이에요. 나나 씨도 학생이에요; 토요일에 만나요. 일요일에도 만나요.'],
  num:['Числа бывают двух видов: корейские (하나, 둘, 셋…) для счёта вещей и китайские (일, 이, 삼…) для цен, дат, номеров. Выбери число или цифру.','Пример: 3 по-корейски (счёт) → 셋; 일곱 → 7; 100 → 백.'],
  price:['Цены читаются китайскими числами + 원: 천 (1000), 만 (10 000). Перед 만 цифру 일 не говорят. Выбери верное чтение цены или цену.','Пример: 3 500원 → 삼천오백 원; 10 000원 → 만 원.'],
  count:['Перед счётным словом (개, 병, 잔, 그릇) стоит корейское число в короткой форме: 한, 두, 세, 네. Выбери счётное слово или форму числа.','Пример: 물 한 병 주세요; 사과 세 개.'],
  neg:['Скажи по-корейски «это …» или «это не …». Есть 받침 (согласная внизу) → 이에요 и 이 아니에요, нет 받침 → 예요 и 가 아니에요. Смотри и на смысл: «это» или «не это». Над заданием три уровня: «Простой» (одно предложение), «Рассказ 2–4» и «Длинный 5–10»: несколько предложений с пропусками. Нажми плитку внизу, потом пропуск (нажми на заполненный пропуск, чтобы убрать ответ), в конце «Проверить». Иконка слева от предложения показывает перевод, «Разбор» справа открывается после проверки.','Пример: «Это книга» → 책이에요; «Это не кофе» → 커피가 아니에요.'],
  place:['Выбери частицу при месте. 에 — куда идёшь (가요) и где находишься (있어요). 에서 — где что-то делаешь (공부해요, 운동해요, 먹어요). Над заданием три уровня: «Простой» (одно предложение), «Рассказ 2–4» и «Длинный 5–10»: несколько предложений с пропусками. Нажми плитку внизу, потом пропуск (нажми на заполненный пропуск, чтобы убрать ответ), в конце «Проверить». Иконка слева от предложения показывает перевод, «Разбор» справа открывается после проверки.','Пример: 학교___ 가요 → 에; 도서관___ 공부해요 → 에서.'],
  dem:['이 / 그 / 저 («этот / тот / вон тот»), 이것 / 그것 / 저것 («эта вещь…») и 여기 / 거기 / 저기 («здесь / там / вон там»). Первое рядом со мной, второе рядом с собеседником, третье далеко от обоих. Пометка в скобках у предложения показывает, где предмет. Над заданием три уровня: «Простой» (одно предложение), «Рассказ 2–4» и «Длинный 5–10»: несколько предложений с пропусками. Нажми плитку внизу, потом пропуск (нажми на заполненный пропуск, чтобы убрать ответ), в конце «Проверить». Иконка слева от предложения показывает перевод, «Разбор» справа открывается после проверки.','Пример: «вон тот» → 저; «здесь» → 여기.'],
  ptext:['Выбери правило чипами под названием (은/는, 이/가, 을/를, 에 / 에서, 하고 / 와 / 과, 만) и поставь нужную частицу в каждом предложении.','Пример: 학교___ 가요 → 에; 학교___ 공부해요 → 에서.'],
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
    if(q.type==='story')box.appendChild(el('div','mex',q.input?'В тексте: впиши форму в каждое поле, Enter проверяет. Значок слева показывает перевод, после проверки «Разбор» объяснит каждое предложение.':'В тексте: нажми плитку, потом пропуск (нажми на заполненный пропуск, чтобы убрать ответ). Значок слева показывает перевод, «Проверить» в конце, после проверки «Разбор» объяснит каждое предложение.'));
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
  mode:'mix',level:'any',levels:{pair:'simple',place:'simple',too:'simple',neg:'simple',when:'simple',dem:'simple',word:'simple',rev:'simple',qw:'simple',part:'simple',form:'simple',days:'simple',num:'simple',price:'simple',count:'simple',polite:'simple',dlg:'simple',han:'simple',spot:'simple',err:'simple',type:'simple',ord:'simple',ptext:'story',build:'simple'},pfam:'topic',bstory:null,gloss:false,cats:{v:1,a:1,q:1,p:1,d:1,n:1,l:1,s:0,w:1},reading:true,tense:'both',
  ses:{ok:0,bad:0,streak:0,best:0},all:{ok:0,bad:0,best:0,bestBlitz:0,bestSurv:0,bestBlitzBy:{},bestSurvBy:{},xp:0,byMode:{}},miss:{},hints:3,
  surv:{on:false,lives:3,max:3,ok:0},lastOver:'blitz',blitzSecs:60,survLives:3,
  seenHelp:false,modeHelp:{},hist:[],cur:null,answered:false,tab:'hist',lastKey:null,timer:null,win:null,
  blitz:{on:false,left:60,total:60,ok:0,bad:0,iv:null},retryQueue:[],retryKeys:new Set()
};
S.retryQueue=[];S.retryKeys=new Set();
function save(){try{localStorage.setItem(LS,JSON.stringify({level:S.level,levels:S.levels,gloss:S.gloss,cats:S.cats,reading:S.reading,tense:S.tense,blitzSecs:S.blitzSecs,survLives:S.survLives,pfam:S.pfam,mode:S.mode,all:S.all,miss:S.miss,seenHelp:S.seenHelp,modeHelp:S.modeHelp}));}catch(e){}}
function load(){try{const j=JSON.parse(localStorage.getItem(LS)||'null');if(!j)return;
  if(j.cats)Object.assign(S.cats,j.cats);
  if(j.levels&&typeof j.levels==='object')Object.assign(S.levels,j.levels);
  else if(j.pairLevel)S.levels.pair=j.pairLevel;
  ['reading','tense','mode','seenHelp','modeHelp','level','gloss'].forEach(k=>{if(j[k]!==undefined)S[k]=j[k];});
  if(PFAMS.some(f=>f.id===j.pfam))S.pfam=j.pfam;
  if([30,60,120].includes(j.blitzSecs))S.blitzSecs=j.blitzSecs;
  if([0,3,5].includes(j.survLives))S.survLives=j.survLives;
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
const wantFam=hooks.fam&&hooks.fam();
if(PFAMS.some(f=>f.id===wantFam))S.pfam=wantFam;
if(![1,2,3,'any'].includes(S.level))S.level='any';
Object.keys(S.levels).forEach(k=>{if(!['simple','story','long'].includes(S.levels[k]))S.levels[k]='simple';});

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
  if(storyOn('word'))return S.levels.word==='long'?genWordStory(5,10):genWordStory(2,4);
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
  if(storyOn('rev'))return S.levels.rev==='long'?genRevStory(5,10):genRevStory(2,4);
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
  if(storyOn('qw'))return S.levels.qw==='long'?genQwStory(5,10):genQwStory(2,4);
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
  if(storyOn('part'))return S.levels.part==='long'?genPartStory(5,10):genPartStory(2,4);
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
/** «Собери предложение: Рассказ»: предложения одного рассказа из учебника идут подряд, каждое собирается из слов-плиток (плюс одна-две лишние). Следующее предложение появляется после «Дальше». */
function genBuildStory(lo,hi){
  let b=S.bstory;
  const lv=S.levels.build;
  if(b&&b.lv===lv&&b.i+1<b.st.sents.length&&b.shown)b.i++;
  else{
    const fit=STORIES.filter(function(st){return st.sents.length>=lo&&st.sents.length<=hi;});
    b=S.bstory={st:rnd(fit.length?fit:STORIES),i:0,lv:lv,shown:false};
  }
  b.shown=true;
  const x=b.st.sents[b.i],n=b.st.sents.length;
  const right=x.ko.replace(/[.?!]$/,'');
  const words=right.split(' ');
  // лишние плитки: слова других предложений рассказов, которых нет в этом
  const spare=[];
  shuffle(STORIES.flatMap(function(st){return st.sents.flatMap(function(y){return y.ko.replace(/[.,?!]/g,'').split(' ');});})).forEach(function(w){
    if(spare.length<(words.length>=4?2:1)&&!words.includes(w)&&!spare.includes(w)&&!words.some(function(v){return v.replace(/[.,?!]/g,'')===w;}))spare.push(w);
  });
  const tiles=shuffle([...words,...spare]);
  const before=b.i>0?b.st.sents.slice(0,b.i).map(function(y){return y.ko;}).join(' '):'';
  return {type:'build',mode:'build',key:'bs:'+b.st.id+':'+b.i,level:2,
    label:'Рассказ «'+b.st.title+'»: предложение '+(b.i+1)+' из '+n+(before?' (до этого: '+before+')':''),
    ru:x.ru,tiles:tiles,accept:[right],right:right,note:'Предложение '+(b.i+1)+' рассказа «'+b.st.title+'»',explain:[right+'.',x.ru],hp:x.ru,hr:right,icon:'🏗️'};
}
function genBuild(){
  if(storyOn('build'))return S.levels.build==='long'?genBuildStory(5,10):genBuildStory(2,4);
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
  if(storyOn('spot'))return S.levels.spot==='long'?genSpotText(4,5):genSpotText(2,3);
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
    options:options,correct:opts.indexOf(right),right:right,explain:[right,note],teach:right,trans:ru,hp:ru,hr:right,icon:'🔍'};
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
  if(storyOn('type'))return S.levels.type==='long'?genTypeStory(5,8):genTypeStory(3,4);
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
  if(storyOn('err'))return S.levels.err==='long'?genErrStory(5,10):genErrStory(3,4);
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
    options:opts,correct:idx,right:a[idx]+' → '+b[idx],explain:['Правильно: '+right,note],teach:right,trans:ru,hp:wrong,hr:right,icon:'🕵️'};
}

/* ---------- «Пара или нет»: две частицы на выбор ---------- */
const PAIRS=[
  {a:'은',b:'는',role:'тема',ex:n=>n+'___ 뭐예요?',exRu:r=>'А что такое «'+r+'»?'},
  {a:'이',b:'가',role:'подлежащее',ex:n=>n+'___ 있어요.',exRu:r=>'Есть: '+r+'.'},
  {a:'을',b:'를',role:'объект действия',ex:n=>n+'___',exRu:r=>'«'+r+'» как объект (что?)'},
  {a:'이에요',b:'예요',role:'«это…»',ex:n=>n+'___.',exRu:r=>'Это «'+r+'».'}
];
const hasFinal=ch=>jong(ch)>0;
/** Уровень с текстом включён: режим открыт сам по себе (не «Микс»), не блиц и не выживание. */
const storyOn=m=>S.mode===m&&S.levels[m]!=='simple'&&!S.blitz.on&&!S.surv.on;
/* ---------- Тексты: несколько предложений с пропусками; плитки из банка переносятся нажатием, проверка в конце ---------- */
/** Режимы с уровнями «Простой / Рассказ 2–4 / Длинный 5–10». */
const STORY_MODES=['pair','place','too','neg','when','dem','word','rev','qw','part','form','days','num','price','count','polite','dlg','han','spot','err','type','ord','ptext','build'];
const plural=n=>n+(n<=4?' предложения':' предложений');
/**
 * Вопрос-текст из предложений. `sents`: [{ko, ru, pieces:[строка | {right, accept?, why}]}], `bank`: плитки (одну можно ставить много раз).
 * У пропуска `picked` (что поставили) и `ok` (после проверки).
 */
function makeStory(mode,label,sents,bank,icon){
  const gaps=[];
  const out=sents.map(function(sn){
    const parts=[];
    sn.pieces.forEach(function(pc){
      if(typeof pc==='string'){if(pc)parts.push({t:pc});}
      else if(pc.mark!==undefined)parts.push({t:pc.mark,mark:true});
      else if(pc.ans!==undefined)parts.push({t:pc.ans,ans:true});
      else{
        const k=gaps.length;
        const hp=sn.pieces.map(function(x){return typeof x==='string'?x:x.mark!==undefined?x.mark:x.ans!==undefined?x.ans:(x===pc?'…':x.right);}).join('');
        parts.push({gap:k});gaps.push({right:pc.right,accept:pc.accept||null,why:pc.why||'',hp:hp,picked:null,ok:null,input:!!pc.input});
      }
    });
    return {ko:sn.ko,ru:sn.ru,tip:sn.tip||'',noTr:!!sn.noTr,cue:sn.cue||'',parts:parts,gapIdx:parts.filter(function(p){return p.gap!==undefined;}).map(function(p){return p.gap;})};
  });
  return {type:'story',mode:mode,key:'story:'+mode+':'+sents.map(function(x){return x.ko;}).join('|').slice(0,80),label:label,
    sents:out,gaps:gaps,input:gaps.some(function(g){return g.input;}),bank:shuffle(bank),active:null,sel:null,checked:false,bonus:0,right:'',explain:[],hp:'Рассказ',hr:'',icon:icon||'⚖️',level:2};
}
/** «Пара или нет». У каждой частицы пара по 받침: 은/는, 이/가, 을/를, 와/과, 으로/로; у места 에/에서. */
const TWIN={'은':'는','는':'은','이':'가','가':'이','을':'를','를':'을','에':'에서','에서':'에','와':'과','과':'와','으로':'로','로':'으로'};

/** Все предложения с переводом, где есть частицы из пар и все слова известны разбору; считается один раз при первом тексте. */
function storyPool(){
  if(POOLS.STORY_POOL)return POOLS.STORY_POOL;
  const catOf={};DICT.forEach(d=>{if(d.s)catOf[d.s]=d.c;});
  POOLS.STORY_POOL=Object.keys(TRANSLATIONS).map(function(ko){
    const segs=analyze(ko);
    const gaps=[];let cur=0;
    segs.forEach(function(sg){
      const at=ko.indexOf(sg.text,cur);if(at<0)return;cur=at+sg.text.length;
      if(sg.type==='particle'&&TWIN[sg.text])gaps.push({at:at,right:sg.text,why:sg.explain||sg.gloss});
    });
    return {ko:ko,ru:TRANSLATIONS[ko],gaps:gaps,cats:catOf[ko]||[],ok:!segs.some(function(sg){return sg.type==='unknown';})};
  }).filter(function(x){return x.ok&&x.gaps.length;});
  return POOLS.STORY_POOL;
}
/** Текст из `n` предложений одной темы (если в теме хватает), в каждом до двух пропусков; плитки: частицы и их пары. */
function genStory(lo,hi){
  const pool=storyPool();
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const bycat={};pool.forEach(function(x){x.cats.forEach(function(c){(bycat[c]||(bycat[c]=[])).push(x);});});
  const rich=Object.keys(bycat).filter(function(c){return bycat[c].length>=n;});
  const src=rich.length&&Math.random()<.75?bycat[rnd(rich)]:pool;
  const bank=new Set();
  const sents=shuffle(src).slice(0,n).map(function(x){
    const use=shuffle(x.gaps).slice(0,2).sort(function(a,b){return a.at-b.at;});
    const pieces=[];let pos=0;
    use.forEach(function(g){
      pieces.push(x.ko.slice(pos,g.at));pieces.push({right:g.right,why:g.why});
      bank.add(g.right);bank.add(TWIN[g.right]);pos=g.at+g.right.length;
    });
    pieces.push(x.ko.slice(pos));
    return {ko:x.ko,ru:x.ru,pieces:pieces};
  });
  return makeStory('pair','Рассказ ('+plural(n)+'): поставь частицы',sents,[...bank]);
}
/** «Куда, где»: день человека: в каждом предложении место и действие, нужно 에 (куда, где находишься) или 에서 (где действие). */
function genPlaceStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const combos=[];
  PLACES.forEach(function(p){
    combos.push({p:p,t:'go'},{p:p,t:'be'});
    p.slice(3).forEach(function(a){combos.push({p:p,t:'do',a:a});});
  });
  const picked=[];let last=null;
  const order=shuffle(combos);
  while(picked.length<n){
    let i=order.findIndex(function(c){return (!last||c.p!==last)&&!picked.includes(c)&&(picked.length>=PLACES.length||!picked.some(function(x){return x.p===c.p;}));});
    if(i<0)i=order.findIndex(function(c){return !picked.includes(c);});
    if(i<0)break;
    picked.push(order[i]);last=order[i].p;
  }
  const sents=picked.map(function(c){
    const p=c.p;let post,ru,right,why;
    if(c.t==='go'){post=' 가요.';ru='Я иду '+p[1]+'.';right='에';why='Куда идёшь (가요) → 에';}
    else if(c.t==='be'){post=' 있어요.';ru='Я '+p[2]+'.';right='에';why='Где находишься (있어요) → 에';}
    else{post=' '+c.a[0]+'.';ru=cap1(p[2])+' '+c.a[1]+'.';right='에서';why='Где что-то делаешь ('+c.a[0]+') → 에서';}
    return {ko:'저는 '+p[0]+right+post,ru:ru,pieces:['저는 '+p[0],{right:right,why:why},post]};
  });
  return makeStory('place','День ('+plural(picked.length)+'): 에 или 에서',sents,['에','에서','를','는'],'📍');
}
/** «Тоже»: новое действие → частица темы (은/는, можно и 이/가), то же действие у другого человека → 도. */
const TOO_SUBJ=[['엄마','мама'],['아빠','папа'],['친구','друг'],['선생님','учитель'],['학생','ученик'],['형','старший брат']];
const TOO_PRED=[['학교에 가요','идёт в школу'],['공원에 가요','идёт в парк'],['빵을 먹어요','ест хлеб'],['커피를 마셔요','пьёт кофе'],['한국어를 공부해요','учит корейский'],['집에 있어요','дома']];

/** Слова шаблона, которых нет в разборе, отбрасываются (чтобы в карточках не было «?»). */
function tooPool(){
  if(POOLS.TOO_POOL)return POOLS.TOO_POOL;
  const known=t=>!analyze(t).some(function(sg){return sg.type==='unknown';});
  POOLS.TOO_POOL={subj:TOO_SUBJ.filter(function(x){return known(x[0]+'는 집에 있어요.');}),pred:TOO_PRED.filter(function(x){return known('엄마는 '+x[0]+'.');})};
  return POOLS.TOO_POOL;
}
function genTooStory(lo,hi){
  const pool=tooPool();
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  let order=shuffle(pool.subj),oi=0;
  const take=function(){if(oi>=order.length){order=shuffle(pool.subj);oi=0;}return order[oi++];};
  const sents=[];let prev=null,reps=0;
  for(let i=0;i<n;i++){
    let sj=take();if(prev&&sj[0]===prev.s[0])sj=take();
    const repeat=!!prev&&(i===n-1&&!reps?true:Math.random()<.55);
    if(repeat){
      reps++;
      sents.push({ko:sj[0]+'도 '+prev.p[0]+'.',ru:cap1(sj[1])+' тоже '+prev.p[1]+'.',
        pieces:[sj[0],{right:'도',why:'То же действие, что в предыдущем предложении, но делает другой человек → 도 («тоже») вместо 은/는, 이/가'},' '+prev.p[0]+'.']});
    }else{
      const p=rnd(pool.pred.filter(function(x){return !prev||x!==prev.p;}));
      const fin=hasFinal(sj[0][sj[0].length-1]);
      const right=fin?'은':'는',alt=fin?'이':'가';
      sents.push({ko:sj[0]+right+' '+p[0]+'.',ru:cap1(sj[1])+' '+p[1]+'.',
        pieces:[sj[0],{right:right,accept:[alt],why:'Новое действие → частица темы '+right+' (у слова «'+sj[0]+'» '+(fin?'есть':'нет')+' 받침). Можно и '+alt+'.'},' '+p[0]+'.']});
      prev={s:sj,p:p};
    }
  }
  return makeStory('too','Тоже ('+plural(n)+'): 도 или другая частица',sents,['도','은','는','이','가'],'➕');
}

/** «Это или не это»: знакомство с вещами: 이에요 / 예요 / 이 아니에요 / 가 아니에요 по 받침. */

function negPool(){
  if(POOLS.NEG_POOL)return POOLS.NEG_POOL;
  POOLS.NEG_POOL=D.S.filter(function(r){return /^[а-яё]+$/i.test(r[2])&&!analyze(r[0]+'이에요.').some(function(sg){return sg.type==='unknown';});});
  return POOLS.NEG_POOL;
}
function genNegStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const sents=shuffle(negPool()).slice(0,n).map(function(w){
    const ko=w[0],fin=jong(ko[ko.length-1])>0,neg=Math.random()<.5;
    const right=neg?(fin?'이 아니에요':'가 아니에요'):(fin?'이에요':'예요');
    return {ko:ko+right+'.',ru:(neg?'Это не ':'Это ')+w[2]+'.',pieces:[ko,{right:right,why:'У слова «'+ko+'» '+(fin?'есть':'нет')+' 받침 → '+right},'.']};
  });
  return makeStory('neg','Это или не это ('+plural(n)+'): выбери окончание',sents,['이에요','예요','이 아니에요','가 아니에요'],'🙅');
}
/** «Когда? (에)»: распорядок: у дней и времени суток нужна 에, у 오늘, 내일, 지금 частица не нужна (плитка «—»). */
const NOPART='—';
function genWhenStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const acts=shuffle(WHEN_ACT),ons=shuffle(WHEN_ON),offs=shuffle(WHEN_OFF);
  const sents=[];
  for(let i=0;i<n;i++){
    const off=Math.random()<.3;
    const time=off?offs[i%offs.length]:ons[i%ons.length],act=acts[i%acts.length];
    const right=off?NOPART:'에';
    sents.push({ko:time[0]+(off?'':'에')+' '+act[0]+'.',ru:cap1(time[1])+' '+act[1]+'.',
      pieces:[time[0],{right:right,why:off?'С 오늘, 내일, 지금 частицу 에 не ставят: «—».':'Слово отвечает на вопрос «когда» → к нему добавляется 에.'},' '+act[0]+'.']});
  }
  return makeStory('when','Когда? ('+plural(n)+'): 에 или «—»',sents,['에','에서','는',NOPART],'🕒');
}
/** «Этот, тот, вон тот»: сцена: у каждого предложения пометка, где предмет (рядом со мной, с тобой, далеко от обоих); в пропуск нужный указатель. */
const DEM_CUE={near:'рядом со мной',mid:'рядом с тобой',far:'далеко от обоих'};
const DEM_WHY={near:'близко ко мне',mid:'близко к собеседнику',far:'далеко от обоих'};
const DEM_DET={near:'이',mid:'그',far:'저'},DEM_THING={near:'이것',mid:'그것',far:'저것'},DEM_PLACE={near:'여기',mid:'거기',far:'저기'};
const DEM_RU_DET={near:{f:'Эта',m:'Этот',n:'Это'},mid:{f:'Та',m:'Тот',n:'То'},far:{f:'Вон та',m:'Вон тот',n:'Вон то'}};
const DEM_RU_THING={near:'Это',mid:'То',far:'Вон то'},DEM_RU_PLACE={near:'Здесь',mid:'Там',far:'Вон там'};
const DEM_NOUN=[['책','книга','f'],['가방','сумка','f'],['나무','дерево','n'],['집','дом','m'],['꽃','цветок','m'],['산','гора','f'],['문','дверь','f']];
const DEM_PRED=[['커요',{f:'большая',m:'большой',n:'большое'}],['작아요',{f:'маленькая',m:'маленький',n:'маленькое'}],['예뻐요',{f:'красивая',m:'красивый',n:'красивое'}],['비싸요',{f:'дорогая',m:'дорогой',n:'дорогое'}]];
const DEM_PLACES=[['학교','школа'],['공원','парк'],['식당','столовая'],['카페','кафе'],['시장','рынок'],['은행','банк'],['도서관','библиотека']];
function genDemStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const sents=[],seen=new Set(),bank=new Set();
  for(let t=0;sents.length<n&&t<200;t++){
    const dist=rnd(['near','mid','far']),fam=rnd(['det','thing','place']);
    let right,post,ru;
    if(fam==='det'){
      const nn=rnd(DEM_NOUN),pr=rnd(DEM_PRED),fin=jong(nn[0][nn[0].length-1])>0;
      right=DEM_DET[dist];post=' '+nn[0]+(fin?'은':'는')+' '+pr[0]+'.';ru=DEM_RU_DET[dist][nn[2]]+' '+nn[1]+' '+pr[1][nn[2]]+'.';
      [DEM_DET.near,DEM_DET.mid,DEM_DET.far].forEach(function(w){bank.add(w);});
    }else if(fam==='thing'){
      const nn=rnd(DEM_NOUN),fin=jong(nn[0][nn[0].length-1])>0;
      right=DEM_THING[dist];post='은 '+nn[0]+(fin?'이에요':'예요')+'.';ru=DEM_RU_THING[dist]+' — '+nn[1]+'.';
      [DEM_THING.near,DEM_THING.mid,DEM_THING.far].forEach(function(w){bank.add(w);});
    }else{
      const pl=rnd(DEM_PLACES),fin=jong(pl[0][pl[0].length-1])>0;
      right=DEM_PLACE[dist];post='는 '+pl[0]+(fin?'이에요':'예요')+'.';ru=DEM_RU_PLACE[dist]+' — '+pl[1]+'.';
      [DEM_PLACE.near,DEM_PLACE.mid,DEM_PLACE.far].forEach(function(w){bank.add(w);});
    }
    const ko=right+post;
    if(seen.has(ko)){continue;}seen.add(ko);
    sents.push({ko:ko,ru:ru,cue:DEM_CUE[dist],pieces:[{right:right,why:right+' — '+DEM_WHY[dist]+' (этот / тот / вон тот)'},post]});
  }
  return makeStory('dem','Этот, тот ('+plural(sents.length)+'): выбери указатель',sents,[...bank],'👉');
}
/* ---------- «Слово → перевод» и «Перевод → слово»: слова в предложениях ---------- */
/** Первый перевод слова: «пить; выпивать» → «пить». */
const firstRu=t=>String(t||'').split(/[;,(]/)[0].trim();

/** Слова сайта с примером и переводом: где слово стоит в предложении (`at`, `len`: само слово или основа глагола) и все слова предложения известны разбору. */
function wsentPool(){
  if(POOLS.WSENT_POOL)return POOLS.WSENT_POOL;
  POOLS.WSENT_POOL=DICT.filter(function(d){return d.s&&TRANSLATIONS[d.s]&&d.t;}).map(function(d){
    let at=d.s.indexOf(d.k),len=d.k.length;
    if(at<0&&/다$/.test(d.k)&&d.k.length>2){at=d.s.indexOf(d.k.slice(0,-1));len=d.k.length-1;}
    return {k:d.k,ko:d.s,ru:TRANSLATIONS[d.s],t:firstRu(d.t),at:at,len:len,cats:d.c||[],verb:/다$/.test(d.k)};
  }).filter(function(x){return x.at>=0&&x.t&&x.t.length<=24&&!analyze(x.ko).some(function(sg){return sg.type==='unknown';});});
  return POOLS.WSENT_POOL;
}
/** Слова для текста: разные переводы, из разных предложений; по возможности одной темы. */
function wsentPick(n){
  const pool=wsentPool();
  const bycat={};pool.forEach(function(x){x.cats.forEach(function(c){(bycat[c]||(bycat[c]=[])).push(x);});});
  const rich=Object.keys(bycat).filter(function(c){return bycat[c].length>=n;});
  const src=rich.length&&Math.random()<.6?bycat[rnd(rich)]:pool;
  const out=[],seenT=new Set(),seenS=new Set();
  shuffle(src).forEach(function(x){if(out.length<n&&!seenT.has(x.t)&&!seenS.has(x.ko)){out.push(x);seenT.add(x.t);seenS.add(x.ko);}});
  return out;
}
/** Слова-ловушки: из того же пула, тех же тем и частей речи в первую очередь. */
function wsentLures(picked,count,key){
  const have=new Set(picked.map(function(x){return key(x);}));
  const pool=wsentPool().filter(function(x){return !have.has(key(x));});
  const near=pool.filter(function(x){return picked.some(function(p){return p.verb===x.verb&&p.cats.some(function(c){return x.cats.includes(c);});});});
  const out=[];
  shuffle(near).concat(shuffle(pool)).forEach(function(x){if(out.length<count&&!out.some(function(o){return key(o)===key(x);}))out.push(x);});
  return out;
}
/** «Слово → перевод»: слово подсвечено в предложении, нужно поставить его перевод по смыслу. Перевод предложения скрыт: он выдал бы ответ. */
function genWordStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const words=wsentPick(n);
  const sents=words.map(function(x){
    return {ko:x.ko,ru:x.ru,noTr:true,pieces:[x.ko.slice(0,x.at),{mark:x.ko.slice(x.at,x.at+x.len)},x.ko.slice(x.at+x.len),'  →  ',
      {right:x.t,why:'«'+x.k+'» здесь значит «'+x.t+'». Предложение: '+x.ru}]};
  });
  const bank=words.map(function(x){return x.t;}).concat(wsentLures(words,hi>5?6:3,function(x){return x.t;}).map(function(x){return x.t;}));
  return makeStory('word','Слово в предложении ('+plural(sents.length)+'): выбери перевод выделенного слова',sents,[...new Set(bank)],'🔤');
}
/** «Перевод → слово»: по-русски предложение целиком (иконка слева), по-корейски в нём пропущено существительное. */
function genRevStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const nouns=wsentPool().filter(function(x){return !x.verb&&x.len===x.k.length;});
  const bycat={};nouns.forEach(function(x){x.cats.forEach(function(c){(bycat[c]||(bycat[c]=[])).push(x);});});
  const rich=Object.keys(bycat).filter(function(c){return bycat[c].length>=n;});
  const src=rich.length&&Math.random()<.6?bycat[rnd(rich)]:nouns;
  const words=[],seen=new Set();
  shuffle(src).forEach(function(x){if(words.length<n&&!seen.has(x.k)&&!seen.has(x.ko)){words.push(x);seen.add(x.k);seen.add(x.ko);}});
  const sents=words.map(function(x){
    return {ko:x.ko,ru:x.ru,pieces:[x.ko.slice(0,x.at),{right:x.k,why:'«'+x.t+'» по-корейски — '+x.k},x.ko.slice(x.at+x.len)]};
  });
  const lures=wsentLures(words,hi>5?6:3,function(x){return x.k;}).filter(function(x){return !x.verb;});
  const bank=words.map(function(x){return x.k;}).concat(lures.map(function(x){return x.k;}));
  return makeStory('rev','Перевод → слово ('+plural(sents.length)+'): поставь пропущенное слово',sents,[...new Set(bank)],'🔁');
}
/* ---------- «Вопросы», «Частицы и счёт», «Выбери форму»: тексты ---------- */
const known=ko=>!analyze(ko).some(function(sg){return sg.type==='unknown';});
/** «Вопросы»: пары «вопрос — ответ» из диалогов; в вопросе пропущено вопросительное слово, подсказка только в переводе ответа (иконка слева). */
const QW_WORDS=['어디','누구','뭐','얼마','몇','어느','무슨'];

function qwPool(){
  if(POOLS.QW_POOL)return POOLS.QW_POOL;
  POOLS.QW_POOL=EXCHANGES.map(function(e){
    const hit=QW_WORDS.filter(function(w){return e[0].split(/[ ?]/).some(function(t){return t===w||t.startsWith(w+'에')||t.startsWith(w+'예')||t.startsWith(w+'이')||t.startsWith(w+'의');});});
    if(hit.length!==1)return null;
    const at=e[0].indexOf(hit[0]);
    if(at<0)return null;
    return {q:e[0],qru:e[1],a:e[2],aru:e[3],w:hit[0],at:at};
  }).filter(function(x){return x&&known(x.q);});
  return POOLS.QW_POOL;
}
function genQwStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const picked=shuffle(qwPool()).slice(0,n);
  const sents=picked.map(function(x){
    return {ko:x.q,ru:x.qru,tip:'Ответ: «'+x.aru+'»',
      pieces:[x.q.slice(0,x.at),{right:x.w,why:'Ответ «'+x.a+'» ('+x.aru+') подсказывает вопрос: '+x.w},x.q.slice(x.at+x.w.length),'   →   ',{ans:x.a}]};
  });
  const bank=new Set(picked.map(function(x){return x.w;}));
  shuffle(QW_WORDS).forEach(function(w){if(bank.size<Math.min(QW_WORDS.length,(hi>5?7:5)))bank.add(w);});
  return makeStory('qw','Вопросы ('+plural(picked.length)+'): поставь вопросительное слово',sents,[...bank],'❓');
}
/** «Частицы и счёт»: предложения из банка частиц и счётных слов, в пропуске нужное слово; в банке всё, что встречалось как вариант. */

function partPool(){
  if(POOLS.PART_POOL)return POOLS.PART_POOL;
  POOLS.PART_POOL=D.PB.map(function(p){return {pre:p[0].split('___')[0],post:p[0].split('___')[1]||'',ru:p[1],right:p[2],opts:p[3],why:p[4],ko:p[0].replace('___',p[2])};}).filter(function(x){return known(x.ko);});
  return POOLS.PART_POOL;
}
function genPartStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const picked=shuffle(partPool()).slice(0,n);
  const sents=picked.map(function(x){return {ko:x.ko,ru:x.ru,pieces:[x.pre,{right:x.right,why:x.why},x.post]};});
  const bank=new Set(picked.map(function(x){return x.right;}));
  shuffle(picked.flatMap(function(x){return x.opts;})).forEach(function(t){if(bank.size<picked.length+(hi>5?5:3))bank.add(t);});
  return makeStory('part','Частицы и счёт ('+plural(picked.length)+'): поставь нужное слово',sents,[...bank],'🧩');
}
/** «Выбери форму»: в предложении глагол или прилагательное без окончания (основа), в пропуск нужно поставить окончание: 아요 / 어요 / 았어요 / 었어요. Только слова, где основа и окончание просто склеиваются (без слияния). */

function formPool(){
  if(POOLS.FORM_POOL)return POOLS.FORM_POOL;
  const stems=new Set();
  DICT.forEach(function(d){if(/다$/.test(d.k)&&!/하다$/.test(d.k))stems.add(d.k.slice(0,-1));});
  [...D.V,...D.A].forEach(function(r){if(/다$/.test(r[0])&&!/하다$/.test(r[0]))stems.add(r[0].slice(0,-1));});
  const out=[];
  Object.keys(TRANSLATIONS).forEach(function(ko){
    const words=ko.replace(/[.?!,]/g,'').split(' ');
    words.forEach(function(w){
      for(const e of ['았어요','었어요','아요','어요']){
        if(!w.endsWith(e))continue;
        const stem=w.slice(0,-e.length);
        if(stem&&stems.has(stem)&&jong(stem[stem.length-1])>0){
          const at=ko.indexOf(w);
          const a=jung(stem[stem.length-1]);const harmony=a===0||a===8;// ㅏ, ㅗ
          const past=e[0]==='았'||e[0]==='었';
          if((e==='아요'||e==='았어요')===harmony&&known(ko))out.push({ko:ko,ru:TRANSLATIONS[ko],stem:stem,e:e,at:at+stem.length,past:past,harmony:harmony});
        }
        break;
      }
    });
  });
  const seen=new Set();
  POOLS.FORM_POOL=out.filter(function(x){const k=x.stem;if(seen.has(k))return false;seen.add(k);return true;});
  return POOLS.FORM_POOL;
}
function genFormStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const pool=formPool();
  const picked=shuffle(pool).slice(0,n);
  const sents=picked.map(function(x){
    const vow=x.harmony?'ㅏ или ㅗ':'не ㅏ и не ㅗ';
    const why=x.stem+' + '+x.e+' → '+x.stem+x.e+'. У основы последний гласный '+vow+' → '+(x.harmony?'아':'어')+(x.past?', прошедшее время → '+(x.harmony?'았':'었')+'어요':', настоящее время → '+(x.harmony?'아요':'어요'));
    return {ko:x.ko,ru:x.ru,cue:x.past?'в прошлом':'',pieces:[x.ko.slice(0,x.at),{right:x.e,why:why},x.ko.slice(x.at+x.e.length)]};
  });
  return makeStory('form','Окончания ('+plural(picked.length)+'): добавь окончание к основе',sents,['아요','어요','았어요','었어요'],'🔧');
}
/* ---------- «Дни недели», «Числа», «Сколько стоит?», «Счётные слова», «Уровень вежливости»: тексты ---------- */
const DAYS_ACC=['в понедельник','во вторник','в среду','в четверг','в пятницу','в субботу','в воскресенье'];
const DAY_ACTS=[['학교에 가요','иду в школу'],['공원에서 운동해요','занимаюсь спортом в парке'],['영화를 봐요','смотрю кино'],['친구를 만나요','встречаюсь с другом'],['집에서 쉬어요','отдыхаю дома'],['커피를 마셔요','пью кофе'],['빵을 먹어요','ем хлеб']];
/** «Дни недели»: расписание недели (день → 에 + действие) и вопросы «а завтра какой день?». Подсказка у второго вида только в иконке, и в ней нет ответа. */
function genDaysStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const acts=DAY_ACTS.filter(function(a){return known('월요일에 '+a[0]+'.');});
  const sents=[],seen=new Set();
  let guard=0;
  while(sents.length<n&&guard++<80){
    const i=Math.floor(Math.random()*7);
    if(Math.random()<.5){
      const d=DAYS[i],a=rnd(acts);
      const ko=d[0]+'에 '+a[0]+'.';
      if(seen.has(ko))continue;seen.add(ko);
      sents.push({ko:ko,ru:cap1(DAYS_ACC[i])+' я '+a[1]+'.',pieces:[{right:d[0],why:'«'+d[1]+'» по-корейски — '+d[0]+'; «в такой-то день» = день + 에'},'에 '+a[0]+'.']});
    }else{
      const t=DAYS[i],nx=DAYS[(i+1)%7];
      const ko='오늘은 '+t[0]+'이에요. 내일은 '+nx[0]+'이에요.';
      if(seen.has(ko))continue;seen.add(ko);
      sents.push({ko:ko,ru:'Сегодня '+t[1]+'. Завтра '+nx[1]+'.',tip:'Сегодня '+t[1]+'. Какой день завтра?',
        pieces:['오늘은 '+t[0]+'이에요. 내일은 ',{right:nx[0],why:'Сегодня '+t[0]+', завтра следующий по кругу: '+nx[0]+' ('+nx[1]+')'},'이에요.']});
    }
  }
  return makeStory('days','Дни недели ('+plural(sents.length)+'): поставь день',sents,DAYS.map(function(d){return d[0];}),'📅');
}
/** Предметы и их счётные слова (только слова, известные разбору). */
const COUNT_ITEMS=[['사과','яблоко','개'],['물','вода','병'],['커피','кофе','잔'],['비빔밥','бибимбап','그릇'],['학생','ученик','명'],['고양이','кот','마리'],['책','книга','권'],['빵','хлеб','개'],['친구','друг','명'],['우유','молоко','병']];
const NATF=['한','두','세','네','다섯','여섯','일곱','여덟','아홉','열'];
const COUNTERS_ALL=['병','잔','개','그릇','명','마리','권','장'];
const subjP=w=>w+(hasFinal(w[w.length-1])?'이':'가');
function countItems(){
  if(POOLS.COUNT_ITEMS)return POOLS.COUNT_ITEMS;
  POOLS.COUNT_ITEMS=COUNT_ITEMS.filter(function(x){return known(subjP(x[0])+' 세 '+x[2]+' 있어요.');});
  return POOLS.COUNT_ITEMS;
}
function countRow(x,n,gapKind){
  const num=NATF[n-1];
  const ko=subjP(x[0])+' '+num+' '+x[2]+' 있어요.';
  const ru=cap1(x[1])+': '+n+'.';
  const why='«'+x[0]+'» считают словом «'+x[2]+'»; '+n+' = '+NATF[n-1]+(n<=4?' (перед счётным слово короче: 하나 → 한, 둘 → 두, 셋 → 세, 넷 → 네)':'');
  const pieces=gapKind==='num'?[subjP(x[0])+' ',{right:num,why:why},' '+x[2]+' 있어요.']:[subjP(x[0])+' '+num+' ',{right:x[2],why:why},' 있어요.'];
  return {ko:ko,ru:ru,pieces:pieces};
}
function genCountStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const items=shuffle(countItems());
  const sents=[],seen=new Set();
  for(let i=0;sents.length<n&&i<items.length*3;i++){
    const x=items[i%items.length],k=1+Math.floor(Math.random()*9);
    const row=countRow(x,k,Math.random()<.5?'num':'cnt');
    if(seen.has(row.ko))continue;seen.add(row.ko);sents.push(row);
  }
  const bank=new Set();
  sents.forEach(function(r){r.pieces.forEach(function(p){if(typeof p!=='string')bank.add(p.right);});});
  shuffle(COUNTERS_ALL).slice(0,3).forEach(function(c){bank.add(c);});
  shuffle(NATF).slice(0,3).forEach(function(c){bank.add(c);});
  return makeStory('count','Счётные слова ('+plural(sents.length)+'): поставь число или счётное слово',sents,[...bank],'🥤');
}
/** «Числа»: корейские числа перед счётным словом (한, 두, 세…) и китайские числа для этажей (일 층, 이 층…). Какой ряд нужен, определяет слово после пропуска. */
function genNumStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const items=shuffle(countItems());
  const sents=[],seen=new Set();
  for(let i=0;sents.length<n&&i<60;i++){
    if(Math.random()<.65){
      const x=items[i%items.length],k=1+Math.floor(Math.random()*9);
      const row=countRow(x,k,'num');
      if(seen.has(row.ko))continue;seen.add(row.ko);sents.push(row);
    }else{
      const k=1+Math.floor(Math.random()*9);
      const ko=SINO[k-1]+' 층에 있어요.';
      if(seen.has(ko))continue;seen.add(ko);
      sents.push({ko:ko,ru:'Находится на '+k+'-м этаже.',pieces:[{right:SINO[k-1],why:'Этаж («층») считают китайскими числами: '+k+' = '+SINO[k-1]},' 층에 있어요.']});
    }
  }
  const bank=new Set();
  sents.forEach(function(r){r.pieces.forEach(function(p){if(typeof p!=='string')bank.add(p.right);});});
  shuffle(NATF.concat(SINO)).slice(0,hi>5?8:5).forEach(function(c){bank.add(c);});
  return makeStory('num','Числа ('+plural(sents.length)+'): поставь число',sents,[...bank],'🔢');
}
/** «Сколько стоит?»: меню с ценами по-корейски и строка «всего»: нужно прочитать цену китайскими числами. Цифры стоят в иконке, итог надо сложить самому. */
const PRICE_ITEMS=[['피자','пицца'],['햄버거','гамбургер'],['스파게티','спагетти'],['콜라','кола'],['커피','кофе'],['빵','хлеб'],['주스','сок']];
const PRICES=[1500,2000,2500,3000,3500,4000,4500,5000,6000,7000,8000,9000,10000,12000,15000,18000,20000];
/** Цены из меню учебника (снимки 076, 080, 081): пицца 15 000, гамбургер 8 000, спагетти 12 000, кола 2 000; у остальных позиций цена случайная. */
const PRICE_BOOK={'피자':15000,'햄버거':8000,'스파게티':12000,'콜라':2000};
const topicP=w=>w+(hasFinal(w[w.length-1])?'은':'는');
function genPriceStory(lo,hi){
  const n=Math.max(2,lo+Math.floor(Math.random()*(hi-lo+1)));
  const items=shuffle(PRICE_ITEMS.filter(function(x){return known(topicP(x[0])+' 만오천 원이에요.');}));
  const rows=Math.min(n,items.length);
  const sents=[];let sum=0;
  const spaced=v=>String(v).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
  for(let i=0;i<rows;i++){
    const price=PRICE_BOOK[items[i][0]]||rnd(PRICES);sum+=price;
    const r=sinoNum(price);
    sents.push({ko:topicP(items[i][0])+' '+r+' 원이에요.',ru:cap1(items[i][1])+': '+spaced(price)+' вон.',tip:cap1(items[i][1])+': '+spaced(price)+' вон',
      pieces:[topicP(items[i][0])+' ',{right:r,why:spaced(price)+' = '+r+(price>=10000?' (만 = 10 000, перед 만 цифру 일 не говорят)':'')},' 원이에요.']});
  }
  if(sum<100000){
    const r=sinoNum(sum);
    sents.push({ko:'모두 '+r+' 원이에요.',ru:'Всего: '+spaced(sum)+' вон.',tip:'Сколько всего? Сложи все цены выше',
      pieces:['모두 ',{right:r,why:'Всего '+spaced(sum)+' = '+r},' 원이에요.']});
  }
  const bank=new Set();
  sents.forEach(function(x){x.pieces.forEach(function(p){if(typeof p!=='string')bank.add(p.right);});});
  const base=sents.length?sum:5000;
  [base+1000,base-1000,base*10,Math.floor(base/10)*1000||2000,base+500,base+10000].forEach(function(v){if(v>0&&v<100000&&bank.size<sents.length+(hi>5?5:3))bank.add(sinoNum(v));});
  return makeStory('price','Цены ('+plural(sents.length)+'): прочитай цену',sents,[...bank],'💴');
}
/** «Уровень вежливости»: кому и как сказать «спасибо»; у каждой формы несколько адресатов. */
const POLITE_TO={'고마워':['другу','младшему брату или сестре','однокласснику'],'고마워요':['знакомому старше тебя','старшему брату','соседке'],'감사해요':['коллеге','товарищу по работе','соседу по офису'],'감사합니다':['начальнику','учителю','незнакомому взрослому']};
function genPoliteStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const order=shuffle(POLITE.map(function(x){return x[0];}));
  const rows=[];
  for(let i=0;rows.length<n&&i<40;i++){
    const f=order[i%order.length];
    const who=POLITE_TO[f][Math.floor(i/order.length)%POLITE_TO[f].length];
    if(rows.some(function(r){return r.f===f&&r.who===who;}))continue;
    rows.push({f:f,who:who});
  }
  const sents=rows.map(function(r){
    const ex=POLITE_EX[r.f];const at=ex.indexOf(r.f);
    const desc=POLITE.find(function(x){return x[0]===r.f;})[1];
    return {ko:ex,ru:'Спасибо — '+r.who+'.',cue:'говоришь '+r.who,
      pieces:[ex.slice(0,at),{right:r.f,why:r.f+' — '+desc+'. От неформального к официальному: '+POLITE.map(function(x){return x[0];}).join(' → ')},ex.slice(at+r.f.length)]};
  });
  return makeStory('polite','Спасибо ('+plural(sents.length)+'): кому как сказать',sents,POLITE.map(function(x){return x[0];}),'🙏');
}
/* ---------- «Диалог», «Хангыль-блиц», «Найди верное», «Найди ошибку»: уровни ---------- */
/** «Диалог»: вопросы по очереди, на каждый нужен свой ответ из банка (в банке лишние ответы на другие вопросы). */
function genDlgStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  // у строк разные теги: ответы одного тега подходят друг к другу, и тогда «неверный» ответ был бы обидным
  const picked=[],tags=new Set();
  shuffle(EXCHANGES.filter(function(e){return known(e[2]);})).forEach(function(e){if(picked.length<n&&!tags.has(e[4])){picked.push(e);tags.add(e[4]);}});
  const sents=picked.map(function(x){
    return {ko:x[2],ru:x[3],tip:'Вопрос: '+x[1],pieces:[x[0]+'   →   ',{right:x[2],why:'На вопрос «'+x[0]+'» ('+x[1]+') отвечают так: '+x[2]+' ('+x[3]+')'}]};
  });
  const bank=picked.map(function(x){return x[2];});
  shuffle(EXCHANGES.filter(function(e){return !tags.has(e[4])&&!bank.includes(e[2]);})).slice(0,hi>5?4:2).forEach(function(e){bank.push(e[2]);});
  return makeStory('dlg','Диалог ('+plural(sents.length)+'): ответь на каждый вопрос',sents,[...new Set(bank)],'💬');
}
/** «Хангыль-блиц»: «Слова» — прочитать слово (выбрать, как оно звучит), «Строки» — прочитать три слова подряд. */
let HAN_WORDS=null;
function hanWords(){
  if(HAN_WORDS)return HAN_WORDS;
  HAN_WORDS=DICT.filter(function(d){return d.r&&/^[가-힣]+$/.test(d.k)&&d.k.length>=2&&d.k.length<=4&&/^[а-яё]+$/i.test(d.r);}).map(function(d){return {k:d.k,r:d.r,t:d.t};});
  return HAN_WORDS;
}
function hanOptions(right,pool,len){
  const dis=[];const used=new Set([right]);
  shuffle(pool).forEach(function(x){if(dis.length<3&&!used.has(x)&&Math.abs(x.length-right.length)<=2){used.add(x);dis.push(x);}});
  return shuffle([right,...dis]);
}
function genHanWord(){
  const pool=hanWords();
  const w=pickW(pool,x=>'hw:'+x.k);
  const opts=hanOptions(w.r,pool.map(function(x){return x.r;})).map(function(t){return {text:t};});
  return {type:'choice',mode:'han',key:'hw:'+w.k,label:'Прочитай слово: как оно звучит?',prompt:w.k,promptKo:true,
    options:opts,correct:opts.findIndex(function(o){return o.text===w.r;}),right:w.r,explain:[w.k+' = '+w.r,w.t?'Значение: '+w.t:''],
    hp:w.k,hr:w.r,icon:'ㅎ'};
}
function genHanLine(){
  const pool=hanWords();
  const picked=shuffle(pool).slice(0,3);
  const right=picked.map(function(x){return x.r;}).join(' ');
  const opts=new Set([right]);
  let guard=0;
  while(opts.size<4&&guard++<40){
    const swap=Math.floor(Math.random()*3);
    const alt=picked.map(function(x,i){if(i!==swap)return x.r;const o=rnd(pool.filter(function(y){return y.r!==x.r&&Math.abs(y.r.length-x.r.length)<=1;}));return o.r;}).join(' ');
    opts.add(alt);
  }
  const line=picked.map(function(x){return x.k;}).join(' ');
  const list=shuffle([...opts]).map(function(t){return {text:t};});
  return {type:'choice',mode:'han',key:'hl:'+line,label:'Прочитай строку: как она звучит?',prompt:line,promptKo:true,
    options:list,correct:list.findIndex(function(o){return o.text===right;}),right:right,explain:[line+' = '+right,picked.map(function(x){return x.k+' — '+x.t;}).join('; ')],
    hp:line,hr:right,icon:'ㅎ'};
}
/** «Найди верное»: три текста из нескольких предложений, в двух по одной ошибке в частице, в одном всё верно. */
function spotPool(){
  if(POOLS.SPOT_POOL)return POOLS.SPOT_POOL;
  POOLS.SPOT_POOL=D.PB.filter(function(p){return !/\s/.test(p[2])&&known(p[0].replace('___',p[2]));}).map(function(p){return {pre:p[0].split('___')[0],post:p[0].split('___')[1]||'',right:p[2],opts:p[3].filter(function(t){return t!==p[2]&&!/\s/.test(t);}),ru:p[1],why:p[4]};});
  return POOLS.SPOT_POOL;
}
function genSpotText(lo,hi){
  const k=lo+Math.floor(Math.random()*(hi-lo+1));
  const base=shuffle(spotPool()).slice(0,k);
  const good=base.map(function(x){return x.pre+x.right+x.post;});
  const bad=shuffle(base.map(function(x,i){return i;})).slice(0,2);
  const variants=[good];
  const notes=[];
  bad.forEach(function(i){
    const x=base[i];const w=rnd(x.opts);
    const t=good.slice();t[i]=x.pre+w+x.post;variants.push(t);
    notes.push('В «'+t[i]+'» ошибка: нужно «'+x.right+'», а не «'+w+'». '+x.why);
  });
  const texts=variants.map(function(t){return t.join(' ');});
  const list=shuffle(texts).map(function(t){return {text:t,ko:true};});
  const right=good.join(' ');
  return {type:'choice',mode:'spot',key:'sp:'+right.slice(0,60),label:'В каком тексте нет ошибок?',prompt:base.map(function(x){return x.ru;}).join(' '),promptKo:false,
    options:list,correct:list.findIndex(function(o){return o.text===right;}),right:right,explain:notes,teach:good[0],trans:base[0].ru,hp:'Тексты без ошибок',hr:right,icon:'🔍'};
}
/** «Найди ошибку»: каждое предложение помечается «верно» или «ошибка»; в части предложений частица подменена. */
function genErrStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const base=shuffle(spotPool()).slice(0,n);
  const nBad=Math.max(1,Math.min(n-1,Math.round(n*(.4+Math.random()*.2))));
  const badSet=new Set(shuffle(base.map(function(x,i){return i;})).slice(0,nBad));
  const sents=base.map(function(x,i){
    const right=x.pre+x.right+x.post;
    if(badSet.has(i)){
      const w=rnd(x.opts);const wrong=x.pre+w+x.post;
      return {ko:right,ru:x.ru,pieces:[wrong+'   ',{right:'ошибка',why:'Здесь ошибка: «'+w+'» вместо «'+x.right+'». Правильно: '+right+'. '+x.why}]};
    }
    return {ko:right,ru:x.ru,pieces:[right+'   ',{right:'верно',why:'Предложение верное. '+x.why}]};
  });
  return makeStory('err','Найди ошибки ('+plural(sents.length)+'): отметь каждое предложение',sents,['верно','ошибка'],'🕵️');
}
/** «Напиши форму»: в предложении вместо глагола или прилагательного пропуск, форму надо вписать с клавиатуры; в подсказке словарная форма. */
function genTypeStory(lo,hi){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const picked=shuffle(formPool()).slice(0,n);
  const sents=picked.map(function(x){
    const form=x.stem+x.e;const from=x.at-x.stem.length;
    const why=x.stem+'다 → '+form+'. У основы последний гласный '+(x.harmony?'ㅏ или ㅗ':'не ㅏ и не ㅗ')+' → '+(x.harmony?(x.past?'았어요':'아요'):(x.past?'었어요':'어요'));
    return {ko:x.ko,ru:x.ru,cue:x.stem+'다'+(x.past?', в прошлом':''),pieces:[x.ko.slice(0,from),{right:form,why:why,input:true},x.ko.slice(x.at+x.e.length)]};
  });
  return makeStory('type','Впиши форму ('+plural(sents.length)+'): глагол в нужной форме',sents,[],'⌨️');
}
/** «Порядок слов»: предложения короткого рассказа из учебника перемешаны, у каждого нужно поставить его номер по порядку (подсказка: перевод в иконке и слова-связки вроде 그리고, 거기에서). */
function genOrdStory(lo,hi){
  const fit=STORIES.filter(function(st){return st.sents.length>=lo&&st.sents.length<=hi;});
  const st=rnd(fit.length?fit:STORIES);
  const n=st.sents.length;
  let order=[...Array(n).keys()],guard=0;
  do{order=shuffle(order);}while(order.every(function(v,i){return v===i;})&&guard++<30);
  const sents=order.map(function(k){
    const x=st.sents[k];
    const why=k===0?'Рассказ начинается с этого предложения: оно вводит тему.':'Идёт '+(k+1)+'-м, после «'+st.sents[k-1].ko+'»: '+st.sents[k-1].ru;
    return {ko:x.ko,ru:x.ru,pieces:[{right:String(k+1),why:why},'   '+x.ko]};
  });
  const q=makeStory('ord','Порядок («'+st.title+'», '+plural(n)+'): поставь номера по порядку',sents,[],'🔢');
  q.bank=[...Array(n).keys()].map(function(i){return String(i+1);}); // номера идут по порядку, не вперемешку
  return q;
}
/* ---------- «Тексты по правилу»: частицы одного правила в предложениях и рассказах ---------- */
/** Чипы правил над заданием: выбор запоминается, по нему собираются предложения. */
function famChips(){
  const lv=el('div','levels fams');
  PFAMS.forEach(function(f){
    const b=el('button','chip'+(S.pfam===f.id?' on':''),f.name);b.type='button';b.title=f.hint;
    b.addEventListener('click',function(){S.pfam=f.id;save();renderQuestion(genQuestion());});
    lv.appendChild(b);
  });
  return lv;
}
/** Все предложения с переводом, где известны все слова: из сайта, рассказов, диалогов и предложений учебника; для каждого место частиц (`at`, `text`, `g`). */
/** Частица входит в правило: по карточке (`g`) и тексту; у 와 / 과 разбор карточки не указывает, берём по тексту. */
const inFam=(f,m)=>f.marks.includes(m.text)&&(f.g.includes(m.g)||(f.marks.includes('와')&&(m.text==='와'||m.text==='과')));
function genPtext(){
  const f=PFAMS.find(function(x){return x.id===S.pfam;})||PFAMS[0];
  const lv=S.levels.ptext;
  const n=lv==='long'?5+Math.floor(Math.random()*6):lv==='story'?2+Math.floor(Math.random()*3):1;
  const cands=ptextPool().map(function(x){return {x:x,gaps:x.marks.filter(function(m){return inFam(f,m);})};}).filter(function(c){return c.gaps.length;});
  // одинаковые по смыслу предложения («커피하고 우유가…» и «커피와 우유가…») в одном тексте не нужны
  const picked=[],seenRu=new Set();
  shuffle(cands).forEach(function(c){const key=c.x.ru.toLowerCase();if(picked.length<n&&!seenRu.has(key)){seenRu.add(key);picked.push(c);}});
  const bank=new Set(f.marks);
  const sents=picked.map(function(c){
    const use=shuffle(c.gaps).slice(0,2).sort(function(a,b){return a.at-b.at;});
    const pieces=[];let pos=0;
    use.forEach(function(g){
      const before=c.x.ko[g.at-1]||'';
      let accept=null;
      // «и»: к 하고 подходят 와 / 과 по 받침, и наоборот
      if(g.text==='하고')accept=[hasFinal(before)?'과':'와'];
      else if(g.text==='와'||g.text==='과')accept=['하고'];
      pieces.push(c.x.ko.slice(pos,g.at));pieces.push({right:g.text,accept:accept,why:g.why});
      pos=g.at+g.text.length;
    });
    pieces.push(c.x.ko.slice(pos));
    return {ko:c.x.ko,ru:c.x.ru,pieces:pieces};
  });
  return makeStory('ptext','Правило «'+f.name+'» ('+plural(sents.length)+'): поставь частицы',sents,[...bank],'🧩');
}
function genPair(){
  if(storyOn('pair'))return S.levels.pair==='long'?genStory(5,10):genStory(2,4);
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
  if(storyOn('ord'))return S.levels.ord==='long'?genOrdStory(5,10):genOrdStory(2,4);
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
  if(storyOn('dlg'))return S.levels.dlg==='long'?genDlgStory(5,10):genDlgStory(2,4);
  const i=pickW(EXCHANGES.map((x,k)=>k),k=>'d:'+k);
  const x=EXCHANGES[i];
  // «лишние» ответы: другие теги и другие слова (у разных пар бывает одинаковый ответ «네. 있어요.»)
  const lures=[];
  shuffle(EXCHANGES.filter(y=>y[4]!==x[4]&&y[2]!==x[2])).forEach(y=>{if(lures.length<2&&!lures.includes(y[2]))lures.push(y[2]);});
  const texts=shuffle([x[2],...lures]);
  return {type:'choice',mode:'dlg',key:'d:'+i,label:'Выбери подходящий ответ',prompt:x[0],promptKo:true,sub:x[1],
    options:texts.map(t=>({text:t,ko:true})),correct:texts.indexOf(x[2]),right:x[2],
    explain:[x[0]+' → '+x[2],x[3]],teach:x[2],hp:x[0],hr:x[2],icon:'💬'};
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
    right:right,explain:[tw[0]+' '+right,e.ko+' → '+right,e.note],teach:tw[0]+' '+right+'.',hp:tw[0]+' '+e.ko,hr:right,icon:'⏳'};
}

/* ---------- «Хангыль-блиц»: слог из букв и чтение слога ---------- */
const HAN_C=[0,2,3,5,6,7,9,11,12,14,15,16,17,18],HAN_V=[0,2,4,6,8,12,13,17,18,20];
const HAN=[];
HAN_C.forEach(c=>HAN_V.forEach(v=>{const cell=syllableRows[c].cells[v];HAN.push({ch:cell.char,rd:cell.reading,hint:cell.hint,c:c,v:v});}));
function genHan(){
  if(storyOn('han'))return S.levels.han==='long'?genHanLine():genHanWord();
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
  if(storyOn('days'))return S.levels.days==='long'?genDaysStory(5,10):genDaysStory(2,4);
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
  if(storyOn('when'))return S.levels.when==='long'?genWhenStory(5,10):genWhenStory(2,4);
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
  if(storyOn('too'))return S.levels.too==='long'?genTooStory(5,10):genTooStory(2,4);
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
  if(storyOn('num'))return S.levels.num==='long'?genNumStory(5,10):genNumStory(2,4);
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
  if(storyOn('price'))return S.levels.price==='long'?genPriceStory(5,10):genPriceStory(1,3);
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
      right:readable(n),explain:[readable(n),how,'Перед 만 цифру 일 не говорят: 10 000 = 만, а не 일만.'],teach:readable(n)+'이에요.',trans:'Это стоит '+fmtMoney(n)+'.',hp:fmtMoney(n),hr:readable(n),icon:'💴'};
  }
  return {type:'choice',mode:'price',key:key,word:null,label:'Сколько это стоит?',prompt:readable(n),promptKo:true,options:set.map(v=>({text:fmtMoney(v)})),correct:set.indexOf(n),
    right:fmtMoney(n),explain:[readable(n)+' = '+fmtMoney(n),how],teach:readable(n)+'이에요.',trans:'Это стоит '+fmtMoney(n)+'.',hp:readable(n),hr:fmtMoney(n),icon:'💴'};
}
const COUNTERS=['병','잔','개','그릇','명','마리','권','장'];
function countPool(){return D.PB.map((x,k)=>k).filter(k=>{const p=D.PB[k];return COUNTERS.includes(p[2])||/^Перед счётным/.test(p[4]);});}
function genCount(){
  if(storyOn('count'))return S.levels.count==='long'?genCountStory(5,10):genCountStory(2,4);
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
  if(storyOn('neg'))return S.levels.neg==='long'?genNegStory(5,10):genNegStory(2,4);
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
  if(storyOn('place'))return S.levels.place==='long'?genPlaceStory(5,10):genPlaceStory(2,4);
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
/** Примеры для «Этот, тот, вон тот»: по одному предложению на каждое слово (слова из словаря сайта). */
const DEM_EX={'이':'이 사람은 친구예요.','그':'그 사람은 선생님이에요.','저':'저 사람은 학생이에요.','이것':'이것은 책이에요.','그것':'그것은 가방이에요.','저것':'저것은 나무예요.','여기':'여기는 학교예요.','거기':'거기는 공원이에요.','저기':'저기는 식당이에요.'};
function genDem(){
  if(storyOn('dem'))return S.levels.dem==='long'?genDemStory(5,10):genDemStory(2,4);
  const fam=rnd(DEM);
  const w=pickW(fam,x=>'dm:'+x[0]);
  const toKo=Math.random()<.5;
  const set=shuffle(fam);
  const note='1) близко ко мне, 2) близко к собеседнику, 3) далеко от обоих: '+fam.map(x=>x[0]).join(' / ');
  if(toKo)return {type:'choice',mode:'dem',key:'dm:'+w[0]+':k',word:null,label:'Выбери слово',prompt:w[1],promptKo:false,options:set.map(x=>({text:x[0],ko:true})),correct:set.indexOf(w),right:w[0],explain:[w[0]+' — '+w[1],note],teach:DEM_EX[w[0]],hp:w[1],hr:w[0],icon:'👉'};
  return {type:'choice',mode:'dem',key:'dm:'+w[0]+':r',word:null,label:'Что значит слово?',prompt:w[0],promptKo:true,options:set.map(x=>({text:x[1]})),correct:set.indexOf(w),right:w[1],explain:[w[0]+' — '+w[1],note],teach:DEM_EX[w[0]],hp:w[0],hr:w[1],icon:'👉'};
}
const POLITE=[['고마워','друзьям (самое неформальное)'],['고마워요','знакомым и близким старше тебя'],['감사해요','коллегам, товарищам'],['감사합니다','по работе, начальнику (формально)']];
/** Примеры для «Уровня вежливости»: по предложению на каждую форму «спасибо» (слова из словаря сайта). */
const POLITE_EX={'고마워':'정말 고마워.','고마워요':'정말 고마워요.','감사해요':'정말 감사해요.','감사합니다':'선생님, 감사합니다.'};
function genPolite(){
  if(storyOn('polite'))return S.levels.polite==='long'?genPoliteStory(5,10):genPoliteStory(2,4);
  const w=pickW(POLITE,x=>'po:'+x[0]);
  const toKo=Math.random()<.5;
  const set=shuffle(POLITE);
  const note='От самого неформального к официальному: '+POLITE.map(x=>x[0]).join(' → ');
  if(toKo)return {type:'choice',mode:'polite',key:'po:'+w[0]+':k',word:null,label:'Как сказать «спасибо» этому человеку?',prompt:w[1].replace(/ \(.*$/,''),promptKo:false,options:set.map(x=>({text:x[0],ko:true})),correct:set.indexOf(w),right:w[0],explain:[w[0]+' — '+w[1],note],teach:POLITE_EX[w[0]],hp:w[1],hr:w[0],icon:'🙇'};
  return {type:'choice',mode:'polite',key:'po:'+w[0]+':r',word:null,label:'Кому так говорят «спасибо»?',prompt:w[0],promptKo:true,options:set.map(x=>({text:x[1].replace(/ \(.*$/,'')})),correct:set.indexOf(w),right:w[1].replace(/ \(.*$/,''),explain:[w[0]+' — '+w[1],note],teach:POLITE_EX[w[0]],hp:w[0],hr:w[1],icon:'🙇'};
}
const GEN={word:genWord,rev:genRev,form:()=>(storyOn('form')?(S.levels.form==='long'?genFormStory(5,10):genFormStory(2,4)):(Math.random()<.5?genForm():genPast())),qw:genQw,part:genPart,build:genBuild,spot:genSpot,type:genType,err:genErr,pair:genPair,ord:genOrd,dlg:genDlg,han:genHan,days:genDays,when:genWhen,too:genToo,num:genNum,price:genPrice,count:genCount,neg:genNeg,place:genPlace,dem:genDem,polite:genPolite,ptext:genPtext};
function genQuestion(){
  let m=S.mode;
  if(m==='mix')m=rnd(['word','word','word','rev','rev','form','form','form','qw','part','part','build','spot','spot','type','type','err','pair','ord','dlg','days','when','too','neg','place','dem','polite']);
  return GEN[m]();
}

/* ---------- отрисовка ---------- */
function renderQuestion(q){
  closeStoryWin();
  S.cur=q;S.answered=false;S.lastKey=q.key;
  clearTimeout(S.timer);
  const card=$('#card');card.innerHTML='';
  card.appendChild(labelWithHelp(q));
  if(STORY_MODES.includes(q.mode)&&S.mode===q.mode)card.appendChild(levelChips(q.mode));
  if(q.mode==='ptext'&&S.mode==='ptext')card.appendChild(famChips());
  if(q.type==='story'){
    drawStory(card,q);
  }else if(q.type==='choice'){
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
    const clr=el('button','ghost','Очистить');clr.type='button';clr.id='clr';clr.addEventListener('click',()=>{if(S.answered)return;q.sel=[];drawBuild();});
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
  // после проверки «Проверить» и «Очистить» выключены, а фокус уходит с кнопки: иначе Enter нажимал бы её снова, а не шёл «Дальше»
  ['chk','clr','hintBtn'].forEach(id=>{const x=$('#'+id);if(x)x.disabled=true;});
  if(document.activeElement&&document.activeElement.tagName==='BUTTON')document.activeElement.blur();
  finish(ok,ans);
}
/** Чипы уровня над заданием: одно предложение (как раньше), текст из 2–4 или длинный из 5–10 (в блице и на выживании всегда простой). */
const LEVEL_LABELS={han:[['simple','Слоги'],['story','Слова'],['long','Строки']],spot:[['simple','Простой'],['story','Текст 2–3'],['long','Длинный 4–5']]};
function levelChips(mode){
  const lv=el('div','levels');
  (LEVEL_LABELS[mode]||[['simple','Простой'],['story','Рассказ 2–4'],['long','Длинный 5–10']]).forEach(function(x){
    const b=el('button','chip'+(S.levels[mode]===x[0]?' on':''),x[1]);b.type='button';
    b.addEventListener('click',function(){S.levels[mode]=x[0];save();renderQuestion(genQuestion());});
    lv.appendChild(b);
  });
  return lv;
}
/** Текст: слева иконка с переводом (по наведению, на телефоне по нажатию), посередине предложение с пропусками, справа «Разбор» (после проверки); ниже банк плиток. */
function drawStory(card,q){
  const box=el('div','story');
  q.sents.forEach(function(s,si){
    const row=el('div','story-row');
    // у заданий, где перевод предложения выдаёт ответ («Слово → перевод»), вместо иконки пустое место: перевод виден в разборе после проверки
    const tr=el('button','story-tr'+(s.noTr?' off':''));tr.type='button';tr.disabled=!!s.noTr;
    if(!s.noTr){
      tr.innerHTML=iconImg('speech');
      tr.setAttribute('aria-label','Перевод предложения');
      tr.appendChild(el('span','story-tip',s.tip||s.ru||''));
      tr.addEventListener('click',function(){tr.classList.toggle('open');});
    }
    const p=el('div','story-s');
    if(s.cue)p.append(el('span','story-cue','('+s.cue+') '));
    s.parts.forEach(function(pt){
      if(pt.gap===undefined){if(pt.mark)p.append(el('mark','story-mark',pt.t));else if(pt.ans)p.append(el('span','story-ans',pt.t));else p.append(pt.t);}
      else if(q.gaps[pt.gap].input){
        // ответ вводится с клавиатуры (корейская раскладка), пробелы не считаются
        const inp=el('input','gap-in');inp.type='text';inp.id='sg'+pt.gap;inp.lang='ko';inp.autocomplete='off';inp.spellcheck=false;
        inp.size=Math.max(4,q.gaps[pt.gap].right.length+2);inp.setAttribute('aria-label','Впиши форму');
        inp.addEventListener('input',function(){q.gaps[pt.gap].picked=inp.value.replace(/\s+/g,'')||null;paintStory(q);});
        inp.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();checkStory(q);}});
        p.append(inp);
      }
      else{const g=el('button','gap');g.type='button';g.id='sg'+pt.gap;g.addEventListener('click',function(){tapGap(pt.gap);});p.append(g);}
    });
    const info=el('button','story-info','Разбор');info.type='button';info.id='si'+si;info.disabled=true;
    info.title='Разбор предложения: что верно, почему и как оно собрано';
    info.addEventListener('click',function(){openStoryWin(q,si);});
    row.append(tr,p,info);box.appendChild(row);
  });
  card.appendChild(box);
  if(!q.input){
  const bank=el('div','tiles bank');bank.id='bank';
  q.bank.forEach(function(t,i){
    const b=el('button','tile');b.type='button';b.id='bt'+i;
    if(i<9)b.appendChild(el('sup','',String(i+1)));
    b.appendChild(document.createTextNode(t));
    b.addEventListener('click',function(){tapTile(i);});bank.appendChild(b);
  });
  card.appendChild(bank);
  }
  const note=el('div','ruline');note.id='snote';card.appendChild(note);
  const acts=el('div','acts');
  const chk=el('button','primary','Проверить');chk.type='button';chk.id='schk';chk.addEventListener('click',function(){checkStory(q);});
  const clr=el('button','ghost','Очистить');clr.type='button';clr.id='sclr';clr.addEventListener('click',function(){clearStory(q);});
  acts.append(chk,clr);card.appendChild(acts);
  paintStory(q);
}
function paintStory(q){
  q.gaps.forEach(function(g,i){
    const e=$('#sg'+i);if(!e)return;
    if(g.input){e.className='gap-in'+(q.checked?(g.ok?' ok':' bad'):(g.picked!==null?' filled':''));e.disabled=q.checked;return;}
    e.textContent=g.picked!==null?g.picked:'___';
    e.className='gap'+(q.checked?(g.ok?' ok':' bad'):(g.picked!==null?' filled':' empty')+(i===q.active?' now':''));
    e.disabled=q.checked;
  });
  q.bank.forEach(function(t,i){
    const b=$('#bt'+i);if(!b)return;
    b.classList.toggle('sel',q.sel===i);b.disabled=q.checked;
  });
  const filled=q.gaps.filter(function(g){return g.picked!==null;}).length;
  const chk=$('#schk');if(chk)chk.disabled=q.checked||filled<q.gaps.length;
  const clr=$('#sclr');if(clr)clr.disabled=q.checked||!filled;
  const note=$('#snote');
  if(note&&q.input)note.textContent=q.checked?'':'Впиши форму в каждое поле: заполнено '+filled+' из '+q.gaps.length+'. Enter проверяет.';
  else if(note)note.textContent=q.checked?'':q.sel!==null?('Выбрано «'+q.bank[q.sel]+'»: нажми на пропуск'):('Заполнено '+filled+' из '+q.gaps.length+(filled?'. Нажми на заполненный пропуск, чтобы убрать ответ.':'. Нажми плитку, потом пропуск.'));
  paintStoryInfo(q);
}
/** Кнопка «Разбор» у предложения оживает после проверки и красится по результату. */
function paintStoryInfo(q){
  q.sents.forEach(function(s,si){
    const b=$('#si'+si);if(!b)return;
    const bad=s.gapIdx.some(function(k){return q.gaps[k].ok===false;});
    b.disabled=!q.checked;b.className='story-info'+(q.checked?(bad?' bad':' ok'):'');
  });
}
function tapTile(i){
  const q=S.cur;if(!q||q.type!=='story'||q.checked)return;
  q.sel=q.sel===i?null:i;paintStory(q);
}
/** Нажатие на пропуск: если выбрана плитка, она встаёт на место; иначе заполненный пропуск освобождается (можно выбрать другой ответ). */
function tapGap(k){
  const q=S.cur;if(!q||q.type!=='story'||q.checked)return;
  const g=q.gaps[k];
  if(q.sel!==null)g.picked=q.bank[q.sel];
  else if(g.picked!==null)g.picked=null;
  q.active=k;
  paintStory(q);
}
/** Клавиши: цифра ставит плитку в первый пустой пропуск, Backspace убирает последний ответ, Enter проверяет. */
function keyStory(q,e){
  if(/^[1-9]$/.test(e.key)){
    const i=+e.key-1;if(i>=q.bank.length)return;
    const k=q.gaps.findIndex(function(g){return g.picked===null;});
    if(k<0)return;
    q.gaps[k].picked=q.bank[i];q.sel=null;q.active=null;paintStory(q);
  }else if(e.key==='Backspace'){
    for(let k=q.gaps.length-1;k>=0;k--)if(q.gaps[k].picked!==null){q.gaps[k].picked=null;break;}
    paintStory(q);
  }else if(e.key==='Enter')checkStory(q);
}
function clearStory(q){
  if(q.checked)return;
  q.gaps.forEach(function(g,k){g.picked=null;if(g.input){const e=$('#sg'+k);if(e)e.value='';}});q.sel=null;q.active=null;paintStory(q);
}
/** Проверка в конце: каждый пропуск считается ответом; за итог бонус к опыту (все верно +5, от 80% +3, от 60% +1) добавляется к первому верному. */
function checkStory(q){
  if(q.checked||q.gaps.some(function(g){return g.picked===null;}))return;
  q.checked=true;q.sel=null;q.active=null;
  q.gaps.forEach(function(g){g.ok=g.picked===g.right||!!(g.accept&&g.accept.includes(g.picked));});
  const right=q.gaps.filter(function(g){return g.ok;}).length,ratio=right/q.gaps.length;
  q.bonus=ratio===1?5:ratio>=.8?3:ratio>=.6?1:0;
  let extra=q.bonus;
  q.gaps.forEach(function(g){
    const xp=10+(g.ok&&extra?extra:0);if(g.ok)extra=0;
    finish(g.ok,g.picked,{key:'',word:null,hp:g.hp,hr:g.right,icon:q.icon,level:1,xp:xp},true);
  });
  paintStory(q);
  S.answered=true;
  showFeedback(q,right===q.gaps.length);
}
/** Окно с разбором одного предложения: что выбрано и что верно, почему, и «Как собрано». Лежит внутри игры (стили `.study`), под окном правила. */
function closeStoryWin(){if(S.win){S.win.remove();S.win=null;}}
function openStoryWin(q,si){
  closeStoryWin();
  const s=q.sents[si];
  const back=el('div','story-win');
  const box=el('div','story-win-box');
  const head=el('div','story-win-head');
  const x=el('button','story-win-x','✕');x.type='button';x.setAttribute('aria-label','Закрыть');x.addEventListener('click',closeStoryWin);
  head.append(el('b','','Разбор предложения'),x);
  box.appendChild(head);
  s.gapIdx.forEach(function(k){
    const g=q.gaps[k];
    const line=el('div','story-win-gap '+(g.ok?'ok':'bad'));
    line.appendChild(el('b','',g.ok?('Верно: '+g.picked+(g.picked!==g.right?' (можно и '+g.right+')':'')):('Не так. Ты поставил(а) '+g.picked+', нужно: '+g.right)));
    if(g.why)line.appendChild(el('span','',g.why));
    box.appendChild(line);
  });
  box.appendChild(drawBreakdown(s.ko,s.ru));
  back.appendChild(box);
  back.addEventListener('click',function(e){if(e.target===back)closeStoryWin();});
  const root=$('#card').closest('.game')||document.body;
  root.appendChild(back);
  S.win=back;
  x.focus({preventScroll:true});
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
/** Засчитывает ответ. `qq` и `quiet` нужны рассказу: каждый пропуск считается ответом, а общий разбор показывается один раз в конце. */
function finish(ok,chosen,qq,quiet){
  const q=qq||S.cur;
  if(!quiet)S.answered=true;
  const A=S.all,B=S.ses;
  const bm=A.byMode[S.mode]||(A.byMode[S.mode]={ok:0,bad:0,best:0});
  if(ok){B.ok++;A.ok++;B.streak++;if(B.streak>B.best)B.best=B.streak;if(B.streak>A.best)A.best=B.streak;
    bm.ok++;if(B.streak>bm.best)bm.best=B.streak;
    const m=q.key&&S.miss[q.key];if(m){m.n--;if(m.n<=0)delete S.miss[q.key];}
    const msgs=[];
    const pr=hooks.record({word:q.word||null,ok:true,mode:S.mode,detail:{q:q.hp,a:q.hr,...(q.mode?{g:q.mode}:{})},xp:q.xp!==undefined?q.xp:(q.level===3?20:q.level===2?15:10)+(B.streak>=5&&B.streak%5===0?5:0)});
    if(pr.bloomed)msgs.push('🌸 Слово «'+q.word+'» расцвело в саду!');
    if(pr.levelUp)msgs.push('⭐ Новый уровень '+pr.level+': '+pr.title+'!');
    if(pr.goalReached)msgs.push('🎯 Цель дня выполнена!');
    if([5,10,20,50].includes(B.streak))msgs.push('🔥 Серия из '+B.streak+' верных подряд!');
    if([50,100,250,500,1000].includes(A.ok))msgs.push('🏅 '+A.ok+' верных ответов за всё время!');
    if(A.ok%10===0){msgs.push('🍞 Испёкся ещё один хлебушек!');const l=$('#nLoaf');l.classList.remove('pop');void l.offsetWidth;l.classList.add('pop');}
    if(msgs.length)toast(msgs[0]);
    if(S.surv.on)S.surv.ok++;
  }else{B.bad++;A.bad++;B.streak=0;bm.bad++;
    hooks.record({word:q.word||null,ok:false,mode:S.mode,detail:{q:q.hp,a:q.hr,y:chosen,...(q.mode?{g:q.mode}:{})}});
    if(q.key){const m=S.miss[q.key]||{n:0,l:''};m.n=Math.min(5,m.n+1);m.l=q.hp+' — '+q.hr;S.miss[q.key]=m;}
    const retryKey=q.word||q.key;
    if(retryKey&&!q.retry&& !S.retryKeys.has(retryKey)){
      S.retryKeys.add(retryKey);
      S.retryQueue.push({q:{...q,retry:true},left:3+Math.floor(Math.random()*2)});
    }}
  if(S.blitz.on){if(ok)S.blitz.ok++;else S.blitz.bad++;}
  if(S.surv.on&&!ok&&S.surv.max!==0){S.surv.lives--;drawLives();if(S.surv.lives<=0)S.timer=setTimeout(endSurv,1300);}
  S.hist.unshift({ok:ok,icon:q.icon,p:q.hp,r:q.hr,you:ok?null:chosen});
  if(S.hist.length>150)S.hist.pop();
  save();updateStats();renderList();
  if(!quiet)showFeedback(q,ok);
}
/* ---------- разбор после ответа ---------- */
/** Строка только корейская (без русских слов), с хангылем и знаком в конце: это уже готовое предложение. */
const PLAIN_SENTENCE=/^[^а-яёА-ЯЁ]*[가-힣][^а-яёА-ЯЁ]*[.?!]$/;
/** Предложение для разбора: явное `teach` задания, иначе первая чисто корейская строка объяснения, иначе пример слова из словаря сайта. */
function teachOf(q){
  if(q.teach)return q.teach;
  const line=(q.explain||[]).map(t=>(t||'').trim()).find(t=>t.length>=4&&PLAIN_SENTENCE.test(t));
  if(line)return line;
  const w=q.word&&DICT.find(d=>d.k===q.word);
  return w&&w.s?w.s:'';
}
/** Перевод предложения: из словаря переводов, иначе `ru` задания (у заданий с `sentence` это перевод, у режима «формы» нет). */
function transOf(q,s){
  return TRANSLATIONS[s]||q.trans||(q.sentence&&q.mode!=='form'?q.ru:'')||'';
}
/** «Как собрано»: карточки слов, частиц и окончаний, объяснения и ссылки на правила, те же, что в разборе предложений словаря. */
function drawBreakdown(sentence,trans){
  const box=el('div','bd');
  box.appendChild(el('div','bd-ko',sentence));
  if(trans)box.appendChild(el('div','bd-tr','«'+trans+'»'));
  box.appendChild(el('div','bd-title','Как собрано'));
  const cards=el('div','bd-cards');
  const segs=analyze(sentence);
  if(segs.every(function(sg){return sg.type==='unknown';}))return document.createDocumentFragment();
  segs.forEach(function(sg){
    const c=el('div','bd-card '+sg.type);
    c.appendChild(el('div','bd-kind',SEG_LABEL[sg.type]));
    c.appendChild(el('div','bd-k',sg.text));
    if(sg.reading)c.appendChild(el('div','bd-r',sg.reading));
    c.appendChild(el('div','bd-g',sg.type==='unknown'?'?':sg.gloss));
    if(sg.explain)c.appendChild(el('div','bd-ex',sg.explain));
    if(sg.g&&hooks.grammar){const b=el('button','bd-rule','Правило →');b.type='button';b.addEventListener('click',()=>hooks.grammar(sg.g));c.appendChild(b);}
    cards.appendChild(c);
  });
  box.appendChild(cards);
  return box;
}
function showFeedback(q,ok){
  const fb=$('#fb');fb.className='feedback show '+(ok?'ok':'bad');fb.innerHTML='';
  if(!motionCalm())gsap.from(fb,{opacity:0,y:12,duration:.32,ease:'power2.out',clearProps:'opacity,transform'});
  const streak=S.ses.streak;
  if(q.type==='story'){
    // рассказ: только итог; разбор каждого предложения открывается кнопкой «Разбор» справа от него
    const right=q.gaps.filter(g=>g.ok).length;
    fb.appendChild(el('div','fbh','Рассказ пройден: верно '+right+' из '+q.gaps.length+(q.bonus?' · бонус +'+q.bonus+' к опыту':'')+(ok?' 🔥':'')));
    fb.appendChild(el('div','fbt','Нажми «Разбор» справа от предложения, чтобы увидеть, что верно и как оно собрано.'));
  }else{
    fb.appendChild(el('div','fbh',ok?('Верно!'+(streak>=3?' 🔥 ×'+streak:'')):'Не так. Правильно: '+q.right));
    // полный разбор «Как собрано» (как в словаре): предложение из задания или пример слова; в блице на него нет времени
    const teach=S.blitz.on?'':teachOf(q);
    const bd=teach?drawBreakdown(teach,transOf(q,teach)):null;
    const shown=!!(bd&&bd.childNodes.length);
    q.explain.forEach(t=>{if(t&&!(shown&&t.trim()===teach))fb.appendChild(el('div','fbt',t));});
    if(shown)fb.appendChild(bd);
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
  const due=S.retryQueue.findIndex(x=>x.left<=0);
  if(due>=0){const rq=S.retryQueue.splice(due,1)[0].q;S.retryKeys.delete(rq.word||rq.key);renderQuestion(rq);}
  else{S.retryQueue.forEach(x=>x.left--);renderQuestion(genQuestion());}
}

function updateStats(){
  const B=S.ses,A=S.all;
  $('#nOk').textContent=B.ok;$('#nBad').textContent=B.bad;
  const tot=B.ok+B.bad;$('#nAcc').textContent=tot?Math.round(B.ok/tot*100)+'%':'–';
  $('#nStreak').textContent=B.streak;$('#nBest').textContent=Math.max(B.best,A.best);
  $('#nLoaf').textContent=Math.floor(A.ok/10);
  $('#loafTxt').textContent=(A.ok%10)+' / 10';
  $('#loafBar').style.width=((A.ok%10)*10)+'%';
  $('#allTime').textContent='За всё время: '+A.ok+' верно, '+A.bad+' неверно'+(bestBlitz()?' · лучший блиц ('+S.blitzSecs+' с): '+bestBlitz():'')+(bestSurv()?' · выживание ('+survName()+'): '+bestSurv():'');
  const P=hooks.state();
  $('#lvlN').textContent=P.level;$('#lvlName').textContent=P.title;
  $('#xpTxt').textContent=P.max?'максимум':P.into+' / '+P.span;$('#xpBar').style.width=P.pct+'%';
  const g=P.todayOk;
  $('#goalMax').textContent=P.goal;$('#goalN').textContent=Math.min(g,P.goal);$('#goalBar').style.width=Math.min(100,g/P.goal*100)+'%';
  $('#goalTxt').textContent=g>=P.goal?'готово 🎉':'ещё '+(P.goal-g);
}
function renderList(){
  const list=$('#list');list.innerHTML='';
  $('#tabHist').classList.toggle('on',S.tab==='hist');$('#tabWeak').classList.toggle('on',S.tab==='weak');$('#tabWords').classList.toggle('on',S.tab==='words');$('#tabRecords').classList.toggle('on',S.tab==='records');
  $('#wq').hidden=S.tab!=='words';
  if(S.tab==='records'){
    MODES.forEach(m=>{
      const r=S.all.byMode[m.id];
      const it=el('div','item rec');it.style.gridTemplateColumns='28px 1fr auto';
      const mk=el('span','mk');mk.innerHTML=iconImg(MODE_ICON[m.id]);it.appendChild(mk);
      const b=el('div');b.appendChild(el('div','',m.name));
      b.appendChild(el('div','muted',r?('верно '+r.ok+', неверно '+r.bad):'ещё не играл(а)'));
      it.appendChild(b);
      it.appendChild(el('div','recbest',r&&r.best?('рекорд '+r.best):'—'));
      list.appendChild(it);
    });
    return;
  }
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
  $('#cbRead').checked=S.reading;$('#tense').value=S.tense;$('#blitzSecs').value=String(S.blitzSecs);$('#survLives').value=String(S.survLives);
  if(!S.blitz.on)$('#blitzBtn').innerHTML=blitzLabel();
  $('#lbRead').classList.toggle('on',S.reading);
}
$('#cbRead').addEventListener('change',e=>{S.reading=e.target.checked;save();syncToggles();if(S.cur&&!S.answered)renderQuestion(S.cur);});
$('#tense').addEventListener('change',e=>{S.tense=e.target.value;save();});
$('#blitzSecs').addEventListener('change',e=>{if(S.blitz.on){syncToggles();return;}S.blitzSecs=+e.target.value;save();syncToggles();updateStats();});
$('#survLives').addEventListener('change',e=>{if(S.surv.on){syncToggles();return;}S.survLives=+e.target.value;save();syncToggles();updateStats();});
$('#tabHist').addEventListener('click',()=>{S.tab='hist';renderList();});
$('#tabWeak').addEventListener('click',()=>{S.tab='weak';renderList();});
$('#tabWords').addEventListener('click',()=>{S.tab='words';renderList();$('#wq').focus({preventScroll:true});});
$('#tabRecords').addEventListener('click',()=>{S.tab='records';renderList();});
$('#wq').addEventListener('input',renderList);
$('#resetBtn').addEventListener('click',async()=>{
  const yes=await askConfirm({title:'Сбросить статистику игры?',text:'Сбросится только прогресс этой игры: счёт, рекорды, испечённые хлебушки, слабые слова и история ответов. Уровень, цель дня, слова и остальной прогресс сайта останутся как есть.',ok:'Сбросить статистику игры',danger:true});
  if(!yes)return;
  S.all={ok:0,bad:0,best:0,bestBlitz:0,bestSurv:0,bestBlitzBy:{},bestSurvBy:{},xp:0,byMode:{}};S.miss={};S.ses={ok:0,bad:0,streak:0,best:0};S.hist=[];S.hints=3;
  save();updateStats();renderList();next();
});

/* ---------- блиц ---------- */
/** Рекорды по вариантам: у блица на 60 секунд и выживания на 3 жизни прежние поля `bestBlitz` и `bestSurv`, у остальных вариантов свои ячейки. */
const bestBlitz=()=>S.blitzSecs===60?S.all.bestBlitz:((S.all.bestBlitzBy||{})[S.blitzSecs]||0);
const bestSurv=()=>S.survLives===3?S.all.bestSurv:((S.all.bestSurvBy||{})[S.survLives]||0);
const survName=()=>S.survLives===0?'без ограничения':S.survLives+' жизни';
const blitzLabel=()=>iconImg('rocket')+' Блиц '+S.blitzSecs+' секунд';
function startBlitz(){
  if(S.surv.on){toast('Сначала закончи выживание');return;}
  clearInterval(S.blitz.iv);
  const secs=S.blitzSecs;
  S.blitz={on:true,left:secs,total:secs,ok:0,bad:0,iv:null};
  $('#timer').classList.add('on');$('#timerBar').style.width='100%';
  $('#blitzBtn').innerHTML='<span class="gi">⏹</span> Остановить блиц';
  S.blitz.iv=setInterval(()=>{
    S.blitz.left--;$('#timerBar').style.width=Math.max(0,S.blitz.left/S.blitz.total*100)+'%';
    if(S.blitz.left<=0)endBlitz();
  },1000);
  next();
}
function endBlitz(){
  clearInterval(S.blitz.iv);clearTimeout(S.timer);
  const b=S.blitz;b.on=false;
  $('#timer').classList.remove('on');$('#blitzBtn').innerHTML=blitzLabel();
  const tot=b.ok+b.bad;
  let rec='';
  if(b.ok>bestBlitz()){
    if(S.blitzSecs===60)S.all.bestBlitz=b.ok;else(S.all.bestBlitzBy||(S.all.bestBlitzBy={}))[S.blitzSecs]=b.ok;
    rec=' Новый рекорд!';save();updateStats();
  }
  S.lastOver='blitz';$('#overT').textContent='Время вышло!';
  $('#overBig').textContent=b.ok;
  $('#overTxt').textContent='верных ответов за '+b.total+' секунд. Неверных: '+b.bad+(tot?', точность '+Math.round(b.ok/tot*100)+'%':'')+'.'+rec;
  $('#over').classList.add('on');$('#overAgain').focus();
  if(S.cur)S.answered=true;
}
$('#blitzBtn').addEventListener('click',()=>{if(S.blitz.on)endBlitz();else startBlitz();});

/* ---------- выживание: три жизни ---------- */
function drawLives(){
  const box=$('#lives');
  if(!S.surv.on){box.className='lives';box.textContent='';return;}
  box.className='lives on';
  if(S.surv.max===0){box.textContent='♾️  ·  верно: '+S.surv.ok+' (остановить можно кнопкой ниже)';return;}
  box.textContent='❤️'.repeat(Math.max(0,S.surv.lives))+'🖤'.repeat(S.surv.max-Math.max(0,S.surv.lives))+'  ·  верно: '+S.surv.ok;
}
function startSurv(){
  if(S.blitz.on){toast('Сначала закончи блиц');return;}
  S.surv={on:true,lives:S.survLives||Infinity,max:S.survLives,ok:0};
  $('#survBtn').innerHTML='<span class="gi">⏹</span> Остановить выживание';drawLives();next();
}
function endSurv(){
  clearTimeout(S.timer);
  const sv=S.surv;sv.on=false;
  $('#survBtn').innerHTML=iconImg('heart')+' На выживание';drawLives();
  let rec='';
  if(sv.ok>bestSurv()){
    if(S.survLives===3)S.all.bestSurv=sv.ok;else(S.all.bestSurvBy||(S.all.bestSurvBy={}))[S.survLives]=sv.ok;
    rec=' Новый рекорд!';save();updateStats();
  }
  S.lastOver='surv';$('#overT').textContent=sv.max===0?'Выживание остановлено':'Жизни закончились';
  $('#overBig').textContent=sv.ok;
  $('#overTxt').textContent=sv.max===0?'верных ответов за заход.'+rec:'верных ответов до '+(sv.max===3?'третьей':'пятой')+' ошибки.'+rec;
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
  if(S.win){if(e.key==='Escape')closeStoryWin();return;}
  if($('#help').classList.contains('on')){if(e.key==='Escape')closeHelp();return;}
  if($('#over').classList.contains('on'))return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const t=e.target;if(t&&(t.tagName==='SELECT'||t.tagName==='INPUT'))return;
  if(S.cur&&S.cur.type==='choice'&&!S.answered&&(e.key==='h'||e.key==='р')&&$('#hintBtn')){e.preventDefault();useHint();}
  else if(S.cur&&S.cur.type==='story'&&!S.answered&&/^([1-9]|Backspace|Enter)$/.test(e.key)){e.preventDefault();keyStory(S.cur,e);}
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
drawCats();syncToggles();updateStats();renderList();drawLives();
renderQuestion(genQuestion());
if(!S.seenHelp)openHelp();
return ()=>{
  document.removeEventListener('keydown',onKeydown);
  closeStoryWin();
  clearInterval(S.blitz.iv);
  clearTimeout(S.timer);
  clearTimeout(toast.t);
};

}
