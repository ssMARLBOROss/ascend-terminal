import { useState } from 'react';

type ServiceStatus='ONLINE'|'WARN';
const services=[
 ['Web-приложение','Web App','3.5.3','3д 14ч','12%','34%','ONLINE'],
 ['API сервер','API Server','3.5.3','3д 14ч','18%','42%','ONLINE'],
 ['База данных','PostgreSQL','15.6','3д 14ч','22%','38%','ONLINE'],
 ['Redis','Redis Cache','7.2','3д 14ч','8%','18%','ONLINE'],
 ['Telegram Bot','Telegram Bot','3.5.3','3д 14ч','10%','24%','ONLINE'],
 ['Mini App','Mini App','3.5.3','3д 14ч','14%','29%','ONLINE'],
 ['Сигналы','Signals Engine','3.5.3','3д 14ч','26%','41%','ONLINE'],
 ['Радар','Radar Scanner','3.5.3','3д 14ч','32%','46%','ONLINE'],
 ['Аналитика','Analytics','3.5.3','3д 14ч','16%','35%','ONLINE'],
 ['Фоновые задачи','Background Jobs','3.5.3','3д 14ч','6%','14%','ONLINE']
] as const;

const logs=[
 ['15:24:36','API','INFO','GET /api/signals · 200'],
 ['15:24:32','Bot','INFO','Сигнал отправлен · BTCUSDT'],
 ['15:24:28','Radar','INFO','Скан завершён · 412 symbols'],
 ['15:24:21','Web','INFO','Вход пользователя · user 1482'],
 ['15:24:18','Signals','INFO','Новый сигнал · ETHUSDT LONG'],
 ['15:24:14','DB','INFO','Резервная копия завершена'],
 ['15:24:10','Analytics','INFO','Данные сессии обновлены'],
 ['15:24:07','Mini App','INFO','Пользователь открыл Mini App'],
 ['15:24:02','API','WARN','Rate limit · 85%'],
 ['15:23:58','Radar','INFO','Volume scan completed'],
 ['15:23:54','Signals','INFO','Signal validated · SOLUSDT'],
 ['15:23:49','Bot','INFO','Telegram notification sent']
] as const;

