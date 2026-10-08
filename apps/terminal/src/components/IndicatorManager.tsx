import {useEffect,useRef,useState} from 'react';
import {
  INDICATOR_CATALOG,DEFAULT_INDICATORS,
  type IndicatorSettings,type IndicatorKey
} from '../market/indicatorSettings';

type Props={
  settings:IndicatorSettings;
  onToggle:(key:IndicatorKey)=>void;
  onUpdate:(patch:Partial<IndicatorSettings>)=>void;
  onReset:()=>void;
  onFocus:()=>void;
  fvgVisible:number;
  bookState:string;
};
const GROUPS=['График','Нижние панели','Интерфейс'] as const;

function Eye({enabled}:{enabled:boolean}){
  return <svg viewBox="0 0 24 24" width="17" height="17" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">
    <path d="M2 12s3.8-6.8 10-6.8S22 12 22 12s-3.8 6.8-10 6.8S2 12 2 12Z"/>
    <circle cx="12" cy="12" r="3"/>
    {!enabled&&<path d="M3 3 21 21" strokeWidth="2.1"/>}
  </svg>;
}

export default function IndicatorManager({
  settings,onToggle,onUpdate,onReset,onFocus,fvgVisible,bookState
}:Props){
  const[open,setOpen]=useState(false);
  const[filter,setFilter]=useState('');
  const[expanded,setExpanded]=useState<IndicatorKey|null>('fvg');
  const root=useRef<HTMLDivElement|null>(null);

  useEffect(()=>{
    if(!open)return;
    const close=(event:MouseEvent)=>{
      if(root.current&&!root.current.contains(event.target as Node))setOpen(false);
    };
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape')setOpen(false);
    };
    document.addEventListener('pointerdown',close);
    document.addEventListener('keydown',onKey);
    return()=>{
      document.removeEventListener('pointerdown',close);
      document.removeEventListener('keydown',onKey);
    };
  },[open]);

  const enabled=INDICATOR_CATALOG.filter(x=>settings[x.key]);
  const filtered=INDICATOR_CATALOG.filter(x=>
    (x.name+' '+x.detail).toLocaleLowerCase().includes(filter.trim().toLocaleLowerCase())
  );
  return <div className="asc-indicator-toolbar" ref={root}>
    <div className="asc-indicator-toolbar-main">
      <button type="button" className={'asc-indicator-open'+(open?' selected':'')}
        aria-haspopup="dialog" aria-expanded={open}
        onClick={()=>setOpen(v=>!v)}>
        <span className="asc-indicator-icon">☷</span> Индикаторы
        <span className="asc-indicator-count">{enabled.length}</span>
        <span aria-hidden="true">{open?'▴':'▾'}</span>
      </button>
      <div className="asc-indicator-active-strip" aria-label="Активные индикаторы">
        {enabled.filter(item=>item.group==='График').slice(0,7).map(item=>
          <button key={item.key} type="button" className="asc-indicator-chip"
            title={'Скрыть '+item.name} onClick={()=>onToggle(item.key)}>
            <i style={{background:item.color}}/>
            <span>{item.name}</span>
            <b aria-hidden="true">×</b>
          </button>
        )}
        {enabled.filter(item=>item.group==='График').length>7&&
          <span className="asc-indicator-more">+{enabled.filter(item=>item.group==='График').length-7}</span>}
      </div>
      <button type="button" className="asc-indicator-focus"
        onClick={onFocus} title="Вернуться к последним свечам">⌖ <span>К цене</span></button>
    </div>

    {open&&<section className="asc-indicator-menu" role="dialog"
      aria-modal="false" aria-label="Управление индикаторами ASCEND">
      <header className="asc-indicator-menu-head">
        <div><strong>ИНДИКАТОРЫ</strong><small>Управление отображением, как в TradingView</small></div>
        <button type="button" onClick={()=>setOpen(false)} aria-label="Закрыть меню индикаторов">✕</button>
      </header>
      <div className="asc-indicator-search">
        <span aria-hidden="true">⌕</span>
        <input type="search" value={filter} onChange={e=>setFilter(e.target.value)}
          placeholder="Поиск индикатора…" aria-label="Найти индикатор"/>
      </div>
      <div className="asc-indicator-list">
        {GROUPS.map(group=>{
          const items=filtered.filter(x=>x.group===group);
          if(!items.length)return null;
          return <div className="asc-indicator-group" key={group}>
            <div className="asc-indicator-group-label">{group}</div>
            {items.map(item=><div className="asc-indicator-item" key={item.key}>
              <div className="asc-indicator-item-row">
                <i className="asc-indicator-dot" style={{background:item.color}}/>
                <div className="asc-indicator-item-name">
                  <strong>{item.name}</strong><small>{item.detail}</small>
                </div>
                {item.key==='fvg'&&<button type="button" className="asc-indicator-gear"
                  aria-label="Настройки FVG" aria-expanded={expanded==='fvg'}
                  onClick={()=>setExpanded(v=>v==='fvg'?null:'fvg')}>⚙</button>}
                <button type="button" className={'asc-indicator-eye'+(settings[item.key]?' active':'')}
                  title={(settings[item.key]?'Скрыть ':'Показать ')+item.name}
                  aria-label={(settings[item.key]?'Скрыть ':'Показать ')+item.name}
                  aria-pressed={settings[item.key]} onClick={()=>onToggle(item.key)}>
                  <Eye enabled={settings[item.key]}/>
                </button>
              </div>
              {item.key==='fvg'&&expanded==='fvg'&&<div className="asc-indicator-settings asc-fvg-full-settings">
                <div className="asc-fvg-settings-section">ТАЙМФРЕЙМЫ FVG</div>
                <div className="asc-fvg-tf-grid">
                  {(['1m','3m','5m','15m','30m'] as const).map(tf=>
                    <label key={tf} className="asc-fvg-tf-item">
                      <input type="checkbox" checked={settings.fvgTimeframes[tf]}
                        onChange={e=>onUpdate({fvgTimeframes:{
                          ...settings.fvgTimeframes,[tf]:e.target.checked}})}/>
                      {tf}
                    </label>)}
                </div>
                <div className="asc-fvg-settings-section">НАПРАВЛЕНИЕ И РАСЧЁТ</div>
                {([
                  ['fvgBullish','Бычьи FVG'],
                  ['fvgBearish','Медвежьи FVG'],
                  ['fvgAdaptiveAtr','Показывать размер через ATR'],
                  ['fvgMidline','Линия 50%'],
                  ['fvgShowFill','Глубина заполнения'],
                  ['fvgShowCreated','Время создания'],
                  ['fvgShowRetest','Время первого ретеста'],
                  ['fvgShowHistorical','Исторические зоны'],
                  ['fvgHighlightStructural','Выделение после MSS (при наличии данных)'],
                  ['fvgOnlyActive','Только активные зоны']
                ] as const).map(([key,label])=>
                  <label className="asc-fvg-check" key={key}>
                    <input type="checkbox" checked={settings[key]}
                      onChange={e=>onUpdate({[key]:e.target.checked})}/>
                    <span>{label}</span>
                  </label>)}
                <label>ATR length
                  <select value={settings.fvgAtrLength}
                    onChange={e=>onUpdate({fvgAtrLength:Number(e.target.value)})}>
                    {[7,10,14,20,28].map(v=><option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label>Заполнение
                  <select value={settings.fvgFillMode}
                    onChange={e=>onUpdate({fvgFillMode:e.target.value as 'wick'|'close'})}>
                    <option value="wick">По теням · Wick</option>
                    <option value="close">По закрытиям · Close</option>
                  </select>
                </label>
                <label>Минимальный размер
                  <select value={settings.fvgThreshold}
                    onChange={e=>onUpdate({fvgThreshold:Number(e.target.value)})}>
                    <option value={0}>Любой</option>
                    <option value={.02}>0,02%</option>
                    <option value={.05}>0,05%</option>
                    <option value={.1}>0,10%</option>
                  </select>
                </label>
                <label>Какие зоны показывать
                  <select value={settings.fvgViewMode}
                    onChange={e=>onUpdate({fvgViewMode:e.target.value as 'near'|'all'})}>
                    <option value="near">Ближайшие к цене</option>
                    <option value="all">Последние по времени</option>
                  </select>
                </label>
                <label>Прозрачность · {settings.fvgOpacity}%
                  <input type="range" min="0" max="100" step="5"
                    value={settings.fvgOpacity} onChange={e=>onUpdate({
                      fvgOpacity:Number(e.target.value)})}/>
                </label>
                <label>Максимум зон
                  <select value={settings.fvgMaxZones}
                    onChange={e=>onUpdate({fvgMaxZones:Number(e.target.value)})}>
                    {[2,4,6,8,12,16,24,40].map(v=><option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <small>На графике {fvgVisible} FVG. Структурная подсветка пока неактивна:
                  подтверждения от Structure Engine не подключены к этому экрану.</small>
              </div>}
            </div>)}
          </div>;
        })}
        {!filtered.length&&<div className="asc-indicator-empty">Ничего не найдено</div>}
      </div>
      <footer className="asc-indicator-menu-footer">
        <span>Стакан: {bookState}</span>
        <button type="button" onClick={()=>onUpdate(
          Object.fromEntries(INDICATOR_CATALOG.map(x=>[x.key,false])) as Partial<IndicatorSettings>
        )}>Скрыть все</button>
        <button type="button" onClick={onReset}>По умолчанию</button>
      </footer>
      <div className="asc-indicator-menu-note">
        Индикаторы независимы. Видимость и настройки сохраняются в этом браузере,
        включая переходы между монетами и таймфреймами.
      </div>
    </section>}
  </div>;
}

export {DEFAULT_INDICATORS};
