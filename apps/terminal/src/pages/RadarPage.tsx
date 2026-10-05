import { useMemo, useState } from 'react';
import { useBybitUniverse } from '../market/useBybitUniverse';

type RadarState='WATCH'|'SHIFTING'|'CONFIRMED';
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
  source:'CEX'|'DEX→CEX';
};

const rows:RadarRow[]=[
  {symbol:'BTCUSDT',price:'86,140',change:'+0.42%',group:'HOT NOW',level:'ONH / UPPER WALL',distance:'0.21%',session:'NEW YORK',state:'SHIFTING',direction:'SHORT',used:82,remaining:69,volume:'1.8×',vwap:'ABOVE',lastEvent:'10m CHOCH↓',tf:'15m',source:'CEX'},
  {symbol:'ETHUSDT',price:'3,241',change:'+1.12%',group:'RC30 LONG',level:'RC30 / RTH LOW',distance:'0.34%',session:'NEW YORK',state:'CONFIRMED',direction:'LONG',used:61,remaining:58,volume:'2.1×',vwap:'ABOVE',lastEvent:'1m BOS↑',tf:'5m',source:'CEX'},
  {symbol:'SOLUSDT',price:'186.40',change:'-0.28%',group:'RC70 SHORT',level:'RC70 / YH',distance:'0.18%',session:'LONDON',state:'WATCH',direction:'SHORT',used:74,remaining:43,volume:'1.4×',vwap:'BELOW',lastEvent:'TOUCH',tf:'10m',source:'CEX'},
  {symbol:'INJUSDT',price:'17.42',change:'+3.21%',group:'YH/YL APPROACH',level:'YH',distance:'0.12%',session:'NEW YORK',state:'SHIFTING',direction:'LONG',used:68,remaining:62,volume:'2.4×',vwap:'ABOVE',lastEvent:'5m MSS↑',tf:'5m',source:'CEX'},
  {symbol:'LINKUSDT',price:'11.86',change:'-1.32%',group:'ONH/ONL APPROACH',level:'ONL',distance:'0.09%',session:'ASIA',state:'WATCH',direction:'LONG',used:57,remaining:71,volume:'1.2×',vwap:'BELOW',lastEvent:'APPROACH',tf:'15m',source:'CEX'},
  {symbol:'CYBERUSDT',price:'5.684',change:'+4.12%',group:'SESSION TRANSITION',level:'London High',distance:'0.27%',session:'NEW YORK',state:'CONFIRMED',direction:'LONG',used:66,remaining:55,volume:'2.8×',vwap:'ABOVE',lastEvent:'CONFIRMED',tf:'3m',source:'CEX'},
  {symbol:'OPUSDT',price:'1.832',change:'-0.48%',group:'HOT NOW',level:'RTH LOW',distance:'0.31%',session:'NEW YORK',state:'WATCH',direction:'SHORT',used:49,remaining:76,volume:'1.1×',vwap:'BELOW',lastEvent:'PROBE',tf:'15m',source:'CEX'},
  {symbol:'ARBUSDT',price:'1.321',change:'+2.43%',group:'YH/YL APPROACH',level:'YL reclaimed',distance:'0.22%',session:'LONDON',state:'SHIFTING',direction:'LONG',used:63,remaining:64,volume:'1.9×',vwap:'ABOVE',lastEvent:'RECLAIM',tf:'10m',source:'CEX'},
  {symbol:'SUIUSDT',price:'0.6451',change:'-1.21%',group:'ONH/ONL APPROACH',level:'ONH',distance:'0.16%',session:'ASIA',state:'WATCH',direction:'SHORT',used:77,remaining:39,volume:'1.6×',vwap:'BELOW',lastEvent:'SWEEP',tf:'5m',source:'CEX'},
  {symbol:'APTUSDT',price:'8.421',change:'+3.58%',group:'RC30 LONG',level:'Balance Low',distance:'0.41%',session:'NEW YORK',state:'CONFIRMED',direction:'LONG',used:54,remaining:73,volume:'2.3×',vwap:'ABOVE',lastEvent:'1m BOS↑',tf:'3m',source:'CEX'},
  {symbol:'WIFUSDT',price:'2.418',change:'+5.82%',group:'DEX HOT',level:'DEX liquidity inflow',distance:'0.63%',session:'NEW YORK',state:'WATCH',direction:'NEUTRAL',used:41,remaining:82,volume:'3.4×',vwap:'ABOVE',lastEvent:'DEX VOLUME SPIKE',tf:'3m',source:'DEX→CEX'},
  {symbol:'PEPEUSDT',price:'0.00001084',change:'+4.31%',group:'DEX VOLUME SPIKE',level:'DEX pool volume',distance:'0.48%',session:'LONDON',state:'WATCH',direction:'NEUTRAL',used:38,remaining:85,volume:'4.1×',vwap:'ABOVE',lastEvent:'LIQUIDITY INFLOW',tf:'3m',source:'DEX→CEX'},
  {symbol:'ARBUSDT',price:'1.329',change:'+2.88%',group:'DEX/CEX GAP',level:'DEX/CEX gap +0.7%',distance:'0.70%',session:'NEW YORK',state:'WATCH',direction:'NEUTRAL',used:44,remaining:79,volume:'2.6×',vwap:'ABOVE',lastEvent:'PRICE GAP',tf:'5m',source:'DEX→CEX'}
];