export default function DevPage(){
 const[notice,setNotice]=useState('Все действия здесь MOCK · All actions are mock');
 const[activeSection,setActiveSection]=useState('Статус системы');
 const mockAction=(label:string)=>{setNotice(label+' · MOCK OK');window.setTimeout(()=>setNotice('Все действия здесь MOCK · All actions are mock'),1800)};

 return <main className="dev-page">
  <aside className="dev-side">
   <div className="dev-side-title"><strong>РАЗРАБОТКА</strong><small>DEV / INFRASTRUCTURE</small><p>Разработка, инфраструктура и управление системой · System engineering & operations</p></div>
   {[
    ['⌂','Статус системы','System Status'],['⚙','Сервисы','Services'],['↻','Деплой','Deploy'],['▤','Логи','Logs'],['◉','Базы данных','Database'],['◇','API и Webhooks','API & Webhooks'],['⇄','Очереди','Queues'],['◷','Мониторинг','Monitoring'],['▦','Тестирование','Testing'],['⬡','Резервные копии','Backups'],['▤','Управление версиями','Versions'],['♙','Пользователи','Users'],['▣','Документация','Documentation']
   ].map(([icon,ru,en])=><button key={ru} className={activeSection===ru?'active':''} onClick={()=>{setActiveSection(ru);mockAction('Раздел выбран · '+ru)}}><span>{icon}</span><b>{ru}<small>{en}</small></b></button>)}
  </aside>

  <section className="dev-workspace">
   <header className="dev-title">
    <div><h2>ИНФРАСТРУКТУРА · DEV <small>INFRASTRUCTURE</small></h2><p>Статус сервисов, деплой, логи, мониторинг и управление системой · System status, deploy, logs and management</p><div className="dev-mock-badge">ДЕМО-ДАННЫЕ · MOCK DATA — реальные сервисы пока не управляются</div></div>
    <div className="dev-title-actions"><button onClick={()=>mockAction("Открыть PROD · Open Production")}>Открыть PROD<small>Open Production · MOCK</small></button><button onClick={()=>mockAction("Открыть DEV · Open Development")}>Открыть DEV<small>Open Development · MOCK</small></button><button onClick={()=>mockAction("Репозиторий · Repository")}>Репозиторий<small>Repository · MOCK</small></button></div>
   </header>

   <section className="dev-kpis">
    <div><small>Статус системы<em>System status</em></small><b className="warning">● MOCK ONLINE</b><span>Демо-статус · Demo status</span></div>
    <div><small>Текущая версия<em>Current version</em></small><b>3.5.3</b><span>Production</span></div>
    <div><small>Последний деплой<em>Last deploy</em></small><b>05.10.2026 15:24</b><span>Успешно · Success</span></div>
    <div><small>Аптайм 24ч<em>Uptime (24h)</em></small><b className="positive">99.9%</b><span>stable</span></div>
    <div><small>Среднее время ответа<em>Average response time</em></small><b>242 мс</b><span>avg latency</span></div>
    <div><small>Активные сервисы<em>Active services</em></small><b>12</b><span>all systems</span></div>
   </section>

   <section className="dev-main-grid">
    <article className="dev-card services-card">
     <div className="dev-card-title">СЕРВИСЫ СИСТЕМЫ <small>SYSTEM SERVICES</small></div>
     <div className="services-head"><span>Сервис<small>Service</small></span><span>Статус<small>Status</small></span><span>Версия<small>Version</small></span><span>Аптайм<small>Uptime</small></span><span>CPU</span><span>Память<small>Memory</small></span></div>
     {services.map(([ru,en,version,uptime,cpu,mem,status])=><div className="service-row" key={en}><span><b>{ru}</b><small>{en}</small></span><span className={status==='ONLINE'?'positive':'warning'}>● {status==='ONLINE'?'MOCK ONLINE':'Внимание · Warn'}</span><span>{version}</span><span>{uptime}</span><span><i className="usage-bar"><em style={{width:cpu}}></em></i>{cpu}</span><span><i className="usage-bar blue"><em style={{width:mem}}></em></i>{mem}</span></div>)}
    </article>

    <article className="dev-card logs-card">
     <div className="dev-card-title">ПОСЛЕДНИЕ ЛОГИ <small>RECENT LOGS</small></div>
     <div className="log-filters"><select><option>Все сервисы · All services</option></select><select><option>Последние 100 · Last 100</option></select><button onClick={()=>mockAction('Логи обновлены · Logs refreshed')}>↻</button></div>
     <div className="logs-head"><span>Время<small>Time</small></span><span>Сервис<small>Service</small></span><span>Уровень<small>Level</small></span><span>Сообщение<small>Message</small></span></div>
     <div className="logs-body">{logs.map(([time,service,level,msg])=><div className="log-row" key={time+service}><span>{time}</span><span>{service}</span><span className={level==='WARN'?'warning':'positive'}>● {level}</span><span>{msg}</span></div>)}</div>
    </article>

    <article className="dev-card deploy-card">
     <div className="dev-card-title">ДЕПЛОЙ И ВЕРСИИ <small>DEPLOY & VERSIONS</small></div>
     <div className="deploy-info"><span>Текущая версия<small>Current version</small></span><b>3.5.3</b><i>PRODUCTION</i></div>
     <div className="env-tabs"><button className="active" onClick={()=>mockAction("Production environment")}>Production</button><button onClick={()=>mockAction("Staging environment")}>Staging</button><button onClick={()=>mockAction("Development environment")}>Development</button></div>
     <div className="deploy-info"><span>Последний деплой<small>Last deploy</small></span><b>05.10.2026 15:24</b><i className="positive">✓ Успешно · Success</i></div>
     <div className="deploy-actions"><button className="primary" onClick={()=>mockAction('Новый деплой · New Deploy')}>▶ Новый деплой<small>New Deploy</small></button><button onClick={()=>mockAction('Откат версии · Rollback')}>↶ Откатить версию<small>Rollback</small></button></div>
    </article>

    <article className="dev-card resources-card">
     <div className="dev-card-title">РЕСУРСЫ СЕРВЕРА <small>SERVER RESOURCES</small></div>
     <div className="resource-rings">
      <div className="resource-ring cpu"><b>24%</b><small>CPU</small></div><div className="resource-ring memory"><b>42%</b><small>Память<br/>Memory</small></div><div className="resource-ring disk"><b>38%</b><small>Диск<br/>Disk</small></div>
     </div>
     <div className="network-row"><span>Сеть (вход)<small>Network In</small><b>12.4 MB/s</b></span><span>Сеть (выход)<small>Network Out</small><b>8.7 MB/s</b></span></div>
    </article>

    <article className="dev-card management-card">
     <div className="dev-card-title">УПРАВЛЕНИЕ СИСТЕМОЙ <small>SYSTEM MANAGEMENT</small></div>
     <div className="management-actions">{[
      ['↻','Перезапустить API','Restart API'],['⌫','Очистить кэш','Clear Cache'],['↻','Обновить Scanner','Update Scanner'],['◉','Проверить БД','Check DB'],['▤','Очистить логи','Clear Logs'],['➤','Тест Telegram','Test Telegram'],['▣','Тест Mini App','Test Mini App'],['⌁','Проверить сигналы','Check Signals'],['▤','Системный отчёт','System Report']
     ].map(([icon,ru,en])=><button key={ru} onClick={()=>mockAction(ru)}><span>{icon}</span><b>{ru}<small>{en}</small></b></button>)}</div>
    </article>
   </section>

   <div className="dev-notice">{notice}</div>
  </section>
 </main>
}
