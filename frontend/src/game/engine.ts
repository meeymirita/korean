// Логика игры «Хлебушек», перенесена из Hlebushek_Game.html. Работает с разметкой GameView.vue.

import { CATS, MODE_HELP, MODES, W } from './modes'
import type { BuildQ, ChoiceQ, GameHooks, GameState, Question, StoryQ } from './types'
import { iconImg } from './icons'
import { analyze, SEG_LABEL, splitCandidates, type Segment } from '@/data/korean/parse'
import { wholeWords } from '@/lib/wholeWord'
import { D as DICT } from '@/data/korean/words'
import { TRANSLATIONS } from '@/data/korean/translations'
import { itemIcon, itemName } from '@/data/shop'
import '@/assets/breakdown.css'
import { dragDrop } from '@/lib/dragdrop'
import { PFAMS } from './families'
import { askConfirm } from '@/composables/useConfirm'
import { nextTick } from 'vue'
import type { GameTab, GameView } from './view'
import { gsap } from 'gsap'
import { burst, cascade, pop } from '@/lib/fx'
import { motionCalm } from '@/lib/motion'
import { createGenerators } from './generators'
import { $, el, shuffle } from './util'
import { breakdownContext, buildAskAi, canAskAi } from '@/lib/askAi'

/** Запускает игру на уже отрисованной оболочке (`components/game/GameShell.vue`); возвращает функцию очистки. */
/** hooks: общий прогресс сайта (record, importXp, state); view: то, что движок показывает оболочке (`./view.ts`). */
export function initGame(hooks: GameHooks, view: GameView) {
'use strict';
/* ---------- данные ---------- */
/** Подпись задания, в которой само задание (вопрос или длинная инструкция), пишется крупно: «Сегодня 월요일. Какой день был вчера?» */
const isTask=(t?: string)=>/\?$/.test(t||'')||(t||'').length>34;
function labelWithHelp(q: Question){
  const wrap=el('div','labelrow');
  const lb=el('div','label'+(isTask(q.label)?' task':''),q.label);wrap.appendChild(lb);
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

/* ---------- состояние ---------- */
const LS='hleb_game_v1';
const S: GameState={
  mode:'mix',fut:'on',level:'any',levels:{pair:'simple',place:'simple',too:'simple',neg:'simple',when:'simple',dem:'simple',word:'simple',rev:'simple',qw:'simple',part:'simple',form:'simple',days:'simple',num:'simple',price:'simple',count:'simple',polite:'simple',dlg:'simple',han:'simple',spot:'simple',err:'simple',type:'simple',ord:'simple',ptext:'story',build:'simple',expert:'simple'},pfam:'topic',asm:'mix',grow:null,bstory:null,gloss:false,cats:{v:1,a:1,q:1,p:1,d:1,n:1,l:1,s:0,w:1},reading:true,tense:'both',
  ses:{ok:0,bad:0,streak:0,best:0},all:{ok:0,bad:0,best:0,bestBlitz:0,bestSurv:0,bestBlitzBy:{},bestSurvBy:{},xp:0,byMode:{}},miss:{},hints:3,
  surv:{on:false,lives:3,max:3,ok:0},lastOver:'blitz',blitzSecs:60,survLives:3,
  seenHelp:false,modeHelp:{},hist:[],cur:null,answered:false,tab:'hist',lastKey:null,timer:undefined,win:null,
  blitz:{on:false,left:60,total:60,ok:0,bad:0,iv:undefined},retryQueue:[],retryKeys:new Set()
};
S.retryQueue=[];S.retryKeys=new Set();
function save(){try{localStorage.setItem(LS,JSON.stringify({level:S.level,levels:S.levels,gloss:S.gloss,cats:S.cats,reading:S.reading,tense:S.tense,fut:S.fut,blitzSecs:S.blitzSecs,survLives:S.survLives,pfam:S.pfam,asm:S.asm,mode:S.mode,all:S.all,miss:S.miss,seenHelp:S.seenHelp,modeHelp:S.modeHelp}));}catch{}}
function load(){try{const j=JSON.parse(localStorage.getItem(LS)||'null');if(!j)return;
  if(j.cats)Object.assign(S.cats,j.cats);
  if(j.levels&&typeof j.levels==='object')Object.assign(S.levels,j.levels);
  else if(j.pairLevel)S.levels.pair=j.pairLevel;
  (['reading','tense','fut','mode','seenHelp','modeHelp','level','gloss'] as const).forEach(k=>{if(j[k]!==undefined)(S as unknown as Record<string, unknown>)[k]=j[k];});
  if(PFAMS.some(f=>f.id===j.pfam))S.pfam=j.pfam;
  if(['mix','num','date','price'].includes(j.asm))S.asm=j.asm;
  if([30,60,120].includes(j.blitzSecs))S.blitzSecs=j.blitzSecs;
  if([0,3,5].includes(j.survLives))S.survLives=j.survLives;
  if(j.all)Object.assign(S.all,j.all);if(j.miss)S.miss=j.miss;}catch{}}
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
if(wantFam&&PFAMS.some(f=>f.id===wantFam))S.pfam=wantFam;
if(![1,2,3,4,5,6,'any'].includes(S.level))S.level='any';
Object.keys(S.levels).forEach(k=>{if(!['simple','story','long','expert'].includes(S.levels[k]!))S.levels[k]='simple';});

/* ---------- генераторы заданий (generators.ts) ---------- */
const { genQuestion, genBuild, tileGloss: sentGloss, asmGloss, normRu, STORY_MODES, LEVEL_LABELS, storyOn } = createGenerators(S, hooks);
/** Подпись плитки: в «Собери число» это цифра, в остальных сборках перевод слова. */
const tileGloss=(t: string)=>S.cur&&S.cur.mode==='assemble'?asmGloss(t):sentGloss(t);
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

/* ---------- отрисовка ---------- */
/** Выключает перетаскивание плиток прошлого задания (`lib/dragdrop.ts`). */
let dragOff: (()=>void)|null=null;
function stopDrag(){if(dragOff){dragOff();dragOff=null;}}
/* ---------- предметы Юны (docs/shop.md): подсказка, 50/50, повтор, второй шанс; только вопросы с вариантами ---------- */
const shopCount=(id: string)=>(hooks.items?hooks.items.count(id):0);
/** идёт трата предмета на сервере: ответы не принимаются, чтобы не записать их раньше решения */
let securing=false;
/** номер неверного варианта, который ждёт решения «Второго шанса» */
let pendingBad: number|null=null;
function shopImg(id: string){const im=document.createElement('img');im.src=itemIcon(id);im.alt='';im.className='shop-ic';return im;}
function shopBar(q: ChoiceQ){
  if(!hooks.items||S.blitz.on)return null;
  const wide=q.options.length>2;
  const defs=([['hint','Подсказка'],['fifty','50/50'],['skip','Повтор']] as [string,string][]).filter(d=>wide||d[0]==='skip');
  const have=defs.filter(d=>shopCount(d[0])>0);
  if(!have.length)return null;
  const bar=el('div','acts shop');bar.id='shopBar';
  have.forEach(d=>{
    const b=el('button','ghost item');b.type='button';b.title=itemName(d[0]);
    b.append(shopImg(d[0]),d[1]+' ×'+shopCount(d[0]));
    b.addEventListener('click',()=>{void useShop(d[0]);});bar.appendChild(b);
  });
  return bar;
}
async function useShop(id: string){
  const q=S.cur as ChoiceQ|null;
  if(!q||q.type!=='choice'||S.answered||securing||pendingBad!==null||!hooks.items)return;
  const wrongLeft=()=>[...document.querySelectorAll<HTMLButtonElement>('#opts .opt')].map((b,i)=>({b,i})).filter(x=>x.i!==q.correct&&!x.b.disabled);
  if(id==='hint'&&(q.shopHint||wrongLeft().length<2))return;
  if(id==='fifty'&&wrongLeft().length<2)return;
  securing=true;
  const ok=await hooks.items.use(id);
  securing=false;
  if(!ok||S.cur!==q||S.answered)return;
  if(id==='skip'){next();return;}
  const drop=(n: number)=>shuffle(wrongLeft()).slice(0,Math.min(n,wrongLeft().length-1)).forEach(x=>{x.b.disabled=true;x.b.classList.add('dim');});
  if(id==='hint'){
    q.shopHint=true;q.xp=Math.min(q.xp??5,5); // ответ с подсказкой даёт 5 очков
    const o=q.options[q.correct]!;
    const line=el('div','hintline','Подсказка Юны: ответ начинается с «'+[...(o.k||o.text)][0]+'»');
    $('#opts').after(line);drop(1);
  }else drop(2);
  const bar=$('#shopBar');if(bar){bar.remove();const nb=shopBar(q);if(nb)($('#opts').parentElement as HTMLElement).appendChild(nb);}
}
/** Неверный вариант при запасе «Второго шанса»: пока не записываем, предлагаем исправить или оставить ошибку. */
function offerSecond(q: ChoiceQ,i: number){
  const btns=[...document.querySelectorAll<HTMLButtonElement>('#opts .opt')];
  btns.forEach(b=>{b.disabled=true;});
  btns[i]?.classList.add('bad','shake');
  pendingBad=i;
  const bar=el('div','acts shop');bar.id='secondBar';
  bar.appendChild(el('span','',"Неверно. Есть «Второй шанс» (×"+shopCount('second')+"): ошибка не запишется."));
  const fix=el('button','ghost item');fix.type='button';fix.append(shopImg('second'),'Исправить');
  const fixIt=async()=>{
    if(securing||!hooks.items||S.answered)return;
    securing=true;
    const ok=await hooks.items.use('second');
    securing=false;
    if(!ok||S.cur!==q||S.answered)return;
    pendingBad=null;q.chanced=true;bar.remove();
    btns.forEach((b,k)=>{if(k===i){b.classList.remove('bad','shake');b.classList.add('dim');}else if(!b.classList.contains('dim'))b.disabled=false;});
  };
  fix.addEventListener('click',()=>{void fixIt();});
  const keep=el('button','ghost item','Оставить ошибку');keep.type='button';
  keep.addEventListener('click',()=>{if(securing||S.answered)return;pendingBad=null;bar.remove();settleChoice(q,i);});
  bar.append(fix,keep);
  $('#opts').after(bar);
}

function renderQuestion(q: Question){
  closeStoryWin();stopDrag();pendingBad=null;
  S.cur=q;S.answered=false;S.lastKey=q.key;
  clearTimeout(S.timer);
  const card=$('#card');card.innerHTML='';
  // первая строка это уровни игры (и чипы правила), под ними задание: так видно, что делать
  if(STORY_MODES.includes(q.mode)&&S.mode===q.mode)card.appendChild(levelChips(q.mode));
  if(q.mode==='ptext'&&S.mode==='ptext')card.appendChild(famChips());
  card.appendChild(labelWithHelp(q));
  if(q.type==='story'){
    drawStory(card,q as StoryQ);
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
    q.options!.forEach((o,i)=>{
      const b=el('button','opt');b.type='button';
      b.appendChild(el('span','k',String(i+1)));
      const tx=el('span','tx');tx.appendChild(el('span','t'+(o.ko?' ko':''),o.text));
      if(o.sub&&S.reading)tx.appendChild(el('span','sub',o.sub));
      b.appendChild(tx);b.addEventListener('click',()=>answerChoice(i));opts.appendChild(b);
    });
    card.appendChild(opts);
    cascade(opts.children);
    if(q.options!.length>2&&!S.blitz.on){
      const acts=el('div','acts');
      const hb=el('button','ghost hint');hb.innerHTML=iconImg('sparkle')+' 50/50 · '+S.hints;hb.type='button';hb.id='hintBtn';hb.disabled=S.hints<=0;
      hb.addEventListener('click',useHint);acts.appendChild(hb);card.appendChild(acts);
    }
    const sb=shopBar(q as ChoiceQ);if(sb)card.appendChild(sb);
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
    if(q.asm){
      // «Собери число»: чипы выбирают, что собирать, а не уровень предложения
      ([['mix','Всё вместе'],['num','Числа'],['date','Даты'],['price','Цены']] as [string,string][]).forEach(function(x){
        const b=el('button','chip'+(S.asm===x[0]?' on':''),x[1]);b.type='button';
        b.addEventListener('click',function(){S.asm=x[0];save();renderQuestion(genQuestion());});
        lv.appendChild(b);
      });
    }else{
      ([['any','Любой'],[1,'Простой'],[2,'Средний'],[3,'Сложный'],[4,'Мастер'],[6,'Мастер+'],[5,'Растёт']] as [number|'any',string][]).forEach(function(x){
        const b=el('button','chip'+(S.level===x[0]?' on':''),x[1]);b.type='button';
        b.addEventListener('click',function(){S.level=x[0];S.grow=null;save();renderQuestion(genBuild());});
        lv.appendChild(b);
      });
    }
    card.appendChild(lv);
    if(q.asm){
      // крупно: число на «бирке», дата как листок календаря (месяц сверху, день крупно)
      const big=el('div','asm-big asm-'+q.asm.kind);
      if(q.asm.kind==='date'){big.appendChild(el('span','asm-mon',q.asm.small));big.appendChild(el('b','asm-num',q.asm.big));}
      else{big.appendChild(el('b','asm-num',q.asm.big));big.appendChild(el('span','asm-mon',q.asm.small));}
      card.appendChild(big);
    }else card.appendChild(el('div','prompt',q.ru));
    const slots=el('div','slots');slots.id='slots';card.appendChild(slots);
    const tiles=el('div','tiles');tiles.id='tiles';
    q.tiles!.forEach((t,i)=>{
      const b=el('button','tile',t);b.type='button';b.dataset.i=String(i);
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
    card.appendChild(el('div','scheme',q.asm?'Собери по слогам, как это читается: плитки нажимай по порядку или перетаскивай в строку. Лишние слоги не нужны. Переводы плиток (цифры): кнопка «Показать переводы» или клавиша T. Enter — проверить, Backspace — убрать последний.':'Не все плитки нужны: среди них есть лишние (с неверной частицей, временем или местом). Не знаешь слово — нажми «Показать переводы» (клавиша T) или наведи на плитку. Клавиши: 1–9 — выбрать слово, Enter — проверить, Backspace — убрать последнее, H — подсказка.'));
    q.sel=[];drawBuild();
    // плитку можно перетащить в строку ответа: встаёт туда, где её отпустили (нажатие по-прежнему ставит в конец)
    dragOff=dragDrop({tiles:tiles.querySelectorAll('.tile'),targets:function(){return S.answered?[]:[slots];},
      onDrop:function(tile,target,x,y){dropTile(+tile.dataset.i!,x,y);}});
  }
  const fb=el('div','feedback');fb.id='fb';fb.setAttribute('aria-live','polite');card.appendChild(fb);
}
function useHint(){
  const q=S.cur;if(!q||S.answered||q.type!=='choice'||S.hints<=0)return;
  const btns=[...document.querySelectorAll<HTMLButtonElement>('#opts .opt')];
  const wrong=shuffle(btns.map((b,i)=>i).filter(i=>i!==q.correct&&!btns[i]!.disabled)).slice(0,2);
  if(wrong.length<2)return;
  wrong.forEach(i=>{btns[i]!.disabled=true;btns[i]!.classList.add('dim');});
  S.hints--;const hb=$<HTMLButtonElement>('#hintBtn');hb.innerHTML=iconImg('sparkle')+' 50/50 · '+S.hints;hb.disabled=true;
}
function checkType(skip: boolean){
  if(S.answered)return;const q=S.cur!;
  const inp=$<HTMLInputElement>('#tinp');const val=inp.value.trim();
  const ok=!skip&&!!val&&(q.squash?q.answers!.map(a=>a.replace(/\s/g,'')).includes(val.replace(/\s/g,'')):q.answers!.includes(normRu(val)));
  inp.disabled=true;inp.classList.add(ok?'ok':'bad');
  finish(ok,val||'—');
}
function drawBuild(){
  const q=S.cur as BuildQ;const slots=$('#slots');slots.innerHTML='';slots.className='slots'+(S.gloss?' gloss':'');
  q.sel.forEach((ti,pos)=>{
    const b=el('button','slot',q.tiles[ti]);b.type='button';b.appendChild(el('span','tg',tileGloss(q.tiles[ti]!)));
    // нажатие на слово в ответе возвращает его в плитки: плитка «вскакивает», чтобы было видно, куда оно ушло
    b.addEventListener('click',()=>{if(S.answered)return;q.sel.splice(pos,1);drawBuild();pop(document.querySelector('#tiles .tile[data-i="'+ti+'"]'));});
    slots.appendChild(b);
  });
  document.querySelectorAll<HTMLElement>('#tiles .tile').forEach(b=>b.classList.toggle('used',q.sel.includes(+b.dataset.i!)));
}
function pickTile(i: number){
  if(S.answered)return;const q=S.cur as BuildQ;if(i>=q.tiles.length||q.sel.includes(i))return;
  q.sel.push(i);drawBuild();
}
/** Плитку отпустили над строкой ответа в точке (x, y): слово встаёт перед тем словом, левее середины которого его отпустили. */
function dropTile(i: number,x: number,y: number){
  if(S.answered)return;const q=S.cur as BuildQ|null;if(!q||q.type!=='build'||i>=q.tiles.length||q.sel.includes(i))return;
  const kids=[...document.querySelectorAll('#slots .slot')];
  let pos=kids.findIndex(function(c){const r=c.getBoundingClientRect();return y<r.top||(y<=r.bottom&&x<r.left+r.width/2);});
  if(pos<0)pos=q.sel.length;
  q.sel.splice(pos,0,i);drawBuild();
}
function toggleGloss(){
  S.gloss=!S.gloss;save();
  const t=$('#tiles'),sl=$('#slots'),b=$('#glossBtn');
  if(t)t.classList.toggle('gloss',S.gloss);
  if(sl)sl.classList.toggle('gloss',S.gloss);
  if(b)b.textContent='🔤 '+(S.gloss?'Скрыть переводы':'Показать переводы');
}
function buildHint(){
  const q=S.cur as BuildQ|null;if(!q||S.answered||q.type!=='build'||S.hints<=0)return;
  const right=q.right.split(' ');
  let k=0;while(k<q.sel.length&&q.tiles[q.sel[k]!]===right[k])k++;
  q.sel.length=k;
  const need=right[k];if(need===undefined)return;
  const ti=q.tiles.findIndex((t,i)=>t===need&&!q.sel.includes(i));
  if(ti<0)return;
  q.sel.push(ti);drawBuild();S.hints--;
  const hb=$<HTMLButtonElement>('#hintBtn');hb.innerHTML=iconImg('sparkle')+' Подсказка · '+S.hints;hb.disabled=S.hints<=0;
}
function checkBuild(){
  if(S.answered)return;const q=S.cur as BuildQ;
  if(!q.sel.length)return;
  const words=q.sel.map(i=>q.tiles[i]!);
  const ans=words.join(' ');
  const ok=q.check?q.check(words):q.accept.includes(ans);
  document.querySelectorAll<HTMLButtonElement>('#tiles .tile').forEach(b=>b.disabled=true);
  const slots=$('#slots');
  if(ok){
    slots.classList.add('ok');
    if(ans!==q.right)q.explain=[ans+' — тоже верно.','Чаще говорят так: '+q.right,q.note];
  }else{
    const canon=q.right.split(' ');
    slots.querySelectorAll('.slot').forEach((b,k)=>b.classList.add(canon[k]===words[k]?'ok':'bad'));
  }
  // после проверки «Проверить» и «Очистить» выключены, а фокус уходит с кнопки: иначе Enter нажимал бы её снова, а не шёл «Дальше»
  ['chk','clr','hintBtn'].forEach(id=>{const x=$<HTMLButtonElement>('#'+id);if(x)x.disabled=true;});
  if(document.activeElement&&document.activeElement.tagName==='BUTTON')(document.activeElement as HTMLElement).blur();
  finish(ok,ans);
}
/** Чипы уровня над заданием: одно предложение (как раньше), текст из 2–4 или длинный из 5–10 (в блице и на выживании всегда простой). */
function levelChips(mode: string){
  const lv=el('div','levels');
  (LEVEL_LABELS[mode]||([['simple','Простой'],['story','Рассказ 2–4'],['long','Длинный 5–10']] as [string,string][])).forEach(function(x){
    const b=el('button','chip'+(S.levels[mode]===x[0]?' on':''),x[1]);b.type='button';
    b.addEventListener('click',function(){S.levels[mode]=x[0];S.retryQueue=[];S.retryKeys=new Set();save();renderQuestion(genQuestion());});
    lv.appendChild(b);
  });
  return lv;
}
/** Текст: слева иконка с переводом (по наведению, на телефоне по нажатию), посередине предложение с пропусками, справа «Разбор» (после проверки); ниже банк плиток. */
function drawStory(card: HTMLElement,q: StoryQ){
  const box=el('div','story');
  q.sents.forEach(function(s,si){
    const row=el('div','story-row');
    // у заданий, где перевод предложения выдаёт ответ («Слово → перевод»), вместо иконки пустое место: перевод виден в разборе после проверки
    const tr=el('button','story-tr'+(s.noTr?' off':''));tr.type='button';tr.disabled=!!s.noTr;
    if(!s.noTr){
      tr.innerHTML=iconImg('speech');
      tr.setAttribute('aria-label','Перевод предложения');
      tr.appendChild(el('span','story-tip',s.tip||s.ru||''));
      tr.setAttribute('aria-expanded','false');
      tr.addEventListener('click',function(){const on=!tr.classList.contains('open');closeTips();tr.classList.toggle('open',on);tr.setAttribute('aria-expanded',String(on));});
    }
    const p=el('div','story-s');
    if(s.cue)p.append(el('span','story-cue','('+s.cue+') '));
    s.parts.forEach(function(pt){
      if(pt.gap===undefined){if(pt.mark)p.append(el('mark','story-mark',pt.t));else if(pt.ans)p.append(el('span','story-ans',pt.t));else p.append(pt.t!);}
      else if(q.gaps[pt.gap]!.input){const gap=q.gaps[pt.gap]!;
        // ответ вводится с клавиатуры (корейская раскладка), пробелы не считаются
        const inp=el('input','gap-in');inp.type='text';inp.id='sg'+pt.gap;inp.lang='ko';inp.autocomplete='off';inp.spellcheck=false;
        inp.size=Math.max(4,gap.right.length+2);inp.setAttribute('aria-label','Впиши форму');
        inp.addEventListener('input',function(){gap.picked=inp.value.replace(/\s+/g,'')||null;paintStory(q);});
        inp.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();checkStory(q);}});
        p.append(inp);
      }
      else{const g=el('button','gap');g.type='button';g.id='sg'+pt.gap;g.addEventListener('click',function(){tapGap(pt.gap!);});p.append(g);}
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
  // плитку можно перетащить прямо в пропуск (нажатием тоже работает); в банке она остаётся: её можно ставить много раз
  dragOff=dragDrop({tiles:bank.querySelectorAll('.tile'),targets:function(){return q.checked?[]:box.querySelectorAll('button.gap');},
    onDrop:function(tile,gap){
      if(q.checked||S.cur!==q)return;
      const k=+gap.id.slice(2);
      q.gaps[k]!.picked=q.bank[+tile.id.slice(2)]!;q.sel=null;q.active=k;paintStory(q);pop(gap);
    }});
  }
  const note=el('div','ruline');note.id='snote';card.appendChild(note);
  const acts=el('div','acts');
  const chk=el('button','primary','Проверить');chk.type='button';chk.id='schk';chk.addEventListener('click',function(){checkStory(q);});
  const clr=el('button','ghost','Очистить');clr.type='button';clr.id='sclr';clr.addEventListener('click',function(){clearStory(q);});
  const all=el('button','ghost story-all','Разбор всего');all.type='button';all.id='sall';all.disabled=true;
  all.title='Разбор всех предложений сразу (после проверки)';all.addEventListener('click',function(){openStoryWin(q,-1);});
  acts.append(chk,clr,all);card.appendChild(acts);
  paintStory(q);
}
/** Прячет открытые переводы предложений (нажатие на другой значок, мимо или Esc). */
function closeTips(){document.querySelectorAll('.story-tr.open').forEach(function(t){t.classList.remove('open');t.setAttribute('aria-expanded','false');});}
function paintStory(q: StoryQ){
  q.gaps.forEach(function(g,i){
    const e=$<HTMLButtonElement>('#sg'+i);if(!e)return;
    const need=q.need&&g.picked===null?' need':'';
    if(g.input){e.className='gap-in'+(q.checked?(g.ok?' ok':' bad'):(g.picked!==null?' filled':need));e.disabled=q.checked;return;}
    e.textContent=g.picked!==null?g.picked:'___';
    e.className='gap'+(q.checked?(g.ok?' ok':' bad'):(g.picked!==null?' filled':' empty'+need)+(i===q.active?' now':''));
    e.disabled=q.checked;
  });
  q.bank.forEach(function(t,i){
    const b=$<HTMLButtonElement>('#bt'+i);if(!b)return;
    b.classList.toggle('sel',q.sel===i);b.disabled=q.checked;
  });
  const filled=q.gaps.filter(function(g){return g.picked!==null;}).length;
  if(filled===q.gaps.length)q.need=false;
  const chk=$<HTMLButtonElement>('#schk');if(chk)chk.disabled=q.checked;
  const all=$<HTMLButtonElement>('#sall');if(all)all.disabled=!q.checked;
  const clr=$<HTMLButtonElement>('#sclr');if(clr)clr.disabled=q.checked||!filled;
  const note=$('#snote');
  if(note)note.classList.toggle('need',!!q.need);
  if(note&&q.need&&!q.checked){note.textContent='Заполни все пропуски: осталось '+(q.gaps.length-filled)+' (обведены рамкой).';paintStoryInfo(q);return;}
  if(note&&q.input)note.textContent=q.checked?'':'Впиши форму в каждое поле: заполнено '+filled+' из '+q.gaps.length+'. Enter проверяет.';
  else if(note)note.textContent=q.checked?'':q.sel!==null?('Выбрано «'+q.bank[q.sel]+'»: нажми на пропуск'):('Заполнено '+filled+' из '+q.gaps.length+(filled?'. Нажми на заполненный пропуск, чтобы убрать ответ.':'. Перетащи плитку в пропуск или нажми плитку, потом пропуск.'));
  paintStoryInfo(q);
}
/** Кнопка «Разбор» у предложения оживает после проверки и красится по результату. */
function paintStoryInfo(q: StoryQ){
  q.sents.forEach(function(s,si){
    const b=$<HTMLButtonElement>('#si'+si);if(!b)return;
    const bad=s.gapIdx.some(function(k){return q.gaps[k]!.ok===false;});
    b.disabled=!q.checked;b.className='story-info'+(q.checked?(bad?' bad':' ok'):'');
  });
}
function tapTile(i: number){
  const q=S.cur as StoryQ|null;if(!q||q.type!=='story'||q.checked)return;
  q.sel=q.sel===i?null:i;paintStory(q);
}
/** Нажатие на пропуск: если выбрана плитка, она встаёт на место; иначе заполненный пропуск освобождается (можно выбрать другой ответ). */
function tapGap(k: number){
  const q=S.cur as StoryQ|null;if(!q||q.type!=='story'||q.checked)return;
  const g=q.gaps[k]!;
  if(q.sel!==null){g.picked=q.bank[q.sel]!;q.sel=null;}
  // ответ убран из пропуска: его плитка в банке «вскакивает», видно, куда он вернулся
  else if(g.picked!==null){pop($('#bt'+q.bank.indexOf(g.picked)));g.picked=null;}
  q.active=k;
  paintStory(q);
}
/** Клавиши: цифра ставит плитку в первый пустой пропуск, Backspace убирает последний ответ, Enter проверяет. */
function keyStory(q: StoryQ,e: KeyboardEvent){
  if(/^[1-9]$/.test(e.key)){
    const i=+e.key-1;if(i>=q.bank.length)return;
    const k=q.gaps.findIndex(function(g){return g.picked===null;});
    if(k<0)return;
    q.gaps[k]!.picked=q.bank[i]!;q.sel=null;q.active=null;paintStory(q);
  }else if(e.key==='Backspace'){
    for(let k=q.gaps.length-1;k>=0;k--)if(q.gaps[k]!.picked!==null){q.gaps[k]!.picked=null;break;}
    paintStory(q);
  }else if(e.key==='Enter')checkStory(q);
}
function clearStory(q: StoryQ){
  if(q.checked)return;
  q.gaps.forEach(function(g,k){g.picked=null;if(g.input){const e=$<HTMLInputElement>('#sg'+k);if(e)e.value='';}});q.sel=null;q.active=null;q.need=false;paintStory(q);
}
/** Проверка в конце: каждый пропуск считается ответом; за итог бонус к опыту (все верно +5, от 80% +3, от 60% +1) добавляется к первому верному. */
function checkStory(q: StoryQ){
  if(q.checked)return;
  // не всё заполнено: проверки нет, пустые пропуски обводятся рамкой, под текстом надпись
  if(q.gaps.some(function(g){return g.picked===null;})){q.need=true;paintStory(q);const e=document.querySelector<HTMLElement>('.story .need');if(e&&e.focus)e.focus({preventScroll:true});return;}
  q.checked=true;q.need=false;q.sel=null;q.active=null;
  q.gaps.forEach(function(g){g.ok=g.picked===g.right||!!(g.accept&&g.accept.includes(g.picked!));});
  const right=q.gaps.filter(function(g){return g.ok;}).length,ratio=right/q.gaps.length;
  q.bonus=ratio===1?5:ratio>=.8?3:ratio>=.6?1:0;
  let extra=q.bonus;
  q.gaps.forEach(function(g){
    const xp=10+(g.ok&&extra?extra:0);if(g.ok)extra=0;
    finish(!!g.ok,g.picked||'',{key:'',word:null,hp:g.hp,hr:g.right,icon:q.icon,level:1,xp:xp},true);
  });
  paintStory(q);
  S.answered=true;
  showFeedback(q,right===q.gaps.length);
}
/** Окно с разбором одного предложения: что выбрано и что верно, почему, и «Как собрано». Лежит внутри игры (стили `.study`), под окном правила. */
function closeStoryWin(){if(S.win){S.win.remove();S.win=null;}}
function openStoryWin(q: StoryQ,si: number){
  closeStoryWin();
  // si = -1: разбор всех предложений подряд (кнопка «Разбор всего»)
  const list=si<0?q.sents:[q.sents[si]!];
  const back=el('div','story-win');
  const box=el('div','story-win-box');
  const head=el('div','story-win-head');
  const x=el('button','story-win-x','✕');x.type='button';x.setAttribute('aria-label','Закрыть');x.addEventListener('click',closeStoryWin);
  head.append(el('b','',si<0?'Разбор всех предложений':'Разбор предложения'),x);
  box.appendChild(head);
  list.forEach(function(s,n){
    if(si<0)box.appendChild(el('div','story-win-n','Предложение '+(n+1)+' из '+list.length));
    s.gapIdx.forEach(function(k){
      const g=q.gaps[k]!;
      const line=el('div','story-win-gap '+(g.ok?'ok':'bad'));
      line.appendChild(el('b','',g.ok?('Верно: '+g.picked+(g.picked!==g.right?' (можно и '+g.right+')':'')):('Не так. Ты поставил(а) '+g.picked+', нужно: '+g.right)));
      if(g.why)line.appendChild(el('span','',g.why));
      box.appendChild(line);
    });
    box.appendChild(drawBreakdown(s.ko,s.ru));
  });
  back.appendChild(box);
  // «Спросить ИИ»: чат появляется справа от разбора, окно сдвигается (на узком экране чат ниже)
  if(canAskAi()){
    const ctx=()=>list.map(function(s,n){
      const gaps=s.gapIdx.map(function(k){const g=q.gaps[k]!;return (g.ok?'верно: ':'ученик поставил '+g.picked+', нужно ')+g.right+(g.why?' ('+g.why+')':'');}).join('; ');
      return (si<0?'Предложение '+(n+1)+':\n':'')+breakdownContext(s.ko,gaps?['Пропуски: '+gaps]:[]);
    }).join('\n\n');
    const bar=el('div','story-win-ask');
    bar.appendChild(buildAskAi(ctx,function(p){back.appendChild(p);},function(open){back.classList.toggle('ask-on',open);}));
    box.appendChild(bar);
  }
  back.addEventListener('click',function(e){if(e.target===back)closeStoryWin();});
  const root=$('#card').closest('.game')||document.body;
  root.appendChild(back);
  S.win=back;
  x.focus({preventScroll:true});
}
function answerChoice(i: number){
  if(S.answered||securing||pendingBad!==null)return;const q=S.cur as ChoiceQ;
  // есть «Второй шанс»: неверный ответ пока не записываем
  if(i!==q.correct&&!q.chanced&&!S.blitz.on&&shopCount('second')>0){offerSecond(q,i);return;}
  settleChoice(q,i);
}
/** Ответ с выбором принят окончательно: подсветка, запись в прогресс и разбор. */
function settleChoice(q: ChoiceQ,i: number){
  const ok=i===q.correct;
  const btns=document.querySelectorAll<HTMLButtonElement>('#opts .opt');
  btns.forEach((b,k)=>{b.disabled=true;if(k===q.correct)b.classList.add('ok');else if(k===i)b.classList.add('bad');});
  const gap=$('#gap');
  if(gap){gap.textContent=q.right;gap.className='gap '+(ok?'ok':'bad');}
  if(!ok&&btns[i])btns[i].classList.add('shake');
  finish(ok,q.options[i]!.text);
  // верный вариант «вскакивает», каждые 5 верных подряд брызги звёзд
  if(ok&&btns[i]){pop(btns[i]);if(S.ses.streak>0&&S.ses.streak%5===0){const r=btns[i].getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2,14);}}
}

/* ---------- ответ, статистика, история ---------- */
/** Что нужно `finish` от вопроса: у пропуска рассказа это не целый вопрос, а только ключ и подписи для истории. */
type FinishQ=Pick<Question,'key'|'hp'|'hr'|'icon'>&Partial<Question>;
/** Засчитывает ответ. `qq` и `quiet` нужны рассказу: каждый пропуск считается ответом, а общий разбор показывается один раз в конце. */
function finish(ok: boolean,chosen: string,qq?: FinishQ,quiet?: boolean){
  const q: FinishQ=qq||S.cur!;
  if(!quiet)S.answered=true;
  const A=S.all,B=S.ses;
  const bm=A.byMode[S.mode]||(A.byMode[S.mode]={ok:0,bad:0,best:0});
  if(ok){B.ok++;A.ok++;B.streak++;if(B.streak>B.best)B.best=B.streak;if(B.streak>A.best)A.best=B.streak;
    bm.ok++;if(B.streak>bm.best)bm.best=B.streak;
    const m=q.key&&S.miss[q.key];if(m){m.n--;if(m.n<=0)delete S.miss[q.key];}
    const msgs: string[]=[];
    const pr=hooks.record({word:q.word||null,ok:true,mode:S.mode,detail:{q:q.hp,a:q.hr,...(q.mode?{g:q.mode}:{})},xp:q.xp!==undefined?q.xp:(q.level===3?20:q.level===2?15:10)+(B.streak>=5&&B.streak%5===0?5:0)});
    if(pr.bloomed)msgs.push('Слово «'+q.word+'» расцвело в саду!');
    if(pr.levelUp)msgs.push('Новый уровень '+pr.level+': '+pr.title+'!');
    if(pr.goalReached)msgs.push('Цель дня выполнена!');
    if([5,10,20,50].includes(B.streak))msgs.push('Серия из '+B.streak+' верных подряд!');
    if([50,100,250,500,1000].includes(A.ok))msgs.push(A.ok+' верных ответов за всё время!');
    if(A.ok%10===0)msgs.push('Испёкся ещё один хлебушек!');
    if(msgs.length)toast(msgs[0]!);
    if(S.surv.on)S.surv.ok++;
  }else{B.bad++;A.bad++;B.streak=0;bm.bad++;
    hooks.record({word:q.word||null,ok:false,mode:S.mode,detail:{q:q.hp,a:q.hr,y:chosen,...(q.mode?{g:q.mode}:{})}});
    if(q.key){const m=S.miss[q.key]||{n:0,l:''};m.n=Math.min(5,m.n+1);m.l=q.hp+' — '+q.hr;S.miss[q.key]=m;}
    const retryKey=q.word||q.key;
    if(retryKey&&!q.retry&& !S.retryKeys.has(retryKey)){
      S.retryKeys.add(retryKey);
      S.retryQueue.push({q:{...(q as Question),retry:true},left:3+Math.floor(Math.random()*2)});
    }}
  if(S.blitz.on){if(ok)S.blitz.ok++;else S.blitz.bad++;}
  if(S.surv.on&&!ok&&S.surv.max!==0){S.surv.lives--;drawLives();if(S.surv.lives<=0)S.timer=setTimeout(endSurv,1300);}
  S.hist.unshift({ok:ok,icon:q.icon,p:q.hp,r:q.hr,you:ok?null:chosen});
  if(S.hist.length>150)S.hist.pop();
  save();updateStats();renderList();
  if(!quiet)showFeedback(q as Question,ok);
}
/* ---------- разбор после ответа ---------- */
/** Строка только корейская (без русских слов), с хангылем и знаком в конце: это уже готовое предложение. */
const PLAIN_SENTENCE=/^[^а-яёА-ЯЁ]*[가-힣][^а-яёА-ЯЁ]*[.?!]$/;
/** Предложение для разбора: явное `teach` задания, иначе первая чисто корейская строка объяснения, иначе пример слова из словаря сайта. */
function teachOf(q: Question): string{
  if(q.teach)return q.teach;
  const line=(q.explain||[]).map(t=>(t||'').trim()).find(t=>t.length>=4&&PLAIN_SENTENCE.test(t));
  if(line)return line;
  const w=q.word&&DICT.find(d=>d.k===q.word);
  return w&&w.s?w.s:'';
}
/** Перевод предложения: из словаря переводов, иначе `ru` задания (у заданий с `sentence` это перевод, у режима «формы» нет). */
function transOf(q: Question,s: string): string{
  return TRANSLATIONS[s]||q.trans||(q.sentence&&q.mode!=='form'?q.ru:'')||'';
}
/** Карточка разбора относится к слову задания: само слово или его основа с окончанием (타다 → 타요). */
function isWordSeg(sg: Segment,word: string){
  if(sg.type==='particle'||sg.type==='unknown')return false;
  const stem=word.endsWith('다')?word.slice(0,-1):word;
  return sg.text===word||(stem.length>0&&sg.text.startsWith(stem));
}
/** Предложение для разбора взято не из задания, а как пример слова q.word из словаря (тогда его надо подписать). */
function isWordExample(q: Question,teach: string){
  if(!q.word||q.teach)return false;
  const w=DICT.find(d=>d.k===q.word);
  return !!(w&&w.s&&w.s===teach);
}
/** «Как собрано»: карточки слов, частиц и окончаний, объяснения и ссылки на правила, те же, что в разборе предложений словаря. */
function drawBreakdown(sentence: string,trans: string,exampleOf?: string|null){
  const box=el('div','bd');
  if(exampleOf){
    // предложение взято как пример слова: оно уже стоит в карточках ниже, поэтому отдельно не печатается
    const t=el('div','bd-title bd-title-ex','Как собрано / пример предложения');
    if(trans)t.appendChild(el('span','bd-title-tr','«'+trans+'»'));
    box.appendChild(t);
  }else{
    box.appendChild(el('div','bd-ko',sentence));
    if(trans)box.appendChild(el('div','bd-tr','«'+trans+'»'));
    box.appendChild(el('div','bd-title','Как собрано'));
  }
  const cards=el('div','bd-cards');
  const segs=analyze(sentence);
  if(segs.every(function(sg){return sg.type==='unknown';}))return document.createDocumentFragment();
  segs.forEach(function(sg){
    const c=el('div','bd-card '+sg.type+(exampleOf&&isWordSeg(sg,exampleOf)?' bd-hit':''));
    c.appendChild(el('div','bd-kind',SEG_LABEL[sg.type]));
    c.appendChild(el('div','bd-k',sg.text));
    if(sg.reading)c.appendChild(el('div','bd-r',sg.reading));
    c.appendChild(el('div','bd-g',sg.type==='unknown'?'?':sg.gloss));
    if(sg.explain)c.appendChild(el('div','bd-ex',sg.explain));
    const rule=sg.g,openRule=hooks.grammar;
    if(rule&&openRule){const b=el('button','bd-rule','Правило →');b.type='button';b.addEventListener('click',()=>openRule(rule));c.appendChild(b);}
    cards.appendChild(c);
  });
  box.appendChild(cards);
  // пары «короткое слово + частица» (화 + 가): бывают и одним словом, проверяем в большом словаре
  const cand=splitCandidates(segs);
  // подсказка появляется только когда большой словарь подтвердил целое слово: на обычных «책 + 이» шума нет
  if(cand.length){
    void wholeWords(cand).then(function(w){
      if(!w.length)return;
      box.appendChild(el('p','bd-note bd-maybe',w.map(function(x){return '«'+x.token+'» может быть одним словом: '+x.token+' — '+x.ru+' (большой словарь). Разбор выше мог ошибиться.';}).join(' ')));
    });
  }
  return box;
}
function showFeedback(q: Question,ok: boolean){
  const fb=$('#fb');fb.className='feedback show '+(ok?'ok':'bad');fb.innerHTML='';
  if(!motionCalm())gsap.from(fb,{opacity:0,y:12,duration:.32,ease:'power2.out',clearProps:'opacity,transform'});
  const streak=S.ses.streak;
  if(q.type==='story'){
    // рассказ: только итог; разбор каждого предложения открывается кнопкой «Разбор» справа от него
    const gaps=q.gaps||[];const right=gaps.filter(g=>g.ok).length;
    fb.appendChild(el('div','fbh','Рассказ пройден: верно '+right+' из '+gaps.length+(q.bonus?' · бонус +'+q.bonus+' к опыту':'')));
    fb.appendChild(el('div','fbt','Нажми «Разбор» справа от предложения, чтобы увидеть, что верно и как оно собрано, или «Разбор всего» под текстом.'));
  }else{
    fb.appendChild(el('div','fbh',ok?('Верно!'+(streak>=3?' Серия ×'+streak:'')):'Не так. Правильно: '+q.right));
    // полный разбор «Как собрано» (как в словаре): предложение из задания или пример слова; в блице на него нет времени
    const teach=S.blitz.on?'':teachOf(q);
    const bd=teach?drawBreakdown(teach,transOf(q,teach),isWordExample(q,teach)?q.word:''):null;
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
  // на уровнях «Рассказ» и «Длинный» повтор простого вопроса не вставляется: уровень остаётся выбранным
  const due=storyOn(S.mode)?-1:S.retryQueue.findIndex(x=>x.left<=0);
  if(due>=0){const rq=S.retryQueue.splice(due,1)[0]!.q;S.retryKeys.delete(rq.word||rq.key);renderQuestion(rq);}
  else{S.retryQueue.forEach(x=>x.left--);renderQuestion(genQuestion());}
}

function updateStats(){
  const B=S.ses,A=S.all,st=view.stats;
  st.ok=B.ok;st.bad=B.bad;
  const tot=B.ok+B.bad;st.acc=tot?Math.round(B.ok/tot*100)+'%':'–';
  st.streak=B.streak;st.best=Math.max(B.best,A.best);
  st.loaves=Math.floor(A.ok/10);st.loafTxt=(A.ok%10)+' / 10';st.loafPct=(A.ok%10)*10;
  st.allTime='За всё время: '+A.ok+' верно, '+A.bad+' неверно'+(bestBlitz()?' · лучший блиц ('+S.blitzSecs+' с): '+bestBlitz():'')+(bestSurv()?' · выживание ('+survName()+'): '+bestSurv():'');
  const P=hooks.state();
  st.lvlN=P.level;st.lvlName=P.title;st.xpTxt=P.max?'максимум':P.into+' / '+P.span;st.xpPct=P.pct;
  const g=P.todayOk;
  st.goalMax=P.goal;st.goalN=Math.min(g,P.goal);st.goalPct=Math.min(100,g/P.goal*100);st.goalTxt=g>=P.goal?'готово':'ещё '+(P.goal-g);
}
/** Списки справа: оболочка рисует их сама из этих копий (поиск по словам тоже на её стороне). */
function renderList(){
  view.tab=S.tab as GameTab;
  view.hist=S.hist.map(h=>({...h}));
  view.weak=Object.values(S.miss).sort((x,y)=>y.n-x.n).map(m=>({...m}));
  view.byMode=JSON.parse(JSON.stringify(S.all.byMode)) as GameView['byMode'];
}

/* ---------- интерфейс: оболочка читает `view`, её кнопки вызывают `view.actions` ---------- */
let toastT: ReturnType<typeof setTimeout>|undefined;
function toast(t: string){view.toast.text=t;view.toast.on=true;clearTimeout(toastT);toastT=setTimeout(()=>{view.toast.on=false;},1800);}
function drawCats(){
  view.cats=CATS.map(c=>({id:c.id,name:c.name,count:W[c.id].length,on:!!S.cats[c.id]}));
}
function syncToggles(){
  view.reading=S.reading;view.tense=S.tense;view.fut=S.fut;view.blitzSecs=S.blitzSecs;view.survLives=S.survLives;
}
/** Сброс статистики игры после подтверждения в своём окне. */
async function resetStats(){
  const yes=await askConfirm({title:'Сбросить статистику игры?',text:'Сбросится только прогресс этой игры: счёт, рекорды, испечённые хлебушки, слабые слова и история ответов. Уровень, цель дня, слова и остальной прогресс сайта останутся как есть.',ok:'Сбросить статистику игры',danger:true});
  if(!yes)return;
  S.all={ok:0,bad:0,best:0,bestBlitz:0,bestSurv:0,bestBlitzBy:{},bestSurvBy:{},xp:0,byMode:{}};S.miss={};S.ses={ok:0,bad:0,streak:0,best:0};S.hist=[];S.hints=3;
  save();updateStats();renderList();next();
}
/** Окно итога блица и выживания. */
function showOver(title: string,big: string,text: string){
  Object.assign(view.over,{on:true,title,big,text});
  void nextTick(()=>document.getElementById('overAgain')?.focus());
}

/* ---------- блиц ---------- */
/** Рекорды по вариантам: у блица на 60 секунд и выживания на 3 жизни прежние поля `bestBlitz` и `bestSurv`, у остальных вариантов свои ячейки. */
const bestBlitz=()=>S.blitzSecs===60?S.all.bestBlitz:((S.all.bestBlitzBy||{})[S.blitzSecs]||0);
const bestSurv=()=>S.survLives===3?S.all.bestSurv:((S.all.bestSurvBy||{})[S.survLives]||0);
const survName=()=>S.survLives===0?'без ограничения':S.survLives+' жизни';
function startBlitz(){
  if(S.surv.on){toast('Сначала закончи выживание');return;}
  clearInterval(S.blitz.iv);
  const secs=S.blitzSecs;
  S.blitz={on:true,left:secs,total:secs,ok:0,bad:0,iv:undefined};
  view.blitzOn=true;view.timer.on=true;view.timer.pct=100;
  S.blitz.iv=setInterval(()=>{
    S.blitz.left--;view.timer.pct=Math.max(0,S.blitz.left/S.blitz.total*100);
    if(S.blitz.left<=0)endBlitz();
  },1000);
  next();
}
function endBlitz(){
  clearInterval(S.blitz.iv);clearTimeout(S.timer);
  const b=S.blitz;b.on=false;
  view.timer.on=false;view.blitzOn=false;
  const tot=b.ok+b.bad;
  let rec='';
  if(b.ok>bestBlitz()){
    if(S.blitzSecs===60)S.all.bestBlitz=b.ok;else(S.all.bestBlitzBy||(S.all.bestBlitzBy={}))[S.blitzSecs]=b.ok;
    rec=' Новый рекорд!';save();updateStats();
  }
  S.lastOver='blitz';
  showOver('Время вышло!',String(b.ok),'верных ответов за '+b.total+' секунд. Неверных: '+b.bad+(tot?', точность '+Math.round(b.ok/tot*100)+'%':'')+'.'+rec);
  if(S.cur)S.answered=true;
}

/* ---------- выживание: три жизни ---------- */
function drawLives(){
  view.survOn=S.surv.on;
  if(!S.surv.on){view.lives.on=false;view.lives.text='';return;}
  view.lives.on=true;
  if(S.surv.max===0){view.lives.text='♾️  ·  верно: '+S.surv.ok+' (остановить можно кнопкой ниже)';return;}
  view.lives.text='❤️'.repeat(Math.max(0,S.surv.lives))+'🖤'.repeat(S.surv.max-Math.max(0,S.surv.lives))+'  ·  верно: '+S.surv.ok;
}
function startSurv(){
  if(S.blitz.on){toast('Сначала закончи блиц');return;}
  S.surv={on:true,lives:S.survLives||Infinity,max:S.survLives,ok:0};
  drawLives();next();
}
function endSurv(){
  clearTimeout(S.timer);
  const sv=S.surv;sv.on=false;
  drawLives();
  let rec='';
  if(sv.ok>bestSurv()){
    if(S.survLives===3)S.all.bestSurv=sv.ok;else(S.all.bestSurvBy||(S.all.bestSurvBy={}))[S.survLives]=sv.ok;
    rec=' Новый рекорд!';save();updateStats();
  }
  S.lastOver='surv';
  showOver(sv.max===0?'Выживание остановлено':'Жизни закончились',String(sv.ok),sv.max===0?'верных ответов за заход.'+rec:'верных ответов до '+(sv.max===3?'третьей':'пятой')+' ошибки.'+rec);
  if(S.cur)S.answered=true;
}

/* ---------- справка ---------- */
let helpFrom: HTMLElement|null=null;
function openHelp(){
  if(S.blitz.on||S.surv.on){toast('Сначала закончи игру на время или выживание');return;}
  helpFrom=document.activeElement as HTMLElement|null;
  clearTimeout(S.timer);
  view.help=true;
  void nextTick(()=>{document.getElementById('helpX')?.focus({preventScroll:true});const box=document.querySelector('#help .box');if(box)box.scrollTop=0;});
}
function closeHelp(){
  view.help=false;
  if(!S.seenHelp){S.seenHelp=true;save();}
  if(helpFrom&&helpFrom.focus)helpFrom.focus();
}
view.actions={
  // «Обновить вопрос»: другой вопрос в том же режиме; ответ не засчитывается ни верным, ни неверным
  refresh:()=>{if(view.over.on)return;next();},
  toggleBlitz:()=>{if(S.blitz.on)endBlitz();else startBlitz();},
  toggleSurv:()=>{if(S.surv.on)endSurv();else startSurv();},
  openHelp,closeHelp,
  overAgain:()=>{view.over.on=false;if(S.lastOver==='surv')startSurv();else startBlitz();},
  overClose:()=>{view.over.on=false;next();},
  resetStats:()=>{void resetStats();},
  setTab:(t)=>{S.tab=t;renderList();},
  toggleCat:(id,on)=>{
    S.cats[id]=on?1:0;
    if(!Object.values(S.cats).some(Boolean))S.cats[id]=1;
    save();hooks.saveCats?.(S.cats);drawCats();
  },
  setReading:(on)=>{S.reading=on;save();syncToggles();if(S.cur&&!S.answered)renderQuestion(S.cur);},
  setTense:(v)=>{S.tense=v;save();syncToggles();},
  setFut:(v)=>{S.fut=v;save();syncToggles();},
  setBlitzSecs:(n)=>{if(S.blitz.on){syncToggles();return;}S.blitzSecs=n;save();syncToggles();updateStats();},
  setSurvLives:(n)=>{if(S.surv.on){syncToggles();return;}S.survLives=n;save();syncToggles();updateStats();},
};

/* ---------- клавиши ---------- */
const onKeydown=(e: KeyboardEvent)=>{
  if(S.win){if(e.key==='Escape')closeStoryWin();return;}
  if(e.key==='Escape')closeTips();
  if(view.help){if(e.key==='Escape')closeHelp();return;}
  if(view.over.on)return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const t=e.target as HTMLElement|null;if(t&&(t.tagName==='SELECT'||t.tagName==='INPUT'))return;
  if(S.cur&&S.cur.type==='choice'&&!S.answered&&(e.key==='h'||e.key==='р')&&$('#hintBtn')){e.preventDefault();useHint();}
  else if(S.cur&&S.cur.type==='story'&&!S.answered&&/^([1-9]|Backspace|Enter)$/.test(e.key)){e.preventDefault();keyStory(S.cur as StoryQ,e);}
  else if(S.cur&&S.cur.type==='choice'&&!S.answered&&/^[1-9]$/.test(e.key)){
    const i=+e.key-1;if(i<S.cur.options!.length){e.preventDefault();answerChoice(i);}
  }else if(S.cur&&S.cur.type==='build'&&!S.answered){
    if(e.key==='Enter'){e.preventDefault();checkBuild();}
    else if(e.key==='Backspace'){e.preventDefault();(S.cur as BuildQ).sel.pop();drawBuild();}
    else if(/^[1-9]$/.test(e.key)){e.preventDefault();pickTile(+e.key-1);}
    else if(e.key==='h'||e.key==='р'){e.preventDefault();buildHint();}
    else if(e.key==='t'||e.key==='е'){e.preventDefault();toggleGloss();}
  }else if(S.answered&&e.key==='Enter'&&!(t&&t.tagName==='BUTTON')){e.preventDefault();next();}
};
document.addEventListener('keydown',onKeydown);
const onDocClick=(e: MouseEvent)=>{const t=e.target as HTMLElement|null;if(!(t&&t.closest&&t.closest('.story-tr')))closeTips();};
document.addEventListener('click',onDocClick);

/* ---------- крючок для бота-игрока (docs/bot.md): только в тестовой сборке, `NUXT_PUBLIC_TEST_HOOKS=1`; в боевой `hooks.probe` не задан ---------- */
type ProbeWindow=Window&{__gameProbe?: unknown};
if(hooks.probe&&typeof window!=='undefined'){
  (window as ProbeWindow).__gameProbe={
    /** Текущее задание без функций: бот по нему знает верный ответ. */
    question:()=>S.cur?JSON.parse(JSON.stringify(S.cur)) as unknown:null,
    /** Режимы и чипы уровней прямо из кода (`MODES`, `STORY_MODES`, `LEVEL_LABELS`): бот не держит своей копии списка. */
    modes:()=>MODES.map(m=>({id:m.id,name:m.name,levels:STORY_MODES.includes(m.id)?(LEVEL_LABELS[m.id]||[['simple','Простой'],['story','Рассказ 2–4'],['long','Длинный 5–10']]).map(x=>({id:x[0],label:x[1]})):[]})),
    /** Счётчики и настройки, которые бот сверяет с экраном. */
    state:()=>({mode:S.mode,levels:{...S.levels},level:S.level,ses:{...S.ses},all:{ok:S.all.ok,bad:S.all.bad,best:S.all.best},answered:S.answered,
      blitz:{on:S.blitz.on,left:S.blitz.left,ok:S.blitz.ok,bad:S.blitz.bad},surv:{...S.surv},retry:S.retryQueue.length,hints:S.hints,histLen:S.hist.length}),
  };
}

/* ---------- старт ---------- */
Object.assign(view,{wq:'',blitzOn:false,survOn:false,help:false});Object.assign(view.over,{on:false});Object.assign(view.timer,{on:false,pct:100});Object.assign(view.toast,{on:false});
drawCats();syncToggles();updateStats();renderList();drawLives();
renderQuestion(genQuestion());
if(!S.seenHelp)openHelp();
return ()=>{
  stopDrag();
  if(hooks.probe&&typeof window!=='undefined')delete (window as ProbeWindow).__gameProbe;
  document.removeEventListener('keydown',onKeydown);
  document.removeEventListener('click',onDocClick);
  closeStoryWin();
  clearInterval(S.blitz.iv);
  clearTimeout(S.timer);
  clearTimeout(toastT);
};

}
