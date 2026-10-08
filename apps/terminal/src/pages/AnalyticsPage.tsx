const sessionBars = [
  { label: 'Asia', value: 312, pct: 58 },
  { label: 'London', value: 524, pct: 92 },
  { label: 'New York', value: 412, pct: 73 }
];

const levelRows = [
  ['ONH / ONL', 74.3],
  ['YH / YL', 68.2],
  ['RTH H / L', 71.5],
  ['IBH / IBL', 64.8],
  ['VWAP', 69.1],
  ['RC30 / RC70', 66.4],
  ['BALANCE', 62.3]
] as const;

const tfRows = [
  ['1m', 62.1],
  ['3m', 66.8],
  ['5m', 69.4],
  ['10m', 68.7],
  ['15m', 67.2],
  ['30m', 63.5],
  ['1h+', 58.4]
] as const;

const coins = [
  ['BTC', 28, '75.0%', '+328.40'],
  ['ETH', 24, '70.8%', '+264.12'],
  ['SOL', 22, '68.2%', '+212.45'],
  ['INJ', 18, '72.2%', '+184.33'],
  ['LINK', 16, '68.8%', '+152.67']
] as const;

const filterRows = [
  'Все монеты · All coins',
  'Все сессии · All sessions',
  'SCALP + NORMAL',
  'Все уровни · All levels'
];

