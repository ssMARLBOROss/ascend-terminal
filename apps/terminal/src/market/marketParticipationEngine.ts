import type {Candle} from '@ascend/contracts';
import type {DailyVwap} from './useDailyVwap';
import type {Metric,TpoProfile,OpenInterest,TradeDelta} from './useLiveMarketMetrics';
import type {OrderbookSnapshot} from './useOrderbookClusters';
import type {ContinuousCvd} from './useContinuousCvd';
import type {PreviousDayLevels} from './usePreviousDayLevels';
import type {PreviousSessionLevels} from './usePreviousSessionLevels';

export type ParticipationKind='BALANCE'|'OUTSIDE_VALUE'|'CONTINUATION_CANDIDATE'|
  'ABSORPTION_CANDIDATE'|'FALSE_BREAK_CANDIDATE'|'OBSERVING'|'NO_DATA';
export type ParticipationSource='BYBIT_TRADES_LAST_1000'|'BYBIT_WS_PUBLIC_TRADES'|'BYBIT_OI_5M'|
  'BYBIT_TPO_30M_APPROX'|'BYBIT_VWAP_5M_APPROX'|'BYBIT_ORDERBOOK_SNAPSHOT'|
  'BYBIT_CANDLES';
export type ParticipationField={
  value:number|null;timestamp:number|null;source:ParticipationSource;quality:string;
  status:'READY'|'STALE'|'NO_DATA';
};
export type ParticipationSnapshot={
  symbol:string;observedAt:number;price:ParticipationField;
  delta:ParticipationField;oi:ParticipationField;oiDelta:ParticipationField;
  poc:ParticipationField;vah:ParticipationField;val:ParticipationField;
  vwap:ParticipationField;bookBid:ParticipationField;bookAsk:ParticipationField;
  cvdWindow?:{from:number;to:number;trades:number};
  context:ParticipationKind;explanation:string;
  coreDecision:'NOT_CONNECTED';structure:'NOT_CONNECTED';
  confidences:string[];
};
export type ParticipationEvent={
  id:string;symbol:string;type:'SWEEP_RECLAIM_BAR'|'BREAK'|'RECLAIM'|'FVG_CREATED'|
    'FVG_RETEST'|'FVG_FILLED'|'OBSERVATION';
  level?:string;side?:'UP'|'DOWN';occurredAt:number;observedAt:number;
  source:'CLOSED_OHLC'|'FVG_REPLAY'|'LIVE_SNAPSHOT';snapshot:ParticipationSnapshot;
  notes:string
};
export type FrozenReference={id:string;price:number;availableFrom:number;status:'FROZEN'};

const noData=(source:ParticipationSource,quality:string):ParticipationField=>({
  value:null,timestamp:null,source,quality,status:'NO_DATA'
});
function field(source:ParticipationSource,value:number|undefined,at:number|undefined,
  now:number,maxAge:number,quality:string):ParticipationField{
  if(value===undefined||at===undefined||!Number.isFinite(value)||!Number.isFinite(at)||
      at>now||at<=0)return noData(source,quality);
  return {value,timestamp:at,source,quality,status:now-at<=maxAge?'READY':'STALE'};
}
export function frozenReferences(day?:PreviousDayLevels,
  sessions?:PreviousSessionLevels):FrozenReference[]{
  const levels:FrozenReference[]=[];
  if(day){
    const at=day.dayStartUtc+86400000;
    levels.push({id:'YH',price:day.high,availableFrom:at,status:'FROZEN'},
      {id:'YL',price:day.low,availableFrom:at,status:'FROZEN'});
  }
  if(sessions)for(const s of sessions.sessions){
    const at=sessions.dayStartUtc+s.to*3600000;
    levels.push({id:s.id+' H',price:s.high,availableFrom:at,status:'FROZEN'},
      {id:s.id+' L',price:s.low,availableFrom:at,status:'FROZEN'});
  }
  return levels;
}

