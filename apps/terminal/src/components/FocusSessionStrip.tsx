import {useEffect,useState} from 'react';
import type {ChartNarrative} from '../market/chartNarrativeResearch';
import {SESSION_WINDOWS} from './SessionClock';

function hhmm(time:number){return new Date(time).toLocaleTimeString('ru-RU',{
  timeZone:'UTC',hour:'2-digit',minute:'2-digit'});
}
/** Fixed session reference clocks, not cryptocurrency exchange opening hours. */
export default function FocusSessionStrip({narrative}:{narrative:ChartNarrative}){
  const[now,setNow]=useState(Date.now);
  useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),30000);
    return()=>window.clearInterval(id)},[]);
  const minute=new Date(now).getUTCHours()*60+new Date(now).getUTCMinutes();
  return <div className="asc-focus-session-strip" aria-label="Карта торговых сессий UTC">
    <strong>СЕССИИ · {hhmm(now)} UTC</strong>
    {SESSION_WINDOWS.map(s=>{
      const active=minute>=s.from*60&&minute<s.to*60;
      const overlap=active&&SESSION_WINDOWS.some(other=>other.id!==s.id&&
        minute>=other.from*60&&minute<other.to*60);
      return <span key={s.id} className={active?'active '+s.id.toLowerCase():''}>
        {s.name} <b>{active?overlap?'ПЕРЕСЕЧЕНИЕ':'АКТИВНА':'—'}</b>
      </span>;
    })}
    <small>{narrative.valid&&narrative.session?
      narrative.session.name+' от OPEN '+(narrative.session.changePct>=0?'+':'')+
      narrative.session.changePct.toFixed(2)+'%':'Сессионная цена: нет полной истории 1m'}</small>
  </div>;
}
