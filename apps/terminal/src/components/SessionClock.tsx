import {useEffect,useMemo,useState} from 'react';

// ASCEND research windows: fixed UTC, not exchange opening/closing times.
// UTC does not follow DST; Kyiv labels follow Europe/Kyiv automatically.
export const SESSION_WINDOWS=[
  {id:'ASIA',name:'АЗИЯ',english:'ASIA',from:0,to:8},
  {id:'LONDON',name:'ЛОНДОН',english:'LONDON',from:7,to:16},
  {id:'NEW_YORK',name:'НЬЮ-ЙОРК',english:'NEW YORK',from:13,to:22}
] as const;

const MINUTES_DAY=24*60;
const KYIV_ZONE='Europe/Kyiv';

function clockUtc(minutes:number){
  const normalized=((minutes%MINUTES_DAY)+MINUTES_DAY)%MINUTES_DAY;
  const hours=Math.floor(normalized/60);
  const mins=Math.floor(normalized%60);
  return String(hours).padStart(2,'0')+':'+String(mins).padStart(2,'0');
}

function hoursAndMinutes(minutes:number){
  const value=Math.max(0,Math.ceil(minutes));
  const h=Math.floor(value/60),m=value%60;
  return h?String(h)+' ч '+String(m)+' мин':String(m)+' мин';
}

function dayStartUtc(now:Date){
  return Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
}

const kyivClock=new Intl.DateTimeFormat('ru-RU',{
  timeZone:KYIV_ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'
});
const kyivDay=new Intl.DateTimeFormat('en-CA',{
  timeZone:KYIV_ZONE,year:'numeric',month:'2-digit',day:'2-digit'
});

function kyivInterval(utcDay:number,from:number,to:number){
  const start=new Date(utcDay+from*60000);
  const end=new Date(utcDay+to*60000);
  const nextDay=kyivDay.format(start)!==kyivDay.format(end);
  return kyivClock.format(start)+' – '+kyivClock.format(end)+(nextDay?' (+1 день)':'');
}

type SessionState='ACTIVE'|'UPCOMING'|'ENDED';

