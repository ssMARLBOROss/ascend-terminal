import type {FvgViewMode} from '../components/fvgOverlay';

export type IndicatorKey=
  'volume'|'vwap'|'sessions'|'sessionClock'|'dayLevels'|'sessionLevels'|
  'book'|'stops'|'tpo'|'fvg'|'oi'|'longShort'|'cvd'|'week'|'stats'|'coins';

export type IndicatorSettings=Record<IndicatorKey,boolean>&{
  fvgThreshold:number;
  fvgViewMode:FvgViewMode;
};
export const STORAGE_KEY='ascend.terminal.indicators.v1';

export const DEFAULT_INDICATORS:IndicatorSettings={
  volume:true,vwap:true,sessions:true,sessionClock:false,
  dayLevels:true,sessionLevels:false,book:false,stops:false,
  tpo:true,fvg:true,oi:true,longShort:true,cvd:true,
  week:false,stats:true,coins:true,
  fvgThreshold:.02,fvgViewMode:'near'
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
  {key:'dayLevels',name:'YH / YL',detail:'Максимум и минимум вчера',group:'График',color:'#8bd5a2'},
  {key:'sessionLevels',name:'Session H / L',detail:'Уровни предыдущих сессий',group:'График',color:'#d08795'},
  {key:'sessions',name:'Session Map',detail:'Зоны и границы сессий',group:'График',color:'#95abe0'},
  {key:'oi',name:'Open Interest · OI',detail:'Динамика открытых позиций',group:'Нижние панели',color:'#55bfdc'},
  {key:'longShort',name:'Net Long / Short',detail:'Доля аккаунтов Long и Short',group:'Нижние панели',color:'#ad99ed'},
  {key:'cvd',name:'CVD · Trade Delta',detail:'Поток последних сделок',group:'Нижние панели',color:'#e8b76e'},
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
    return clean;
  }catch{return {...DEFAULT_INDICATORS}}
}
