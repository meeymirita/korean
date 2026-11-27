// Генераторы заданий игры «Хлебушек» (`engine.ts` рисует задания, здесь они придумываются). Вынесены из `engine.ts` без изменений логики:
// фабрика получает состояние игры `S` и подсказки `hooks`, как раньше функции лежали внутри `initGame`.
import { D } from './words'
import { ADJS, ALLW, CATS, FORMS, VERBS, W, type Entry, type FormEntry } from './modes'
import type { GameHooks, GameState, Piece, Question, SentIn, StoryGap, StoryPart, StoryQ } from './types'
import { makeBuild, parseBuildKey, type Level, type TenseMode } from './build'
import { analyze } from '@/data/korean/parse'
import { D as DICT } from '@/data/korean/words'
import { TRANSLATIONS } from '@/data/korean/translations'
import { STUDY, STUDY_TRANSLATIONS } from '@/data/korean/study'
import '@/assets/breakdown.css'
import { EXCHANGES, type Exchange } from './dialogs'
import { STORIES } from './stories'
import { LONG_ALL, LONG_SENTENCES, checkLong, growSteps, longText, longTrap, longWords } from './long-sentences'
import { LONG3 } from './long-sentences-3'
import { PFAMS, type RuleFamily } from './families'
import { ptextPool, type PtextMark } from './ptext-pool'
import { futureForm } from '@/data/korean/conjugation'
import { syllableRows } from '@/data/alphabet'


import { head, rnd, shuffle } from './util'

/** Тяжёлые наборы предложений для текстов считаются один раз на страницу (данные не меняются), а не при каждом запуске игры. */
const POOLS: Record<string, unknown>={};
/** Пул считается один раз на страницу: при первом обращении, дальше берётся готовый. Вид записей задаёт функция, которая его собирает. */
function memo<T>(key: string,make: ()=>T): T{if(!(key in POOLS))POOLS[key]=make();return POOLS[key] as T;}

