import type {FvgViewMode} from '../components/fvgOverlay';
import type {FvgTf,FillMode} from './fvgContextEngine';
import type {CvdInterval} from './cvdEngine';
import type {ChartViewMode} from '../components/chartViewport';

export type IndicatorKey=
  'volume'|'vwap'|'sessions'|'sessionClock'|'dayLevels'|'sessionLevels'|
  'book'|'stops'|'liquidityMap'|'tpo'|'fvg'|'oi'|'longShort'|'cvd'|'participation'|'week'|'stats'|'coins';

export type IndicatorSettings=Record<IndicatorKey,boolean>&{
  fvgThreshold:number;
  fvgViewMode:FvgViewMode;
  fvgTimeframes:Record<FvgTf,boolean>;
  fvgBullish:boolean;fvgBearish:boolean;
  fvgAdaptiveAtr:boolean;fvgAtrLength:number;fvgMidline:boolean;
  fvgShowFill:boolean;fvgShowCreated:boolean;fvgShowRetest:boolean;
  fvgShowHistorical:boolean;fvgHighlightStructural:boolean;
  fvgOnlyActive:boolean;fvgFillMode:FillMode;fvgOpacity:number;
  fvgMaxZones:number;
  cvdInterval:CvdInterval;
  chartViewMode:ChartViewMode;
};
export const STORAGE_KEY='ascend.terminal.indicators.v1';

export const DEFAULT_INDICATORS:IndicatorSettings={
  volume:true,vwap:true,sessions:true,sessionClock:false,
  dayLevels:true,sessionLevels:false,book:false,stops:false,liquidityMap:true,
  tpo:true,fvg:true,oi:true,longShort:true,cvd:true,participation:true,
  week:false,stats:true,coins:true,
  fvgThreshold:.02,fvgViewMode:'near',
  fvgTimeframes:{'1m':false,'3m':true,'5m':true,'15m':true,'30m':false},
  fvgBullish:true,fvgBearish:true,fvgAdaptiveAtr:true,
  fvgAtrLength:14,fvgMidline:true,fvgShowFill:true,
  fvgShowCreated:true,fvgShowRetest:true,fvgShowHistorical:false,
  fvgHighlightStructural:true,fvgOnlyActive:true,fvgFillMode:'wick',
  fvgOpacity:42,fvgMaxZones:8,cvdInterval:'5m',chartViewMode:'TIGHT'
};

export type IndicatorDefinition={
  key:IndicatorKey;name:string;detail:string;group:'График'|'Нижние панели'|'Интерфейс';
  color:string
};
export const INDICATOR_CATALOG:IndicatorDefinition[]=[
  {key:'volume',name:'Volume',detail:'Объёмы под свечами',group:'График',color:'#52bba0'},
  {key:'vwap',name:'VWAP · UTC',detail:'Средневзвешенная цена',group:'График',color:'#edcf69'},
  {key:'fvg',name:'Fair Value Gap · FVG',detail:'Имбалансы и заполнение зон',group:'График',color:'#51d4a4'},
  {key:'tpo',name:'TPO · POC / VAH / VAL',detail:'Профиль ценового баланса',group:'График',color:'#c59beb'},
  {key:'book',name:'Order Book · BID / ASK',detail:'Текущие кластеры стакана',group:'График',color:'#64d9ba'},
  {key:'stops',name:'STOP? · зоны ликвидности',detail:'Оценочные зоны стопов',group:'График',color:'#d9a772'},
  {key:'liquidityMap',name:'Liquidity Map · BSL / SSL',detail:'Уровни YH/YL, ONH/ONL, RTH и IB · sweep/reclaim',group:'График',color:'#e6aa86'},
  {key:'dayLevels',name:'YH / YL',detail:'Максимум и минимум вчера',group:'График',color:'#8bd5a2'},
  {key:'sessionLevels',name:'Session H / L',detail:'Уровни предыдущих сессий',group:'График',color:'#d08795'},
  {key:'sessions',name:'Session Map',detail:'Зоны и границы сессий',group:'График',color:'#95abe0'},
  {key:'oi',name:'Open Interest · OI',detail:'Динамика открытых позиций',group:'Нижние панели',color:'#55bfdc'},
  {key:'longShort',name:'Net Long / Short',detail:'Доля аккаунтов Long и Short',group:'Нижние панели',color:'#ad99ed'},
  {key:'cvd',name:'CVD · Executed Trades',detail:'Накопительная дельта Bybit publicTrade',group:'Нижние панели',color:'#e8b76e'},
  {key:'participation',name:'Market Participation V1',detail:'Контекст участников · панель справа',group:'Нижние панели',color:'#65c8d7'},
  {key:'week',name:'7 дней × 7 дней',detail:'Сопоставление двух недель',group:'Нижние панели',color:'#70cedc'},
  {key:'stats',name:'OHLCV · сводка',detail:'Цены и объём над графиком',group:'Интерфейс',color:'#9cc7d6'},
  {key:'sessionClock',name:'Session Clock',detail:'Большая панель часов сессий',group:'Интерфейс',color:'#a4b3ef'},
  {key:'coins',name:'Панель монет',detail:'Список торговых пар слева',group:'Интерфейс',color:'#aec6d6'}
];

