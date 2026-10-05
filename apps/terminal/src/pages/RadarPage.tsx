import { useMemo, useState } from 'react';

type RadarState='НАБЛЮДЕНИЕ · WATCH'|'СМЕНА · SHIFTING'|'ПОДТВЕРЖДЕНО · CONFIRMED';
type Direction='LONG'|'SHORT'|'NEUTRAL';

type RadarRow={
  symbol:string;
  price:string;
  change:string;
  group:string;
  level:string;
  distance:string;
  session:string;
  state:RadarState;
  direction:Direction;
  used:number;
  remaining:number;
  volume:string;
  vwap:string;
  lastEvent:string;
  tf:string;
};

const rows:RadarRow[]=[
  {symbol:'BTCUSDT',price:'86,140',change:'+0.42%',group:'ГОРЯЧИЕ · HOT NOW',level:'ONH / UPPER WALL',distance:'0.21%',session:'NEW YORK',state:'СМЕНА · SHIFTING',direction:'SHORT',used:82,remaining:69,volume:'1.8×',vwap:'ABOVE',lastEvent:'10m CHOCH↓',tf:'15m'},
  {symbol:'ETHUSDT',price:'3,241',change:'+1.12%',group:'RC30 LONG',level:'RC30 / RTH LOW',distance:'0.34%',session:'NEW YORK',state:'ПОДТВЕРЖДЕНО · CONFIRMED',direction:'LONG',used:61,remaining:58,volume:'2.1×',vwap:'ABOVE',lastEvent:'1m BOS↑',tf:'5m'},
  {symbol:'SOLUSDT',price:'186.40',change:'-0.28%',group:'RC70 SHORT',level:'RC70 / YH',distance:'0.18%',session:'LONDON',state:'НАБЛЮДЕНИЕ · WATCH',direction:'SHORT',used:74,remaining:43,volume:'1.4×',vwap:'BELOW',lastEvent:'TOUCH',tf:'10m'},
  {symbol:'INJUSDT',price:'17.42',change:'+3.21%',group:'YH/YL APPROACH',level:'YH',distance:'0.12%',session:'NEW YORK',state:'СМЕНА · SHIFTING',direction:'LONG',used:68,remaining:62,volume:'2.4×',vwap:'ABOVE',lastEvent:'5m MSS↑',tf:'5m'},
  {symbol:'LINKUSDT',price:'11.86',change:'-1.32%',group:'ONH/ONL APPROACH',level:'ONL',distance:'0.09%',session:'ASIA',state:'НАБЛЮДЕНИЕ · WATCH',direction:'LONG',used:57,remaining:71,volume:'1.2×',vwap:'BELOW',lastEvent:'APPROACH',tf:'15m'},
  {symbol:'CYBERUSDT',price:'5.684',change:'+4.12%',group:'SESSION TRANSITION',level:'London High',distance:'0.27%',session:'NEW YORK',state:'ПОДТВЕРЖДЕНО · CONFIRMED',direction:'LONG',used:66,remaining:55,volume:'2.8×',vwap:'ABOVE',lastEvent:'ПОДТВЕРЖДЕНО · CONFIRMED',tf:'3m'},
  {symbol:'OPUSDT',price:'1.832',change:'-0.48%',group:'ГОРЯЧИЕ · HOT NOW',level:'RTH LOW',distance:'0.31%',session:'NEW YORK',state:'НАБЛЮДЕНИЕ · WATCH',direction:'SHORT',used:49,remaining:76,volume:'1.1×',vwap:'BELOW',lastEvent:'PROBE',tf:'15m'},
  {symbol:'ARBUSDT',price:'1.321',change:'+2.43%',group:'YH/YL APPROACH',level:'YL reclaimed',distance:'0.22%',session:'LONDON',state:'СМЕНА · SHIFTING',direction:'LONG',used:63,remaining:64,volume:'1.9×',vwap:'ABOVE',lastEvent:'RECLAIM',tf:'10m'},
  {symbol:'SUIUSDT',price:'0.6451',change:'-1.21%',group:'ONH/ONL APPROACH',level:'ONH',distance:'0.16%',session:'ASIA',state:'НАБЛЮДЕНИЕ · WATCH',direction:'SHORT',used:77,remaining:39,volume:'1.6×',vwap:'BELOW',lastEvent:'SWEEP',tf:'5m'},
  {symbol:'APTUSDT',price:'8.421',change:'+3.58%',group:'RC30 LONG',level:'Balance Low',distance:'0.41%',session:'NEW YORK',state:'ПОДТВЕРЖДЕНО · CONFIRMED',direction:'LONG',used:54,remaining:73,volume:'2.3×',vwap:'ABOVE',lastEvent:'1m BOS↑',tf:'3m'}
];