export function buildParticipationSnapshot(args:{
  symbol:string;now:number;price?:number;priceAt?:number;
  candles:Candle[];timeframe:string;vwap?:DailyVwap;
  tpo:Metric<TpoProfile>;oi:Metric<OpenInterest>;cvd:Metric<TradeDelta>;
  continuousCvd?:ContinuousCvd;
  orderbook?:OrderbookSnapshot;levels:FrozenReference[];
}):ParticipationSnapshot{
  const {symbol,now,price,candles,timeframe,vwap,tpo,oi,cvd,orderbook,levels}=args;
  const chartStep:Record<string,number>={'1m':60000,'3m':180000,'5m':300000,
    '15m':900000,'30m':1800000,'1H':3600000,'4H':14400000,'1D':86400000};
  const last=candles.at(-1);
  const px=field('BYBIT_CANDLES',price,
    args.priceAt??(last?last.timestamp+chartStep[timeframe]:undefined),now,180000,
    'last price; last received websocket tick or latest REST candle');
  const d=cvd.status==='ready'?cvd.data:undefined;
  const live=args.continuousCvd;
  // Never substitute a recent-1000 snapshot after a WebSocket gap.
  const delta=live?field('BYBIT_WS_PUBLIC_TRADES',
      live.status==='LIVE'&&live.data?.health==='LIVE'&&live.data.trades>0?
        live.data.volumeDelta:undefined,
      live.status==='LIVE'?live.data?.lastTradeAt:undefined,
      now,90000,'cumulative taker delta in this connected WebSocket segment; no backfill'):
    field('BYBIT_TRADES_LAST_1000',d?.delta,d?.to,now,60000,
      'rolling sample of at most 1000 trades, not continuous CVD');
  const o=oi.status==='ready'?oi.data:undefined;
  const oiValue=field('BYBIT_OI_5M',o?.value,o?.timestamp,now,900000,
    '5m open-interest interval');
  const oiDelta=field('BYBIT_OI_5M',o?.deltaPercent,o?.timestamp,now,900000,
    'change vs prior available OI interval; not directional long/short');
  const t=tpo.status==='ready'?tpo.data:undefined;
  const poc=field('BYBIT_TPO_30M_APPROX',t?.poc,t?.to,now,7200000,
    'rolling 24h range-TPO approximation (30m brackets), not actual volume');
  const vah=field('BYBIT_TPO_30M_APPROX',t?.vah,t?.to,now,7200000,'rolling 24h VAH');
  const val=field('BYBIT_TPO_30M_APPROX',t?.val,t?.to,now,7200000,'rolling 24h VAL');
  // Daily VWAP is approximate HLC3 and only considered current within 3 minutes.
  const vw=field('BYBIT_VWAP_5M_APPROX',vwap?.value,vwap?.updatedAt,now,180000,
    'daily UTC VWAP approximation: HLC3 × base volume');
  const bid=orderbook?.clusters.find(c=>c.side==='bid');
  const ask=orderbook?.clusters.find(c=>c.side==='ask');
  const bookBid=field('BYBIT_ORDERBOOK_SNAPSHOT',bid?.notionalUsdt,
    orderbook?.receivedAt,now,45000,'visible resting BID, not an executed order');
  const bookAsk=field('BYBIT_ORDERBOOK_SNAPSHOT',ask?.notionalUsdt,
    orderbook?.receivedAt,now,45000,'visible resting ASK, not proof of absorption');
  const available=(x:ParticipationField)=>x.status==='READY';
  const readyPrice=available(px),readyValue=available(vah)&&available(val)&&available(poc);
  let context:ParticipationKind='NO_DATA',explanation='Нет синхронизированных данных цены и баланса.';
  if(readyPrice){
    context='OBSERVING';
    explanation='Доступна цена; ожидаем дополнительные подтверждённые наблюдения.';
    if(readyValue){
      if(px.value!>=val.value!&&px.value!<=vah.value!){
        context='BALANCE';
        explanation='Цена внутри приближённой Value Area. Это контекст, не сигнал входа.';
      }else{
        context='OUTSIDE_VALUE';
        explanation=px.value!>vah.value!?'Цена выше VAH: исследуем принятие цены над диапазоном.':
          'Цена ниже VAL: исследуем принятие цены под диапазоном.';
      }
    }
    if(context==='OUTSIDE_VALUE'&&available(vw)&&available(delta)&&available(oiDelta)){
      const long=px.value!>vah.value!&&px.value!>vw.value!;
      const short=px.value!<val.value!&&px.value!<vw.value!;
      // Current last-trade delta is a short sample, not the 5m/15m CVD.
      if((long&&delta.value!>0||short&&delta.value!<0)&&oiDelta.value!>0){
        context='CONTINUATION_CANDIDATE';
        explanation='Цена за Value Area, со стороны VWAP; выборка сделок совпадает с направлением, OI растёт. Разные окна данных: только гипотеза.';
      }
    }
    // Detect same-candle rejection of a genuinely frozen liquidity level.
    const closed=candles.filter(c=>c.timestamp+(chartStep[timeframe]??Infinity)<=now);
    const bar=closed.at(-1),previous=closed.at(-2);
    if(bar&&previous&&bar.timestamp+(chartStep[timeframe]??Infinity)>=now-300000){
      const rejectionSide=levels.flatMap(l=>{
        if(l.availableFrom>bar.timestamp)return [];
        if(previous.close>=l.price&&bar.low<l.price&&bar.close>l.price)return ['DOWN'];
        if(previous.close<=l.price&&bar.high>l.price&&bar.close<l.price)return ['UP'];
        return [];
      })[0];
      if(rejectionSide){
        context='FALSE_BREAK_CANDIDATE';
        explanation='Тень последней закрытой свечи сняла известный уровень, закрытие вернулось за него. Последовательность внутри свечи неизвестна.';
        const oppositeFlow=available(delta)&&(
          rejectionSide==='DOWN'&&delta.value!<0||
          rejectionSide==='UP'&&delta.value!>0);
        // The live CVD total is since connection, NOT one candle of delta:
        // do not claim absorption from its sign alone.
        if(!live&&oppositeFlow&&d&&d.from>=bar.timestamp&&
          d.to<=bar.timestamp+(chartStep[timeframe]??0)){
          context='ABSORPTION_CANDIDATE';
          explanation='После отвержения уровня в той же свечной области была зарегистрирована встречная агрессивная дельта. Это гипотеза поглощения, не подтверждённый лимитный участник.';
        }
      }
    }
  }
  return {symbol,observedAt:now,price:px,delta,oi:oiValue,oiDelta,poc,vah,val,
    vwap:vw,bookBid,bookAsk,cvdWindow:live?.data?.trades?{
      from:live.data.startedAt,to:live.data.lastTradeAt,trades:live.data.trades
    }:d?{from:d.from,to:d.to,trades:d.trades}:undefined,
    context,explanation,coreDecision:'NOT_CONNECTED',structure:'NOT_CONNECTED',
    confidences:[px,delta,oiValue,poc,vw,bookBid].filter(available)
      .map(x=>x.source)};
}

