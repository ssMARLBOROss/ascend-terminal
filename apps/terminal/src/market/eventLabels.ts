import type {AscendEvent} from '@ascend/contracts';

function payloadString(event:AscendEvent,key:string){
  const value=event.payload?.[key];
  return typeof value==='string'?value:undefined;
}

export function eventLevelId(event:AscendEvent){
  const payloadId=payloadString(event,'levelId');
  if(payloadId)return payloadId;
  const raw=String(event.level??'').toUpperCase();
  if(raw.startsWith('TDH'))return'TDH';
  if(raw.startsWith('TDL'))return'TDL';
  if(raw.startsWith('ONH'))return'ONH';
  if(raw.startsWith('ONL'))return'ONL';
  if(raw.startsWith('YH'))return'YH';
  if(raw.startsWith('YL'))return'YL';
  if(raw.startsWith('RTH H'))return'RTH_HIGH';
  if(raw.startsWith('RTH L'))return'RTH_LOW';
  if(raw.startsWith('IBH'))return'IBH';
  if(raw.startsWith('IBL'))return'IBL';
  if(raw.startsWith('ASIA H'))return'ASIA_H';
  if(raw.startsWith('ASIA L'))return'ASIA_L';
  if(raw.startsWith('LONDON H'))return'LONDON_H';
  if(raw.startsWith('LONDON L'))return'LONDON_L';
  if(raw.startsWith('NEW YORK H'))return'NEW_YORK_H';
  if(raw.startsWith('NEW YORK L'))return'NEW_YORK_L';
  return raw.split(' ')[0]||'LEVEL';
}

function levelNameRu(id:string){
  const map:Record<string,string>={
    YH:'максимум предыдущего дня',
    YL:'минимум предыдущего дня',
    TDH:'максимум текущего дня',
    TDL:'минимум текущего дня',
    ONH:'ночной максимум',
    ONL:'ночной минимум',
    RTH_HIGH:'RTH максимум',
    RTH_LOW:'RTH минимум',
    IBH:'IB максимум',
    IBL:'IB минимум',
    ASIA_H:'максимум Азии',
    ASIA_L:'минимум Азии',
    LONDON_H:'максимум Лондона',
    LONDON_L:'минимум Лондона',
    NEW_YORK_H:'максимум Нью-Йорка',
    NEW_YORK_L:'минимум Нью-Йорка'
  };
  return map[id]??id;
}

export function eventShortLabel(event:AscendEvent){
  const id=eventLevelId(event);
  if(event.type==='SWEEP')return `СНЯТ ${id}`;
  if(event.type==='PROBE')return `ПРОКОЛ ${id}`;
  if(event.type==='TOUCH')return `КАСАНИЕ ${id}`;
  if(event.type==='BREAK')return `ПРОБОЙ ${id}`;
  if(event.type==='ACCEPT')return `ACCEPT ${id}`;
  if(event.type==='RECLAIM')return `RECLAIM ${id}`;
  if(event.type==='CHOCH')return'CHOCH';
  if(event.type==='MSS')return'MSS';
  if(event.type==='BOS')return'BOS';
  if(event.type==='ENTRY')return'ENTRY';
  if(event.type==='TP')return'TP';
  if(event.type==='SL')return'SL';
  if(event.type==='CONFIRMED')return'CONFIRMED';
  return event.type;
}

export function eventTitleRu(event:AscendEvent){
  const id=eventLevelId(event);
  const level=levelNameRu(id);
  if(event.type==='SWEEP')return `Снята ликвидность: ${level}`;
  if(event.type==='PROBE')return `Неглубокий прокол: ${level}`;
  if(event.type==='TOUCH')return `Касание: ${level}`;
  if(event.type==='BREAK')return `Пробой: ${level}`;
  if(event.type==='ACCEPT')return `Принятие цены за уровнем: ${level}`;
  if(event.type==='RECLAIM')return `Возврат уровня: ${level}`;
  if(event.type==='CHOCH')return'Смена характера движения · CHOCH';
  if(event.type==='MSS')return'Смена структуры · MSS';
  if(event.type==='BOS')return'Пробой структуры · BOS';
  if(event.type==='ENTRY')return'Вход в сделку';
  if(event.type==='TP')return'Тейк-профит';
  if(event.type==='SL')return'Стоп-лосс';
  if(event.type==='CONFIRMED')return'Вход подтверждён';
  return String(event.type);
}

export function eventLevelNameRu(event:AscendEvent){
  return levelNameRu(eventLevelId(event));
}
