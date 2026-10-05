export type Direction='LONG'|'SHORT'|'NEUTRAL';
export type SetupMode='SCALP'|'NORMAL';
export type EnvironmentMode='MOCK'|'PAPER'|'LIVE';
export type SessionName='SYDNEY'|'ASIA'|'LONDON'|'NEW_YORK';
export const CORE_TIMEFRAMES=['1m','3m','5m','10m','15m','30m','45m','1H','2H','4H','6H','12H','1D','1W','1M'] as const;
export type AscendTimeframe=typeof CORE_TIMEFRAMES[number];
export type AscendEventType='OBSERVE'|'APPROACH'|'TOUCH'|'PROBE'|'SWEEP'|'RECLAIM'|'ACCEPT'|'HH'|'HL'|'LH'|'LL'|'BOS'|'CHOCH'|'MSS'|'SHIFTING'|'CONFIRMED'|'ENTRY'|'TP'|'SL'|'INVALIDATED';
export interface AscendEvent<T=Record<string,unknown>>{eventId:string;sequenceId:number;instrument:string;timeframe:AscendTimeframe;type:AscendEventType;timestamp:number;price:number;session?:SessionName;level?:string;direction?:Direction;explanation?:string;nextExpected?:string;payload:T;}
export interface MarketLevel{id:string;kind:'YH'|'YL'|'ONH'|'ONL'|'IBH'|'IBL'|'RTH_HIGH'|'RTH_LOW'|'OPEN'|'VWAP'|'WALL'|'BALANCE';label:string;price:number;status:'LIVE'|'FROZEN'|'EXPECTED';role?:'SUPPORT'|'RESISTANCE'|'UNDER_ATTACK'|'SWEPT'|'RECLAIMED'|'ACCEPTED_ABOVE'|'ACCEPTED_BELOW'|'FLIPPED';}
export interface LiquidityCluster{id:string;session:SessionName;side:'UPPER'|'LOWER';low:number;high:number;status:'FROZEN'|'LIVE'|'EXPECTED';role:'SUPPORT'|'RESISTANCE'|'UNDER_ATTACK'|'SWEPT'|'RECLAIMED'|'ACCEPTED_ABOVE'|'ACCEPTED_BELOW'|'FLIPPED';}
export interface RangeMath{usedRangePct:number;remainingRangePct:number;lostMovePct:number;potentialMovePct:number;riskPct:number;rr:number;speed:number;acceleration:number;balancePosition:number;}
export interface SetupState{instrument:string;mode:SetupMode;stage:AscendEventType;direction:Direction;confirmed:boolean;range:RangeMath;}
export interface SessionState{name:SessionName;status:'FROZEN'|'LIVE'|'UPCOMING';high?:number;low?:number;balance?:number;startsIn?:string;}
export interface TradePlan{direction:Direction;entry?:number;stopLoss?:number;takeProfits:Array<{label:string;price:number;source:string}>;rr?:number;status:'WATCH'|'WAIT_CONFIRM'|'CONFIRMED'|'SKIP'|'PAPER';}
