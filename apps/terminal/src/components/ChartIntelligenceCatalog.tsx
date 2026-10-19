import type {IndicatorKey,IndicatorSettings} from '../market/indicatorSettings';

type IntelligenceItem={
  id:string;title:string;detail:string;
  layer?:IndicatorKey; layerNote?:string;
};
type IntelligenceGroup={title:string;items:readonly IntelligenceItem[]};

/** Read-only catalog of research subjects, inside the EXISTING chart indicator menu.
 * A switch delegates only to the pre-existing indicator visibility flag.
 * An unimplemented data source never becomes a fake live signal.
 */
export const CHART_INTELLIGENCE_GROUPS:readonly IntelligenceGroup[]=[
  {title:'01 · РЫНОК',items:[
    {id:'global',title:'Глобальный рынок',detail:'BTC · ETH · SOL, глобальное направление, согласованность рынков'},
    {id:'breadth',title:'Широта и доминирование',detail:'TOTAL / TOTAL2 / TOTAL3 · BTC.D / ETH.D / USDT.D'},
    {id:'relative',title:'Относительная сила и настроение',detail:'BTC / ETH · Fear & Greed · кросс-рыночное расхождение'},
    {id:'radar',title:'Умный радар монет',detail:'Торговые пары и зоны интереса. Полнота покрытия зависит от источника.',layer:'coins',layerNote:'Панель монет'}
  ]},
  {title:'02 · ГРАФИК И СЕССИИ',items:[
    {id:'structure',title:'Структура рынка',detail:'HH / HL / LH / LL · BOS / CHOCH — существующая структура графика'},
    {id:'session',title:'Сессии и принятие цены',detail:'Азия · Лондон · Нью-Йорк, диапазоны H/L. Acceptance отдельно не подтверждён.',layer:'sessions',layerNote:'Карта сессий'},
    {id:'profile',title:'Профиль объёма и TPO',detail:'POC · VAH / VAL. Доступен существующий TPO; Volume Profile требует отдельной проверки.',layer:'tpo',layerNote:'TPO'},
    {id:'footprint',title:'Футпринт / дельта по ценам',detail:'Исполнения внутри свечи; полного исторического tick-by-price потока нет'},
    {id:'vwap',title:'VWAP, ATR и RSI',detail:'VWAP доступен на графике; RSI в нижней панели, ATR проверяется отдельно',layer:'vwap',layerNote:'VWAP'}
  ]},
  {title:'03 · ПОТОК И ЛИКВИДНОСТЬ',items:[
    {id:'cvd',title:'Дельта / CVD',detail:'Bybit publicTrade: только непрерывный участок, не полная реконструкция',layer:'cvd',layerNote:'Панель CVD'},
    {id:'book',title:'Стакан и глубина',detail:'Лимитные BID / ASK, видимая ликвидность, возможные снятия заявок',layer:'book',layerNote:'Order Book'},
    {id:'absorption',title:'Поглощение и крупные сделки',detail:'Absorption, крупный поток, эффективность исполнения; проверенный детектор отсутствует'},
    {id:'liquidations',title:'Ликвидации',detail:'Сторона принудительно закрытых позиций; полный исторический ряд не подтверждён'}
  ]},
  {title:'04 · ПОЗИЦИИ',items:[
    {id:'oi',title:'Открытый интерес / Funding',detail:'В терминале есть OI; фандинг и межбиржевой Basis не равны этому ряду',layer:'oi',layerNote:'Открытый интерес'},
    {id:'cot',title:'Крупные участники и COT',detail:'CME · фонды · управляющие · дилеры. Недельные данные с задержкой'}
  ]},
  {title:'05 · КАПИТАЛ',items:[
    {id:'onchain',title:'Ончейн и биржевые переводы',detail:'Кошельки, крупные переводы, MVRV; нужен проверенный поставщик'},
    {id:'stablecoins',title:'Стейблкоины',detail:'USDT / USDC · предложение · отклонение от привязки'},
    {id:'defi',title:'DeFi / DEX',detail:'TVL · DEX-объёмы · доходы протоколов'}
  ]},
  {title:'06 · РИСК И ИССЛЕДОВАНИЯ',items:[
    {id:'macro',title:'Макро и календарь',detail:'Ставки, события, режим глобального риска; не сигнал входа'},
    {id:'lab',title:'Волатильность / Research Lab',detail:'ATR, диапазон, риск сделки, журнал и тесты; не меняет торговое ядро'}
  ]}
];
export const CHART_INTELLIGENCE_COUNT=CHART_INTELLIGENCE_GROUPS.reduce((sum,g)=>sum+g.items.length,0);

type Props={
  settings:IndicatorSettings;
  onToggle:(key:IndicatorKey)=>void;
  filter:string;
};

export default function ChartIntelligenceCatalog({settings,onToggle,filter}:Props){
  const q=filter.trim().toLocaleLowerCase();
  const groups=CHART_INTELLIGENCE_GROUPS.map(group=>({
    ...group,
    items:group.items.filter(item=>
      (item.title+' '+item.detail+' '+group.title).toLocaleLowerCase().includes(q))
  })).filter(group=>group.items.length);
  return <div className="asc-indicator-list" aria-label="Контекст рынка внутри графика">
    <div style={{margin:'7px 9px 12px',padding:'10px',border:'1px solid #33556a',
      borderRadius:8,background:'#081e2c',color:'#b9d4e3',fontSize:11,lineHeight:1.45}}>
      <strong style={{color:'#dceff7'}}>20 направлений аналитики</strong>
      <div>Открываются внутри этого меню графика. Доступные слои можно включить.
        Новые источники без подтверждённых данных отмечены отдельно.</div>
      <small style={{display:'block',marginTop:5,color:'#dfc38f'}}>
        Только наблюдение — не меняет Structure Engine, ENTRY READY, сделки и риск.</small>
    </div>
    {groups.map(group=><div className="asc-indicator-group" key={group.title}>
      <div className="asc-indicator-group-label">{group.title}</div>
      {group.items.map(item=><div className="asc-indicator-item" key={item.id}>
        <div className="asc-indicator-item-row">
          <i className="asc-indicator-dot"
            style={{background:item.layer?'#4bb49b':'#6b7e8c'}}/>
          <div className="asc-indicator-item-name">
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
            <small style={{marginTop:3,color:item.layer?'#9fd4c4':'#d7b679'}}>
              {item.layer?'Доступный слой: '+(item.layerNote||item.title)+
                (settings[item.layer]?' · ПОКАЗАН':' · СКРЫТ'):
                'ИССЛЕДОВАНИЕ · НЕТ ПОДКЛЮЧЁННОГО РЯДА'}
            </small>
          </div>
          {item.layer&&<button type="button"
            className={'asc-indicator-eye'+(settings[item.layer]?' active':'')}
            aria-label={(settings[item.layer]?'Скрыть ':'Показать ')+(item.layerNote||item.title)}
            aria-pressed={settings[item.layer]}
            title={(settings[item.layer]?'Скрыть ':'Показать ')+(item.layerNote||item.title)}
            onClick={()=>onToggle(item.layer!)}>
            <span aria-hidden="true" style={{fontSize:14}}>{settings[item.layer]?'◉':'○'}</span>
          </button>}
        </div>
      </div>)}
    </div>)}
    {!groups.length&&<div className="asc-indicator-empty">По запросу ничего не найдено</div>}
  </div>;
}
