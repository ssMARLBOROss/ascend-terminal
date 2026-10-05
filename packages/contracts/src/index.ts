export type Direction = 'LONG' | 'SHORT' | 'NEUTRAL';
export type SetupMode = 'SCALP' | 'NORMAL';
export type EnvironmentMode = 'MOCK' | 'PAPER' | 'LIVE';
export type SessionName = 'SYDNEY' | 'ASIA' | 'LONDON' | 'NEW_YORK';

export const CORE_TIMEFRAMES = [
  '1m','3m','5m','10m','15m','30m','45m','1H','2H','4H','6H','12H','1D','1W','1M'
] as const;
export type AscendTimeframe = typeof CORE_TIMEFRAMES[number];

export type AscendEventType =
  | 'OBSERVE' | 'APPROACH' | 'TOUCH' | 'PROBE' | 'SWEEP'
  | 'RECLAIM' | 'ACCEPT' | 'WATCH'
  | 'HH' | 'HL' | 'LH' | 'LL'
  | 'BOS' | 'CHOCH' | 'MSS' | 'RETEST'
  | 'SHIFTING' | 'CONFIRMED' | 'ENTRY'
  | 'TP' | 'SL' | 'INVALIDATED';

export type SetupStage =
  | 'IDLE'
  | 'APPROACH'
  | 'TOUCH'
  | 'PROBE_SWEEP'
  | 'RECLAIM_ACCEPT'
  | 'WATCH'
  | 'CONTEXT_30M'
  | 'SESSION_DIRECTION_15M'
  | 'CHOCH_10M'
  | 'SHIFTING'
  | 'MSS_5M'
  | 'RETEST_3M'
  | 'TRIGGER_1M'
  | 'CONFIRMED'
  | 'ENTRY'
  | 'MANAGE'
  | 'INVALIDATED';

export interface AscendEvent<T = Record<string, unknown>> {
  eventId: string;
  sequenceId: number;
  instrument: string;
  timeframe: AscendTimeframe;
  type: AscendEventType;
  timestamp: number;
  price: number;
  session?: SessionName;
  level?: string;
  direction?: Direction;
  explanation?: string;
  nextExpected?: string;
  payload: T;
}

export interface MarketLevel {
  id: string;
  kind: 'YH'|'YL'|'ONH'|'ONL'|'IBH'|'IBL'|'RTH_HIGH'|'RTH_LOW'|'OPEN'|'VWAP'|'WALL'|'BALANCE';
  label: string;
  price: number;
  status: 'LIVE'|'FROZEN'|'EXPECTED';
  role?: 'SUPPORT'|'RESISTANCE'|'UNDER_ATTACK'|'SWEPT'|'RECLAIMED'|'ACCEPTED_ABOVE'|'ACCEPTED_BELOW'|'FLIPPED';
}

export interface LiquidityCluster {
  id: string;
  session: SessionName;
  side: 'UPPER'|'LOWER';
  low: number;
  high: number;
  status: 'FROZEN'|'LIVE'|'EXPECTED';
  role: 'SUPPORT'|'RESISTANCE'|'UNDER_ATTACK'|'SWEPT'|'RECLAIMED'|'ACCEPTED_ABOVE'|'ACCEPTED_BELOW'|'FLIPPED';
}

export interface RangeMath {
  usedRangePct: number;
  remainingRangePct: number;
  lostMovePct: number;
  potentialMovePct: number;
  riskPct: number;
  rr: number;
  speed: number;
  acceleration: number;
  balancePosition: number;
}

export interface SetupState {
  instrument: string;
  mode: SetupMode;
  stage: SetupStage;
  direction: Direction;
  confirmed: boolean;
  range: RangeMath;
}

export interface SessionState {
  name: SessionName;
  status: 'FROZEN'|'LIVE'|'UPCOMING';
  high?: number;
  low?: number;
  balance?: number;
  startsIn?: string;
}

export interface TradePlan {
  direction: Direction;
  entry?: number;
  stopLoss?: number;
  takeProfits: Array<{ label: string; price: number; source: string }>;
  rr?: number;
  status: 'WATCH'|'WAIT_CONFIRM'|'CONFIRMED'|'SKIP'|'PAPER';
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RadarCandidate {
  instrument: string;
  group: string;
  stage: 'WATCH'|'SHIFTING'|'CONFIRMED';
  direction: Direction;
  price: number;
  change24hPct?: number;
  activeLevel?: string;
  session?: SessionName;
}

export interface GlobalContext {
  btcDirection: Direction;
  ethDirection: Direction;
  solDirection: Direction;
  breadthLongPct: number;
  globalPressure: number;
  activeSession: SessionName;
  sessionFuel?: number;
}
