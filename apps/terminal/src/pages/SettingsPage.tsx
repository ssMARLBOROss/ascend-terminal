import { useState } from 'react';

type ToggleKey='terminalNotify'|'sound'|'telegramNotify'|'asia'|'london'|'ny'|'showSessions'|'onh'|'rth'|'yhy'|'ibh'|'open'|'englishTerms'|'compactTables';

export default function SettingsPage(){
  const[toggles,setToggles]=useState<Record<ToggleKey,boolean>>({
    terminalNotify:true,sound:true,telegramNotify:true,
    asia:true,london:true,ny:true,showSessions:true,
    onh:true,rth:true,yhy:true,ibh:true,open:true,
    englishTerms:true,compactTables:false
  });
  const[density,setDensity]=useState('Стандартная · Standard');
  const[theme,setTheme]=useState('Тёмная · Dark');
  const[activeSection,setActiveSection]=useState('Основные');
  const[notice,setNotice]=useState('Настройки пока локальные UI · Settings are UI mock');
  const flip=(key:ToggleKey)=>setToggles(v=>({...v,[key]:!v[key]}));

  const Toggle=({k}:{k:ToggleKey})=><button className={'settings-toggle '+(toggles[k]?'on':'')} onClick={()=>flip(k)} aria-pressed={toggles[k]}><i></i></button>;

  return <main className="settings-page">
    <aside className="settings-side">
      <div className="settings-side-title"><strong>НАСТРОЙКИ</strong><small>SETTINGS · TERMINAL & STRATEGY</small></div>
      {[
        ['⌂','Основные','General'],['◈','Торговля','Trading'],['◉','Риск-менеджмент','Risk Management'],['◷','Сессии и время','Sessions & Time'],['≋','Индикаторы','Indicators'],['◎','Радар','Radar'],['♧','Сигналы','Signals'],['♙','TG-Бот','Telegram Bot'],['▣','Мини-приложение','Mini App'],['♧','Уведомления','Notifications'],['▤','Интерфейс','Interface'],['◇','Доступы','Access'],['▦','Данные и API','Data & API'],['▤','Журнал','Logs'],['⬡','Резервные копии','Backups']
      ].map(([icon,ru,en])=><button key={ru} className={activeSection===ru?'active':''} onClick={()=>{setActiveSection(ru);setNotice('Раздел выбран · Selected: '+ru)}}><span>{icon}</span><b>{ru}<small>{en}</small></b></button>)}
    </aside>

    <section className="settings-workspace">
      <header className="settings-title">
        <div><h2>ОСНОВНЫЕ НАСТРОЙКИ <small>GENERAL SETTINGS</small></h2><p>Базовые параметры работы терминала · Basic terminal parameters</p><div className="settings-mock-badge">UI MOCK — значения пока не применяются к реальному Core / бирже</div></div>
      </header>

      <section className="settings-summary">
        <div><small>Статус системы<em>System Status</em></small><b className="positive">● Онлайн</b><span>Online</span></div>
        <div><small>Версия<em>Version</em></small><b>3.5.3</b><span>Production</span></div>
        <div><small>Последнее обновление<em>Last Update</em></small><b>05.10.2026</b><span>15:24</span></div>
        <div><small>Биржа по умолчанию<em>Default Exchange</em></small><b>MEXC</b><button>Изменить · Change</button></div>
        <div><small>Валюта<em>Currency</em></small><select defaultValue="USDT"><option>USDT</option><option>USD</option></select></div>
        <div><small>Язык интерфейса<em>Interface Language</em></small><select defaultValue="ru-en"><option value="ru-en">Русский / English</option><option value="ru">Русский</option><option value="en">English</option></select></div>
        <div><small>Часовой пояс<em>Timezone</em></small><select defaultValue="utc3"><option value="utc3">(UTC+3) Киев</option><option value="utc">UTC</option></select></div>
      </section>

      <section className="settings-grid">
        <article className="settings-card">
          <div className="settings-card-title">ТОРГОВЫЕ ПАРАМЕТРЫ <small>TRADING PARAMETERS</small></div>
          {[
            ['Биржа','Exchange','MEXC'],
            ['Тип торговли','Trade Mode','Фьючерсы · Futures'],
            ['Тип позиции','Position Type','Кросс · Cross'],
            ['Кредитное плечо','Leverage','20x'],
            ['Размер позиции от депозита','Position Size from Deposit','5%'],
            ['Комиссия','Fee','0.05%'],
            ['Проскальзывание','Slippage','0.02%']
          ].map(([ru,en,val])=><label className="settings-field" key={ru}><span>{ru}<small>{en}</small></span><input value={val} readOnly /></label>)}
        </article>

        <article className="settings-card">
          <div className="settings-card-title">СТРАТЕГИЯ ASCEND <small>STRATEGY SETTINGS</small></div>
          {[
            ['Вход по RSI (покупка)','RSI Entry (Long)','30 → 37'],
            ['Вход по RSI (продажа)','RSI Entry (Short)','70 → 63'],
            ['Длина RSI','RSI Length','14'],
            ['Подтверждение MTF','MTF Confirmation','≥ 3 из 4'],
            ['ATR (длина)','ATR Length','14'],
            ['Зона уровня (ATR)','Level Zone (ATR)','0.30'],
            ['Допуск ретеста (ATR)','Retest Tolerance (ATR)','0.25'],
            ['Объём (средняя)','Volume SMA Length','20']
          ].map(([ru,en,val])=><label className="settings-field" key={ru}><span>{ru}<small>{en}</small></span><input value={val} readOnly /></label>)}
          <div className="mtf-row"><span>Таймфреймы для MTF<small>MTF Timeframes</small></span><div>{['1m','3m','5m','15m','1h','4h','1D'].map((x,i)=><button className={i<5?'active':''} key={x}>{x}</button>)}</div></div>
        </article>

        <article className="settings-card">
          <div className="settings-card-title">СЕССИИ И УРОВНИ <small>SESSIONS & LEVELS</small></div>
          <div className="session-setting"><span>Азия <small>Asia · 00:00–08:00</small></span><Toggle k="asia"/></div>
          <div className="session-setting"><span>Лондон <small>London · 07:00–16:00</small></span><Toggle k="london"/></div>
          <div className="session-setting"><span>Нью-Йорк <small>New York · 13:00–22:00</small></span><Toggle k="ny"/></div>
          <div className="session-setting"><span>Показывать сессии на графике <small>Show Sessions on Chart</small></span><Toggle k="showSessions"/></div>
          <div className="settings-subtitle">КЛЮЧЕВЫЕ УРОВНИ <small>KEY LEVELS</small></div>
          {[['ONH / ONL','onh'],['RTH High / RTH Low','rth'],['YH / YL','yhy'],['IBH / IBL','ibh'],['Open','open']].map(([name,key])=><div className="session-setting" key={name}><span>{name}</span><Toggle k={key as ToggleKey}/></div>)}
        </article>

        <article className="settings-card">
          <div className="settings-card-title">УВЕДОМЛЕНИЯ <small>NOTIFICATIONS</small></div>
          <div className="session-setting"><span>Уведомления в терминале <small>Terminal Notifications</small></span><Toggle k="terminalNotify"/></div>
          <div className="session-setting"><span>Звук <small>Sound</small></span><Toggle k="sound"/></div>
          <div className="session-setting"><span>Уведомления в Telegram <small>Telegram Notifications</small></span><Toggle k="telegramNotify"/></div>
          <div className="settings-subtitle">ТИПЫ УВЕДОМЛЕНИЙ <small>NOTIFICATION TYPES</small></div>
          {['Сигналы · Signals','Подтверждения · Confirmations','Снятие уровня · Level Sweep','Изменение тренда · Trend Change','Закрытие сделки · Trade Close','Новости · News'].map(x=><label className="check-row" key={x}><input type="checkbox" defaultChecked/><span>{x}</span></label>)}
        </article>

        <article className="settings-card settings-interface">
          <div className="settings-card-title">ИНТЕРФЕЙС <small>INTERFACE</small></div>
          <div className="theme-row"><span>Тема<small>Theme</small></span>{['Тёмная · Dark','Светлая · Light','Системная · System'].map(x=><button className={theme===x?'active':''} onClick={()=>setTheme(x)} key={x}>{x}</button>)}</div>
          <label className="settings-field"><span>Язык интерфейса<small>Interface Language</small></span><select><option>Русский / English</option></select></label>
          <label className="settings-field"><span>Плотность интерфейса<small>Interface Density</small></span><select value={density} onChange={e=>setDensity(e.target.value)}><option>Стандартная · Standard</option><option>Компактная · Compact</option></select></label>
          <div className="session-setting"><span>Показывать английские термины <small>Show English Terms</small></span><Toggle k="englishTerms"/></div>
          <div className="session-setting"><span>Компактные таблицы <small>Compact Tables</small></span><Toggle k="compactTables"/></div>
        </article>

        <article className="settings-card">
          <div className="settings-card-title">ДАННЫЕ И API <small>DATA & API</small></div>
          <div className="api-row"><span>Публичные данные<small>Public Data</small></span><b>TradingView + Exchange</b></div>
          <div className="api-row"><span>API ключи биржи<small>Exchange API Keys</small></span><button>Настроить · Configure</button></div>
          <div className="api-row"><span>Webhook (сигналы)<small>Webhook (Signals)</small></span><button>Настроить · Configure</button></div>
          <div className="api-row"><span>Webhook (бот)<small>Webhook (Bot)</small></span><button>Настроить · Configure</button></div>
          <label className="settings-field"><span>Обновление данных<small>Data Update Interval</small></span><select><option>1 сек · 1 sec</option></select></label>
        </article>

        <article className="settings-card settings-management">
          <div className="settings-card-title">УПРАВЛЕНИЕ <small>MANAGEMENT</small></div>
          <button className="save-settings" onClick={()=>setNotice("Сохранено локально · Saved locally (MOCK)")}>СОХРАНИТЬ НАСТРОЙКИ <small>SAVE SETTINGS</small></button>
          <button className="reset-settings" onClick={()=>setNotice("Сброс интерфейса · UI reset (MOCK)")}>СБРОСИТЬ К ЗНАЧЕНИЯМ ПО УМОЛЧАНИЮ <small>RESET TO DEFAULTS</small></button>
          <div><button onClick={()=>setNotice("Экспорт подготовлен · Export prepared (MOCK)")}>Экспорт настроек<small>Export Settings</small></button><button onClick={()=>setNotice("Импорт открыт · Import opened (MOCK)")}>Импорт настроек<small>Import Settings</small></button></div>
        </article>
      </section>
      <div className="settings-notice">{notice}</div>
    </section>
  </main>
}