/** Создаёт генераторы заданий: `genQuestion` выбирает режим по `S.mode`, остальное нужно движку для отрисовки (плитки, уровни, подсказки). */
export function createGenerators(S: GameState, hooks: GameHooks) {
'use strict';
/* ---------- что было недавно: одно и то же задание и один и тот же ответ подряд не идут (docs/bot.md, «разнообразие») ---------- */
/** Ключи и верные ответы последних заданий этой игры. */
const recent: {key: string;right: string}[]=[];
/** Все ключи заданий этой игры: по их числу видно, сколько разных заданий в режиме (окно повторов растёт вместе с набором). */
const seenKeys=new Set<string>();
const RECENT_MAX=30;
/** Сколько раз один и тот же верный ответ может встретиться в последних 10 заданиях: у режимов с двумя-тремя ответами (에 / 에서, 도) больше, у многих (частицы) меньше. */
function sameCap(){
  const tail=recent.slice(-RECENT_MAX);
  const kinds=new Set(tail.map(x=>x.right)).size||1;
  return Math.max(3,Math.min(5,Math.ceil(10/kinds)+1));
}
/* ---------- выбор с весами (ошибки возвращаются чаще) ---------- */
function pickW<T>(arr: T[],keyFn: (x: T)=>string): T{
  let pool=arr;
  if(arr.length>1) pool=arr.filter(x=>keyFn(x)!==S.lastKey);
  // не повторяем задания последних шагов: в большом наборе в окне до 30 заданий, в малом половину набора
  const ban=new Set(recent.slice(-Math.min(RECENT_MAX,Math.floor(arr.length/2))).map(x=>x.key));
  const fresh=pool.filter(x=>!ban.has(keyFn(x)));
  if(fresh.length>=Math.min(3,pool.length))pool=fresh;
  const w=pool.map(x=>{const m=S.miss[keyFn(x)];return 1+3*(m?m.n:0);});
  let r=Math.random()*w.reduce((a,b)=>a+b,0);
  for(let i=0;i<pool.length;i++){r-=w[i]!;if(r<=0)return pool[i]!;}
  return pool[pool.length-1]!;
}
function activePool(){
  const p=CATS.filter(c=>S.cats[c.id]).flatMap(c=>W[c.id]);
  return p.length>=4?p:ALLW;
}
function distract(correct: Entry,pool: Entry[],n: number){
  const bad: Entry[]=[];const used=new Set([head(correct)]);
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
  const p: FormEntry[]=[];if(S.cats.v)p.push(...VERBS);if(S.cats.a)p.push(...ADJS);
  return p.length?p:FORMS;
}

/* ---------- хангыль: неверные «наивные» формы ---------- */
const jung=(ch: string)=>{const c=ch.charCodeAt(0)-0xAC00;return c<0||c>11171?-1:Math.floor((c%588)/28);};
const jong=(ch: string)=>{const c=ch.charCodeAt(0)-0xAC00;return c<0||c>11171?-1:c%28;};
function naive(e: FormEntry,tense: string){
  const stem=e.ko.slice(0,-1),last=stem[stem.length-1]!;
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
/** «Выбери форму»: будущее время (-(으)ㄹ 거예요) у глагола. Ловушки: ㄹ / 을 не по 받침, настоящее и прошедшее вместо будущего. */
function genFuture(){
  const pool=VERBS.filter(function(x){return !!futureForm(x.ko);});
  const e=pickW(pool,function(x){return 'fu:'+x.ko;});
  const right=futureForm(e.ko)!;
  const stem=e.ko.slice(0,-1),last=stem[stem.length-1]!;
  const j=jong(last);
  const wrongMark=j===0||j===8?stem+'을 거예요':stem+'ㄹ 거예요';
  const set=[right,e.pres,e.past,wrongMark].filter(function(v,i,a){return a.indexOf(v)===i;});
  let guard=0;
  while(set.length<4&&guard++<80){const x=rnd(VERBS);const f=futureForm(x.ko);if(f&&x.ko!==e.ko&&!set.includes(f))set.push(f);}
  const opts=shuffle(set).map(function(t){return {text:t,ko:true};});
  const rule=j===8?'основа на ㄹ: ничего не добавляем':j===0?'받침 нет: ㄹ под последней гласной':'받침 есть: 을';
  return {type:'choice',mode:'form',key:'fu:'+e.ko,word:e.ko,label:'Поставь в форму будущего: -(으)ㄹ 거예요 («буду…»)',prompt:e.ko,promptKo:true,
    reading:e.rd,sub:e.ru,options:opts,correct:opts.findIndex(function(o){return o.text===right;}),right:right,
    explain:[e.ko+' → '+right,rule+'; сам 거예요 не меняется'],hp:e.ko+' (буд.)',hr:right,icon:'🔮'};
}
function genQw(){
  if(storyOn('qw'))return S.levels.qw==='long'?genQwStory(5,10):genQwStory(2,4);
  const i=pickW(D.QB.map((x,k)=>k),k=>'q:'+k);
  const q=D.QB[i]!;
  const dis=shuffle(D.QPOOL.filter(x=>x!==q[2])).slice(0,3);
  const opts=shuffle([q[2],...dis]).map(t=>({text:t,ko:true}));
  const parts=q[0].split('___');
  return {type:'choice',mode:'qw',key:'q:'+i,label:'Вставь вопросительное слово',sentence:{pre:parts[0]!,post:parts[1]!},ru:q[1],
    options:opts,correct:opts.findIndex(o=>o.text===q[2]),right:q[2],explain:[q[0].replace('___',q[2]),q[1]],
    hp:q[0].replace('___','…'),hr:q[2],icon:'❓'};
}
function genPart(){
  if(storyOn('part'))return S.levels.part==='long'?genPartStory(5,10):genPartStory(2,4);
  const i=pickW(D.PB.map((x,k)=>k),k=>'p:'+k);
  const p=D.PB[i]!;
  const opts=shuffle(p[3]).map(t=>({text:t,ko:true}));
  const parts=p[0].split('___');
  return {type:'choice',mode:'part',key:'p:'+i,label:'Вставь частицу или слово',sentence:{pre:parts[0]!,post:parts[1]!},ru:p[1],
    options:opts,correct:opts.findIndex(o=>o.text===p[2]),right:p[2],explain:[p[0].replace('___',p[2]),p[4]],
    hp:p[0].replace('___','…'),hr:p[2],icon:'🧩'};
}
const LEVEL_NAME: Record<number, string>={1:'простой',2:'средний',3:'сложный',4:'мастер',6:'мастер+'};
/* перевод плитки: «дедушка + 는 — тема» */
const PART_ROLE: Record<string, string>={'은':'тема','는':'тема','이':'подлежащее','가':'подлежащее','을':'объект','를':'объект','에':'куда / где','에서':'где (действие)',
  '하고':'и / с','이에요':'быть','예요':'быть','도':'тоже','의':'чей','로':'чем / куда','으로':'чем / куда','와':'и / с','과':'и / с',
  '에게':'кому','한테':'кому','께':'кому','들':'мн. число','부터':'с','까지':'до'};
const TOKEN_OVERRIDE: Record<string, string>={'안':'не (отрицание)','제':'мой','내':'мой'};
const glossCache=new Map<string, string>();
function tileGloss(tok: string): string{
  if(glossCache.has(tok))return glossCache.get(tok)!;
  let out: string;
  if(TOKEN_OVERRIDE[tok])out=TOKEN_OVERRIDE[tok]!;
  else out=analyze(tok).map(function(sg){
    if(sg.type==='unknown')return '?';
    if(sg.type==='particle'||sg.type==='ending')return sg.text+' — '+(PART_ROLE[sg.text]||'частица');
    let g=sg.gloss.replace(/ \(.*$/,'');
    if(/настоящее время/.test(sg.gloss))g+=' (наст.)';else if(/прошедшее время/.test(sg.gloss))g+=' (прош.)';
    return g;
  }).join(' + ');
  // лишняя плитка с неверной частицей (버스을) не разбирается: показываем основу и частицу, не выдавая, что она неверная
  if(out==='?'){
    const p=Object.keys(PART_ROLE).sort(function(x,y){return y.length-x.length;}).find(function(k){return tok.length>k.length&&tok.endsWith(k);});
    if(p){const g=tileGloss(tok.slice(0,-p.length));if(g&&!g.includes('?'))out=g+' + '+p+' — '+PART_ROLE[p];}
  }
  glossCache.set(tok,out);return out;
}
/** «Собери предложение: Рассказ»: предложения одного рассказа из учебника идут подряд, каждое собирается из слов-плиток (плюс одна-две лишние). Следующее предложение появляется после «Дальше». */
function genBuildStory(lo: number,hi: number){
  let b=S.bstory;
  const lv=S.levels.build!;
  if(b&&b.lv===lv&&b.i+1<b.st.sents.length&&b.shown)b.i++;
  else{
    const fit=STORIES.filter(function(st){return st.sents.length>=lo&&st.sents.length<=hi;});
    b=S.bstory={st:rnd(fit.length?fit:STORIES),i:0,lv:lv,shown:false};
  }
  b.shown=true;
  const x=b.st.sents[b.i]!,n=b.st.sents.length;
  const right=x.ko.replace(/[.?!]$/,'');
  const words=right.split(' ');
  // лишние плитки: слова других предложений рассказов, которых нет в этом
  const spare: string[]=[];
  shuffle(STORIES.flatMap(function(st){return st.sents.flatMap(function(y){return y.ko.replace(/[.,?!]/g,'').split(' ');});})).forEach(function(w){
    if(spare.length<(words.length>=4?2:1)&&!words.includes(w)&&!spare.includes(w)&&!words.some(function(v){return v.replace(/[.,?!]/g,'')===w;}))spare.push(w);
  });
  const tiles=shuffle([...words,...spare]);
  const before=b.i>0?b.st.sents.slice(0,b.i).map(function(y){return y.ko;}).join(' '):'';
  return {type:'build',mode:'build',key:'bs:'+b.st.id+':'+b.i,level:2,
    label:'Рассказ «'+b.st.title+'»: предложение '+(b.i+1)+' из '+n+(before?' (до этого: '+before+')':''),
    ru:x.ru,tiles:tiles,accept:[right],right:right,note:'Предложение '+(b.i+1)+' рассказа «'+b.st.title+'»',explain:[right+'.',x.ru],hp:x.ru,hr:right,icon:'🏗️'};
}
/** «Собери предложение: Мастер» (две части, `long-sentences.ts`) и «Мастер+» (три части, `long-sentences-3.ts`). Группы внутри части можно ставить в любом порядке, сказуемое последнее (`checkLong`); лишние плитки с неверной частицей. */
function genBuildLong(plus?: boolean){
  const SRC=plus?LONG3:LONG_SENTENCES,tag=plus?'bm:':'bl:',lv=plus?6:4;
  const all=SRC.map(function(x,i){return i;});
  const fit=all.filter(function(i){const t=SRC[i]!.t;return S.tense==='pres'?t==='p':S.tense==='past'?t==='a':(S.fut!=='off'||t!=='f');});
  const pool=fit.length?fit:all;
  const rest=pool.filter(function(i){return tag+i!==S.lastKey;});
  const i=rnd(rest.length?rest:pool),x=SRC[i]!;
  const words=longWords(x),right=words.join(' '),text=longText(x);
  const spare: string[]=[];
  shuffle(words.slice()).forEach(function(w){
    const t=longTrap(w);
    if(t&&spare.length<2&&!words.includes(t)&&!spare.includes(t))spare.push(t);
  });
  return {type:'build',mode:'build',key:tag+i,level:lv,label:'Собери предложение · '+LEVEL_NAME[lv],ru:x.ru,tiles:shuffle([...words,...spare]),
    accept:[right],check:function(w: string[]){return checkLong(x,w);},right:right,note:x.note,explain:[text,x.note],teach:text,trans:x.ru,hp:x.ru,hr:text,icon:'🏗️'};
}
/** «Собери предложение: Растёт»: длинное предложение собирается по частям, каждая часть отдельное задание со своим переводом, собранные раньше части показаны над заданием. */
function genBuildGrow(){
  const fits=function(i: number){const t=LONG_ALL[i]!.t;return S.tense==='pres'?t==='p':S.tense==='past'?t==='a':(S.fut!=='off'||t!=='f');};
  let g=S.grow;
  if(g&&g.shown&&g.k+1<growSteps(LONG_ALL[g.i]!).length)g.k++;
  else{
    const all=LONG_ALL.map(function(x,i){return i;}).filter(function(i){return growSteps(LONG_ALL[i]!).length>=2;});
    const fit=all.filter(fits);
    const pool=fit.length?fit:all;
    const rest=pool.filter(function(i){return !(S.lastKey||'').startsWith('bg:'+i+':');});
    g=S.grow={i:rnd(rest.length?rest:pool),k:0,shown:false};
  }
  g.shown=true;
  const x=LONG_ALL[g.i]!,steps=growSteps(x),st=steps[g.k]!;
  const part: typeof x={...x,ko:st.ko};
  const words=longWords(part),right=words.join(' '),text=longText(part);
  const spare: string[]=[];
  shuffle(words.slice()).forEach(function(w){
    const t=longTrap(w);
    if(t&&spare.length<2&&!words.includes(t)&&!spare.includes(t))spare.push(t);
  });
  const last=g.k===steps.length-1;
  const label='Растёт · часть '+(g.k+1)+' из '+steps.length+(st.prefix?' (уже есть: '+st.prefix+')':'');
  return {type:'build',mode:'build',key:'bg:'+g.i+':'+g.k,level:5,label:label,ru:st.ru,tiles:shuffle([...words,...spare]),
    accept:[right],check:function(w: string[]){return checkLong(part,w);},right:right,note:last?x.note:'',explain:last?[(st.prefix?st.prefix+' ':'')+text+'.',x.note]:[text+'.'],teach:last?longText(x):text,trans:last?x.ru:st.ru,hp:st.ru,hr:text,icon:'🏗️'};
}
function genBuild(){
  if(storyOn('build'))return S.levels.build==='long'?genBuildStory(5,10):genBuildStory(2,4);
  // «Мастер» только в самом режиме и в «Миксе»: в блице и на выживании длинное предложение не успеть собрать
  // «Любой» в самом режиме даёт «Мастера» примерно в каждом пятом задании
  if(!S.blitz.on&&!S.surv.on&&S.level===5)return genBuildGrow();
  if(!S.blitz.on&&!S.surv.on&&S.level===6)return genBuildLong(true);
  // «Любой» в самом режиме: примерно каждое пятое «Мастер», каждое десятое «Мастер+»
  if(!S.blitz.on&&!S.surv.on&&S.level==='any'&&S.mode==='build'){const r=Math.random();if(r<.1)return genBuildLong(true);if(r<.3)return genBuildLong();}
  if(!S.blitz.on&&!S.surv.on&&S.level===4)return genBuildLong();
  const mode=S.tense==='pres'?'p':S.tense==='past'?'a':'b';
  let level: Level|undefined,seed: number|undefined,tm: TenseMode=mode;
  const missed=Object.keys(S.miss).filter(k=>/^b:/.test(k)&&k!==S.lastKey);
  if(missed.length&&Math.random()<.3){
    const p=parseBuildKey(rnd(missed));
    if(p){level=p.level;tm=p.mode;seed=p.seed;}
  }
  if(!seed){level=(S.level==='any'?rnd([1,2,2,3]):S.level>=4?3:S.level) as Level;seed=1+Math.floor(Math.random()*2147483000);}
  const b=makeBuild(level!,tm,seed!);
  return {type:'build',mode:'build',key:b.key,level:level,label:'Собери предложение · '+LEVEL_NAME[level!],ru:b.ru,tiles:b.tiles,
    accept:b.accept,right:b.right,note:b.note,explain:[b.right+'.',b.note],hp:b.ru,hr:b.right,icon:'🏗️'};
}

/* ---------- «Найди верное»: четыре предложения, верное одно ---------- */
function genSpot(){
  if(storyOn('spot'))return S.levels.spot==='long'?genSpotText(4,5):genSpotText(2,3);
  let key,ru,right,opts,note;
  if(Math.random()<.4){
    const i=pickW(D.QB.map((x,k)=>k),k=>'o:q'+k);const q=D.QB[i]!;
    const words=shuffle([q[2],...shuffle(D.QPOOL.filter(x=>x!==q[2])).slice(0,3)]);
    opts=words.map(w=>q[0].replace('___',w));right=q[0].replace('___',q[2]);ru=q[1];key='o:q'+i;note=q[1];
  }else{
    const i=pickW(D.PB.map((x,k)=>k),k=>'o:p'+k);const p=D.PB[i]!;
    opts=shuffle(p[3]).map(t=>p[0].replace('___',t));right=p[0].replace('___',p[2]);ru=p[1];key='o:p'+i;note=p[4];
  }
  const options=opts.map(t=>({text:t,ko:true}));
  return {type:'choice',mode:'spot',key:key,label:'Какое предложение верное?',prompt:ru,promptKo:false,
    options:options,correct:opts.indexOf(right),right:right,explain:[right,note],teach:right,trans:ru,hp:ru,hr:right,icon:'🔍'};
}

/* ---------- «Напиши»: ответ вводится с клавиатуры ---------- */
function normRu(s: unknown){return String(s).toLowerCase().replace(/ё/g,'е').replace(/\([^)]*\)/g,' ').replace(/[^a-zа-я0-9가-힣 ]/g,' ').replace(/\s+/g,' ').trim();}
function ruAnswers(e: Entry){
  const out=new Set<string>();
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
    const i=pickW(D.PB.map((x,k)=>k).filter(k=>!/\s/.test(D.PB[k]![2])),k=>'e:p'+k);const p=D.PB[i]!;
    const bad=rnd(p[3].filter(t=>t!==p[2]&&!/\s/.test(t)));
    wrong=p[0].replace('___',bad);right=p[0].replace('___',p[2]);ru=p[1];note=p[4];key='e:p'+i;
  }else{
    const i=pickW(D.QB.map((x,k)=>k),k=>'e:q'+k);const q=D.QB[i]!;
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
const PAIRS: {a: string;b: string;role: string;ex: (n: string)=>string;exRu: (r: string)=>string}[]=[
  {a:'은',b:'는',role:'тема',ex:n=>n+'___ 뭐예요?',exRu:r=>'А что такое «'+r+'»?'},
  {a:'이',b:'가',role:'подлежащее',ex:n=>n+'___ 있어요.',exRu:r=>'Есть: '+r+'.'},
  {a:'을',b:'를',role:'объект действия',ex:n=>n+'___',exRu:r=>'«'+r+'» как объект (что?)'},
  {a:'이에요',b:'예요',role:'«это…»',ex:n=>n+'___.',exRu:r=>'Это «'+r+'».'}
];
const hasFinal=(ch: string)=>jong(ch)>0;
/** Уровень с текстом включён: режим открыт сам по себе (не «Микс»), не блиц и не выживание. */
const storyOn=(m: string)=>S.mode===m&&S.levels[m]!=='simple'&&!S.blitz.on&&!S.surv.on;
/* ---------- Тексты: несколько предложений с пропусками; плитки из банка переносятся нажатием, проверка в конце ---------- */
/** Режимы с уровнями «Простой / Рассказ 2–4 / Длинный 5–10». */
const STORY_MODES=['pair','place','too','neg','when','dem','word','rev','qw','part','form','days','num','price','count','polite','dlg','han','spot','err','type','ord','ptext','build','expert'];
const plural=(n: number)=>n+(n<=4?' предложения':' предложений');
/**
 * Вопрос-текст из предложений. `sents`: [{ko, ru, pieces:[строка | {right, accept?, why}]}], `bank`: плитки (одну можно ставить много раз).
 * У пропуска `picked` (что поставили) и `ok` (после проверки).
 */
function makeStory(mode: string,label: string,sents: SentIn[],bank: string[],icon?: string): StoryQ{
  const gaps: StoryGap[]=[];
  const out=sents.map(function(sn){
    const parts: StoryPart[]=[];
    sn.pieces.forEach(function(pc){
      if(typeof pc==='string'){if(pc)parts.push({t:pc});}
      else if(pc.mark!==undefined)parts.push({t:pc.mark,mark:true});
      else if(pc.ans!==undefined)parts.push({t:pc.ans,ans:true});
      else{
        const k=gaps.length;
        const hp=sn.pieces.map(function(x){return typeof x==='string'?x:x.mark!==undefined?x.mark:x.ans!==undefined?x.ans:(x===pc?'…':x.right);}).join('');
        parts.push({gap:k});gaps.push({right:pc.right!,accept:pc.accept||null,why:pc.why||'',hp:hp,picked:null,ok:null,input:!!pc.input});
      }
    });
    return {ko:sn.ko,ru:sn.ru,tip:sn.tip||'',noTr:!!sn.noTr,cue:sn.cue||'',parts:parts,gapIdx:parts.filter(function(p){return p.gap!==undefined;}).map(function(p){return p.gap!;})};
  });
  return {type:'story',mode:mode,key:'story:'+mode+':'+sents.map(function(x){return x.ko;}).join('|').slice(0,80),label:label,
    sents:out,gaps:gaps,input:gaps.some(function(g){return g.input;}),bank:shuffle(bank),active:null,sel:null,checked:false,bonus:0,right:'',explain:[],hp:'Рассказ',hr:'',icon:icon||'⚖️',level:2};
}
/** «Пара или нет». У каждой частицы пара по 받침: 은/는, 이/가, 을/를, 와/과, 으로/로; у места 에/에서. */
const TWIN: Record<string, string>={'은':'는','는':'은','이':'가','가':'이','을':'를','를':'을','에':'에서','에서':'에','와':'과','과':'와','으로':'로','로':'으로'};

interface PoolSent { ko: string; ru: string; gaps: { at: number; right: string; why: string }[]; cats: string[]; ok: boolean }
/** Все предложения с переводом, где есть частицы из пар и все слова известны разбору; считается один раз при первом тексте. */
function storyPool(): PoolSent[]{
  return memo('STORY_POOL',function(){
  const catOf: Record<string, string[]>={};DICT.forEach(d=>{if(d.s)catOf[d.s]=d.c;});
  return Object.keys(STUDY_TRANSLATIONS).map(function(ko){
    const segs=analyze(ko);
    const gaps: PoolSent['gaps']=[];let cur=0;
    segs.forEach(function(sg){
      const at=ko.indexOf(sg.text,cur);if(at<0)return;cur=at+sg.text.length;
      if(sg.type==='particle'&&TWIN[sg.text])gaps.push({at:at,right:sg.text,why:sg.explain||sg.gloss});
    });
    return {ko:ko,ru:TRANSLATIONS[ko]!,gaps:gaps,cats:catOf[ko]||[],ok:!segs.some(function(sg){return sg.type==='unknown';})};
  }).filter(function(x){return x.ok&&x.gaps.length;});
  });
}
/** Текст из `n` предложений одной темы (если в теме хватает), в каждом до двух пропусков; плитки: частицы и их пары. */
function genStory(lo: number,hi: number){
  const pool=storyPool();
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const bycat: Record<string, PoolSent[]>={};pool.forEach(function(x){x.cats.forEach(function(c){(bycat[c]||(bycat[c]=[])).push(x);});});
  const rich=Object.keys(bycat).filter(function(c){return bycat[c]!.length>=n;});
  const src=rich.length&&Math.random()<.75?bycat[rnd(rich)]!:pool;
  const bank=new Set<string>();
  const sents=shuffle(src).slice(0,n).map(function(x){
    const use=shuffle(x.gaps).slice(0,2).sort(function(a,b){return a.at-b.at;});
    const pieces: Piece[]=[];let pos=0;
    use.forEach(function(g){
      pieces.push(x.ko.slice(pos,g.at));pieces.push({right:g.right,why:g.why});
      bank.add(g.right);bank.add(TWIN[g.right]!);pos=g.at+g.right.length;
    });
    pieces.push(x.ko.slice(pos));
    return {ko:x.ko,ru:x.ru,pieces:pieces};
  });
  return makeStory('pair','Рассказ ('+plural(n)+'): поставь частицы',sents,[...bank]);
}
/** «Куда, где»: день человека: в каждом предложении место и действие, нужно 에 (куда, где находишься) или 에서 (где действие). */
/** Место: слово, «куда», «где» и действия в нём (корейский, перевод). */
type Place=[string,string,string,...[string,string][]];
function genPlaceStory(lo: number,hi: number){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const combos: {p: Place;t: string;a?: [string,string]}[]=[];
  PLACES.forEach(function(p){
    combos.push({p:p,t:'go'},{p:p,t:'be'});
    (p.slice(3) as [string,string][]).forEach(function(a){combos.push({p:p,t:'do',a:a});});
  });
  const picked: typeof combos=[];let last: Place|null=null;
  const order=shuffle(combos);
  while(picked.length<n){
    let i=order.findIndex(function(c){return (!last||c.p!==last)&&!picked.includes(c)&&(picked.length>=PLACES.length||!picked.some(function(x){return x.p===c.p;}));});
    if(i<0)i=order.findIndex(function(c){return !picked.includes(c);});
    if(i<0)break;
    picked.push(order[i]!);last=order[i]!.p;
  }
  const sents=picked.map(function(c){
    const p=c.p;let post: string,ru: string,right: string,why: string;
    if(c.t==='go'){post=' 가요.';ru='Я иду '+p[1]+'.';right='에';why='Куда идёшь (가요) → 에';}
    else if(c.t==='be'){post=' 있어요.';ru='Я '+p[2]+'.';right='에';why='Где находишься (있어요) → 에';}
    else{const a=c.a!;post=' '+a[0]+'.';ru=cap1(p[2])+' '+a[1]+'.';right='에서';why='Где что-то делаешь ('+a[0]+') → 에서';}
    return {ko:'저는 '+p[0]+right+post,ru:ru,pieces:['저는 '+p[0],{right:right,why:why},post]};
  });
  return makeStory('place','День ('+plural(picked.length)+'): 에 или 에서',sents,['에','에서','를','는'],'📍');
}
/** «Тоже»: новое действие → частица темы (은/는, можно и 이/가), то же действие у другого человека → 도. */
const TOO_SUBJ: [string,string][]=[['엄마','мама'],['아빠','папа'],['친구','друг'],['선생님','учитель'],['학생','ученик'],['형','старший брат']];
const TOO_PRED: [string,string][]=[['학교에 가요','идёт в школу'],['공원에 가요','идёт в парк'],['빵을 먹어요','ест хлеб'],['커피를 마셔요','пьёт кофе'],['한국어를 공부해요','учит корейский'],['집에 있어요','дома']];

/** Слова шаблона, которых нет в разборе, отбрасываются (чтобы в карточках не было «?»). */
function tooPool(){
  return memo('TOO_POOL',function(){
  const known=(t: string)=>!analyze(t).some(function(sg){return sg.type==='unknown';});
  return {subj:TOO_SUBJ.filter(function(x){return known(x[0]+'는 집에 있어요.');}),pred:TOO_PRED.filter(function(x){return known('엄마는 '+x[0]+'.');})};
  });
}
function genTooStory(lo: number,hi: number){
  const pool=tooPool();
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  let order=shuffle(pool.subj),oi=0;
  const take=function(){if(oi>=order.length){order=shuffle(pool.subj);oi=0;}return order[oi++]!;};
  const sents: SentIn[]=[];let prev: {s: [string,string];p: [string,string]}|null=null,reps=0;
  const seen=new Set<string>();
  for(let i=0;i<n;i++){
    // одно и то же предложение в тексте не повторяется: пробуем другой набор, пока не выйдет новое
    for(let tries=0;tries<40;tries++){
      let sj=take();if(prev&&sj[0]===(prev as {s: [string,string]}).s[0])sj=take();
      const repeat=!!prev&&(i===n-1&&!reps&&tries<20?true:Math.random()<.55);
      let sent: SentIn,next: {s: [string,string];p: [string,string]}|null=prev;
      if(repeat&&prev){const pv: {s: [string,string];p: [string,string]}=prev;
        sent={ko:sj[0]+'도 '+pv.p[0]+'.',ru:cap1(sj[1])+' тоже '+pv.p[1]+'.',
          pieces:[sj[0],{right:'도',why:'То же действие, что в предыдущем предложении, но делает другой человек → 도 («тоже») вместо 은/는, 이/가'},' '+pv.p[0]+'.']};
      }else{
        const pv=prev as {p: [string,string]}|null;const p=rnd(pool.pred.filter(function(x){return !pv||x!==pv.p;}));
        const fin=hasFinal(sj[0][sj[0].length-1]!);
        const right=fin?'은':'는',alt=fin?'이':'가';
        sent={ko:sj[0]+right+' '+p[0]+'.',ru:cap1(sj[1])+' '+p[1]+'.',
          pieces:[sj[0],{right:right,accept:[alt],why:'Новое действие → частица темы '+right+' (у слова «'+sj[0]+'» '+(fin?'есть':'нет')+' 받침). Можно и '+alt+'.'},' '+p[0]+'.']};
        next={s:sj,p:p};
      }
      if(seen.has(sent.ko)&&tries<39)continue;
      seen.add(sent.ko);sents.push(sent);if(repeat&&prev)reps++;prev=next;break;
    }
  }
  return makeStory('too','Тоже ('+plural(n)+'): 도 или другая частица',sents,['도','은','는','이','가'],'➕');
}

/** «Это или не это»: знакомство с вещами: 이에요 / 예요 / 이 아니에요 / 가 아니에요 по 받침. */

function negPool(){
  return memo('NEG_POOL',function(){
  return D.S.filter(function(r){return /^[а-яё]+$/i.test(r[2])&&!analyze(r[0]+'이에요.').some(function(sg){return sg.type==='unknown';});});
  });
}
function genNegStory(lo: number,hi: number){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const sents=shuffle(negPool()).slice(0,n).map(function(w){
    const ko=w[0],fin=jong(ko[ko.length-1]!)>0,neg=Math.random()<.5;
    const right=neg?(fin?'이 아니에요':'가 아니에요'):(fin?'이에요':'예요');
    return {ko:ko+right+'.',ru:(neg?'Это не ':'Это ')+w[2]+'.',pieces:[ko,{right:right,why:'У слова «'+ko+'» '+(fin?'есть':'нет')+' 받침 → '+right},'.']};
  });
  return makeStory('neg','Это или не это ('+plural(n)+'): выбери окончание',sents,['이에요','예요','이 아니에요','가 아니에요'],'🙅');
}
/** «Когда? (에)»: распорядок: у дней и времени суток нужна 에, у 오늘, 내일, 지금 частица не нужна (плитка «—»). */
const NOPART='—';
function genWhenStory(lo: number,hi: number){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const acts=shuffle(WHEN_ACT),ons=shuffle(WHEN_ON),offs=shuffle(WHEN_OFF);
  const sents: SentIn[]=[];
  for(let i=0;i<n;i++){
    const kind=whenKind(),off=kind==='off';
    const time=(off?offs[i%offs.length]:ons[i%ons.length])!,act=acts[i%acts.length]!;
    const right=WHEN_RIGHT[kind];
    const ruText=kind==='too'?cap1(time[1])+' тоже '+act[1]+'.':kind==='only'?'Только '+time[1]+' '+act[1]+'.':cap1(time[1])+' '+act[1]+'.';
    sents.push({ko:time[0]+(right===NOPART?'':right)+' '+act[0]+'.',ru:ruText,
      pieces:[time[0],{right:right,why:WHEN_WHY[kind]},' '+act[0]+'.']});
  }
  return makeStory('when','Когда? ('+plural(n)+'): 에, 에도, 에만 или «—»',sents,['에','에도','에만','에서','는',NOPART],'🕒');
}
/** «Этот, тот, вон тот»: сцена: у каждого предложения пометка, где предмет (рядом со мной, с тобой, далеко от обоих); в пропуск нужный указатель. */
type Dist='near'|'mid'|'far';
type Gender='f'|'m'|'n';
const DEM_CUE={near:'рядом со мной',mid:'рядом с тобой',far:'далеко от обоих'};
const DEM_WHY={near:'близко ко мне',mid:'близко к собеседнику',far:'далеко от обоих'};
const DEM_DET={near:'이',mid:'그',far:'저'},DEM_THING={near:'이것',mid:'그것',far:'저것'},DEM_PLACE={near:'여기',mid:'거기',far:'저기'};
const DEM_RU_DET={near:{f:'Эта',m:'Этот',n:'Это'},mid:{f:'Та',m:'Тот',n:'То'},far:{f:'Вон та',m:'Вон тот',n:'Вон то'}};
const DEM_RU_THING={near:'Это',mid:'То',far:'Вон то'},DEM_RU_PLACE={near:'Здесь',mid:'Там',far:'Вон там'};
const DEM_NOUN: [string,string,Gender][]=[['책','книга','f'],['가방','сумка','f'],['나무','дерево','n'],['집','дом','m'],['꽃','цветок','m'],['산','гора','f'],['문','дверь','f']];
const DEM_PRED: [string,Record<Gender,string>][]=[['커요',{f:'большая',m:'большой',n:'большое'}],['작아요',{f:'маленькая',m:'маленький',n:'маленькое'}],['예뻐요',{f:'красивая',m:'красивый',n:'красивое'}],['비싸요',{f:'дорогая',m:'дорогой',n:'дорогое'}]];
const DEM_PLACES: [string,string][]=[['학교','школа'],['공원','парк'],['식당','столовая'],['카페','кафе'],['시장','рынок'],['은행','банк'],['도서관','библиотека']];
function genDemStory(lo: number,hi: number){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const sents: SentIn[]=[],seen=new Set<string>(),bank=new Set<string>();
  for(let t=0;sents.length<n&&t<200;t++){
    const dist: Dist=rnd(['near','mid','far'] as const),fam=rnd(['det','thing','place']);
    let right: string,post: string,ru: string;
    if(fam==='det'){
      const nn=rnd(DEM_NOUN),pr=rnd(DEM_PRED),fin=jong(nn[0][nn[0].length-1]!)>0;
      right=DEM_DET[dist];post=' '+nn[0]+(fin?'은':'는')+' '+pr[0]+'.';ru=DEM_RU_DET[dist][nn[2]]+' '+nn[1]+' '+pr[1][nn[2]]+'.';
      [DEM_DET.near,DEM_DET.mid,DEM_DET.far].forEach(function(w){bank.add(w);});
    }else if(fam==='thing'){
      const nn=rnd(DEM_NOUN),fin=jong(nn[0][nn[0].length-1]!)>0;
      right=DEM_THING[dist];post='은 '+nn[0]+(fin?'이에요':'예요')+'.';ru=DEM_RU_THING[dist]+' — '+nn[1]+'.';
      [DEM_THING.near,DEM_THING.mid,DEM_THING.far].forEach(function(w){bank.add(w);});
    }else{
      const pl=rnd(DEM_PLACES),fin=jong(pl[0][pl[0].length-1]!)>0;
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
const firstRu=(t: string)=>String(t||'').split(/[;,(]/)[0]!.trim();

/** Слова сайта с примером и переводом: где слово стоит в предложении (`at`, `len`: само слово или основа глагола) и все слова предложения известны разбору. */
function wsentPool(){
  return memo('WSENT_POOL',function(){
  return STUDY.filter(function(d){return d.s&&TRANSLATIONS[d.s]&&d.t;}).map(function(d){
    let at=d.s.indexOf(d.k),len=d.k.length;
    if(at<0&&/다$/.test(d.k)&&d.k.length>2){at=d.s.indexOf(d.k.slice(0,-1));len=d.k.length-1;}
    return {k:d.k,ko:d.s,ru:TRANSLATIONS[d.s]!,t:firstRu(d.t),at:at,len:len,cats:d.c||[],verb:/다$/.test(d.k)};
  }).filter(function(x){return x.at>=0&&x.t&&x.t.length<=24&&!analyze(x.ko).some(function(sg){return sg.type==='unknown';});});
  });
}
/** Слова для текста: разные переводы, из разных предложений; по возможности одной темы. */
type WSent=ReturnType<typeof wsentPool>[number];
function wsentPick(n: number){
  const pool=wsentPool();
  const bycat: Record<string, WSent[]>={};pool.forEach(function(x){x.cats.forEach(function(c){(bycat[c]||(bycat[c]=[])).push(x);});});
  const rich=Object.keys(bycat).filter(function(c){return bycat[c]!.length>=n;});
  const src=rich.length&&Math.random()<.6?bycat[rnd(rich)]!:pool;
  const out: WSent[]=[],seenT=new Set<string>(),seenS=new Set<string>();
  shuffle(src).forEach(function(x){if(out.length<n&&!seenT.has(x.t)&&!seenS.has(x.ko)){out.push(x);seenT.add(x.t);seenS.add(x.ko);}});
  return out;
}
/** Слова-ловушки: из того же пула, тех же тем и частей речи в первую очередь. */
function wsentLures(picked: WSent[],count: number,key: (x: WSent)=>string){
  const have=new Set(picked.map(function(x){return key(x);}));
  const pool=wsentPool().filter(function(x){return !have.has(key(x));});
  const near=pool.filter(function(x){return picked.some(function(p){return p.verb===x.verb&&p.cats.some(function(c){return x.cats.includes(c);});});});
  const out: WSent[]=[];
  shuffle(near).concat(shuffle(pool)).forEach(function(x){if(out.length<count&&!out.some(function(o){return key(o)===key(x);}))out.push(x);});
  return out;
}
/** «Слово → перевод»: слово подсвечено в предложении, нужно поставить его перевод по смыслу. Перевод предложения скрыт: он выдал бы ответ. */
function genWordStory(lo: number,hi: number){
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
function genRevStory(lo: number,hi: number){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const nouns=wsentPool().filter(function(x){return !x.verb&&x.len===x.k.length;});
  const bycat: Record<string, WSent[]>={};nouns.forEach(function(x){x.cats.forEach(function(c){(bycat[c]||(bycat[c]=[])).push(x);});});
  const rich=Object.keys(bycat).filter(function(c){return bycat[c]!.length>=n;});
  const src=rich.length&&Math.random()<.6?bycat[rnd(rich)]!:nouns;
  const words: WSent[]=[],seen=new Set<string>();
  shuffle(src).forEach(function(x){if(words.length<n&&!seen.has(x.k)&&!seen.has(x.ko)){words.push(x);seen.add(x.k);seen.add(x.ko);}});
  const sents=words.map(function(x){
    return {ko:x.ko,ru:x.ru,pieces:[x.ko.slice(0,x.at),{right:x.k,why:'«'+x.t+'» по-корейски — '+x.k},x.ko.slice(x.at+x.len)]};
  });
  const lures=wsentLures(words,hi>5?6:3,function(x){return x.k;}).filter(function(x){return !x.verb;});
  const bank=words.map(function(x){return x.k;}).concat(lures.map(function(x){return x.k;}));
  return makeStory('rev','Перевод → слово ('+plural(sents.length)+'): поставь пропущенное слово',sents,[...new Set(bank)],'🔁');
}
/* ---------- «Вопросы», «Частицы и счёт», «Выбери форму»: тексты ---------- */
const known=(ko: string)=>!analyze(ko).some(function(sg){return sg.type==='unknown';});
/** «Вопросы»: пары «вопрос — ответ» из диалогов; в вопросе пропущено вопросительное слово, подсказка только в переводе ответа (иконка слева). */
const QW_WORDS=['어디','누구','뭐','얼마','몇','어느','무슨'];

function qwPool(){
  return memo('QW_POOL',function(){
  return EXCHANGES.map(function(e){
    const hit=QW_WORDS.filter(function(w){return e[0].split(/[ ?]/).some(function(t){return t===w||t.startsWith(w+'에')||t.startsWith(w+'예')||t.startsWith(w+'이')||t.startsWith(w+'의');});});
    if(hit.length!==1)return null;
    const w=hit[0]!;const at=e[0].indexOf(w);
    if(at<0)return null;
    return {q:e[0],qru:e[1],a:e[2],aru:e[3],w:w,at:at};
  }).filter(function(x): x is NonNullable<typeof x>{return !!x&&known(x.q);});
  });
}
function genQwStory(lo: number,hi: number){
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
  return memo('PART_POOL',function(){
  return D.PB.map(function(p){return {pre:p[0].split('___')[0]!,post:p[0].split('___')[1]||'',ru:p[1],right:p[2],opts:p[3],why:p[4],ko:p[0].replace('___',p[2])};}).filter(function(x){return known(x.ko);}).filter(function(x,i,a){return a.findIndex(function(y){return y.ko===x.ko;})===i;});
  });
}
function genPartStory(lo: number,hi: number){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const picked=shuffle(partPool()).slice(0,n);
  const sents=picked.map(function(x){return {ko:x.ko,ru:x.ru,pieces:[x.pre,{right:x.right,why:x.why},x.post]};});
  const bank=new Set(picked.map(function(x){return x.right;}));
  shuffle(picked.flatMap(function(x){return x.opts;})).forEach(function(t){if(bank.size<picked.length+(hi>5?5:3))bank.add(t);});
  return makeStory('part','Частицы и счёт ('+plural(picked.length)+'): поставь нужное слово',sents,[...bank],'🧩');
}
/** «Выбери форму»: в предложении глагол или прилагательное без окончания (основа), в пропуск нужно поставить окончание: 아요 / 어요 / 았어요 / 었어요. Только слова, где основа и окончание просто склеиваются (без слияния). */

function formPool(){
  return memo('FORM_POOL',function(){
  const stems=new Set<string>();
  DICT.forEach(function(d){if(/다$/.test(d.k)&&!/하다$/.test(d.k))stems.add(d.k.slice(0,-1));});
  [...D.V,...D.A].forEach(function(r){if(/다$/.test(r[0])&&!/하다$/.test(r[0]))stems.add(r[0].slice(0,-1));});
  const out: {ko: string;ru: string;stem: string;e: string;at: number;past: boolean;harmony: boolean}[]=[];
  Object.keys(STUDY_TRANSLATIONS).forEach(function(ko){
    const words=ko.replace(/[.?!,]/g,'').split(' ');
    words.forEach(function(w){
      for(const e of ['았어요','었어요','아요','어요']){
        if(!w.endsWith(e))continue;
        const stem=w.slice(0,-e.length);
        if(stem&&stems.has(stem)&&jong(stem[stem.length-1]!)>0){
          const at=ko.indexOf(w);
          const a=jung(stem[stem.length-1]!);const harmony=a===0||a===8;// ㅏ, ㅗ
          const past=e[0]==='았'||e[0]==='었';
          if((e==='아요'||e==='았어요')===harmony&&known(ko))out.push({ko:ko,ru:TRANSLATIONS[ko]!,stem:stem,e:e,at:at+stem.length,past:past,harmony:harmony});
        }
        break;
      }
    });
  });
  const seen=new Set<string>();
  return out.filter(function(x){const k=x.stem;if(seen.has(k))return false;seen.add(k);return true;});
  });
}
function genFormStory(lo: number,hi: number){
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
const DAY_ACTS: [string,string][]=[['학교에 가요','иду в школу'],['공원에서 운동해요','занимаюсь спортом в парке'],['영화를 봐요','смотрю кино'],['친구를 만나요','встречаюсь с другом'],['집에서 쉬어요','отдыхаю дома'],['커피를 마셔요','пью кофе'],['빵을 먹어요','ем хлеб']];
/** «Дни недели»: расписание недели (день → 에 + действие) и вопросы «а завтра какой день?». Подсказка у второго вида только в иконке, и в ней нет ответа. */
function genDaysStory(lo: number,hi: number){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const acts=DAY_ACTS.filter(function(a){return known('월요일에 '+a[0]+'.');});
  const sents: SentIn[]=[],seen=new Set<string>();
  let guard=0;
  while(sents.length<n&&guard++<80){
    const i=Math.floor(Math.random()*7);
    if(Math.random()<.5){
      const d=DAYS[i]!,a=rnd(acts);
      const ko=d[0]+'에 '+a[0]+'.';
      if(seen.has(ko))continue;seen.add(ko);
      sents.push({ko:ko,ru:cap1(DAYS_ACC[i]!)+' я '+a[1]+'.',pieces:[{right:d[0],why:'«'+d[1]+'» по-корейски — '+d[0]+'; «в такой-то день» = день + 에'},'에 '+a[0]+'.']});
    }else{
      const t=DAYS[i]!,nx=DAYS[(i+1)%7]!;
      const ko='오늘은 '+t[0]+'이에요. 내일은 '+nx[0]+'이에요.';
      if(seen.has(ko))continue;seen.add(ko);
      sents.push({ko:ko,ru:'Сегодня '+t[1]+'. Завтра '+nx[1]+'.',tip:'Сегодня '+t[1]+'. Какой день завтра?',
        pieces:['오늘은 '+t[0]+'이에요. 내일은 ',{right:nx[0],why:'Сегодня '+t[0]+', завтра следующий по кругу: '+nx[0]+' ('+nx[1]+')'},'이에요.']});
    }
  }
  return makeStory('days','Дни недели ('+plural(sents.length)+'): поставь день',sents,DAYS.map(function(d){return d[0];}),'📅');
}
/** Предметы и их счётные слова (только слова, известные разбору). */
const COUNT_ITEMS: [string,string,string][]=[['사과','яблоко','개'],['물','вода','병'],['커피','кофе','잔'],['비빔밥','бибимбап','그릇'],['학생','ученик','명'],['고양이','кот','마리'],['책','книга','권'],['빵','хлеб','개'],['친구','друг','명'],['우유','молоко','병']];
const NATF=['한','두','세','네','다섯','여섯','일곱','여덟','아홉','열'];
const COUNTERS_ALL=['병','잔','개','그릇','명','마리','권','장'];
const subjP=(w: string)=>w+(hasFinal(w[w.length-1]!)?'이':'가');
function countItems(){
  return memo('COUNT_ITEMS',function(){
  return COUNT_ITEMS.filter(function(x){return known(subjP(x[0])+' 세 '+x[2]+' 있어요.');});
  });
}
function countRow(x: [string,string,string],n: number,gapKind: string): SentIn{
  const num=NATF[n-1]!;
  const ko=subjP(x[0])+' '+num+' '+x[2]+' 있어요.';
  const ru=cap1(x[1])+': '+n+'.';
  const why='«'+x[0]+'» считают словом «'+x[2]+'»; '+n+' = '+NATF[n-1]+(n<=4?' (перед счётным слово короче: 하나 → 한, 둘 → 두, 셋 → 세, 넷 → 네)':'');
  const pieces: Piece[]=gapKind==='num'?[subjP(x[0])+' ',{right:num,why:why},' '+x[2]+' 있어요.']:[subjP(x[0])+' '+num+' ',{right:x[2],why:why},' 있어요.'];
  return {ko:ko,ru:ru,pieces:pieces};
}
function genCountStory(lo: number,hi: number){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const items=shuffle(countItems());
  const sents: SentIn[]=[],seen=new Set<string>();
  for(let i=0;sents.length<n&&i<items.length*3;i++){
    const x=items[i%items.length]!,k=1+Math.floor(Math.random()*9);
    const row=countRow(x,k,Math.random()<.5?'num':'cnt');
    if(seen.has(row.ko))continue;seen.add(row.ko);sents.push(row);
  }
  const bank=new Set<string>();
  sents.forEach(function(r){r.pieces.forEach(function(p){if(typeof p!=='string')bank.add(p.right!);});});
  shuffle(COUNTERS_ALL).slice(0,3).forEach(function(c){bank.add(c);});
  shuffle(NATF).slice(0,3).forEach(function(c){bank.add(c);});
  return makeStory('count','Счётные слова ('+plural(sents.length)+'): поставь число или счётное слово',sents,[...bank],'🥤');
}
/** «Числа»: корейские числа перед счётным словом (한, 두, 세…) и китайские числа для этажей (일 층, 이 층…). Какой ряд нужен, определяет слово после пропуска. */
function genNumStory(lo: number,hi: number){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const items=shuffle(countItems());
  const sents: SentIn[]=[],seen=new Set<string>();
  for(let i=0;sents.length<n&&i<60;i++){
    if(Math.random()<.65){
      const x=items[i%items.length]!,k=1+Math.floor(Math.random()*9);
      const row=countRow(x,k,'num');
      if(seen.has(row.ko))continue;seen.add(row.ko);sents.push(row);
    }else{
      const k=1+Math.floor(Math.random()*9);
      const ko=SINO[k-1]+' 층에 있어요.';
      if(seen.has(ko))continue;seen.add(ko);
      sents.push({ko:ko,ru:'Находится на '+k+'-м этаже.',pieces:[{right:SINO[k-1]!,why:'Этаж («층») считают китайскими числами: '+k+' = '+SINO[k-1]},' 층에 있어요.']});
    }
  }
  const bank=new Set<string>();
  sents.forEach(function(r){r.pieces.forEach(function(p){if(typeof p!=='string')bank.add(p.right!);});});
  shuffle(NATF.concat(SINO)).slice(0,hi>5?8:5).forEach(function(c){bank.add(c);});
  return makeStory('num','Числа ('+plural(sents.length)+'): поставь число',sents,[...bank],'🔢');
}
/** «Сколько стоит?»: меню с ценами по-корейски и строка «всего»: нужно прочитать цену китайскими числами. Цифры стоят в иконке, итог надо сложить самому. */
const PRICE_ITEMS: [string,string][]=[['피자','пицца'],['햄버거','гамбургер'],['스파게티','спагетти'],['콜라','кола'],['커피','кофе'],['빵','хлеб'],['주스','сок']];
const PRICES=[1500,2000,2500,3000,3500,4000,4500,5000,6000,7000,8000,9000,10000,12000,15000,18000,20000];
/** Цены из меню учебника (снимки 076, 080, 081): пицца 15 000, гамбургер 8 000, спагетти 12 000, кола 2 000; у остальных позиций цена случайная. */
const PRICE_BOOK: Record<string, number>={'피자':15000,'햄버거':8000,'스파게티':12000,'콜라':2000};
const topicP=(w: string)=>w+(hasFinal(w[w.length-1]!)?'은':'는');
function genPriceStory(lo: number,hi: number){
  const n=Math.max(2,lo+Math.floor(Math.random()*(hi-lo+1)));
  const items=shuffle(PRICE_ITEMS.filter(function(x){return known(topicP(x[0])+' 만오천 원이에요.');}));
  const rows=Math.min(n,items.length);
  const sents: SentIn[]=[];let sum=0;
  const spaced=(v: number)=>String(v).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
  for(let i=0;i<rows;i++){
    const item=items[i]!;const price=PRICE_BOOK[item[0]]||rnd(PRICES);sum+=price;
    const r=sinoNum(price);
    sents.push({ko:topicP(item[0])+' '+r+' 원이에요.',ru:cap1(item[1])+': '+spaced(price)+' вон.',tip:cap1(item[1])+': '+spaced(price)+' вон',
      pieces:[topicP(item[0])+' ',{right:r,why:spaced(price)+' = '+r+(price>=10000?' (만 = 10 000, перед 만 цифру 일 не говорят)':'')},' 원이에요.']});
  }
  if(sum<100000){
    const r=sinoNum(sum);
    sents.push({ko:'모두 '+r+' 원이에요.',ru:'Всего: '+spaced(sum)+' вон.',tip:'Сколько всего? Сложи все цены выше',
      pieces:['모두 ',{right:r,why:'Всего '+spaced(sum)+' = '+r},' 원이에요.']});
  }
  const bank=new Set<string>();
  sents.forEach(function(x){x.pieces.forEach(function(p){if(typeof p!=='string')bank.add(p.right!);});});
  const base=sents.length?sum:5000;
  [base+1000,base-1000,base*10,Math.floor(base/10)*1000||2000,base+500,base+10000].forEach(function(v){if(v>0&&v<100000&&bank.size<sents.length+(hi>5?5:3))bank.add(sinoNum(v));});
  return makeStory('price','Цены ('+plural(sents.length)+'): прочитай цену',sents,[...bank],'💴');
}
/** «Уровень вежливости»: кому и как сказать «спасибо»; у каждой формы несколько адресатов. */
const POLITE_TO: Record<string, string[]>={'고마워':['другу','младшему брату или сестре','однокласснику'],'고마워요':['знакомому старше тебя','старшему брату','соседке'],'감사해요':['коллеге','товарищу по работе','соседу по офису'],'감사합니다':['начальнику','учителю','незнакомому взрослому']};
function genPoliteStory(lo: number,hi: number){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  const order=shuffle(POLITE.map(function(x){return x[0];}));
  const rows: {f: string;who: string}[]=[];
  for(let i=0;rows.length<n&&i<40;i++){
    const f=order[i%order.length]!;
    const to=POLITE_TO[f]!;const who=to[Math.floor(i/order.length)%to.length]!;
    if(rows.some(function(r){return r.f===f&&r.who===who;}))continue;
    rows.push({f:f,who:who});
  }
  const sents=rows.map(function(r){
    const ex=POLITE_EX[r.f]!;const at=ex.indexOf(r.f);
    const desc=POLITE.find(function(x){return x[0]===r.f;})![1];
    return {ko:ex,ru:'Спасибо — '+r.who+'.',cue:'говоришь '+r.who,
      pieces:[ex.slice(0,at),{right:r.f,why:r.f+' — '+desc+'. От неформального к официальному: '+POLITE.map(function(x){return x[0];}).join(' → ')},ex.slice(at+r.f.length)]};
  });
  return makeStory('polite','Спасибо ('+plural(sents.length)+'): кому как сказать',sents,POLITE.map(function(x){return x[0];}),'🙏');
}
/* ---------- «Диалог», «Хангыль-блиц», «Найди верное», «Найди ошибку»: уровни ---------- */
/** «Диалог»: вопросы по очереди, на каждый нужен свой ответ из банка (в банке лишние ответы на другие вопросы). */
function genDlgStory(lo: number,hi: number){
  const n=lo+Math.floor(Math.random()*(hi-lo+1));
  // у строк разные теги: ответы одного тега подходят друг к другу, и тогда «неверный» ответ был бы обидным
  const picked: Exchange[]=[],tags=new Set<string>();
  shuffle(EXCHANGES.filter(function(e){return known(e[2]);})).forEach(function(e){if(picked.length<n&&!tags.has(e[4])){picked.push(e);tags.add(e[4]);}});
  const sents=picked.map(function(x){
    return {ko:x[2],ru:x[3],tip:'Вопрос: '+x[1],pieces:[x[0]+'   →   ',{right:x[2],why:'На вопрос «'+x[0]+'» ('+x[1]+') отвечают так: '+x[2]+' ('+x[3]+')'}]};
  });
  const bank=picked.map(function(x){return x[2];});
  shuffle(EXCHANGES.filter(function(e){return !tags.has(e[4])&&!bank.includes(e[2]);})).slice(0,hi>5?4:2).forEach(function(e){bank.push(e[2]);});
  return makeStory('dlg','Диалог ('+plural(sents.length)+'): ответь на каждый вопрос',sents,[...new Set(bank)],'💬');
}
/** «Хангыль-блиц»: «Слова» — прочитать слово (выбрать, как оно звучит), «Строки» — прочитать три слова подряд. */
let HAN_WORDS: {k: string;r: string;t: string}[]|null=null;
function hanWords(){
  if(HAN_WORDS)return HAN_WORDS;
  HAN_WORDS=STUDY.filter(function(d){return d.r&&/^[가-힣]+$/.test(d.k)&&d.k.length>=2&&d.k.length<=4&&/^[а-яё]+$/i.test(d.r);}).map(function(d){return {k:d.k,r:d.r,t:d.t};});
  return HAN_WORDS;
}
function hanOptions(right: string,pool: string[]){
  const dis: string[]=[];const used=new Set([right]);
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
    const alt=picked.map(function(x,i){if(i!==swap)return x.r;const near=pool.filter(function(y){return y.r!==x.r&&Math.abs(y.r.length-x.r.length)<=1;});const o=rnd(near.length?near:pool.filter(function(y){return y.r!==x.r;}));return o.r;}).join(' ');
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
  return memo('SPOT_POOL',function(){
  return D.PB.filter(function(p){return !/\s/.test(p[2])&&known(p[0].replace('___',p[2]));}).map(function(p){return {pre:p[0].split('___')[0]!,post:p[0].split('___')[1]||'',right:p[2],opts:p[3].filter(function(t){return t!==p[2]&&!/\s/.test(t);}),ru:p[1],why:p[4]};}).filter(function(x,i,a){return a.findIndex(function(y){return y.pre+y.right+y.post===x.pre+x.right+x.post;})===i;});
  });
}
function genSpotText(lo: number,hi: number){
  const k=lo+Math.floor(Math.random()*(hi-lo+1));
  const base=shuffle(spotPool()).slice(0,k);
  const good=base.map(function(x){return x.pre+x.right+x.post;});
  const bad=shuffle(base.map(function(x,i){return i;})).slice(0,2);
  const variants=[good];
  const notes: string[]=[];
  bad.forEach(function(i){
    const x=base[i]!;const w=rnd(x.opts);
    const t=good.slice();t[i]=x.pre+w+x.post;variants.push(t);
    notes.push('В «'+t[i]+'» ошибка: нужно «'+x.right+'», а не «'+w+'». '+x.why);
  });
  const texts=variants.map(function(t){return t.join(' ');});
  const list=shuffle(texts).map(function(t){return {text:t,ko:true};});
  const right=good.join(' ');
  return {type:'choice',mode:'spot',key:'sp:'+right.slice(0,60),label:'В каком тексте нет ошибок?',prompt:base.map(function(x){return x.ru;}).join(' '),promptKo:false,
    options:list,correct:list.findIndex(function(o){return o.text===right;}),right:right,explain:notes,teach:good[0],trans:base[0]!.ru,hp:'Тексты без ошибок',hr:right,icon:'🔍'};
}
/** «Найди ошибку»: каждое предложение помечается «верно» или «ошибка»; в части предложений частица подменена. */
function genErrStory(lo: number,hi: number){
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
function genTypeStory(lo: number,hi: number){
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
function genOrdStory(lo: number,hi: number){
  const fit=STORIES.filter(function(st){return st.sents.length>=lo&&st.sents.length<=hi;});
  const st=rnd(fit.length?fit:STORIES);
  const n=st.sents.length;
  let order=[...Array(n).keys()],guard=0;
  do{order=shuffle(order);}while(order.every(function(v,i){return v===i;})&&guard++<30);
  const sents=order.map(function(k){
    const x=st.sents[k]!;
    const why=k===0?'Рассказ начинается с этого предложения: оно вводит тему.':'Идёт '+(k+1)+'-м, после «'+st.sents[k-1]!.ko+'»: '+st.sents[k-1]!.ru;
    return {ko:x.ko,ru:x.ru,pieces:[{right:String(k+1),why:why},'   '+x.ko]};
  });
  const q=makeStory('ord','Порядок («'+st.title+'», '+plural(n)+'): поставь номера по порядку',sents,[],'🔢');
  q.bank=[...Array(n).keys()].map(function(i){return String(i+1);}); // номера идут по порядку, не вперемешку
  return q;
}
/**
 * «Эксперт»: один текст, где в каждом предложении своё правило (частицы всех шести правил, счётные слова и частицы из «Частицы и счёт», окончания глаголов).
 * Перевода у предложений нет (виден в разборе после проверки), кроме тех, где без него неоднозначно (도, 만, 은/는, 이/가); плитки общие на все пропуски. Размер: 5, 10 или 15 пропусков.
 */
/** «Слабые места»: задание из правила, где у владельца меньше 90% (по журналу ответов); пока слабых нет, обычный микс. */
function genWeak(): Question{
  const list=(hooks.weak&&hooks.weak())||[];
  if(!list.length)return GEN[rnd(['word','form','part','pair','when','place','too'])]!();
  const r=rnd(list);
  if(r.game&&GEN[r.game])return GEN[r.game]!();
  if(r.family&&PFAMS.some(f=>f.id===r.family)){S.pfam=r.family;return genPtext();}
  return GEN.part!();
}
const AMBIG=['은','는','이','가','도','만'];
function genExpert(){
  const target={simple:5,story:10,long:15}[S.levels.expert||'simple']||5;
  const all=PFAMS.find(function(x){return x.id==='all';})!;
  const pt=shuffle(ptextPool().map(function(x){return {x:x,gaps:x.marks.filter(function(m){return inFam(all,m);})};}).filter(function(c){return c.gaps.length;}));
  const pc=shuffle(partPool()),fm=shuffle(formPool());
  const bank=new Set<string>(all.marks);
  const sents: SentIn[]=[];let n=0;const seen=new Set<string>();
  let ip=0,ic=0,ifm=0;
  while(n<target&&(ip<pt.length||ic<pc.length||ifm<fm.length)){
    const r=Math.random(),left=target-n;
    const want=r<.5?'p':r<.78?'c':'f';
    let sn: SentIn|null=null;
    if(want==='p'&&ip<pt.length){
      const c=pt[ip++]!;const use=shuffle(c.gaps).slice(0,Math.min(2,left));
      sn={ko:c.x.ko,ru:c.x.ru,pieces:ptextPieces(c.x,use)};
      n+=use.length;
    }else if(want==='c'&&ic<pc.length){
      const x=pc[ic++]!;
      sn={ko:x.ko,ru:x.ru,pieces:[x.pre,{right:x.right,why:x.why},x.post]};
      bank.add(x.right);x.opts.forEach(function(t){bank.add(t);});n++;
    }else if(want==='f'&&ifm<fm.length){
      const x=fm[ifm++]!;
      const vow=x.harmony?'ㅏ или ㅗ':'не ㅏ и не ㅗ';
      const why=x.stem+' + '+x.e+'. У основы последний гласный '+vow+' → '+(x.harmony?'아':'어')+(x.past?', прошедшее время → '+(x.harmony?'았':'었')+'어요':', настоящее время → '+(x.harmony?'아요':'어요'));
      sn={ko:x.ko,ru:x.ru,cue:x.past?'в прошлом':'сейчас',pieces:[x.ko.slice(0,x.at),{right:x.e,why:why},x.ko.slice(x.at+x.e.length)]};
      ['아요','어요','았어요','었어요'].forEach(function(t){bank.add(t);});n++;
    }
    if(!sn)continue;
    // перевода нет, кроме предложений, где без него не обойтись: «тоже», «только», «о чём речь» (도, 만, 은/는, 이/가)
    sn.noTr=!sn.pieces.some(function(p){return typeof p!=='string'&&p.right!==undefined&&AMBIG.includes(p.right);});
    const key=sn.ru.toLowerCase(),keyKo='ko:'+sn.ko;
    if(seen.has(key)||seen.has(keyKo)){n-=sn.pieces.filter(function(p){return typeof p!=='string';}).length;continue;}
    seen.add(key);seen.add(keyKo);sents.push(sn);
  }
  return makeStory('expert','Эксперт ('+n+' пропусков): правила вперемешку, перевод только где нужен',shuffle(sents),[...bank],'🎓');
}
/* ---------- «Тексты по правилу»: частицы одного правила в предложениях и рассказах ---------- */
/** Все предложения с переводом, где известны все слова: из сайта, рассказов, диалогов и предложений учебника; для каждого место частиц (`at`, `text`, `g`). */
/** Частица входит в правило: по карточке (`g`) и тексту; у 와 / 과 разбор карточки не указывает, берём по тексту. */
const inFam=(f: RuleFamily,m: PtextMark)=>f.marks.includes(m.text)&&(f.g.includes(m.g)||(f.marks.includes('와')&&(m.text==='와'||m.text==='과')));
/** Предложение с пропусками на месте частиц `use`; у 하고 подходят 와 / 과 по 받침, и наоборот. */
function ptextPieces(x: {ko: string},use: PtextMark[]): Piece[]{
  use=[...use].sort(function(a,b){return a.at-b.at;});
  const pieces: Piece[]=[];let pos=0;
  use.forEach(function(g){
    const before=x.ko[g.at-1]||'';
    let accept: string[]|undefined;
    if(g.text==='하고')accept=[hasFinal(before)?'과':'와'];
    else if(g.text==='와'||g.text==='과')accept=['하고'];
    pieces.push(x.ko.slice(pos,g.at));pieces.push({right:g.text,accept:accept,why:g.why});
    pos=g.at+g.text.length;
  });
  pieces.push(x.ko.slice(pos));
  return pieces;
}
function genPtext(){
  const f=PFAMS.find(function(x){return x.id===S.pfam;})||PFAMS[0]!;
  const lv=S.levels.ptext;
  const n=lv==='long'?5+Math.floor(Math.random()*6):lv==='story'?2+Math.floor(Math.random()*3):1;
  const cands=ptextPool().map(function(x){return {x:x,gaps:x.marks.filter(function(m){return inFam(f,m);})};}).filter(function(c){return c.gaps.length;});
  // одинаковые по смыслу предложения («커피하고 우유가…» и «커피와 우유가…») в одном тексте не нужны
  const picked: typeof cands=[],seenRu=new Set<string>();
  shuffle(cands).forEach(function(c){const key=c.x.ru.toLowerCase();if(picked.length<n&&!seenRu.has(key)){seenRu.add(key);picked.push(c);}});
  const bank=new Set(f.marks);
  const sents=picked.map(function(c){
    const pieces=ptextPieces(c.x,shuffle(c.gaps).slice(0,2));
    return {ko:c.x.ko,ru:c.x.ru,pieces:pieces};
  });
  return makeStory('ptext','Правило «'+f.name+'» ('+plural(sents.length)+'): поставь частицы',sents,[...bank],'🧩');
}
function genPair(){
  if(storyOn('pair'))return S.levels.pair==='long'?genStory(5,10):genStory(2,4);
  if(Math.random()<.35){
    const PP=D.PB.map((x,k)=>k).filter(k=>['에','에서','을','를','는','은'].includes(D.PB[k]![2]));
    const i=pickW(PP,k=>'pr:p'+k);const p=D.PB[i]!;
    const twin=({'에':'에서','에서':'에','을':'를','를':'을','는':'은','은':'는'} as Record<string, string>)[p[2]]!;
    const opts=shuffle([p[2],twin]).map(t=>({text:t,ko:true}));
    const parts=p[0].split('___');
    return {type:'choice',mode:'pair',key:'pr:p'+i,label:'Какая частица? Выбери одну из двух',sentence:{pre:parts[0]!,post:parts[1]!},ru:p[1],
      options:opts,correct:opts.findIndex(o=>o.text===p[2]),right:p[2],explain:[p[0].replace('___',p[2]),p[4]],
      hp:p[0].replace('___','…'),hr:p[2],icon:'⚖️'};
  }
  const nouns=W.s.filter(e=>/^[가-힣]+$/.test(e.ko));
  const e=pickW(nouns,x=>'pr:'+x.ko);
  const pr=rnd(PAIRS);
  const fin=hasFinal(e.ko[e.ko.length-1]!);
  const right=fin?pr.a:pr.b;
  const opts=shuffle([pr.a,pr.b]).map(t=>({text:t,ko:true}));
  const parts=pr.ex(e.ko).split('___');
  const why=fin?'есть 받침 (согласная внизу) → '+pr.a:'нет 받침 (слог кончается на гласную) → '+pr.b;
  return {type:'choice',mode:'pair',key:'pr:'+e.ko+':'+pr.a,word:e.ko,label:'Выбери форму: '+pr.a+' или '+pr.b+' ('+pr.role+')',
    sentence:{pre:parts[0]!,post:parts[1]!},ru:pr.exRu(e.ru),options:opts,correct:opts.findIndex(o=>o.text===right),right:right,
    explain:[pr.ex(e.ko).replace('___',right),e.ko+': '+why],hp:pr.ex(e.ko).replace('___','…'),hr:right,icon:'⚖️'};
}

/* ---------- «Порядок слов»: куда поставить слово ---------- */
function genOrd(){
  if(storyOn('ord'))return S.levels.ord==='long'?genOrdStory(5,10):genOrdStory(2,4);
  for(let t=0;t<30;t++){
    const level: Level=rnd([2,2,3] as const);
    const seed=1+Math.floor(Math.random()*2147483000);
    const tm: TenseMode=S.tense==='pres'?'p':S.tense==='past'?'a':'b';
    const b=makeBuild(level,tm,seed);
    const toks=b.right.split(' ');
    if(toks.length<3)continue;
    const k=Math.floor(Math.random()*toks.length);
    const word=toks[k]!,rest=toks.filter((x,i)=>i!==k);
    const seen=new Set<string>(),good: string[]=[],bad: string[]=[];
    for(let p=0;p<=rest.length;p++){
      const arr=rest.slice();arr.splice(p,0,word);
      const sent=arr.join(' ');
      if(seen.has(sent))continue;seen.add(sent);
      (b.accept.includes(sent)?good:bad).push(sent);
    }
    if(bad.length<2)continue;
    const right=good.includes(b.right)?b.right:good[0]!;
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
  const x=EXCHANGES[i]!;
  // «лишние» ответы: другие теги и другие слова (у разных пар бывает одинаковый ответ «네. 있어요.»)
  const lures: string[]=[];
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
const HAN: {ch: string;rd: string;hint: string;c: number;v: number}[]=[];
HAN_C.forEach(c=>HAN_V.forEach(v=>{const cell=syllableRows[c]!.cells[v]!;HAN.push({ch:cell.char,rd:cell.reading,hint:cell.hint||'',c:c,v:v});}));
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
  const dis: typeof HAN=[];const used=new Set([h.rd]);
  for(const x of near.concat(shuffle(HAN))){if(dis.length>=3)break;if(used.has(x.rd))continue;used.add(x.rd);dis.push(x);}
  const opts=shuffle([h,...dis]).map(x=>({text:x.rd}));
  return {type:'choice',mode:'han',key:'h:'+h.ch,label:'Как читается слог?',prompt:h.ch,promptKo:true,
    options:opts,correct:opts.findIndex(o=>o.text===h.rd),right:h.rd,explain:[h.ch+' = '+h.hint+' → '+h.rd,
    (h.v===4||h.v===8)?'ㅓ — среднее «о» (머, 서), ㅗ — глубокое «о» (고, 보)':''],hp:h.ch,hr:h.rd,icon:'ㅎ'};
}
/* ---------- «Время и дни»: дни недели, частицы 에 («когда») и 도 («тоже») ---------- */
const DAYS: [string,string,string][]=[['월요일','понедельник','ворёиль'],['화요일','вторник','хваёиль'],['수요일','среда','суёиль'],['목요일','четверг','мокёиль'],['금요일','пятница','кымёиль'],['토요일','суббота','тхоёиль'],['일요일','воскресенье','ирёиль']];
const DAY_TIME: [string,string,string][]=[['아침','утро','ачим'],['점심','день, обед','чомсим'],['저녁','вечер','чонёк'],['밤','ночь','пам']];
const DAY_WEEK: [string,string,string][]=[['지난주','прошлая неделя','чинанджу'],['이번 주','эта неделя','ибон чу'],['다음 주','следующая неделя','таым чу'],['주','неделя','чу']];
function genDays(){
  if(storyOn('days'))return S.levels.days==='long'?genDaysStory(5,10):genDaysStory(2,4);
  const t=rnd(['ko2ru','ru2ko','ko2ru','ru2ko','near','kind']);
  if(t==='near'){
    const i=pickW(DAYS.map((x,k)=>k),k=>'dn:'+k);
    const back=Math.random()<.5,r=DAYS[(i+(back?6:1))%7]!;
    const set=shuffle(DAYS.filter(x=>x!==r)).slice(0,3).concat([r]);
    const opts=shuffle(set).map(x=>({text:x[0],ko:true}));
    return {type:'choice',mode:'days',key:'dn:'+i+':'+(back?'b':'f'),word:r[0],label:'Сегодня «'+DAYS[i]![0]+'» ('+DAYS[i]![1]+'). Какой день '+(back?'был вчера?':'будет завтра?'),
      prompt:(back?'어제':'내일')+' = ?',promptKo:true,options:opts,correct:opts.findIndex(o=>o.text===r[0]),right:r[0],
      explain:[DAYS[i]![0]+' → '+(back?'вчера ':'завтра ')+r[0]+' ('+r[1]+')','Неделя идёт по кругу: 월 화 수 목 금 토 일'],hp:DAYS[i]![0]+' → '+(back?'вчера':'завтра'),hr:r[0],icon:'📅'};
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
const WHEN_ON: [string,string][]=[['월요일','в понедельник'],['화요일','во вторник'],['수요일','в среду'],['목요일','в четверг'],['금요일','в пятницу'],['토요일','в субботу'],['일요일','в воскресенье'],
  ['아침','утром'],['저녁','вечером'],['밤','ночью'],['점심','днём'],['주말','на выходных'],['평일','в будни'],['이번 주','на этой неделе'],['다음 주','на следующей неделе']];
const WHEN_OFF: [string,string][]=[['오늘','сегодня'],['내일','завтра'],['지금','сейчас']];
/** Что нужно после слова времени: 에 («когда»), ничего (오늘, 내일, 지금), 에도 («тоже»), 에만 («только»): всё пройденное, но выбор уже не из двух. */
type WhenKind='on'|'off'|'too'|'only';
const WHEN_RIGHT: Record<WhenKind,string>={on:'에',off:'—',too:'에도',only:'에만'};
const WHEN_WHY: Record<WhenKind,string>={on:'Слово отвечает на вопрос «когда» → к нему добавляется 에.',off:'С 오늘, 내일, 지금, 언제 частицу 에 не ставят: «—».',too:'«Тоже» после слова времени: 에 + 도 → 에도.',only:'«Только» после слова времени: 에 + 만 → 에만.'};
/** Случайный вид пропуска: чаще всего 에, потом «—», «тоже» и «только»; withoutOff: без «ничего» (для простого уровня «—» выбирается отдельно). */
const whenKind=(withoutOff=false): WhenKind=>{const r=Math.random();return withoutOff?(r<.55?'on':r<.78?'too':'only'):r<.4?'on':r<.6?'off':r<.8?'too':'only';};
const WHEN_ACT: [string,string,string][]=[['친구를 만나요','встречаюсь с другом','Когда ты встречаешься с другом?'],['운동해요','занимаюсь спортом','Когда ты занимаешься спортом?'],
  ['한국어를 공부해요','занимаюсь корейским','Когда ты занимаешься корейским?'],['도서관에 가요','иду в библиотеку','Когда ты идёшь в библиотеку?'],
  ['영화를 봐요','смотрю фильм','Когда ты смотришь фильм?'],['쇼핑해요','хожу по магазинам','Когда ты ходишь по магазинам?'],
  ['요리를 배워요','учусь готовить','Когда ты учишься готовить?'],['집에 있어요','я дома','Когда ты дома?']];
const NONE='ничего не нужно';
const cap1=(s: string)=>s.charAt(0).toUpperCase()+s.slice(1);
/**
 * Уровень «Эксперт» текстовых режимов (куда/где, когда, тоже, это или не это): 8–12 предложений и лишние похожие плитки.
 * Перевод прячется только там, где без него ответ однозначен (`hideTr`: «Куда, где»); в остальных он решает смысл («тоже», «только», «не»).
 */
const EXPERT_LV: [string,string][]=[['simple','Простой'],['story','Рассказ 2–4'],['long','Длинный 5–10'],['expert','Эксперт 8–12']];
/** Чипы уровня над заданием: у режимов без записи три обычных («Простой», «Рассказ 2–4», «Длинный 5–10»). Читает движок и бот-игрок (`docs/bot.md`). */
const LEVEL_LABELS: Record<string, [string,string][]>={han:[['simple','Слоги'],['story','Слова'],['long','Строки']],spot:[['simple','Простой'],['story','Текст 2–3'],['long','Длинный 4–5']],when:EXPERT_LV,too:EXPERT_LV,neg:EXPERT_LV,place:EXPERT_LV,expert:[['simple','5 пропусков'],['story','10 пропусков'],['long','15 пропусков']]};
function textLevel(mode: string,gen: (lo: number,hi: number)=>Question,extra: string[],hideTr: boolean): Question{
  const lv=S.levels[mode];
  if(lv!=='expert')return lv==='long'?gen(5,10):gen(2,4);
  const q=gen(8,12) as StoryQ;
  if(hideTr)q.sents.forEach(function(x){x.noTr=true;});
  extra.forEach(function(t){if(!q.bank.includes(t))q.bank.push(t);});
  q.bank=shuffle(q.bank);q.label='Эксперт: '+q.label;
  return q;
}
function genWhen(){
  if(storyOn('when'))return textLevel('when',genWhenStory,['에서도','도'],false);
  const act=rnd(WHEN_ACT);
  const r=Math.random();
  const q=r<.12,off=q||r<.3;
  const kind: WhenKind=off?'off':whenKind(true);
  const time: [string,string]=q?['언제','когда']:off?rnd(WHEN_OFF):rnd(WHEN_ON);
  const post=' '+act[0]+(q?'?':'.');
  const ru=q?act[2]:kind==='too'?cap1(time[1])+' тоже '+act[1]+'.':kind==='only'?'Только '+time[1]+' '+act[1]+'.':cap1(time[1])+' '+act[1]+'.';
  const opts=shuffle(['에','에도','에만','에서',NONE]).map(t=>({text:t,ko:t!==NONE}));
  const right=WHEN_RIGHT[kind]===NOPART?NONE:WHEN_RIGHT[kind];
  return {type:'choice',mode:'when',key:'wh:'+time[0]+':'+act[0]+':'+kind,word:null,label:kind==='on'||kind==='off'?'Нужна ли частица, которая отвечает на вопрос «когда»?':'Какая частица нужна после слова времени?',sentence:{pre:time[0],post:post},ru:ru,
    options:opts,correct:opts.findIndex(o=>o.text===right),right:right,
    explain:[time[0]+(right===NONE?'':right)+post,WHEN_WHY[kind]],
    hp:time[0]+' ___'+post,hr:right,icon:'🕒'};
}

/* «Тоже»: 도 вместо 은/는, 이/가, 을/를; с 에 и 에서 получается 에도, 에서도 */
/** [начало, конец, перевод, какая частица стояла бы без «тоже»] */
const TOO: [string,string,string,string][]=[
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
const TOO_AT: [string,string,string,string][]=[
  ['저는 토요일에 친구를 만나요. 일요일',' 친구를 만나요.','В субботу я встречаюсь с другом. И в воскресенье тоже.','에도'],
  ['저는 도서관에 가요. 학교',' 가요.','Я иду в библиотеку. И в школу тоже.','에도'],
  ['저는 도서관에서 공부해요. 카페',' 공부해요.','Я занимаюсь в библиотеке. И в кафе тоже.','에서도'],
  ['저는 집에서 쉬어요. 공원',' 쉬어요.','Я отдыхаю дома. И в парке тоже.','에서도'],
];
function genToo(){
  if(storyOn('too'))return textLevel('too',genTooStory,['을','를','에도','에서도','만'],false);
  const at=Math.random()<.4;
  const pool=at?TOO_AT:TOO;
  const i=pickW(pool.map((x,k)=>k),k=>(at?'ta:':'to:')+k);
  const x=pool[i]!;
  const right=at?x[3]:'도';
  let set: string[];
  if(at)set=x[3]==='에도'?['에도','도','에','에서도']:['에서도','도','에서','에도'];
  else{const other=rnd(['이','가','은','는','을','를'].filter(t=>t!==x[3]));set=['도',x[3],x[3]+'도',other];}
  const opts=shuffle(set).map(t=>({text:t,ko:true}));
  return {type:'choice',mode:'too',key:(at?'ta:':'to:')+i,word:null,label:'Вставь частицу «тоже»',sentence:{pre:x[0],post:x[1]},ru:x[2],
    options:opts,correct:opts.findIndex(o=>o.text===right),right:right,
    explain:[x[0]+right+x[1],at?'С 에 и 에서 частица 도 добавляется: 에도, 에서도.':'도 заменяет 은/는, 이/가, 을/를: вместе с ними её не ставят.'],hp:x[0]+' ___'+x[1],hr:right,icon:'➕'};
}

/** Пары частиц, где замена всегда ошибка (выбор по 받침): так «ошибка» в тексте точно ошибка. */
const SWAP: Record<string,string>={'은':'는','는':'은','이':'가','가':'이','을':'를','를':'을','와':'과','과':'와'};
/** «Найди ошибки»: 6–8 предложений, в 1–3 из них частица заменена на неверную пару; у каждого предложения вердикт «верно» / «ошибка». */
function genFindErrors(){
  const n=6+Math.floor(Math.random()*3);
  const bad=1+Math.floor(Math.random()*3);
  const pool=shuffle(ptextPool().map(function(x){return {x:x,gaps:x.marks.filter(function(m){return !!SWAP[m.text];})};}).filter(function(c){return c.gaps.length&&c.x.ko.length<60;})).slice(0,n);
  const wrongAt=new Set(shuffle(pool.map(function(_,i){return i;})).slice(0,bad));
  const sents: SentIn[]=pool.map(function(c,i){
    if(!wrongAt.has(i))return {ko:c.x.ko,ru:c.x.ru,pieces:[c.x.ko+'  →  ',{right:'верно',why:'Здесь всё верно.'}]};
    const g=rnd(c.gaps);const fake=c.x.ko.slice(0,g.at)+SWAP[g.text]+c.x.ko.slice(g.at+g.text.length);
    return {ko:fake,ru:c.x.ru,pieces:[fake+'  →  ',{right:'ошибка',why:'Верно было: '+c.x.ko+' ('+g.text+', а не '+SWAP[g.text]+')'}]};
  });
  return makeStory('finderr','Найди ошибки ('+plural(n)+'): в тексте есть неверные частицы',sents,['верно','ошибка'],'🔎');
}
/** «Лишнее предложение»: рассказ из учебника и одно предложение из другого рассказа; нужно отметить, какое лишнее. */
function genOddOne(){
  const stories=shuffle(STORIES.filter(function(st){return st.sents.length>=5;}));
  const a=stories[0]!,b=stories[1]!;
  const take=shuffle(a.sents.map(function(_,i){return i;})).slice(0,6).sort(function(x,y){return x-y;}).map(function(i){return a.sents[i]!;});
  const odd=rnd(b.sents);
  const at=1+Math.floor(Math.random()*take.length);
  const all=[...take.slice(0,at),odd,...take.slice(at)];
  const sents: SentIn[]=all.map(function(x){
    const isOdd=x===odd;
    return {ko:x.ko,ru:x.ru,pieces:[x.ko+'  →  ',{right:isOdd?'лишнее':'подходит',why:isOdd?'Это из другого рассказа («'+b.title+'»), а текст про «'+a.title+'».':'Подходит к рассказу «'+a.title+'».'}]};
  });
  return makeStory('oddone','Лишнее предложение: рассказ «'+a.title+'», одно предложение из другого',sents,['подходит','лишнее'],'🧐');
}
/** «Смесь времён»: текст, где время глагола определяет слово времени (어제 → прошедшее, 지금 / 오늘 → настоящее, 내일 / 주말에 → будущее). Плитки: все три формы каждого глагола. */
const TENSE_TIMES: {t: string;tense: 'past'|'now'|'fut'}[]=[
  {t:'어제',tense:'past'},{t:'지금',tense:'now'},{t:'오늘',tense:'now'},{t:'내일',tense:'fut'},{t:'주말에',tense:'fut'},{t:'토요일에',tense:'fut'},
];
const TENSE_NAME={past:'прошедшее: 어제 («вчера»)',now:'настоящее: 지금 / 오늘 («сейчас / сегодня»)',fut:'будущее: 내일 / 주말에 / 토요일에 → -(으)ㄹ 거예요'};
function genTenses(){
  const n=8+Math.floor(Math.random()*3);
  const verbs=FUT_NOW.map(function(x){return {obj:x[0],verb:x[1],now:x[2],past:x[5]};}).filter(function(x){return !!futureForm(x.verb);});
  const combos: {v: typeof verbs[number];tm: typeof TENSE_TIMES[number]}[]=[];
  verbs.forEach(function(v){TENSE_TIMES.forEach(function(tm){combos.push({v:v,tm:tm});});});
  const picked: typeof combos=[];const perVerb: Record<string,number>={};const perTense: Record<string,number>={};
  shuffle(combos).forEach(function(c){
    if(picked.length>=n)return;
    if((perVerb[c.v.verb]||0)>=2||(perTense[c.tm.tense]||0)>=Math.ceil(n/3)+1)return;
    if(picked.some(function(x){return x.v===c.v&&x.tm.tense===c.tm.tense;}))return;
    picked.push(c);perVerb[c.v.verb]=(perVerb[c.v.verb]||0)+1;perTense[c.tm.tense]=(perTense[c.tm.tense]||0)+1;
  });
  const bank=new Set<string>();
  const sents: SentIn[]=picked.map(function(c){
    const f=futureForm(c.v.verb)!;
    const right=c.tm.tense==='past'?c.v.past:c.tm.tense==='now'?c.v.now:f;
    [c.v.now,c.v.past,f,futWrongMark(c.v.verb)].forEach(function(t){bank.add(t);});
    const pre=c.tm.t+' '+c.v.obj+' ';
    return {ko:pre+right+' ('+c.v.verb+').',ru:'',noTr:true,pieces:[pre,{right:right,why:c.tm.t+' → '+TENSE_NAME[c.tm.tense]+'. '+c.v.verb+' → '+right},' ('+c.v.verb+').']};
  });
  return makeStory('tenses','Смесь времён ('+plural(sents.length)+'): в скобках глагол, форму определяет слово времени',sents,[...bank],'🕰️');
}
/* «Планы»: -(으)ㄹ 거예요. Часть 1: форма будущего в предложении, часть 2: «сейчас или потом» (지금 и 내일) */
/** [начало, конец, глагол, перевод, настоящее, прошедшее] */
const FUT_S: [string,string,string,string,string,string][]=[
  ['내일 친구를 ','.','만나다','Завтра встречусь с другом.','만나요','만났어요'],
  ['저녁에 한국어 책을 ','.','읽다','Вечером буду читать книгу по-корейски.','읽어요','읽었어요'],
  ['토요일에 ','.','운동하다','В субботу буду заниматься спортом.','운동해요','운동했어요'],
  ['집에서 ','.','쉬다','Буду отдыхать дома.','쉬어요','쉬었어요'],
  ['바다에 ','.','가다','Поеду на море.','가요','갔어요'],
  ['사진을 ','.','찍다','Буду фотографировать.','찍어요','찍었어요'],
  ['서울에서 ','.','살다','Буду жить в Сеуле.','살아요','살았어요'],
  ['주말에 밥을 ','.','만들다','На выходных приготовлю еду.','만들어요','만들었어요'],
  ['오늘 저녁에 고기를 안 ','.','먹다','Сегодня вечером не буду есть мясо.','먹어요','먹었어요'],
  ['혼자 영화를 ','.','보다','Буду смотреть фильм одна/один.','봐요','봤어요'],
];
/** [объект или место, глагол, настоящее, «сейчас» по-русски, «потом» по-русски, прошедшее] */
const FUT_NOW: [string,string,string,string,string,string][]=[
  ['한국어를','공부하다','공부해요','учу корейский','буду учить корейский','공부했어요'],
  ['커피를','마시다','마셔요','пью кофе','буду пить кофе','마셨어요'],
  ['책을','읽다','읽어요','читаю книгу','буду читать книгу','읽었어요'],
  ['친구를','만나다','만나요','встречаюсь с другом','встречусь с другом','만났어요'],
  ['집에서','쉬다','쉬어요','отдыхаю дома','буду отдыхать дома','쉬었어요'],
  ['밥을','먹다','먹어요','ем','буду есть','먹었어요'],
  ['사진을','찍다','찍어요','фотографирую','буду фотографировать','찍었어요'],
];
const FUT_LATER: [string,string][]=[['내일','завтра'],['주말에','на выходных'],['토요일에','в субботу']];
function futWrongMark(ko: string){
  const stem=ko.slice(0,-1),j=jong(stem[stem.length-1]!);
  return j===0||j===8?stem+'을 거예요':stem+'ㄹ 거예요';
}
function genFut(){
  const later=Math.random()<.4;
  if(!later){
    const i=pickW(FUT_S.map((x,k)=>k),k=>'ft:'+k);
    const x=FUT_S[i]!;
    const right=futureForm(x[2])!;
    const set=[right,futWrongMark(x[2]),x[4],x[5]].filter((v,k,a)=>a.indexOf(v)===k);
    const opts=shuffle(set).map(t=>({text:t,ko:true}));
    const stem=x[2].slice(0,-1),j=jong(stem[stem.length-1]!);
    return {type:'choice',mode:'fut',key:'ft:'+i,word:null,label:'Поставь глагол в форму будущего: -(으)ㄹ 거예요',sentence:{pre:x[0],post:x[1]},ru:x[3],
      options:opts,correct:opts.findIndex(o=>o.text===right),right:right,
      explain:[x[0]+right+x[1],(j===8?'Основа на ㄹ: ничего не добавляем':j===0?'받침 нет: ㄹ под последней гласной':'받침 есть: 을')+'; сам 거예요 не меняется.'],hp:x[0]+'___'+x[1],hr:right,icon:'🔮'};
  }
  const i=pickW(FUT_NOW.map((x,k)=>k),k=>'fn:'+k);
  const x=FUT_NOW[i]!;
  const now=Math.random()<.5;
  const lt=rnd(FUT_LATER);
  const pre=(now?'지금':lt[0])+' '+x[0]+' ';
  const fut=futureForm(x[1])!;
  const right=now?x[2]:fut;
  const set=[right,now?fut:x[2],futWrongMark(x[1]),x[5]];
  const opts=shuffle(set.filter((v,k,a)=>a.indexOf(v)===k)).map(t=>({text:t,ko:true}));
  const ru=(now?'Сейчас ':cap1(lt[1])+' ')+(now?x[3]:x[4])+'.';
  return {type:'choice',mode:'fut',key:'fn:'+i+':'+(now?'n':'l'),word:null,label:'Сейчас или потом? Выбери форму',sentence:{pre:pre,post:'.'},ru:ru,
    options:opts,correct:opts.findIndex(o=>o.text===right),right:right,
    explain:[pre+right+'.',now?'지금 — это сейчас: обычное настоящее время.':'План на потом: -(으)ㄹ 거예요 («буду…»).'],hp:pre+'___.',hr:right,icon:'🔮'};
}

/* «Только (만)»: 만 или 도 по смыслу, место 만 рядом с 에 / 에서 */
/** [начало, конец, перевод, правильный ответ (만), частица без «только»] */
const ONLY_P: [string,string,string,string,string][]=[
  ['교실에 선생님',' 있어요.','В классе только учитель.','만','이'],
  ['저는 김치',' 먹어요.','Я ем только кимчи.','만','를'],
  ['친구',' 와요.','Приходит только друг.','만','가'],
  ['하이 씨',' 회사원이에요.','Только Хай сотрудник компании.','만','는'],
  ['우리 반에서 저',' 영국 사람이에요.','В нашей группе только я англичанин.','만','는'],
  ['저는 이 가수',' 좋아해요.','Мне нравится только этот певец.','만','를'],
];
/** [слово, конец, перевод, верное сочетание, неверные] */
const ONLY_AT: [string,string,string,string,string[]][]=[
  ['학교',' 가요.','Хожу только в школу.','에만',['만에','는만','를만']],
  ['집',' 커피를 마셔요.','Пью кофе только дома.','에서만',['만에서','에만','는만']],
  ['일요일',' 청소해요.','Убираюсь только по воскресеньям.','에만',['만에','에서만','는만']],
  ['평일',' 학교에 가요.','В школу хожу только в будни.','에만',['만에','에서만','는만']],
  ['돌하르방은 제주도',' 있어요.','Статуи дольхарбан есть только на острове Чеджу.','에만',['만에','에서만','는만']],
  ['저는 책',' 읽어요.','Я читаю только книги.','만',['을만','를만','은만']],
];
const ONLY_PAIR: Record<string, string>={'이':'가','가':'이','은':'는','는':'은','을':'를','를':'을'};
function genOnly(){
  const at=Math.random()<.4;
  if(at){
    const i=pickW(ONLY_AT.map((x,k)=>k),k=>'oa:'+k);
    const x=ONLY_AT[i]!;
    const set=shuffle([x[3]].concat(x[4])).map(t=>({text:t,ko:true}));
    return {type:'choice',mode:'only',key:'oa:'+i,word:null,label:'Поставь «только» на своё место',sentence:{pre:x[0],post:x[1]},ru:x[2],
      options:set,correct:set.findIndex(o=>o.text===x[3]),right:x[3],
      explain:[x[0]+x[3]+x[1],x[3]==='만'?'Вместо 을/를 ставим просто 만: «책만».':'Сначала 에 / 에서, потом 만: «'+x[3]+'». 만 не ставится перед 에 и не рядом с 은/는, 이/가, 을/를.'],hp:x[0]+'___'+x[1],hr:x[3],icon:'☝️'};
  }
  const too=Math.random()<.4;
  const x=(too?TOO[pickW(TOO.map((y,k)=>k),k=>'ot:'+k)]:ONLY_P[pickW(ONLY_P.map((y,k)=>k),k=>'op:'+k)])! as [string,string,string,string,string];
  const base=x[3]==='만'||x[3]==='도'?x[4]:x[3];
  const right=too?'도':'만';
  const set=[right,too?'만':'도',base,ONLY_PAIR[base]!];
  const opts=shuffle(set).map(t=>({text:t,ko:true}));
  return {type:'choice',mode:'only',key:(too?'ot:':'op:')+x[0]+x[1],word:null,label:'Вставь частицу по смыслу: «только» или «тоже»',sentence:{pre:x[0],post:x[1]},ru:x[2],
    options:opts,correct:opts.findIndex(o=>o.text===right),right:right,
    explain:[x[0]+right+x[1],too?'도 добавляет: «тоже». Вместо 은/는, 이/가, 을/를.':'만 выделяет одно: «только». Вместо 은/는, 이/가, 을/를; 받침 на неё не влияет.'],hp:x[0]+' ___'+x[1],hr:right,icon:'☝️'};
}

/* ---------- «Числа и деньги»: числа, цены, счётные слова ---------- */
const NAT=['하나','둘','셋','넷','다섯','여섯','일곱','여덟','아홉','열'];
const SINO=['일','이','삼','사','오','육','칠','팔','구','십'];
const SINO_BIG: [number,string][]=[[100,'백'],[1000,'천'],[10000,'만']];
function genNum(){
  if(storyOn('num'))return S.levels.num==='long'?genNumStory(5,10):genNumStory(2,4);
  const nat=Math.random()<.5;
  const pair=(k: string,i: number): [number,string]=>[i+1,k];
  const list=nat?NAT.map(pair):SINO.map(pair).concat(SINO_BIG);
  const x=pickW(list,y=>'nu:'+(nat?'n':'s')+y[0]);
  const toKo=Math.random()<.5;
  const others=shuffle(list.filter(y=>y!==x)).slice(0,3);
  const sys=nat?'Корейские числа (하나, 둘, 셋…)':'Китайские числа (일, 이, 삼…)';
  const fmt=(n: number)=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
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
function sinoPart(x: number){let o='';const th=Math.floor(x/1000),h=Math.floor(x%1000/100),t=Math.floor(x%100/10),u=x%10;
  if(th)o+=(th>1?SDIG[th]:'')+'천';if(h)o+=(h>1?SDIG[h]:'')+'백';if(t)o+=(t>1?SDIG[t]:'')+'십';if(u)o+=SDIG[u];return o;}
/** Сумма 1..99999 китайскими числами: 3500 → 삼천오백, 10000 → 만 (일 перед 만, 천, 백, 십 не говорят) */
function sinoNum(n: number){const man=Math.floor(n/10000),r=n%10000;return (man?(man>1?sinoPart(man):'')+'만':'')+sinoPart(r);}
const fmtMoney=(n: number)=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',')+'원';
function genPrice(){
  if(storyOn('price'))return S.levels.price==='long'?genPriceStory(5,10):genPriceStory(1,3);
  const kind=rnd(['t','t','h','m','mix']);
  const n=kind==='t'?(1+Math.floor(Math.random()*9))*1000:kind==='h'?(1+Math.floor(Math.random()*9))*1000+500:kind==='m'?(1+Math.floor(Math.random()*9))*10000:(1+Math.floor(Math.random()*4))*10000+(1+Math.floor(Math.random()*9))*1000;
  const key='pr:'+n;
  const cands=[n*10<100000?n*10:n/10,n+1000<100000?n+1000:n-1000,n>=10000?(n%10000===0?n/10:n-(n%10000)):n+500,n+10000<100000?n+10000:n-10000,n>1000?n-1000:n+2000];
  const bad: number[]=[];for(const c of cands){const v=Math.round(c);if(v>0&&v<100000&&v!==n&&!bad.includes(v))bad.push(v);if(bad.length>=3)break;}
  let g=0;while(bad.length<3&&g++<50){const v=(1+Math.floor(Math.random()*19))*500;if(v!==n&&!bad.includes(v))bad.push(v);}
  const set=shuffle([n,...bad]);
  const readable=(n: number)=>sinoNum(n)+' 원';
  const parts: string[]=[];if(n>=10000)parts.push(Math.floor(n/10000)===1?'만 (10 000)':sinoPart(Math.floor(n/10000))+'만');if(n%10000)parts.push(sinoPart(n%10000));
  const how=fmtMoney(n)+' = '+parts.join(' + ');
  if(Math.random()<.5){
    return {type:'choice',mode:'price',key:key,word:null,label:'Прочитай цену по-корейски',prompt:fmtMoney(n),promptKo:false,options:set.map(v=>({text:readable(v),ko:true})),correct:set.indexOf(n),
      right:readable(n),explain:[readable(n),how,'Перед 만 цифру 일 не говорят: 10 000 = 만, а не 일만.'],teach:readable(n)+'이에요.',trans:'Это стоит '+fmtMoney(n)+'.',hp:fmtMoney(n),hr:readable(n),icon:'💴'};
  }
  return {type:'choice',mode:'price',key:key,word:null,label:'Сколько это стоит?',prompt:readable(n),promptKo:true,options:set.map(v=>({text:fmtMoney(v)})),correct:set.indexOf(n),
    right:fmtMoney(n),explain:[readable(n)+' = '+fmtMoney(n),how],teach:readable(n)+'이에요.',trans:'Это стоит '+fmtMoney(n)+'.',hp:readable(n),hr:fmtMoney(n),icon:'💴'};
}

/* ---------- «Собери число»: число, дата или цена крупно, плитки со словами, ответ собирается слотами ---------- */
const ASM_MONTHS=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const ASM_GLOSS: Record<string,string>={'일':'1','이':'2','삼':'3','사':'4','오':'5','육':'6','칠':'7','팔':'8','구':'9','십':'10','백':'100','천':'1000','만':'10 000','월':'месяц','유':'6 (только в 유월)','시':'10 (только в 시월)','원':'воны'};
/** Слово на плитке «Собери число»: цифра, которую оно значит. */
function asmGloss(tok: string){return ASM_GLOSS[tok]||'';}
const ASM_ALL=['일','이','삼','사','오','육','칠','팔','구','십','백','천','만'];
/** Китайское число по слогам: 23405 → 이 만 삼 천 사 백 오 */
function asmSino(n: number){return Array.from(sinoNum(n));}
function asmDay(d: number){return [...asmSino(d),'일'];}
function asmMonth(m: number){return m===6?['유','월']:m===10?['시','월']:[...asmSino(m),'월'];}
function genAssemble(){
  const kind=S.asm==='mix'||!S.asm?rnd(['num','num','date','price']):S.asm;
  let toks: string[],big: string,small: string,label: string,note: string,key: string,spare: string[]=[],read: string;
  if(kind==='date'){
    const m=1+Math.floor(Math.random()*12),d=1+Math.floor(Math.random()*31);
    toks=[...asmMonth(m),...asmDay(d)];read=toks.join('');
    big=String(d);small=ASM_MONTHS[m-1]!;key='as:d:'+m+'.'+d;label='Собери дату по-корейски';
    note='Месяц: число + 월, день: число + 일. '+(m===6?'Июнь — 유월 (не 육월). ':m===10?'Октябрь — 시월 (не 십월). ':'')+d+' '+small+' = '+read;
    if(m===6)spare.push('육');if(m===10)spare.push('십');
  }else if(kind==='price'){
    const n=rnd([1,2,3,4,5,6,7,8,9])*1000+rnd([0,0,500,100,200,300])*(Math.random()<.5?1:0)+(Math.random()<.3?rnd([1,2,3,4])*10000:0);
    toks=[...asmSino(n),'원'];read=toks.join('');
    big=fmtMoney(n);small='цена';key='as:p:'+n;label='Собери цену по-корейски';
    note=fmtMoney(n)+' = '+sinoNum(n)+' 원'+(n>=10000&&Math.floor(n/10000)===1?'. Перед 만 цифру 일 не говорят.':'');
  }else{
    const r=Math.random();
    const n=r<.15?11+Math.floor(Math.random()*89):r<.4?100+Math.floor(Math.random()*900):r<.7?1000+Math.floor(Math.random()*9000):10000+Math.floor(Math.random()*89999);
    toks=asmSino(n);read=toks.join('');
    big=String(n).replace(/\B(?=(\d{3})+(?!\d))/g,' ');small='число';key='as:n:'+n;label='Собери число по-корейски';
    note='Китайские числа: '+big+' = '+read+(n>=10000?'. Перед 만 цифру 일 не говорят (10 000 = 만).':'');
  }
  // лишние плитки: слоги чисел, которых в ответе нет (две штуки, по одной в коротких)
  shuffle(ASM_ALL).forEach(function(w){if(spare.length<(toks.length>=5?2:1)&&!toks.includes(w)&&!spare.includes(w))spare.push(w);});
  const right=toks.join(' ');
  return {type:'build',mode:'assemble',key:key,level:2,label:label,ru:big,asm:{kind:kind,big:big,small:small},tiles:shuffle([...toks,...spare]),
    accept:[right],right:right,note:note,explain:[read,note],hp:big+(kind==='date'?' '+small:''),hr:read,icon:'🔢'};
}
const COUNTERS=['병','잔','개','그릇','명','마리','권','장'];
function countPool(){return D.PB.map((x,k)=>k).filter(k=>{const p=D.PB[k]!;return COUNTERS.includes(p[2])||/^Перед счётным/.test(p[4]);});}
function genCount(){
  if(storyOn('count'))return S.levels.count==='long'?genCountStory(5,10):genCountStory(2,4);
  const pool=countPool();
  const i=pickW(pool,k=>'cn:'+k);
  const p=D.PB[i]!;
  const opts=shuffle(p[3]).map(t=>({text:t,ko:true}));
  const parts=p[0].split('___');
  return {type:'choice',mode:'count',key:'cn:'+i,label:'Вставь счётное слово или число',sentence:{pre:parts[0]!,post:parts[1]!},ru:p[1],
    options:opts,correct:opts.findIndex(o=>o.text===p[2]),right:p[2],explain:[p[0].replace('___',p[2]),p[4]],hp:p[0].replace('___','…'),hr:p[2],icon:'🥤'};
}
/* ---------- по разделам грамматики: «Быть и отрицание», «Место и направление», «Указатели», «Вежливость» ---------- */
/** «Это …» и «это не …»: 이에요/예요 и 이/가 아니에요 по 받침 */
function genNeg(){
  if(storyOn('neg'))return textLevel('neg',genNegStory,[],false);
  const pool=D.S.filter(r=>/^[а-яё]+$/i.test(r[2]));
  const w=pickW(pool,r=>'ng:'+r[0]);
  const ko=w[0],hasB=jong(ko[ko.length-1]!)>0;
  const neg=Math.random()<.5;
  const aff=ko+(hasB?'이에요':'예요'),affBad=ko+(hasB?'예요':'이에요');
  const no=ko+(hasB?'이':'가')+' 아니에요',noBad=ko+(hasB?'가':'이')+' 아니에요';
  const right=neg?no:aff;
  const set=shuffle(neg?[no,aff,noBad,affBad]:[aff,no,affBad,noBad]);
  return {type:'choice',mode:'neg',key:'ng:'+ko+':'+(neg?'n':'a'),word:ko,label:'Скажи по-корейски',prompt:(neg?'Это не ':'Это ')+w[2]+'.',promptKo:false,
    options:set.map(t=>({text:t,ko:true})),correct:set.indexOf(right),right:right,
    explain:[right+' — '+(neg?'Это не ':'Это ')+w[2],hasB?'У слова «'+ko+'» есть 받침 → '+(neg?'이 아니에요':'이에요'):'У слова «'+ko+'» нет 받침 → '+(neg?'가 아니에요':'예요')],hp:(neg?'не ':'')+w[2],hr:right,icon:'🙅'};
}
const PLACES: Place[]=[['학교','в школу','в школе',['공부해요','занимаюсь']],['도서관','в библиотеку','в библиотеке',['공부해요','занимаюсь'],['책을 읽어요','читаю книгу']],['공원','в парк','в парке',['운동해요','занимаюсь спортом']],
  ['카페','в кафе','в кафе',['커피를 마셔요','пью кофе']],['시장','на рынок','на рынке',['빵을 사요','покупаю хлеб']],['식당','в столовую','в столовой',['밥을 먹어요','ем']],
  ['백화점','в универмаг','в универмаге',['쇼핑해요','хожу по магазинам']],['집','домой','дома',['쉬어요','отдыхаю']],['은행','в банк','в банке']];
/** 에 (куда, где находишься) или 에서 (где действие) */
function genPlace(){
  if(storyOn('place'))return textLevel('place',genPlaceStory,['에도','에만','도'],true);
  const p=pickW(PLACES,x=>'pl:'+x[0]);
  const acts=p.slice(3) as [string,string][];
  const t=rnd(acts.length?['go','be','do','do']:['go','be']);
  let pre='저는 '+p[0],post: string,ru: string,right: string,why: string;
  if(t==='go'){post=' 가요.';ru='Я иду '+p[1]+'.';right='에';why='Куда идёшь (가요) → 에';}
  else if(t==='be'){post=' 있어요.';ru='Я '+p[2]+'.';right='에';why='Где находишься (있어요) → 에';}
  else{const a=rnd(acts);post=' '+a[0]+'.';ru=cap1(p[2])+' '+a[1]+'.';right='에서';why='Где что-то делаешь ('+a[0]+') → 에서';}
  const opts=shuffle(['에','에서','를','는']).map(x=>({text:x,ko:true}));
  return {type:'choice',mode:'place',key:'pl:'+p[0]+':'+t+post,word:null,label:'Вставь частицу места',sentence:{pre:pre,post:post},ru:ru,
    options:opts,correct:opts.findIndex(o=>o.text===right),right:right,explain:[pre+right+post,why],hp:pre+' ___'+post,hr:right,icon:'📍'};
}
const DEM: [string,string][][]=[
  [['이','этот (рядом со мной)'],['그','тот (рядом с тобой или уже известный)'],['저','вон тот (далеко от обоих)']],
  [['이것','эта вещь (рядом со мной)'],['그것','та вещь (рядом с тобой)'],['저것','вон та вещь (далеко от обоих)']],
  [['여기','здесь (рядом со мной)'],['거기','там (рядом с тобой)'],['저기','вон там (далеко от обоих)']],
];
/** Примеры для «Этот, тот, вон тот»: по одному предложению на каждое слово (слова из словаря сайта). */
const DEM_EX: Record<string, string>={'이':'이 사람은 친구예요.','그':'그 사람은 선생님이에요.','저':'저 사람은 학생이에요.','이것':'이것은 책이에요.','그것':'그것은 가방이에요.','저것':'저것은 나무예요.','여기':'여기는 학교예요.','거기':'거기는 공원이에요.','저기':'저기는 식당이에요.'};
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
const POLITE: [string,string][]=[['고마워','друзьям (самое неформальное)'],['고마워요','знакомым и близким старше тебя'],['감사해요','коллегам, товарищам'],['감사합니다','по работе, начальнику (формально)']];
/** Примеры для «Уровня вежливости»: по предложению на каждую форму «спасибо» (слова из словаря сайта). */
const POLITE_EX: Record<string, string>={'고마워':'정말 고마워.','고마워요':'정말 고마워요.','감사해요':'정말 감사해요.','감사합니다':'선생님, 감사합니다.'};
function genPolite(){
  if(storyOn('polite'))return S.levels.polite==='long'?genPoliteStory(5,10):genPoliteStory(2,4);
  const w=pickW(POLITE,x=>'po:'+x[0]);
  const toKo=Math.random()<.5;
  const set=shuffle(POLITE);
  const note='От самого неформального к официальному: '+POLITE.map(x=>x[0]).join(' → ');
  if(toKo)return {type:'choice',mode:'polite',key:'po:'+w[0]+':k',word:null,label:'Как сказать «спасибо» этому человеку?',prompt:w[1].replace(/ \(.*$/,''),promptKo:false,options:set.map(x=>({text:x[0],ko:true})),correct:set.indexOf(w),right:w[0],explain:[w[0]+' — '+w[1],note],teach:POLITE_EX[w[0]],hp:w[1],hr:w[0],icon:'🙇'};
  return {type:'choice',mode:'polite',key:'po:'+w[0]+':r',word:null,label:'Кому так говорят «спасибо»?',prompt:w[0],promptKo:true,options:set.map(x=>({text:x[1].replace(/ \(.*$/,'')})),correct:set.indexOf(w),right:w[1].replace(/ \(.*$/,''),explain:[w[0]+' — '+w[1],note],teach:POLITE_EX[w[0]],hp:w[0],hr:w[1],icon:'🙇'};
}
const GEN: Record<string, ()=>Question>={assemble:genAssemble,word:genWord,rev:genRev,form:()=>(storyOn('form')?(S.levels.form==='long'?genFormStory(5,10):genFormStory(2,4)):(()=>{const r=Math.random();return S.fut!=='off'&&S.tense==='both'&&r>.7?genFuture():r<.5?genForm():genPast();})()),qw:genQw,part:genPart,build:genBuild,spot:genSpot,type:genType,err:genErr,pair:genPair,ord:genOrd,dlg:genDlg,han:genHan,days:genDays,when:genWhen,too:genToo,num:genNum,price:genPrice,count:genCount,neg:genNeg,place:genPlace,dem:genDem,polite:genPolite,ptext:genPtext,expert:genExpert,tenses:genTenses,finderr:genFindErrors,oddone:genOddOne,weak:genWeak,fut:genFut,only:genOnly};
function genQuestion(): Question{
  // один и тот же верный ответ не больше `sameCap()` раз из последних 10: иначе «пять из десяти одной грамматикой»; не вышло с 30 попыток — берём что есть
  let q: Question|undefined;
  for(let t=0;t<30;t++){
    let m=S.mode;
    if(m==='mix')m=rnd(['word','word','word','rev','rev','form','form','form','qw','part','part','build','spot','spot','type','type','err','pair','ord','dlg','days','when','too','neg','place','dem','polite','fut','only']);
    q=GEN[m]!();
    // то же задание не ближе, чем через 60% набора, который уже встречался (но не дальше 30 шагов назад)
    const win=Math.min(RECENT_MAX,Math.floor(seenKeys.size*.6));
    if(recent.slice(-win).some(x=>x.key===q!.key))continue;
    if(q.type==='story'||q.type==='build')break;
    const id=q.mode+'|'+q.right;
    const n=recent.slice(-10).filter(x=>x.right===id).length;
    if(n<sameCap())break;
  }
  seenKeys.add(q!.key);
  recent.push({key:q!.key,right:q!.type==='story'||q!.type==='build'?q!.key:q!.mode+'|'+q!.right});
  if(recent.length>RECENT_MAX)recent.shift();
  return q!;
}

return { genQuestion, genBuild, tileGloss, asmGloss, normRu, STORY_MODES, EXPERT_LV, LEVEL_LABELS, storyOn };
}