export function loadIndicatorSettings():IndicatorSettings{
  try{
    const raw=window.localStorage.getItem(STORAGE_KEY);
    if(!raw)return {...DEFAULT_INDICATORS};
    const parsed=JSON.parse(raw) as Record<string,unknown>;
    const clean={...DEFAULT_INDICATORS};
    for(const item of INDICATOR_CATALOG){
      if(typeof parsed[item.key]==='boolean')clean[item.key]=parsed[item.key] as boolean;
    }
    if([0,.02,.05,.1].includes(Number(parsed.fvgThreshold)))
      clean.fvgThreshold=Number(parsed.fvgThreshold);
    if(parsed.fvgViewMode==='near'||parsed.fvgViewMode==='all')
      clean.fvgViewMode=parsed.fvgViewMode;
    const boolSettings=[
      'fvgBullish','fvgBearish','fvgAdaptiveAtr','fvgMidline','fvgShowFill',
      'fvgShowCreated','fvgShowRetest','fvgShowHistorical',
      'fvgHighlightStructural','fvgOnlyActive'
    ] as const;
    for(const key of boolSettings)
      if(typeof parsed[key]==='boolean')clean[key]=parsed[key] as boolean;
    if(typeof parsed.fvgTimeframes==='object'&&parsed.fvgTimeframes){
      const tf=parsed.fvgTimeframes as Record<string,unknown>;
      for(const key of ['1m','3m','5m','15m','30m'] as const)
        if(typeof tf[key]==='boolean')clean.fvgTimeframes[key]=tf[key] as boolean;
    }
    if(parsed.chartViewMode==='TIGHT'||parsed.chartViewMode==='FULL')
      clean.chartViewMode=parsed.chartViewMode;
    if(parsed.cvdInterval==='1m'||parsed.cvdInterval==='5m'||parsed.cvdInterval==='15m')
      clean.cvdInterval=parsed.cvdInterval;
    if(parsed.fvgFillMode==='wick'||parsed.fvgFillMode==='close')
      clean.fvgFillMode=parsed.fvgFillMode;
    if(Number.isInteger(parsed.fvgAtrLength)&&Number(parsed.fvgAtrLength)>=2&&
      Number(parsed.fvgAtrLength)<=100)clean.fvgAtrLength=Number(parsed.fvgAtrLength);
    if(Number.isInteger(parsed.fvgMaxZones)&&Number(parsed.fvgMaxZones)>=2&&
      Number(parsed.fvgMaxZones)<=40)clean.fvgMaxZones=Number(parsed.fvgMaxZones);
    if(typeof parsed.fvgOpacity==='number'&&
      parsed.fvgOpacity>=0&&parsed.fvgOpacity<=100)clean.fvgOpacity=parsed.fvgOpacity;
    return clean;
  }catch{return {...DEFAULT_INDICATORS}}
}