const groups=['REAL MARKET','ALL','HOT NOW','WATCH','SHIFTING','CONFIRMED','RC30 LONG','RC70 SHORT','YH/YL APPROACH','ONH/ONL APPROACH','SESSION TRANSITION','DEX HOT','DEX VOLUME SPIKE','DEX/CEX GAP'];
const stateClass=(s:RadarState)=>s.toLowerCase();
const stateRu:Record<RadarState,string>={WATCH:'НАБЛЮДЕНИЕ',SHIFTING:'СМЕНА',CONFIRMED:'ПОДТВЕРЖДЕНО'};
const groupRu:Record<string,string>={
  'REAL MARKET':'РЕАЛЬНЫЙ РЫНОК',
  'ALL':'ВСЕ',
  'HOT NOW':'ГОРЯЧИЕ',
  'WATCH':'НАБЛЮДЕНИЕ',
  'SHIFTING':'СМЕНА',
  'CONFIRMED':'ПОДТВЕРЖДЕНО',
  'RC30 LONG':'RC30 LONG',
  'RC70 SHORT':'RC70 SHORT',
  'YH/YL APPROACH':'ПОДХОД YH/YL',
  'ONH/ONL APPROACH':'ПОДХОД ONH/ONL',
  'SESSION TRANSITION':'ПЕРЕХОД СЕССИИ',
  'DEX HOT':'DEX ГОРЯЧИЕ',
  'DEX VOLUME SPIKE':'DEX ВСПЛЕСК ОБЪЁМА',
  'DEX/CEX GAP':'DEX/CEX РАЗРЫВ'
};