const groups=['ALL','ГОРЯЧИЕ · HOT NOW','НАБЛЮДЕНИЕ · WATCH','СМЕНА · SHIFTING','ПОДТВЕРЖДЕНО · CONFIRMED','RC30 LONG','RC70 SHORT','YH/YL APPROACH','ONH/ONL APPROACH','SESSION TRANSITION'];

const stateClass=(s:RadarState)=>s.toLowerCase();

export default function RadarPage(){
  const[selectedSymbol,setSelectedSymbol]=useState('BTCUSDT');
  const[group,setGroup]=useState('ALL');
  const[direction,setDirection]=useState('ALL');
  const[session,setSession]=useState('ALL');
  const[tf,setTf]=useState('ALL');

  const filtered=useMemo(()=>rows.filter(r=>{
    if(group==='НАБЛЮДЕНИЕ · WATCH'||group==='СМЕНА · SHIFTING'||group==='ПОДТВЕРЖДЕНО · CONFIRMED'){
      if(r.state!==group)return false;
    }else if(group!=='ALL'&&r.group!==group)return false;
    if(direction!=='ALL'&&r.direction!==direction)return false;
    if(session!=='ALL'&&r.session!==session)return false;
    if(tf!=='ALL'&&r.tf!==tf)return false;
    return true;
  }),[group,direction,session,tf]);

  const selected=rows.find(r=>r.symbol===selectedSymbol)??rows[0];

  return <main className="radar-page">
    <section className="radar-head">
      <div>
        <h2>УМНЫЙ РАДАР <small>SMART RADAR</small></h2>
        <p>Весь фьючерсный рынок · Futures universe → быстрый математический фильтр → глубокий расчёт только для кандидатов</p>
      </div>
      <div className="radar-health"><span>● MOCK/PAPER</span><b>СКАНЕР ONLINE · SCANNER ONLINE</b></div>
    </section>

    <section className="radar-kpis">
      <button onClick={()=>setGroup('ГОРЯЧИЕ · HOT NOW')} className={group==='ГОРЯЧИЕ · HOT NOW'?'active':''}><small>ГОРЯЧИЕ · HOT NOW</small><b>18</b><span>активное движение · active move</span></button>
      <button onClick={()=>setGroup('НАБЛЮДЕНИЕ · WATCH')} className={group==='НАБЛЮДЕНИЕ · WATCH'?'active':''}><small>НАБЛЮДЕНИЕ · WATCH</small><b>64</b><span>ждём реакцию · waiting reaction</span></button>
      <button onClick={()=>setGroup('СМЕНА · SHIFTING')} className={group==='СМЕНА · SHIFTING'?'active':''}><small>СМЕНА · SHIFTING</small><b>21</b><span>структура меняется · structure shifting</span></button>
      <button onClick={()=>setGroup('ПОДТВЕРЖДЕНО · CONFIRMED')} className={group==='ПОДТВЕРЖДЕНО · CONFIRMED'?'active':''}><small>ПОДТВЕРЖДЕНО · CONFIRMED</small><b>9</b><span>кандидаты на вход · entry-ready</span></button>
      <div><small>РЫНОК · UNIVERSE</small><b>412</b><span>фьючерсные пары · futures symbols</span></div>
      <div><small>ГЛУБОКИЙ СКАН · DEEP SCAN</small><b>37</b><span>текущие кандидаты · current candidates</span></div>
    </section>

    <section className="radar-controls">
      <input placeholder="Поиск монеты / Search symbol…" />
      <div className="radar-group-tabs">{groups.map(g=><button key={g} className={group===g?'active':''} onClick={()=>setGroup(g)}>{g}</button>)}</div>
      <select value={direction} onChange={e=>setDirection(e.target.value)}><option>ALL</option><option>LONG</option><option>SHORT</option><option>NEUTRAL</option></select>
      <select value={session} onChange={e=>setSession(e.target.value)}><option>ALL</option><option>ASIA</option><option>LONDON</option><option>NEW YORK</option></select>
      <select value={tf} onChange={e=>setTf(e.target.value)}><option>ALL</option><option>3m</option><option>5m</option><option>10m</option><option>15m</option></select>
    </section>

    <section className="radar-body">
      <article className="radar-table-card">
        <div className="radar-table-head">
          <span>#</span><span>Монета<br/><small>Symbol</small></span><span>Цена<br/><small>Price</small></span><span>24H</span><span>Активный уровень<br/><small>Активный уровень · Active level</small></span><span>Дистанция<br/><small>Дистанция · Distance</small></span><span>Сессия<br/><small>Session</small></span><span>Состояние<br/><small>State</small></span><span>Направление<br/><small>Direction</small></span><span>Использовано<br/><small>Used</small></span><span>Осталось<br/><small>Remaining</small></span><span>Объём<br/><small>Объём · Volume</small></span><span>VWAP</span><span>Последнее событие<br/><small>Последнее событие · Last event</small></span>
        </div>
        <div className="radar-table-body">
          {filtered.map((r,index)=><button className={'radar-table-row '+(selected.symbol===r.symbol?'selected':'')} key={r.symbol} onClick={()=>setSelectedSymbol(r.symbol)}>
            <span>{index+1}</span>
            <b>{r.symbol}</b>
            <span>{r.price}</span>
            <span className={r.change.startsWith('+')?'positive':'negative'}>{r.change}</span>
            <span>{r.level}</span>
            <span>{r.distance}</span>
            <span>{r.session}</span>
            <span><i className={'state-pill '+stateClass(r.state)}>{r.state}</i></span>
            <span className={r.direction==='LONG'?'positive':r.direction==='SHORT'?'negative':''}>{r.direction}</span>
            <span>{r.used}%</span>
            <span>{r.remaining}%</span>
            <span>{r.volume}</span>
            <span>{r.vwap}</span>
            <span>{r.lastEvent}</span>
          </button>)}
        </div>
        <div className="radar-table-foot"><span>Показано {filtered.length} из {rows.length} mock-кандидатов / candidates</span><span>Сортировка / Sort: активность → близость к уровню → стадия Core</span></div>
      </article>

      <aside className="radar-preview">
        <div className="radar-preview-head">
          <div><strong>{selected.symbol}</strong><small>{selected.tf} · {selected.session}</small></div>
          <i className={'state-pill '+stateClass(selected.state)}>{selected.state}</i>
        </div>

        <div className="preview-price"><b>{selected.price}</b><span className={selected.change.startsWith('+')?'positive':'negative'}>{selected.change}</span></div>

        <section>
          <div className="section-title">ПРЕДПРОСМОТР РЕШЕНИЯ · DECISION PREVIEW</div>
          <div className="kv"><span>Кандидат направления · Direction candidate</span><b className={selected.direction==='LONG'?'positive':'negative'}>{selected.direction}</b></div>
          <div className="kv"><span>Активный уровень · Active level</span><b>{selected.level}</b></div>
          <div className="kv"><span>Дистанция · Distance</span><b>{selected.distance}</b></div>
          <div className="kv"><span>Последнее событие<br/><small>Последнее событие · Last event</small></span><b>{selected.lastEvent}</b></div>
        </section>

        <section>
          <div className="section-title">МАТЕМАТИЧЕСКИЙ ФИЛЬТР · MATH GATE</div>
          <div className="preview-meter"><div><span>Использовано диапазона · Used Range</span><b>{selected.used}%</b></div><progress value={selected.used} max="100"/></div>
          <div className="preview-meter"><div><span>Осталось движения · Remaining Move</span><b>{selected.remaining}%</b></div><progress value={selected.remaining} max="100"/></div>
          <div className="kv"><span>Объём<br/><small>Объём · Volume</small></span><b>{selected.volume}</b></div>
          <div className="kv"><span>VWAP</span><b>{selected.vwap}</b></div>
        </section>

        <section>
          <div className="section-title">МАРШРУТ CORE · CORE ROUTE</div>
          {[
            ['Баланс / уровень · Balance / level','done'],
            ['Касание / снятие · Touch / Sweep',selected.lastEvent.includes('TOUCH')||selected.lastEvent.includes('SWEEP')||selected.state!=='НАБЛЮДЕНИЕ · WATCH'?'done':''],
            ['Возврат / принятие · Reclaim / Accept',selected.state!=='НАБЛЮДЕНИЕ · WATCH'?'done':''],
            ['10m CHOCH',selected.state==='СМЕНА · SHIFTING'||selected.state==='ПОДТВЕРЖДЕНО · CONFIRMED'?'done':''],
            ['5m MSS',selected.state==='ПОДТВЕРЖДЕНО · CONFIRMED'?'done':''],
            ['Ретест 3m · Retest',''],
            ['Micro-BOS 1m · Trigger',selected.state==='ПОДТВЕРЖДЕНО · CONFIRMED'?'done':'']
          ].map(([label,cls])=><div className={'preview-step '+cls} key={label}><span>{cls?'✓':'○'}</span><b>{label}</b></div>)}
        </section>

        <div className="radar-preview-actions">
          <button>ОТКРЫТЬ РЫНОК · OPEN MARKET</button>
          <button className="primary">PIN TO НАБЛЮДЕНИЕ · WATCH</button>
        </div>
      </aside>
    </section>
  </main>
}
