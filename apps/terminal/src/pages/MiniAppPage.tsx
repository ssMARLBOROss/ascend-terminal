import { useState } from 'react';

type AccessTier='SUBSCRIBER'|'USER'|'PRIVATE';

const signalRows=[
  ['BTCUSDT','15m','LONG','83,650 – 83,820','+2.18%'],
  ['ETHUSDT','15m','SHORT','2,311 – 2,342','+1.64%'],
  ['SOLUSDT','5m','LONG','142.1 – 143.5','+3.12%'],
  ['INJUSDT','30m','LONG','17.20 – 17.65','+2.48%'],
  ['LINKUSDT','15m','SHORT','11.80 – 12.25','+2.06%']
] as const;

const tierFeatures:Record<AccessTier,string[]>={
  SUBSCRIBER:['Состояние рынка · Market state','Ограниченное число сигналов · Limited signals','Базовая статистика · Basic stats'],
  USER:['Все сигналы · All signals','Активные сделки · Active trades','Полная статистика · Full stats','Уведомления · Notifications'],
  PRIVATE:['Все функции · All features','Расширенная аналитика · Advanced analytics','VIP сигналы · VIP signals','Приоритетные уведомления · Priority alerts']
};

export default function MiniAppPage(){
  const[tier,setTier]=useState<AccessTier>('USER');
  const[preview,setPreview]=useState<'HOME'|'SIGNALS'|'DETAIL'>('HOME');
  const[settings,setSettings]=useState({market:true,signals:true,trades:true,stats:true});
  const[device,setDevice]=useState<'MOBILE'|'TABLET'|'DESKTOP'>('MOBILE');
  const[notice,setNotice]=useState('Mini App использует демо-данные · Mini App uses mock data');

  const toggle=(key:keyof typeof settings)=>setSettings(s=>({...s,[key]:!s[key]}));

  return <main className="miniapp-page">
    <aside className="miniapp-side">
      <div className="miniapp-side-title"><strong>МИНИ-ПРИЛОЖЕНИЕ</strong><small>MINI APP · USER PREVIEW & CONTROL</small></div>
      {[
        ['HOME','Главная','Home'],
        ['SIGNALS','Сигналы','Signals'],
        ['DETAIL','Активная сделка','Active Trade'],
        ['HISTORY','История','History'],
        ['NOTIFY','Уведомления','Notifications'],
        ['USERS','Пользователи','Users'],
        ['ACCESS','Доступы','Access'],
        ['SETTINGS','Настройки Mini App','Mini App Settings'],
        ['CONTENT','Контент','Content'],
        ['STATS','Статистика','Statistics'],
        ['TEST','Тестирование','Testing']
      ].map(([key,ru,en],i)=><button key={key} className={preview===key?'active':''} onClick={()=>{if(['HOME','SIGNALS','DETAIL'].includes(key))setPreview(key as 'HOME'|'SIGNALS'|'DETAIL');else setNotice(ru+' · '+en+' — следующий этап / coming next')}}><span>{['⌂','⌁','▥','◷','♧','♙','◇','⚙','▤','▥','⌬'][i]}</span><b>{ru}<small>{en}</small></b></button>)}
    </aside>

    <section className="miniapp-workspace">
      <header className="miniapp-title">
        <div><h2>ПРЕДПРОСМОТР МИНИ-ПРИЛОЖЕНИЯ <small>MINI APP PREVIEW</small></h2><p>Как это видит пользователь в Telegram · How user sees it in Telegram</p></div>
        <div className="device-switch"><button className={device==='MOBILE'?'active':''} onClick={()=>setDevice('MOBILE')}>Телефон<small>Mobile</small></button><button className={device==='TABLET'?'active':''} onClick={()=>{setDevice('TABLET');setNotice("Планшетный preview · Tablet preview (MOCK)")}}>Планшет<small>Tablet</small></button><button className={device==='DESKTOP'?'active':''} onClick={()=>{setDevice('DESKTOP');setNotice("Desktop preview · MOCK")}}>Десктоп<small>Desktop</small></button></div>
      </header>

      <section className="miniapp-main">
        <div className={"phone-stage device-"+device.toLowerCase()}>
          <div className="phone-shell">
            <div className="phone-notch"></div>
            <div className="phone-screen">
              <div className="phone-top"><b>9:41</b><span>●●● ᯤ</span></div>
              <div className="phone-brand"><span>A</span><div><strong>ASCEND</strong><small>Trading Signals</small></div><button onClick={()=>setNotice("Настройки профиля · Profile settings (MOCK)")}>⚙</button></div>

              {preview==='HOME'&&<>
                <div className="phone-tabs"><button className="active">Рынок<small>Market</small></button><button onClick={()=>setPreview('SIGNALS')}>Сигналы<small>Signals</small></button><button onClick={()=>setNotice("Мои сделки · My Trades — MOCK")}>Мои сделки<small>My Trades</small></button></div>
                <div className="phone-card market-state">
                  <div className="phone-card-head"><b>Текущее состояние рынка<small>Market State</small></b><span className="long-chip">LONG</span></div>
                  <strong>63%</strong>
                  <div className="market-meter"><i></i></div>
                  <div className="meter-labels"><span>37% SHORT</span><span>НЕЙТРАЛЬНО · NEUTRAL</span></div>
                </div>
                <div className="coin-strip"><div><b>BTC</b><span>+1.24%</span></div><div><b>ETH</b><span>+0.86%</span></div><div><b>SOL</b><span>+1.92%</span></div></div>
                <div className="phone-card active-signal">
                  <div className="phone-card-head"><b>Активный сигнал<small>Active Signal</small></b><span className="new-chip">НОВЫЙ · NEW</span></div>
                  <div className="coin-title"><span>₿</span><b>BTCUSDT</b><em>LONG</em></div>
                  <div className="trade-row"><span>Вход<small>Entry</small><b>83,650 – 83,820</b></span><span>Текущая цена<small>Current price</small><b>83,812 <i>+0.42%</i></b></span></div>
                  <div className="targets"><span><small>TP1</small><b>84,420</b></span><span><small>TP2</small><b>84,980</b></span><span><small>TP3</small><b>85,640</b></span><span><small>SL</small><b className="negative">83,320</b></span></div>
                  <button className="open-signal" onClick={()=>setPreview('DETAIL')}>ОТКРЫТЬ СИГНАЛ<small>Open Signal</small></button>
                </div>
              </>}

              {preview==='SIGNALS'&&<>
                <div className="phone-filter-row">{['Все','Лонг','Шорт','Скальп','Нормал'].map((x,i)=><button className={i===0?'active':''} key={x}>{x}<small>{['All','Long','Short','Scalp','Normal'][i]}</small></button>)}</div>
                <div className="phone-signal-list">{signalRows.map((r,i)=><button key={r[0]} onClick={()=>{if(i===0)setPreview('DETAIL')}}>
                  <div className="signal-icon">{['₿','◆','●','◉','⬡'][i]}</div>
                  <div><b>{r[0]}</b><small>{r[1]} · {i%2===0?'LONG':'SHORT'}</small><span>{r[3]}</span></div>
                  <div><small>{['15:24','14:58','14:33','13:41','12:18'][i]}</small><strong>{r[4]}</strong></div>
                </button>)}</div>
              </>}

              {preview==='DETAIL'&&<>
                <div className="signal-detail-phone-head"><button onClick={()=>setPreview('SIGNALS')}>‹</button><div><b>BTCUSDT</b><small>15m · New York</small></div><span>LONG</span></div>
                <div className="detail-price-phone"><b>83,812</b><span>+0.42%</span></div>
                <div className="mini-chart">
                  <div className="chart-line l1"></div><div className="chart-line l2"></div><div className="chart-line l3"></div><div className="chart-line sl"></div>
                  <svg viewBox="0 0 300 160" preserveAspectRatio="none"><polyline points="5,135 25,118 45,126 65,92 85,103 105,74 125,85 145,60 165,72 185,44 205,55 225,34 245,47 265,25 295,38" fill="none" stroke="#39d6f1" strokeWidth="3"/></svg>
                  <span className="tag tp3">TP3 85,640</span><span className="tag tp2">TP2 84,980</span><span className="tag tp1">TP1 84,420</span><span className="tag entry">ВХОД · ENTRY</span><span className="tag stop">SL 83,320</span>
                </div>
                <div className="detail-metrics">
                  <div><span>Зона входа<small>Entry Zone</small></span><b>83,650 – 83,820</b></div>
                  <div><span>R:R</span><b>1:2.8</b></div>
                  <div><span>Стоп-лосс<small>Stop Loss</small></span><b className="negative">83,320 (-0.59%)</b></div>
                  <div><span>Сессия<small>Session</small></span><b>New York</b></div>
                  <div><span>TP1</span><b className="positive">84,420 (+0.72%)</b></div>
                  <div><span>Уровень<small>Level</small></span><b>ONH</b></div>
                  <div><span>TP2</span><b className="positive">84,980 (+1.39%)</b></div>
                  <div><span>Статус<small>Status</small></span><b className="positive">Подтверждено · Confirmed</b></div>
                  <div><span>TP3</span><b className="positive">85,640 (+2.18%)</b></div>
                  <div><span>Время<small>Time</small></span><b>15:24</b></div>
                </div>
                <button className="copy-signal">КОПИРОВАТЬ СИГНАЛ<small>Copy Signal</small></button>
              </>}

              <div className="phone-bottom">
                <button className={preview==='HOME'?'active':''} onClick={()=>setPreview('HOME')}><span>⌂</span><small>Главная<br/>Home</small></button>
                <button className={preview==='SIGNALS'?'active':''} onClick={()=>setPreview('SIGNALS')}><span>⌁</span><small>Сигналы<br/>Signals</small></button>
                <button onClick={()=>setNotice("Сделки · Trades — MOCK")}><span>▣</span><small>Сделки<br/>Trades</small></button>
                <button onClick={()=>setNotice("Профиль · Profile — MOCK")}><span>♙</span><small>Профиль<br/>Profile</small></button>
              </div>
            </div>
          </div>
        </div>

        <aside className="miniapp-control">
          <section className="mini-control-card">
            <div className="mini-control-title">УПРАВЛЕНИЕ ДОСТУПОМ <small>ACCESS MANAGEMENT</small></div>
            <div className="access-tiers">
              {([
                ['SUBSCRIBER','Подписчик','Subscriber'],
                ['USER','Пользователь','User'],
                ['PRIVATE','Личный доступ','Private']
              ] as const).map(([key,ru,en])=><button key={key} className={tier===key?'active '+key.toLowerCase():''} onClick={()=>setTier(key)}><span>{key==='SUBSCRIBER'?'♙':key==='USER'?'♕':'◆'}</span><b>{ru}<small>{en}</small></b></button>)}
            </div>
            <div className="tier-features">{tierFeatures[tier].map(x=><div key={x}>✓ {x}</div>)}</div>
          </section>

          <section className="mini-control-card">
            <div className="mini-control-title">НАСТРОЙКИ МИНИ-ПРИЛОЖЕНИЯ <small>MINI APP SETTINGS</small></div>
            {[
              ['market','Показывать состояние рынка','Show market state'],
              ['signals','Показывать активные сигналы','Show active signals'],
              ['trades','Показывать мои сделки','Show my trades'],
              ['stats','Показывать статистику','Show statistics']
            ].map(([key,ru,en])=><button className="mini-toggle-row" key={key} onClick={()=>toggle(key as keyof typeof settings)}><span>○</span><b>{ru}<small>{en}</small></b><i className={settings[key as keyof typeof settings]?'on':''}></i></button>)}
          </section>

          <section className="mini-control-card">
            <div className="mini-control-title">СТАТУС МИНИ-ПРИЛОЖЕНИЯ <small>MINI APP STATUS</small></div>
            <div className="mini-stat"><span>●</span><b>MOCK ONLINE<small>Demo status</small></b><em>UI preview</em></div>
            <div className="mini-stat"><span>♙</span><b>Пользователей<small>Users</small></b><strong>1,482</strong></div>
            <div className="mini-stat"><span>◉</span><b>Активных сейчас<small>Online now</small></b><strong>237</strong></div>
            <div className="mini-stat"><span>▥</span><b>Всего сигналов 24ч<small>Total signals (24h)</small></b><strong>64</strong></div>
            <div className="mini-stat"><span>◷</span><b>Среднее время реакции<small>Average response time</small></b><strong>1.2с</strong></div>
          </section>

          <section className="mini-control-card">
            <div className="mini-control-title">ССЫЛКА НА МИНИ-ПРИЛОЖЕНИЕ <small>MINI APP LINK</small></div>
            <div className="mini-link"><code>https://t.me/ascend_bot/app</code><button onClick={()=>setNotice("Ссылка скопирована · Link copied (MOCK)")}>⧉</button></div>
            <div className="mini-link-actions"><button className="open-tg" onClick={()=>setNotice("Открытие Telegram · Open Telegram (MOCK)")}>➤ Открыть в Telegram<small>Open in Telegram</small></button><div className="qr-placeholder"><span>▦</span><small>QR</small></div></div>
          </section>
        </aside>
      </section>

      <section className="access-preview">
        <div className="access-preview-title">ПРЕДПРОСМОТР ПО ТИПУ ДОСТУПА <small>USER VIEW BY ACCESS TYPE</small></div>
        {([
          ['SUBSCRIBER','Подписчик','Subscriber'],
          ['USER','Пользователь','User'],
          ['PRIVATE','Личный доступ','Private']
        ] as const).map(([key,ru,en])=><button key={key} onClick={()=>setTier(key)} className={'access-card '+key.toLowerCase()+(tier===key?' active':'')}>
          <div className="mini-phone-thumb"><span>A</span><i></i><i></i><i></i></div>
          <div><strong>{ru}<small>{en}</small></strong>{tierFeatures[key].map(x=><p key={x}>✓ {x}</p>)}</div>
        </button>)}
      </section>
      <div className="miniapp-notice">{notice}</div>
    </section>
  </main>
}