const stepMs:Record<string,number>={'1m':60000,'3m':180000,'5m':300000,
  '15m':900000,'30m':1800000,'1H':3600000,'4H':14400000,'1D':86400000};
/** Only events becoming observable after the logger started. Bars are closed,
 *  and only FROZEN levels whose availableFrom precedes that bar are used. */
export function detectObservedLevelEvents(args:{
  symbol:string;candles:Candle[];timeframe:string;levels:FrozenReference[];
  startedAt:number;now:number;snapshot:ParticipationSnapshot
}):ParticipationEvent[]{
  const {symbol,candles,levels,startedAt,now,snapshot}=args;
  const step=stepMs[args.timeframe]??0;
  if(!step||step>1800000)return [];
  const bars=candles.filter(c=>c.timestamp+step>startedAt&&c.timestamp+step<=now)
    .slice(-120);
  const result:ParticipationEvent[]=[];
  for(let i=0;i<bars.length;i++){
    const c=bars[i],end=c.timestamp+step;
    const previous=candles.find(b=>b.timestamp===c.timestamp-step);
    if(!previous)continue;
    for(const level of levels){
      if(level.availableFrom>c.timestamp)continue;
      let type:ParticipationEvent['type']|undefined;
      let side:ParticipationEvent['side'];
      if(previous.close>=level.price&&c.low<level.price&&c.close>level.price){
        type='SWEEP_RECLAIM_BAR';side='DOWN';
      }else if(previous.close<=level.price&&c.high>level.price&&c.close<level.price){
        type='SWEEP_RECLAIM_BAR';side='UP';
      }else if(previous.close>level.price&&c.close<level.price){
        type='BREAK';side='DOWN';
      }else if(previous.close<level.price&&c.close>level.price){
        // Reclaim is only justified if this recently traded ABOVE the
        // reference then broke below; otherwise it's a plain upward break.
        const prior=candles.some(b=>b.timestamp<previous.timestamp&&
          b.timestamp>=previous.timestamp-12*step&&b.close>level.price);
        type=prior?'RECLAIM':'BREAK';side='UP';
      }
      if(!type)continue;
      result.push({id:[symbol,args.timeframe,end,level.id,type].join(':'),
        symbol,type,level:level.id,side,occurredAt:end,
        observedAt:now,source:'CLOSED_OHLC',snapshot,
        notes:'Observed from a CLOSED '+args.timeframe+' candle. No intrabar ordering or Core confirmation.'});
    }
  }
  return result.slice(-60);
}