export default function RadarPage({onNavigate,onOpenMarket}:{onNavigate:(view:string)=>void;onOpenMarket?:(symbol:string)=>void}){
  const[selectedSymbol,setSelectedSymbol]=useState('BTCUSDT');
  const[group,setGroup]=useState('REAL MARKET');
  const[direction,setDirection]=useState('ALL');
  const[session,setSession]=useState('ALL');
  const[tf,setTf]=useState('ALL');
  const[query,setQuery]=useState('');
  const[notice,setNotice]=useState('');
  const universe=useBybitUniverse();
  const liveRows=useMemo<RadarRow[]>(()=>universe.items
    .slice()
    .sort((a,b)=>b.turnover24h-a.turnover24h)
    .slice(0,120)
    .map(t=>{
      const span=Math.max(t.high24h-t.low24h,Math.abs(t.lastPrice)*0.0001);
      const used=Math.max(0,Math.min(100,((t.lastPrice-t.low24h)/span)*100));
      const nearest=Math.min(Math.abs(t.high24h-t.lastPrice),Math.abs(t.lastPrice-t.low24h));
      return{
        symbol:t.symbol,
        price:t.lastPrice>=1000?t.lastPrice.toLocaleString('en-US',{maximumFractionDigits:2}):String(Number(t.lastPrice.toPrecision(7))),
        change:(t.change24hPct>=0?'+':'')+t.change24hPct.toFixed(2)+'%',
        group:'REAL MARKET',
        level:used>80?'24H HIGH':used<20?'24H LOW':'24H RANGE',
        distance:(nearest/Math.max(t.lastPrice,1e-12)*100).toFixed(2)+'%',
        session:'LIVE',
        state:'WATCH',
        direction:t.change24hPct>0.25?'LONG':t.change24hPct<-0.25?'SHORT':'NEUTRAL',
        used:Math.round(used),
        remaining:Math.round(100-used),
        volume:t.turnover24h>=1e9?(t.turnover24h/1e9).toFixed(1)+'B':t.turnover24h>=1e6?(t.turnover24h/1e6).toFixed(1)+'M':(t.turnover24h/1e3).toFixed(0)+'K',
        vwap:'—',
        lastEvent:Math.abs(t.change24hPct)>=3?'24H EXPANSION':'REAL TICKER',
        tf:'LIVE',
        source:'CEX'
      };
    }),[universe.items]);

  const baseRows=group==='REAL MARKET'?liveRows:rows;
  const filtered=useMemo(()=>baseRows.filter(r=>{
    if(query&& !r.symbol.toLowerCase().includes(query.toLowerCase()))return false;
    if(group==='WATCH'||group==='SHIFTING'||group==='CONFIRMED'){
      if(r.state!==group)return false;
    }else if(group!=='ALL'&&r.group!==group)return false;
    if(direction!=='ALL'&&r.direction!==direction)return false;
    if(session!=='ALL'&&r.session!==session)return false;
    if(tf!=='ALL'&&r.tf!==tf)return false;
    return true;
  }),[baseRows,group,direction,session,tf,query]);

  const selected=baseRows.find(r=>r.symbol===selectedSymbol)??baseRows[0]??rows[0];

  return <main className="radar-page">
    <section className="radar-head">
      <div>
        <h2>УМНЫЙ РАДАР <small>SMART RADAR</small></h2>
        <p>Весь фьючерсный рынок · Futures universe → быстрый математический фильтр → глубокий расчёт только для кандидатов</p>
      </div>
      <div className="radar-health"><span className={universe.status==='LIVE'?'positive':'warning'}>● {universe.status} · BYBIT PUBLIC</span><b>{universe.items.length||'—'} USDT FUTURES · 5s SNAPSHOT</b></div>
    </section>

    <section className="radar-kpis">
      <button onClick={()=>setGroup('HOT NOW')} className={group==='HOT NOW'?'active':''}><small>ГОРЯЧИЕ <em>HOT NOW</em></small><b>18</b><span>активное движение · active move</span></button>
      <button onClick={()=>setGroup('WATCH')} className={group==='WATCH'?'active':''}><small>НАБЛЮДЕНИЕ <em>WATCH</em></small><b>64</b><span>ждём реакцию · waiting reaction</span></button>
      <button onClick={()=>setGroup('SHIFTING')} className={group==='SHIFTING'?'active':''}><small>СМЕНА <em>SHIFTING</em></small><b>21</b><span>структура меняется · structure shifting</span></button>
      <button onClick={()=>setGroup('CONFIRMED')} className={group==='CONFIRMED'?'active':''}><small>ПОДТВЕРЖДЕНО <em>CONFIRMED</em></small><b>9</b><span>кандидаты на вход · entry-ready</span></button>
      <button onClick={()=>setGroup('REAL MARKET')} className={group==='REAL MARKET'?'active':''}><small>РЫНОК <em>LIVE UNIVERSE</em></small><b>{universe.items.length||'—'}</b><span>Bybit USDT futures · public</span></button>
      <button onClick={()=>setGroup('DEX HOT')} className={group==='DEX HOT'?'active':''}><small>DEX РАННИЕ <em>EARLY WARNING</em></small><b>7</b><span>discovery only · без CONFIRMED</span></button>
    </section>

    <section className="radar-controls">
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск монеты / Search symbol…" />
      <div className="radar-group-tabs">{groups.map(g=><button key={g} className={group===g?'active':''} onClick={()=>setGroup(g)}><span>{groupRu[g]}</span><small>{g}</small></button>)}</div>
      <select value={direction} onChange={e=>setDirection(e.target.value)}><option value="ALL">Все направления / All</option><option>LONG</option><option>SHORT</option><option>NEUTRAL</option></select>
      <select value={session} onChange={e=>setSession(e.target.value)}><option value="ALL">Все сессии / All</option><option>LIVE</option><option>ASIA</option><option>LONDON</option><option>NEW YORK</option></select>
      <select value={tf} onChange={e=>setTf(e.target.value)}><option value="ALL">Все ТФ / All TF</option><option>LIVE</option><option>3m</option><option>5m</option><option>10m</option><option>15m</option></select>
    </section>

    <section className="radar-body">
      <article className="radar-table-card">
        <div className="radar-table-head">
          <span>#</span><span>Монета<small>Symbol</small></span><span>Цена<small>Price</small></span><span>24H</span><span>Активный уровень<small>Active level</small></span><span>Дистанция<small>Distance</small></span><span>Сессия<small>Session</small></span><span>Состояние<small>State</small></span><span>Направление<small>Direction</small></span><span>Источник<small>Source</small></span><span>Исп.<small>Used</small></span><span>Осталось<small>Remaining</small></span><span>Объём<small>Volume</small></span><span>VWAP</span><span>Событие<small>Last event</small></span>
        </div>
        <div className="radar-table-body">
          {filtered.map((r,index)=><button className={'radar-table-row '+(selected.symbol===r.symbol?'selected':'')} key={r.symbol} onClick={()=>setSelectedSymbol(r.symbol)}>
            <span>{index+1}</span><b>{r.symbol}</b><span>{r.price}</span><span className={r.change.startsWith('+')?'positive':'negative'}>{r.change}</span><span>{r.level}</span><span>{r.distance}</span><span>{r.session}</span>
            <span><i className={'state-pill '+stateClass(r.state)}>{r.state}</i><small>{stateRu[r.state]}</small></span>
            <span className={r.direction==='LONG'?'positive':r.direction==='SHORT'?'negative':''}>{r.direction}</span><span className={r.source==='DEX→CEX'?'dex-source':''}>{r.source}</span><span>{r.used}%</span><span>{r.remaining}%</span><span>{r.volume}</span><span>{r.vwap}</span><span>{r.lastEvent}</span>
          </button>)}
        </div>
        <div className="radar-table-foot"><span>Показано {filtered.length} из {group==='REAL MARKET'?liveRows.length:rows.length} · {group==='REAL MARKET'?'REAL BYBIT':'ASCEND MOCK'}</span><span>{group==='REAL MARKET'?'Сортировка: 24h turnover · обновление ~5 сек':'Сортировка: активность → близость → Core'}</span></div>
      </article>

      <aside className="radar-preview">
        <div className="radar-preview-head">
          <div><strong>{selected.symbol}</strong><small>{selected.tf} · {selected.session}</small></div>
          <i className={'state-pill '+stateClass(selected.state)}>{selected.state}<small>{stateRu[selected.state]}</small></i>
        </div>

        <div className="preview-price"><b>{selected.price}</b><span className={selected.change.startsWith('+')?'positive':'negative'}>{selected.change}</span></div>

        <section>
          <div className="section-title">ПРЕДПРОСМОТР РЕШЕНИЯ <small>DECISION PREVIEW</small></div>
          <div className="kv"><span>Кандидат направления <small>Direction candidate</small></span><b className={selected.direction==='LONG'?'positive':'negative'}>{selected.direction}</b></div>
          <div className="kv"><span>Активный уровень <small>Active level</small></span><b>{selected.level}</b></div>
          <div className="kv"><span>Дистанция <small>Distance</small></span><b>{selected.distance}</b></div>
          <div className="kv"><span>Последнее событие <small>Last event</small></span><b>{selected.lastEvent}</b></div><div className="kv"><span>Источник <small>Source</small></span><b className={selected.source==='DEX→CEX'?'dex-source':''}>{selected.source}</b></div>
        </section>

        <section>
          <div className="section-title">МАТЕМАТИЧЕСКИЙ ФИЛЬТР <small>MATH GATE</small></div>
          <div className="preview-meter"><div><span>Использовано диапазона <small>Used Range</small></span><b>{selected.used}%</b></div><progress value={selected.used} max="100"/></div>
          <div className="preview-meter"><div><span>Осталось движения <small>Remaining Move</small></span><b>{selected.remaining}%</b></div><progress value={selected.remaining} max="100"/></div>
          <div className="kv"><span>Объём <small>Volume</small></span><b>{selected.volume}</b></div>
          <div className="kv"><span>VWAP</span><b>{selected.vwap}</b></div>
        </section>

        <section>
          <div className="section-title">МАРШРУТ CORE <small>CORE ROUTE</small></div>{selected.source==='DEX→CEX'&&<div className="dex-safety">DEX = раннее предупреждение. Самостоятельно CONFIRMED/ENTRY запрещены.</div>}
          {[
            ['Баланс / уровень','Balance / level','done'],
            ['Касание / снятие','Touch / Sweep',selected.lastEvent.includes('TOUCH')||selected.lastEvent.includes('SWEEP')||selected.state!=='WATCH'?'done':''],
            ['Возврат / принятие','Reclaim / Accept',selected.state!=='WATCH'?'done':''],
            ['CHOCH 10m','Transition',selected.state==='SHIFTING'||selected.state==='CONFIRMED'?'done':''],
            ['MSS 5m','Structure shift',selected.state==='CONFIRMED'?'done':''],
            ['Ретест 3m','Retest',''],
            ['Micro-BOS 1m','Trigger',selected.state==='CONFIRMED'?'done':'']
          ].map(([ru,en,cls])=><div className={'preview-step '+cls} key={ru}><span>{cls?'✓':'○'}</span><b>{ru}<small>{en}</small></b></div>)}
        </section>

        <div className="radar-preview-actions">
          <button onClick={()=>onOpenMarket?onOpenMarket(selected.symbol):onNavigate('MARKET')}>ОТКРЫТЬ РЫНОК<small>OPEN MARKET</small></button>
          <button className="primary" onClick={()=>setNotice(selected.symbol+' добавлен в наблюдение · pinned (MOCK)')}>В НАБЛЮДЕНИЕ<small>PIN TO WATCH</small></button>
        </div>
        {notice&&<div className="radar-action-notice">{notice}</div>}
      </aside>
    </section>
  </main>
}
