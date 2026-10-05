type OverviewPageProps = { onNavigate: (view:string)=>void };

const leftStats = [
  ['Market cap','$8.47B','+2.39%'],
  ['BTC dominance','54.3%','+1.2%'],
  ['Open interest','1.62B','+1.87%'],
  ['Global P&L','+11.23%','2.14 R:R']
];

export default function OverviewPage({onNavigate}:OverviewPageProps){
  const nodes=[
    ['АНАЛИТИКА','ДАННЫХ','ANALYTICS'],
    ['ПРОГНОЗНЫЙ','ИНТЕЛЛЕКТ','RADAR'],
    ['СТРАТЕГИЯ','ВХОДА','SIGNALS'],
    ['РИСК-','МЕНЕДЖМЕНТ','MARKET'],
    ['TG-БОТ / MINI','APP','TELEGRAM'],
    ['НАСТРОЙКИ /','ДОСТУПЫ','SETTINGS']
  ];
  return <main className="overview-page">
    <section className="overview-left">
      <article className="overview-card">
        <div className="ov-head"><strong>MARKET ОБЗОР</strong><span>⋮</span></div>
        <b className="ov-big">$ 8.47B</b><em className="positive">+2.35%</em><small>за 24 часа</small>
        <svg className="ov-spark" viewBox="0 0 220 70"><polyline points="0,58 20,46 38,53 58,32 80,38 101,22 126,30 148,20 173,42 195,48 220,25" fill="none" stroke="#27d8f6" strokeWidth="3"/></svg>
        {leftStats.slice(1).map(([a,b,c])=><div className="ov-row" key={a}><span>{a}</span><b>{b}</b><em className="positive">{c}</em></div>)}
      </article>
      <article className="overview-card">
        <div className="ov-head"><strong>РАСПРЕДЕЛЕНИЕ СЕТАПОВ</strong><span>⋮</span></div>
        <div className="ov-donut-wrap"><div className="ov-donut"><b>37</b><small>НАБЛЮДЕНИЙ</small></div>
        <div className="ov-legend"><span>RC30 LONG <b>29%</b></span><span>RC70 SHORT <b>18%</b></span><span>SHIFTING <b>10%</b></span><span>CONFIRMED <b>43%</b></span></div></div>
      </article>
      <article className="overview-card">
        <div className="ov-head"><strong>ЭФФЕКТИВНОСТЬ СЕССИЙ</strong><span>⋮</span></div>
        <svg className="ov-line" viewBox="0 0 260 100"><polyline points="0,84 38,60 70,40 105,55 140,66 177,50 212,18 260,8" fill="none" stroke="#26d9f7" strokeWidth="3"/><polyline points="0,92 38,82 70,70 105,74 140,72 177,63 212,48 260,40" fill="none" stroke="#ff8b31" strokeWidth="2"/></svg>
        <div className="ov-foot"><span>ХОД, %<b className="positive">+11.23%</b></span><span>СРЕДНИЙ R:R<b>2.14</b></span></div>
      </article>
    </section>

    <section className="overview-center">
      <div className="overview-title"><h1>ASCEND AI ОРКЕСТРАТОР</h1><p>ТЕРМИНАЛ УПРАВЛЕНИЯ: РЫНОК, TG-БОТ, MINI APP, НАСТРОЙКИ.</p></div>
      <div className="orchestrator">
        <div className="orbit orbit-one"></div><div className="orbit orbit-two"></div><div className="orbit orbit-three"></div>
        <button className="ai-core" onClick={()=>onNavigate('MARKET')}><span>AI</span><small>ЯДРО ASCEND</small></button>
        {nodes.map(([a,b,v],i)=><button key={v} className={'orbit-node node-'+(i+1)} onClick={()=>onNavigate(v)}><span>{i%2===0?'▥':'◇'}</span><b>{a}<br/>{b}</b></button>)}
        <div className="system-protected"><span>СТАТУС СИСТЕМЫ</span><b>ЗАЩИЩЕНО</b></div>
      </div>
      <div className="overview-quick">
        <button onClick={()=>onNavigate('MARKET')}><span>◇</span><b>ИНТЕГРАЦИИ ДАННЫХ</b><small>Рыночные потоки и уровни</small></button>
        <button onClick={()=>onNavigate('ANALYTICS')}><span>✣</span><b>ДНЕВНИК СТРУКТУРЫ</b><small>Сделки и аналитика</small></button>
        <button onClick={()=>onNavigate('RADAR')}><span>◉</span><b>КАРТА СЕССИЙ</b><small>Активность и переходы</small></button>
        <button onClick={()=>onNavigate('TELEGRAM')}><span>⌁</span><b>ПОДКЛЮЧЕНИЯ API</b><small>TG / Mini App</small></button>
        <button onClick={()=>onNavigate('DEV')}><span>⬡</span><b>DEV / ИНФРАСТРУКТУРА</b><small>Логи и статусы</small></button>
      </div>
    </section>

    <section className="overview-right">
      <article className="overview-card risk-card">
        <div className="ov-head"><strong>РИСК / ROUTE АНАЛИТИКА</strong><span>⋮</span></div>
        <div className="risk-gauge"><div><b>37</b><small>MODERATE RISK</small></div></div>
        <div className="ov-row"><span>Value at Risk</span><b>0.38%</b></div><div className="ov-row"><span>Potential Move</span><b>0.96%</b></div><div className="ov-row"><span>Средний R:R</span><b>2.4 / 1</b></div>
      </article>
      <article className="overview-card">
        <div className="ov-head"><strong>ЛЕНТА РЕШЕНИЙ ASCEND</strong><span>⋮</span></div>
        {[
          ['W','НАБЛЮДЕНИЕ','подход к зоне','WATCH'],
          ['S','SWEEP','снята верхняя ликвидность','MARKET'],
          ['R','RECLAIM','возврат ниже ONH','MARKET'],
          ['N','ДАЛЬШЕ','ждём MSS на 5m','MARKET']
        ].map(([icon,a,b,v])=><button className="decision-feed-row" key={a} onClick={()=>onNavigate(v)}><i>{icon}</i><span><b>{a}</b><small>{b}</small></span><em>›</em></button>)}
      </article>
      <article className="overview-card">
        <div className="ov-head"><strong>УВЕДОМЛЕНИЯ / TG / MINI APP</strong><span>⋮</span></div>
        {['Монета вошла в зону','Риск-оценка пересчитана','Проверка уровня завершена','Новая структура','Mini App доступ обновлён'].map((x,i)=><button className="notice-row" key={x} onClick={()=>onNavigate(i===4?'MINIAPP':'TELEGRAM')}><span>▲</span><b>{x}</b><small>09:{27-i} AM</small></button>)}
      </article>
    </section>
  </main>
}
