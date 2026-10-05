import { useMemo, useState } from 'react';

type SignalState='WATCH'|'SHIFTING'|'CONFIRMED'|'ENTRY'|'TP'|'SL'|'CLOSED';
type Signal={
  symbol:string; state:SignalState; direction:'LONG'|'SHORT'; tf:string; session:string; level:string;
  price:string; change:string; rr:string; time:string; mode:'SCALP'|'NORMAL';
  entry:string; sl:string; tp1:string; tp2:string; tp3:string;
  used:number; lost:number; remaining:number; potential:string;
};

const signals:Signal[]=[
  {symbol:'BTCUSDT',state:'CONFIRMED',direction:'SHORT',tf:'15m',session:'NEW YORK',level:'ONH / UPPER WALL',price:'86,680',change:'-0.34%',rr:'1:2.4',time:'15:24',mode:'NORMAL',entry:'86,680',sl:'86,991',tp1:'86,400',tp2:'85,851',tp3:'85,500',used:82,lost:31,remaining:69,potential:'0.96%'},
  {symbol:'ETHUSDT',state:'ENTRY',direction:'LONG',tf:'5m',session:'NEW YORK',level:'RC30 / RTH LOW',price:'3,241',change:'+1.12%',rr:'1:2.8',time:'15:18',mode:'SCALP',entry:'3,228',sl:'3,184',tp1:'3,268',tp2:'3,311',tp3:'3,356',used:61,lost:18,remaining:58,potential:'1.42%'},
  {symbol:'SOLUSDT',state:'WATCH',direction:'SHORT',tf:'10m',session:'LONDON',level:'RC70 / YH',price:'186.40',change:'-0.28%',rr:'1:2.1',time:'15:12',mode:'SCALP',entry:'—',sl:'—',tp1:'—',tp2:'—',tp3:'—',used:74,lost:0,remaining:43,potential:'0.72%'},
  {symbol:'INJUSDT',state:'SHIFTING',direction:'LONG',tf:'5m',session:'NEW YORK',level:'YH',price:'17.42',change:'+3.21%',rr:'1:3.0',time:'14:58',mode:'NORMAL',entry:'—',sl:'—',tp1:'—',tp2:'—',tp3:'—',used:68,lost:21,remaining:62,potential:'1.88%'},
  {symbol:'LINKUSDT',state:'TP',direction:'LONG',tf:'30m',session:'LONDON',level:'RTH LOW',price:'11.86',change:'+1.48%',rr:'1:3.2',time:'14:45',mode:'NORMAL',entry:'11.52',sl:'11.31',tp1:'11.72',tp2:'11.86',tp3:'12.14',used:79,lost:14,remaining:36,potential:'2.10%'},
  {symbol:'CYBERUSDT',state:'CLOSED',direction:'LONG',tf:'5m',session:'ASIA',level:'RC30',price:'5.684',change:'+4.12%',rr:'1:2.8',time:'14:33',mode:'SCALP',entry:'5.412',sl:'5.301',tp1:'5.520',tp2:'5.621',tp3:'5.684',used:91,lost:12,remaining:0,potential:'4.12%'}
];

const stateRu:Record<SignalState,string>={
  WATCH:'НАБЛЮДЕНИЕ',SHIFTING:'СМЕНА СТРУКТУРЫ',CONFIRMED:'ПОДТВЕРЖДЕНО',ENTRY:'ВХОД',TP:'ТЕЙК-ПРОФИТ',SL:'СТОП',CLOSED:'ЗАКРЫТО'
};