export default function SessionClock(){
  const[nowMs,setNowMs]=useState(()=>Date.now());
  useEffect(()=>{
    const update=()=>setNowMs(Date.now());
    // One lightweight timer for all three sessions. No candles, REST or WebSocket.
    const timer=window.setInterval(update,15000);
    document.addEventListener('visibilitychange',update);
    return()=>{
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',update);
    };
  },[]);

  const model=useMemo(()=>{
    const now=new Date(nowMs);
    const utcDay=dayStartUtc(now);
    const utcMinute=now.getUTCHours()*60+now.getUTCMinutes()+now.getUTCSeconds()/60;
    const sessions=SESSION_WINDOWS.map(session=>{
      const from=session.from*60,to=session.to*60;
      const state:SessionState=utcMinute>=from&&utcMinute<to?'ACTIVE':utcMinute<from?'UPCOMING':'ENDED';
      const nextTarget=state==='ACTIVE'?to:state==='UPCOMING'?from:from+MINUTES_DAY;
      const remaining=nextTarget-utcMinute;
      const progress=Math.min(100,Math.max(0,(utcMinute-from)/(to-from)*100));
      return {...session,fromMinutes:from,toMinutes:to,state,remaining,progress,
        kyiv:kyivInterval(utcDay,from,to)};
    });
    const nextOpen=sessions
      .map(session=>({name:session.name,minutes:session.state==='UPCOMING'?session.fromMinutes-utcMinute:session.fromMinutes+MINUTES_DAY-utcMinute}))
      .sort((a,b)=>a.minutes-b.minutes)[0];
    const transitions=SESSION_WINDOWS.map((session,i)=>{
      const next=SESSION_WINDOWS[(i+1)%SESSION_WINDOWS.length];
      const nextStart=(next.from+(i===SESSION_WINDOWS.length-1?24:0))*60;
      const end=session.to*60;
      const delta=nextStart-end;
      const intervalFrom=Math.min(nextStart,end);
      const intervalTo=Math.max(nextStart,end);
      return {from:session.name,to:next.name,delta,
        hours:hoursAndMinutes(Math.abs(delta)),
        clock:clockUtc(intervalFrom)+' – '+clockUtc(intervalTo)};
    });
    return {sessions,transitions,nextOpen,utcMinute,kyivNow:kyivClock.format(now),
      utcNow:clockUtc(utcMinute),active:sessions.filter(s=>s.state==='ACTIVE').map(s=>s.name)};
  },[nowMs]);

  return <section className="asc-session-panel" aria-label="Торговые сессии и переходы">
    <div className="asc-session-head">
      <div><strong>ТОРГОВЫЕ СЕССИИ · SESSION MAP</strong>
        <small>Наблюдаемые окна ASCEND · UTC постоянно, Киев с переходом на летнее/зимнее время</small>
      </div>
      <div className="asc-session-clocks">
        <span>UTC <b>{model.utcNow}</b></span><span>КИЕВ <b>{model.kyivNow}</b></span>
      </div>
    </div>
    <div className="asc-session-cards">
      {model.sessions.map(session=><div key={session.id}
        className={'asc-session-card '+(session.state==='ACTIVE'?'active':session.state==='UPCOMING'?'upcoming':'ended')}>
        <div className="asc-session-card-top">
          <div><b>{session.name}</b><small>{session.english}</small></div>
          <span className="asc-session-state">{session.state}</span>
        </div>
        <div className="asc-session-range"><strong>{clockUtc(session.fromMinutes)}–{clockUtc(session.toMinutes)}</strong><small>UTC · {hoursAndMinutes(session.toMinutes-session.fromMinutes)}</small></div>
        <div className="asc-session-kyiv">Киев: {session.kyiv}</div>
        <div className="asc-session-progress"><i style={{width:session.progress+'%'}}/></div>
        <div className="asc-session-countdown">
          <span>{session.state==='ACTIVE'?'До закрытия':session.state==='UPCOMING'?'До открытия':'Следующее открытие через'}</span>
          <b>{hoursAndMinutes(session.remaining)}</b>
        </div>
      </div>)}
    </div>
    <div className="asc-session-timeline">
      <div className="asc-session-time-ticks">{[0,4,8,12,16,20,24].map(h=><span key={h}>{String(h).padStart(2,'0')}:00</span>)}</div>
      {model.sessions.map(s=><div className="asc-session-track" key={s.id}>
        <span className="asc-session-track-label">{s.english}</span>
        <div className="asc-session-track-body">
          <div className={'asc-session-track-bar '+s.id.toLowerCase()}
            style={{left:(s.fromMinutes/MINUTES_DAY*100)+'%',width:((s.toMinutes-s.fromMinutes)/MINUTES_DAY*100)+'%'}}/>
          <div className="asc-session-now" style={{left:(model.utcMinute/MINUTES_DAY*100)+'%'}}/>
        </div>
      </div>)}
    </div>
    <div className="asc-session-transitions">
      {model.transitions.map(t=><div key={t.from+'-'+t.to} className={'asc-session-transition '+(t.delta>0?'is-gap':'is-overlap')}>
        <span>{t.from} → {t.to}</span>
        <b>{t.delta>0?'ПРОМЕЖУТОК':'ПЕРЕСЕЧЕНИЕ'} {t.hours}</b>
        <small>{t.clock} UTC</small>
      </div>)}
    </div>
    <div className="asc-session-bottom">
      <span>{model.active.length?'СЕЙЧАС АКТИВНЫ: '+model.active.join(' + '):'СЕЙЧАС ВНЕ ЗАДАННЫХ СЕССИОННЫХ ОКОН'}</span>
      <span>Следующее открытие: {model.nextOpen.name} через {hoursAndMinutes(model.nextOpen.minutes)}</span>
    </div>
    <p className="asc-session-disclaimer">Промежуток между нашими сессионными окнами не означает закрытие крипторынка: Bybit торгуется круглосуточно. Панель не создаёт торговых сигналов.</p>
  </section>;
}
