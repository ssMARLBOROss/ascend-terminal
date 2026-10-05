type TelegramPageProps={onNavigate:(view:string)=>void};

const signals=[
 ['WATCH','BTCUSDT','LONG','15m','72%','US','Наблюдение'],
 ['CONFIRMED','ETHUSDT','LONG','1h','68%','ASIA','Подтвержден'],
 ['ENTRY','SOLUSDT','SHORT','5m','61%','US','Вход выполнен'],
 ['TP/SL','LINKUSDT','LONG','30m','76%','EU','TP2 достигнут'],
 ['CLOSED','AVAXUSDT','LONG','1h','64%','ASIA','Закрыт +8.4%']
];

const lifecycle=[
 ['WATCH','Наблюдение'],
 ['CONFIRMED','Подтверждено'],
 ['ENTRY','Вход'],
 ['TP1','Тейк 1'],
 ['TP2','Тейк 2'],
 ['TP3','Тейк 3'],
 ['CLOSED','Закрыто']
];

export default function TelegramPage({onNavigate}:TelegramPageProps){
 return <main className="tg-page">
  <aside className="tg-sidebar">
   <div className="tg-side-title"><span>➤</span><div><strong>TG-БОТ</strong><small>ОПЕРАЦИОННЫЙ ЦЕНТР · OPERATIONS CENTER</small></div></div>
   {[
    ['Активные сигналы','Active signals'],['Очередь','Queue'],['Каналы','Channels'],['Шаблоны','Templates'],['Пользователи','Users'],['Доступы','Access'],['История','History']
   ].map(([ru,en],i)=><button className={i===0?'active':''} key={ru}><span>{['◉','☷','➤','▤','♙','▣','◷'][i]}</span><b>{ru}<small>{en}</small></b></button>)}
  </aside>

  <section className="tg-workspace">
   <div className="tg-title"><div><h2>TG-БОТ / ОПЕРАЦИОННЫЙ ЦЕНТР <small>OPERATIONS CENTER</small></h2><p>Управление сигналами, публикациями и взаимодействием · Signal publishing & Telegram operations</p></div><div className="tg-steps"><span className="done">1 Подготовка <small>Prepare</small></span><i>→</i><span className="done">2 Проверка <small>Review</small></span><i>→</i><span className="active">3 Отправка <small>Send</small></span><i>→</i><span>4 Завершено <small>Done</small></span></div></div>

   <div className="tg-grid">
    <article className="tg-panel signals-panel">
     <div className="tg-panel-head"><strong>АКТИВНЫЕ СИГНАЛЫ <small>ACTIVE SIGNALS</small> <b>(5)</b></strong><button>Сначала новые · Newest⌄</button></div>
     <div className="tg-tabs">{['ВСЕ · ALL 5','WATCH 1','CONFIRMED 1','ENTRY 1','TP/SL 1','CLOSED 1'].map((x,i)=><button className={i===0?'active':''} key={x}>{x}</button>)}</div>
     <div className="tg-signals">{signals.map(row=><button className={'tg-signal '+row[0].toLowerCase().replace('/','-')} key={row[1]}>
       <div className="tg-signal-top"><span>{row[0]}</span><small>15:22</small></div>
       <div className="tg-symbol"><b>{row[1]}</b><strong className={row[2]==='LONG'?'positive':'negative'}>{row[2]==='LONG'?'↗':'↘'} {row[2]}</strong></div>
       <div className="tg-signal-meta"><span>ТФ<small>TF</small><b>{row[3]}</b></span><span>Вероятность<small>Probability</small><b className="positive">{row[4]}</b></span><span>Сессия<small>Session</small><b>{row[5]}</b></span><span>Статус<small>Status</small><b>{row[6]}</b></span></div>
     </button>)}</div>
    </article>

    <article className="tg-panel queue-panel">
     <div className="tg-panel-head"><strong>ОЧЕРЕДЬ ПУБЛИКАЦИЙ <small>PUBLISH QUEUE</small> <b>(4)</b></strong><button className="positive">⟳ Авто · Auto: ВКЛ / ON</button></div>
     <div className="queue-table">
      <div className="queue-head"><span>#</span><span>Сигнал<small>Signal</small></span><span>Каналы<small>Channels</small></span><span>Статус<small>Status</small></span><span>Время<small>Time</small></span></div>
      {[
       ['001','BTCUSDT ↗ LONG','PUBLIC +1','Ожидает · Waiting','15:24'],
       ['002','ETHUSDT ↗ LONG','PRIVATE','Ожидает · Waiting','15:25'],
       ['003','SOLUSDT ↘ SHORT','PUBLIC','Отправлен · Sent','15:18'],
       ['004','LINKUSDT ↗ LONG','PRIVATE','Черновик · Draft','--:--']
      ].map((r,i)=><button className={'queue-row '+(i===0?'selected':'')} key={r[0]}>{r.map((v,j)=><span key={j}>{v}</span>)}</button>)}
     </div>

     <div className="template-head"><strong>ШАБЛОН СООБЩЕНИЯ <small>MESSAGE TEMPLATE</small></strong><button>Стандартный · Standard v2⌄</button><button>⚙ Настроить · Configure</button></div>
     <div className="message-preview-grid">
      <div className="message-preview"><div className="preview-brand"><b>ASCEND Signals</b><small>Публичный канал · Public channel</small></div><h3>#BTCUSDT <span className="positive">↗ LONG</span></h3><p>Вход · Entry: <b>83,950 – 84,200</b></p><p>TP1: <b className="positive">84,420 (+0.55%)</b></p><p>TP2: <b className="positive">84,690 (+1.34%)</b></p><p>TP3: <b className="positive">85,640 (+2.01%)</b></p><p>Стоп · Stop: <b className="negative">82,910 (-1.24%)</b></p><small>ТФ / TF: 15m · Сессия / Session: US · Вероятность / Probability: 72%</small></div>
      <div className="signal-life"><strong>ЖИЗНЕННЫЙ ЦИКЛ <small>SIGNAL LIFECYCLE</small></strong>{lifecycle.map(([en,ru],i)=><div className={i<3?'done':''} key={en}><span>{i+1}</span><b>{ru}<small>{en}</small></b><small>{i<3?['15:10','15:14','15:17'][i]:'Ожидает · Waiting'}</small></div>)}</div>
     </div>
    </article>

    <aside className="tg-right">
     <article className="tg-panel">
      <div className="tg-panel-head"><strong>СТАТУС БОТА <small>BOT STATUS / CONTROL CENTER</small></strong></div>
      {[
       ['Telegram Bot','Подключен · Connected','@AscendSignalsBot'],
       ['Публичный канал · Public','Активен · Active','@ascend_signals'],
       ['Приватный канал · Private','Активен · Active','@ascend_private'],
       ['Mini App','Доступен · Available','open']
      ].map(r=><button className="bot-status" key={r[0]} onClick={()=>r[0]==='Mini App'&&onNavigate('MINIAPP')}><span>●</span><b>{r[0]}</b><strong>{r[1]}</strong><small>{r[2]}</small></button>)}
      <div className="bot-stat"><span>Состояние очереди <small>Queue status</small></span><b className="positive">Работает · Running</b><small>2 в очереди</small></div>
      <div className="bot-stat"><span>Отправлено сегодня <small>Sent today</small></span><b>48</b><small className="positive">+12%</small></div>
      <div className="bot-stat"><span>Ошибок сегодня <small>Errors today</small></span><b className="negative">2</b><small>-67%</small></div>
     </article>

     <article className="tg-panel actions">
      <div className="tg-panel-head"><strong>ДЕЙСТВИЯ <small>ACTIONS</small></strong></div>
      <button className="send-public">➤ Отправить в паблик<small>Send public</small></button><button className="send-private">➤ Отправить в приват<small>Send private</small></button><button onClick={()=>onNavigate('MINIAPP')}>▦ Открыть Mini App<small>Open Mini App</small></button><button className="pause">Ⅱ Пауза очереди<small>Pause queue</small></button><button>⚗ Тест сообщения<small>Test message</small></button>
     </article>

     <article className="tg-panel button-states"><div className="tg-panel-head"><strong>СОСТОЯНИЯ КНОПОК <small>BUTTON STATES</small></strong></div><div><button>Стандарт<small>Default</small></button><button className="hover-demo">Наведение<small>Hover</small></button><button className="pressed">Нажатие<small>Pressed</small></button><button disabled>Отключена<small>Disabled</small></button><button className="loading">◌ Загрузка...<small>Loading</small></button><button className="success">✓ Успех<small>Success</small></button></div></article>
    </aside>
   </div>
  </section>
 </main>
}