export default function SignalsPage({onNavigate}:{onNavigate:(view:string)=>void}){
  const[selectedSymbol,setSelectedSymbol]=useState('BTCUSDT');
  const[filter,setFilter]=useState<'ALL'|SignalState>('ALL');
  const[mode,setMode]=useState<'ALL'|'SCALP'|'NORMAL'>('ALL');
  const[query,setQuery]=useState('');
  const selected=signals.find(s=>s.symbol===selectedSymbol)??signals[0];
  const filtered=useMemo(()=>signals.filter(s=>(filter==='ALL'||s.state===filter)&&(mode==='ALL'||s.mode===mode)&&(!query||s.symbol.toLowerCase().includes(query.toLowerCase()))),[filter,mode,query]);

  return <main className="signals-page">
    <aside className="signals-side">
      <div className="signals-side-title"><strong>СИГНАЛЫ</strong><small>SIGNALS · УПРАВЛЕНИЕ / MANAGEMENT</small></div>
      {[
        ['ALL','Все сигналы','All signals'],
        ['WATCH','Наблюдение','Watch'],
        ['SHIFTING','Смена структуры','Shifting'],
        ['CONFIRMED','Подтверждено','Confirmed'],
        ['ENTRY','Входы','Entries'],
        ['TP','Тейк-профит','Take profit'],
        ['SL','Стопы','Stop loss'],
        ['CLOSED','Закрытые','Closed']
      ].map(([key,ru,en])=><button key={key} className={filter===key?'active':''} onClick={()=>setFilter(key as 'ALL'|SignalState)}><span>{ru}</span><small>{en}</small></button>)}
      <div className="signals-side-divider">РЕЖИМ / MODE</div>
      {['ALL','SCALP','NORMAL'].map(x=><button key={x} className={mode===x?'active':''} onClick={()=>setMode(x as 'ALL'|'SCALP'|'NORMAL')}><span>{x==='ALL'?'Все режимы':x}</span><small>{x==='ALL'?'All modes':x==='SCALP'?'Быстрый вход':'Полное подтверждение'}</small></button>)}
    </aside>

    <section className="signals-workspace">
      <header className="signals-title">
        <div><h2>ТОРГОВЫЕ СИГНАЛЫ <small>TRADING SIGNALS</small></h2><p>От WATCH до CLOSED: вся цепочка решения ASCEND Core</p></div>
        <button className="signals-new" onClick={()=>onNavigate('RADAR')}>+ ИЗ РАДАРА <small>FROM RADAR</small></button>
      </header>

      <section className="signals-kpis">
        {[
          ['АКТИВНЫЕ','ACTIVE','18'],
          ['НАБЛЮДЕНИЕ','WATCH','24'],
          ['СМЕНА','SHIFTING','21'],
          ['ПОДТВЕРЖДЕНО','CONFIRMED','16'],
          ['ВХОДЫ СЕГОДНЯ','ENTRIES TODAY','12'],
          ['TP ДОСТИГНУТО','TP HIT','31'],
          ['SL СРАБОТАЛО','SL HIT','8']
        ].map(([ru,en,v])=><div key={ru}><small>{ru}<em>{en}</em></small><b>{v}</b></div>)}
      </section>

      <section className="signals-main">
        <article className="signals-table-card">
          <div className="signals-toolbar">
            <div className="signals-tabs">{['ALL','WATCH','SHIFTING','CONFIRMED','ENTRY','TP','CLOSED'].map(x=><button className={filter===x?'active':''} onClick={()=>setFilter(x as 'ALL'|SignalState)} key={x}>{x}</button>)}</div>
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск сигнала / Search signal…" />
          </div>
          <div className="signals-table-head">
            <span>#</span><span>Монета<br/><small>Symbol</small></span><span>ТФ<br/><small>TF</small></span><span>Сессия<br/><small>Session</small></span><span>Тип<br/><small>Side</small></span><span>Уровень<br/><small>Level</small></span><span>Цена<br/><small>Price</small></span><span>Статус<br/><small>Status</small></span><span>R:R</span><span>Время<br/><small>Time</small></span>
          </div>
          <div className="signals-table-body">
            {filtered.map((s,i)=><button className={'signals-row '+(selected.symbol===s.symbol?'selected':'')} key={s.symbol+s.state} onClick={()=>setSelectedSymbol(s.symbol)}>
              <span>{i+1}</span><b>{s.symbol}</b><span>{s.tf}</span><span>{s.session}</span>
              <span className={s.direction==='LONG'?'positive':'negative'}>{s.direction}</span><span>{s.level}</span><span>{s.price}</span>
              <span><i className={'signal-state '+s.state.toLowerCase()}>{s.state}</i><small>{stateRu[s.state]}</small></span>
              <span>{s.rr}</span><span>{s.time}</span>
            </button>)}
          </div>
        </article>

        <aside className="signal-detail">
          <div className="signal-detail-head"><div><strong>{selected.symbol}</strong><small>{selected.tf} · {selected.session} · {selected.mode}</small></div><i className={'signal-state '+selected.state.toLowerCase()}>{selected.state}</i></div>
          <div className="signal-detail-price"><b>{selected.price}</b><span className={selected.change.startsWith('+')?'positive':'negative'}>{selected.change}</span></div>

          <section>
            <div className="section-title">ЦЕПОЧКА CORE <small>CORE CHAIN</small></div>
            {[
              ['Баланс','Balance',true],
              ['Снятие','Sweep',true],
              ['Возврат','Reclaim',selected.state!=='WATCH'],
              ['CHOCH 10m','CHOCH',selected.state!=='WATCH'],
              ['MSS 5m','MSS',['CONFIRMED','ENTRY','TP','CLOSED'].includes(selected.state)],
              ['Ретест 3m','Retest',['CONFIRMED','ENTRY','TP','CLOSED'].includes(selected.state)],
              ['Micro-BOS 1m','Trigger',['CONFIRMED','ENTRY','TP','CLOSED'].includes(selected.state)],
              ['Подтверждение','Confirmed',['CONFIRMED','ENTRY','TP','CLOSED'].includes(selected.state)]
            ].map(([ru,en,done])=><div className={'signal-chain-step '+(done?'done':'')} key={String(ru)}><span>{done?'✓':'○'}</span><b>{ru}<small>{en}</small></b></div>)}
          </section>

          <section>
            <div className="section-title">ТОРГОВЫЙ ПЛАН <small>TRADE PLAN</small></div>
            <div className="kv"><span>Вход <small>Entry</small></span><b>{selected.entry}</b></div>
            <div className="kv"><span>Структурный SL <small>Structural stop</small></span><b className="negative">{selected.sl}</b></div>
            <div className="kv"><span>TP1</span><b className="positive">{selected.tp1}</b></div>
            <div className="kv"><span>TP2</span><b className="positive">{selected.tp2}</b></div>
            <div className="kv"><span>TP3</span><b className="positive">{selected.tp3}</b></div>
            <div className="kv"><span>Риск/прибыль <small>Risk/Reward</small></span><b>{selected.rr}</b></div>
          </section>

          <section>
            <div className="section-title">МАТЕМАТИКА ВХОДА <small>ENTRY MATH</small></div>
            <div className="signal-math"><span>Использовано диапазона<small>Used Range</small></span><b>{selected.used}%</b></div>
            <div className="signal-math"><span>Потеряно движения<small>Lost Move</small></span><b>{selected.lost}%</b></div>
            <div className="signal-math"><span>Осталось движения<small>Remaining Move</small></span><b>{selected.remaining}%</b></div>
            <div className="signal-math"><span>Потенциал<small>Potential Move</small></span><b>{selected.potential}</b></div>
          </section>

          <div className="signal-actions">
            <button onClick={()=>onNavigate('MARKET')}>ОТКРЫТЬ НА РЫНКЕ<small>OPEN MARKET</small></button>
            <button onClick={()=>onNavigate('RADAR')}>ДОБАВИТЬ В РАДАР<small>PIN TO RADAR</small></button>
            <button className="primary" onClick={()=>onNavigate('TELEGRAM')}>ОТПРАВИТЬ В TG<small>SEND TO TELEGRAM</small></button>
          </div>
        </aside>
      </section>
    </section>
  </main>
}