export default function AnalyticsPage(){
  return <div className="analytics-layout">
    <aside className="analytics-sidebar">
      <div className="analytics-sidebar-title">
        <strong>АНАЛИТИКА · ANALYTICS</strong>
        <small>РЕЗУЛЬТАТЫ · RESULTS · СТАТИСТИКА · STATISTICS · ЭФФЕКТИВНОСТЬ · EFFICIENCY</small>
      </div>

      <div className="analytics-menu">
        {['Общая статистика · Overview','Сессии · Sessions','Сетапы · Setups','Монеты · Coins','Лонг / Шорт · Long / Short','SCALP / NORMAL','Уровни ликвидности · Liquidity Levels','Временные интервалы · Timeframes','Сравнение периодов · Period Compare','Журнал сделок · Trade Journal','Экспорт данных · Export'].map((item,index)=>
          <button className={index===0?'active':''} key={item}><span>{index+1}</span>{item}</button>
        )}
      </div>

      <div className="analytics-filter-card">
        <div className="analytics-filter-title">ПЕРИОД АНАЛИЗА · ANALYSIS PERIOD</div>
        <div className="period-row">
          {['1D','7D','30D','90D'].map(v=><button className={v==='7D'?'active':''} key={v}>{v}</button>)}
        </div>
        <label>С<input value="28.09.2026" readOnly /></label>
        <label>По<input value="05.10.2026" readOnly /></label>
        <div className="analytics-filter-title secondary">ФИЛЬТРЫ · FILTERS</div>
        {filterRows.map(v=><button className="filter-select" key={v}>{v}<span>⌄</span></button>)}
        <button className="apply-filter">ПРИМЕНИТЬ · APPLY</button>
      </div>
    </aside>

    <main className="analytics-page">
      <section className="analytics-kpis">
        <div className="kpi-card"><small>Всего сделок · Total trades</small><b>242</b><span className="positive">↗ +12.3%</span></div>
        <div className="kpi-card"><small>Процент побед · Win Rate</small><b>68.6%</b><span className="positive">↗ +6.2%</span></div>
        <div className="kpi-card wide"><small>Общий результат · Total result</small><b className="positive">+1,248.67 <em>USDT</em></b><span className="positive">↗ +18.4%</span></div>
        <div className="kpi-card"><small>Средний R:R · Avg R:R</small><b>1:3.2</b><span className="positive">↗ +0.6</span></div>
        <div className="kpi-card"><small>Фактор прибыли · Profit Factor</small><b>2.48</b><span className="positive">стабильно</span></div>
        <div className="kpi-card danger"><small>Макс. просадка · Max Drawdown</small><b>-12.3%</b><span>контроль риска · risk control</span></div>
      </section>

      <section className="analytics-main-grid">
        <article className="analytics-card equity-card">
          <div className="analytics-card-head">
            <div><strong>КРИВАЯ КАПИТАЛА · EQUITY CURVE</strong><small>MOCK · 7 ДНЕЙ / DAYS</small></div>
            <div className="segmented"><button className="active">Общая · Overall</button><button>По сессиям · Sessions</button><button>По сетапам · Setups</button><button>По монетам · Coins</button></div>
          </div>
          <div className="equity-chart">
            <div className="equity-value">05.10.2026<br/><b>1,248.67 USDT</b></div>
            <svg viewBox="0 0 1000 280" preserveAspectRatio="none" aria-label="Mock equity curve">
              <defs>
                <linearGradient id="equityFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#22d6a0" stopOpacity=".34"/>
                  <stop offset="100%" stopColor="#22d6a0" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d="M0 238 L35 250 L75 225 L112 205 L155 188 L198 158 L242 184 L286 170 L330 196 L374 188 L420 150 L462 167 L508 135 L552 112 L598 139 L640 116 L688 126 L736 86 L780 102 L826 68 L870 92 L916 88 L956 55 L1000 22 L1000 280 L0 280 Z" fill="url(#equityFill)"/>
              <polyline points="0,238 35,250 75,225 112,205 155,188 198,158 242,184 286,170 330,196 374,188 420,150 462,167 508,135 552,112 598,139 640,116 688,126 736,86 780,102 826,68 870,92 916,88 956,55 1000,22" fill="none" stroke="#21d6a0" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
            </svg>
            <div className="chart-axis"><span>28.09</span><span>29.09</span><span>30.09</span><span>01.10</span><span>02.10</span><span>03.10</span><span>04.10</span><span>05.10</span></div>
          </div>
        </article>

        <article className="analytics-card results-card">
          <div className="analytics-card-head"><div><strong>РАСПРЕДЕЛЕНИЕ РЕЗУЛЬТАТОВ · RESULT DISTRIBUTION</strong><small>242 сделки</small></div></div>
          <div className="result-donut">
            <div className="donut"><div><b>242</b><small>СДЕЛКИ · TRADES</small></div></div>
            <div className="result-legend">
              <div><span className="dot green"></span><p>Профит · Profit (TP1/2/3)</p><b>166 · 68.6%</b></div>
              <div><span className="dot red"></span><p>Убыток · Loss (SL)</p><b>62 · 25.6%</b></div>
              <div><span className="dot gray"></span><p>Безубыток · Breakeven (BE)</p><b>14 · 5.8%</b></div>
            </div>
          </div>
          <div className="setup-compare">
            <div className="analytics-filter-title">SCALP / NORMAL</div>
            <div className="setup-row"><b>SCALP</b><span>138 сделок</span><strong>71.0%</strong><em>R:R 1:2.4</em><i>+624.32</i></div>
            <div className="setup-row"><b>NORMAL</b><span>104 сделки</span><strong>65.4%</strong><em>R:R 1:4.1</em><i>+624.35</i></div>
          </div>
        </article>

        <article className="analytics-card sessions-card">
          <div className="analytics-card-head"><div><strong>РЕЗУЛЬТАТЫ ПО СЕССИЯМ · SESSION RESULTS</strong><small>PNL</small></div></div>
          <div className="session-bars">
            {sessionBars.map(row=><div className="session-bar" key={row.label}>
              <b className="positive">+{row.value}.18</b>
              <div><span style={{height:row.pct+'%'}}></span></div>
              <small>{row.label}</small>
            </div>)}
          </div>
        </article>

        <article className="analytics-card side-card">
          <div className="analytics-card-head"><div><strong>ЛОНГ / ШОРТ · LONG / SHORT</strong><small>242 сделки</small></div></div>
          <div className="longshort-ring"><div><b>54.5%</b><small>LONG</small></div></div>
          <div className="longshort-values"><span><i className="green-box"></i>LONG <b>132</b></span><span><i className="red-box"></i>SHORT <b>110</b></span></div>
        </article>

        <article className="analytics-card coins-card">
          <div className="analytics-card-head"><div><strong>ЛУЧШИЕ МОНЕТЫ · TOP COINS</strong><small>PNL / MOCK</small></div></div>
          <div className="coin-table">
            <div className="table-head"><span>#</span><span>Монета</span><span>Сделки · Trades</span><span>Процент побед · Win Rate</span><span>Результат · Result</span></div>
            {coins.map((row,index)=><div className="table-row" key={row[0]}><span>{index+1}</span><b>{row[0]}</b><span>{row[1]}</span><span className="positive">{row[2]}</span><span className="positive">{row[3]}</span></div>)}
          </div>
        </article>

        <article className="analytics-card efficiency-card">
          <div className="analytics-card-head"><div><strong>ЭФФЕКТИВНОСТЬ ПО УРОВНЯМ · LEVEL EFFICIENCY</strong><small>ПРОЦЕНТ ПОБЕД · WIN RATE</small></div></div>
          <div className="efficiency-list">
            {levelRows.map(([label,value])=><div className="efficiency-row" key={label}><span>{label}</span><div><i style={{width:value+'%'}}></i></div><b>{value}%</b></div>)}
          </div>
        </article>

        <article className="analytics-card efficiency-card">
          <div className="analytics-card-head"><div><strong>ВРЕМЕННЫЕ ИНТЕРВАЛЫ · TIMEFRAMES</strong><small>ПРОЦЕНТ ПОБЕД · WIN RATE</small></div></div>
          <div className="efficiency-list">
            {tfRows.map(([label,value])=><div className="efficiency-row" key={label}><span>{label}</span><div><i style={{width:value+'%'}}></i></div><b>{value}%</b></div>)}
          </div>
        </article>

        <article className="analytics-card compare-card">
          <div className="analytics-card-head"><div><strong>СРАВНЕНИЕ ПЕРИОДОВ · PERIOD COMPARISON</strong><small>прошлая vs текущая неделя · previous vs current week</small></div></div>
          <div className="compare-table">
            <div><span>Сделки · Trades</span><b>198</b><b>242</b><strong className="positive">+22.2%</strong></div>
            <div><span>Процент побед · Win Rate</span><b>61.6%</b><b>68.6%</b><strong className="positive">+7.0%</strong></div>
            <div><span>R:R</span><b>1:2.1</b><b>1:3.2</b><strong className="positive">+1.1</strong></div>
            <div><span>Результат · Result</span><b>+524.18</b><b>+1,248.67</b><strong className="positive">+138%</strong></div>
            <div><span>Макс. DD · Max DD</span><b>-18.6%</b><b>-12.3%</b><strong className="positive">лучше</strong></div>
          </div>
        </article>
      </section>
    </main>
  </div>
}
