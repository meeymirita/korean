// Мелкие помощники движка игры «Хлебушек» и её генераторов заданий: поиск и создание элементов, случайный выбор.
import type { Entry } from './modes'

/** Элемент по селектору. Разметка игры постоянная, поэтому тип элемента задаёт вызывающий (по умолчанию обычный HTMLElement). */
export const $=<T extends HTMLElement=HTMLElement>(s: string,r?: ParentNode)=>(r||document).querySelector(s) as T;
export const el=<K extends keyof HTMLElementTagNameMap>(t: K,c?: string,x?: string|number|null)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=String(x);return e;};
export const shuffle=<T,>(src: readonly T[]): T[]=>{const a=src.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j]!,a[i]!];}return a;};
export const rnd=<T,>(a: readonly T[]): T=>a[Math.floor(Math.random()*a.length)]!;
export const head=(x: Entry)=>String(x.ru).split(/[ ,(]/)[0]!.toLowerCase();

