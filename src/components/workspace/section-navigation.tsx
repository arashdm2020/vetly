'use client';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft } from 'lucide-react';
export function SectionNavigation<T extends string>({items,value,onChange,label}:{items:readonly {id:T;title:string;detail:string;icon:LucideIcon}[];value:T;onChange:(value:T)=>void;label:string}) {
  return <nav className="section-navigation" aria-label={label}>{items.map(({id,title,detail,icon:Icon})=><button key={id} type="button" aria-current={value===id?'page':undefined} onClick={()=>onChange(id)}><Icon size={19} aria-hidden="true"/><span><strong>{title}</strong><small>{detail}</small></span><ChevronLeft size={14} className="section-nav-arrow" aria-hidden="true"/></button>)}</nav>;
}
