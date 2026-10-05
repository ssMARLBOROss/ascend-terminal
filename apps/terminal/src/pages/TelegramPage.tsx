type TelegramPageProps={onNavigate:(view:string)=>void};

const signals=[
 ['WATCH','BTCUSDT','LONG','15m','72%','US','Наблюдение'],
 ['CONFIRMED','ETHUSDT','LONG','1h','68%','ASIA','Подтвержден'],
 ['ENTRY','SOLUSDT','SHORT','5m','61%','US','Вход выполнен'],
 ['TP/SL','LINKUSDT','LONG','30m','76%','EU','TP2 достигнут'],
 ['CLOSED','AVAXUSDT','LONG','1h','64%','ASIA','Закрыт +8.4%']
];

export default function TelegramPage({onNavigate}:TelegramPageProps){
 return <main className="tg-page">
  <aside className="tg-sidebar">
   <div className="tg-side-title"><span>➤</span><div><strong>TG-БОТ</strong><small>ОПЕРАЦИОННЫЙ ЦЕНТР</small></div></div>
   {['Активные сигналы','Очередь','Каналы','Шаблоны','Пользователи','Доступы','История'].map((x,i)=><button className={i===0?'active':''} key={x}><span>{['◉','☷','➤','▤','♙','▣','◷'][i]}</span>{x}</button>)}
  </aside>

  <section className="tg-workspace">
   <div className="tg-title"><div><h2>TG-БОТ / ОПЕРАЦИОННЫЙ ЦЕНТР</h2><p>Управление сигналами, публикациями и взаимодействием в Telegram</p></div><div className="tg-steps"><span className="done">1 Подготовка</span><i>→</i><span className="done">2 Проверка</span><i>→</i><span className="active">3 Отправка</span><i>→</i><span>4 Завершено</span></div></div>

   <div className="tg-grid">
    <article className="tg-panel signals-panel">
     <div className="tg-panel-head"><strong>АКТИВНЫЕ СИГНАЛЫ <b>(5)</b></strong><button>Сначала новые⌄</button></div>
     <div className="tg-tabs">{['ВСЕ 5','WATCH 1','CONFIRMED 1','ENTRY 1','TP/SL 1','CLOSED 1'].map((x,i)=><button className={i===0?'active':''} key={x}>{x}</button>)}</div>
     <div className="tg-signals">{signals.map(row=><button className={'tg-signal '+row[0].toLowerCase().replace('/','-')} key={row[1]}>
       <div className="tg-signal-top"><span>{row[0]}</span><small>15:22</small></div>
       <div className="tg-symbol"><b>{row[1]}</b><strong className={row[2]==='LONG'?'positive':'negative'}>{row[2]==='LONG'?'↗':'↘'} {row[2]}</strong></div>
       <div className="tg-signal-meta"><span>ТФ<b>{row[3]}</b></span><span>Вероятность<b className="positive">{row[4]}</b></span><span>Сессия<b>{row[5]}</b></span><span>Статус<b>{row[6]}</b></span></div>
     </button>)}</div>
    </article>

    <article className="tg-panel queue-panel">
     <div className="tg-panel-head"><strong>ОЧЕРЕДЬ ПУБЛИКАЦИЙ <b>(4)</b></strong><button className="positive">⟳ Авто: ВКЛ</button></div>
     <div className="queue-table">
      <div className="queue-head"><span>#</span><span>Сигнал</span><span>Каналы</span><span>Статус</span><span>Время</span></div>
      {[
       ['001','BTCUSDT ↗ LONG','PUBLIC +1','Ожидает','15:24'],
       ['002','ETHUSDT ↗ LONG','PRIVATE','Ожидает','15:25'],
       ['003','SOLUSDT ↘ SHORT','PUBLIC','Отправлен','15:18'],
       ['004','LINKUSDT ↗ LONG','PRIVATE','Черновик','--:--']
      ].map((r,i)=><button className={'queue-row '+(i===0?'selected':'')} key={r[0]}>{r.map((v,j)=><span key={j}>{v}</span>)}</button>)}
     </div>
     <div className="template-head"><strong>ШАБЛОН СООБЩЕНИЯ</strong><button>Стандартный v2⌄</button><button>⚙ Настроить</button></div>
     <div className="message-preview-grid">
      <div className="message-preview"><div className="preview-brand"><b>ASCEND Signals</b><small>Публичный канал</small></div><h3>#BTCUSDT <span className="positive">↗ LONG</span></h3><p>Вход: <b>83,950 – 84,200</b></p><p>TP1: <b className="positive">84,420 (+0.55%)</b></p><p>TP2: <b className="positive">84,690 (+1.34%)</b></p><p>TP3: <b className="positive">85,640 (+2.01%)</b></p><p>Стоп: <b className="negative">82,910 (-1.24%)</b></p><small>ТФ: 15m · Сессия: US · Вероятность: 72%</small></div>
      <div className="signal-life"><strong>ЖИЗНЕННЫЙ ЦИКЛ СИГНАЛА</strong>{['WATCH','CONFIRMED','ENTRY','TP1','TP2','TP3','CLOSED'].map((x,i)=><div className={i<3?'done':''} key={x}><span>{i+1}</span><b>{x}</b><small>{i<3?['15:10','15:14','15:17'][i]:'Ожидает'}</small></div>)}</div>
     </div>
    </article>

    <aside className="tg-right">
     <article className="tg-panel">
      <div className="tg-panel-head"><strong>СТАТУС БОТА / КОНТРОЛЬНЫЙ ЦЕНТР</strong></div>
      {[
       ['Telegram Bot','Подключен','@AscendSignalsBot'],
       ['Публичный канал','Активен','@ascend_signals'],
       ['Приватный канал','Активен','@ascend_private'],
       ['Mini App','Доступен','open']
      ].map(r=><button className="bot-status" key={r[0]} onClick={()=>r[0]==='Mini App'&&onNavigate('MINIAPP')}><span>●</span><b>{r[0]}</b><strong>{r[1]}</strong><small>{r[2]}</small></button>)}
      <div className="bot-stat"><span>Состояние очереди</span><b className="positive">Работает</b><small>2 в очереди</small></div>
      <div className="bot-stat"><span>Отправлено сегодня</span><b>48</b><small className="positive">+12%</small></div>
      <div className="bot-stat"><span>Ошибок сегодня</span><b className="negative">2</b><small>-67%</small></div>
     </article>
     <article className="tg-panel actions">
      <div className="tg-panel-head"><strong>ДЕЙСТВИЯ</strong></div>
      <button className="send-public">➤ Отправить в паблик</button><button className="send-private">➤ Отправить в приват</button><button onClick={()=>onNavigate('MINIAPP')}>▦ Открыть Mini App</button><button className="pause">Ⅱ Пауза очереди</button><button>⚗ Тест сообщения</button>
     </article>
     <article className="tg-panel button-states"><div className="tg-panel-head"><strong>СОСТОЯНИЯ КНОПОК</strong></div><div><button>Стандарт</button><button className="hover-demo">Наведение</button><button className="pressed">Нажатие</button><button disabled>Отключена</button><button className="loading">◌ Загрузка...</button><button className="success">✓ Успех</button></div></article>
    </aside>
   </div>
  </section>
 </main>
}
