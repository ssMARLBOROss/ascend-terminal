import type { AscendEvent, AscendEventType, SessionState } from '@ascend/contracts';

export type RadarItem = {
  symbol: string;
  price: string;
  change: string;
  group: string;
  state: string;
};

export const radar: RadarItem[] = [
  { symbol: 'BTCUSDT', price: '86,140', change: '+0.42%', group: 'HOT NOW', state: 'ONH APPROACH' },
  { symbol: 'ETHUSDT', price: '3,241', change: '+1.12%', group: 'RC30 LONG', state: 'RECOVERY' },
  { symbol: 'SOLUSDT', price: '186.4', change: '-0.28%', group: 'RC70 SHORT', state: 'WATCH' },
  { symbol: 'BNBUSDT', price: '602.1', change: '+0.95%', group: 'YH/YL APPROACH', state: 'YH NEAR' },
  { symbol: 'ADAUSDT', price: '0.623', change: '+0.64%', group: 'ONH/ONL APPROACH', state: 'ONH NEAR' }
];

export const sessions: SessionState[] = [
  { name: 'ASIA', status: 'FROZEN', high: 86240, low: 85480, balance: 85860 },
  { name: 'LONDON', status: 'FROZEN', high: 86720, low: 85740, balance: 86230 },
  { name: 'NEW_YORK', status: 'LIVE', high: 86991, low: 86110, balance: 86400 },
  { name: 'ASIA', status: 'UPCOMING', balance: 86320, startsIn: '02:14:36' }
];

export const events: AscendEvent[] = [
  {
    eventId: 'e1', sequenceId: 1, instrument: 'BTCUSDT', timeframe: '15m',
    type: 'APPROACH', timestamp: 1791191100000, price: 86820, session: 'NEW_YORK',
    level: 'ONH / UPPER WALL', direction: 'SHORT',
    explanation: 'Цена вошла в область верхней стенки. Это только активация наблюдения, не вход.',
    nextExpected: 'Touch ONH or rejection before touch',
    payload: { rsi: 64.1, volumeRatio: 1.2, usedRangePct: 74 }
  },
  {
    eventId: 'e2', sequenceId: 2, instrument: 'BTCUSDT', timeframe: '15m',
    type: 'TOUCH', timestamp: 1791191400000, price: 86962, session: 'NEW_YORK',
    level: 'ONH / UPPER WALL', direction: 'SHORT',
    explanation: 'Касание ONH. Ждём либо принятие цены выше стенки, либо снятие и возврат.',
    nextExpected: 'Sweep / probe or acceptance above',
    payload: { rsi: 67.0, volumeRatio: 1.4, usedRangePct: 78 }
  },
  {
    eventId: 'e3', sequenceId: 3, instrument: 'BTCUSDT', timeframe: '15m',
    type: 'SWEEP', timestamp: 1791191580000, price: 86991, session: 'NEW_YORK',
    level: 'ONH / UPPER WALL', direction: 'SHORT',
    explanation: 'Ликвидность выше ONH снята. Сам sweep ещё не означает SHORT.',
    nextExpected: 'Reclaim below ONH or acceptance above',
    payload: { rsi: 68.4, volumeRatio: 1.8, sweepDepthPct: 0.08, usedRangePct: 82 }
  },
  {
    eventId: 'e4', sequenceId: 4, instrument: 'BTCUSDT', timeframe: '15m',
    type: 'RECLAIM', timestamp: 1791191820000, price: 86940, session: 'NEW_YORK',
    level: 'ONH', direction: 'SHORT',
    explanation: 'Цена вернулась под ONH и не приняла область выше. SHORT переходит в WATCH.',
    nextExpected: '30m context + 15m session direction',
    payload: { rsi: 61.3, volumeRatio: 1.6, balanceDistancePct: 0.62 }
  },
  {
    eventId: 'e5', sequenceId: 5, instrument: 'BTCUSDT', timeframe: '30m',
    type: 'WATCH', timestamp: 1791191940000, price: 86910, session: 'NEW_YORK',
    level: '30m CONTEXT', direction: 'SHORT',
    explanation: '30m контекст не конфликтует с возвратом под верхнюю ликвидность. Setup остаётся в WATCH.',
    nextExpected: '15m session direction + 10m CHOCH',
    payload: { rsi: 60.1, volumeRatio: 1.5 }
  },
  {
    eventId: 'e6', sequenceId: 6, instrument: 'BTCUSDT', timeframe: '10m',
    type: 'CHOCH', timestamp: 1791192060000, price: 86865, session: 'NEW_YORK',
    level: 'MTF STRUCTURE', direction: 'SHORT',
    explanation: '10m CHOCH вниз: структура начала смещаться после reclaim верхней ликвидности.',
    nextExpected: 'SHIFTING → 5m MSS down',
    payload: { rsi: 58.9, volumeRatio: 1.5 }
  },
  {
    eventId: 'e7', sequenceId: 7, instrument: 'BTCUSDT', timeframe: '10m',
    type: 'SHIFTING', timestamp: 1791192120000, price: 86840, session: 'NEW_YORK',
    level: 'STRUCTURE SHIFT', direction: 'SHORT',
    explanation: '10m переход подтверждён. Состояние меняется WATCH → SHIFTING.',
    nextExpected: '5m MSS down',
    payload: { rsi: 57.8, volumeRatio: 1.5 }
  },
  {
    eventId: 'e8', sequenceId: 8, instrument: 'BTCUSDT', timeframe: '5m',
    type: 'MSS', timestamp: 1791192300000, price: 86780, session: 'NEW_YORK',
    level: 'MTF STRUCTURE', direction: 'SHORT',
    explanation: '5m MSS подтвердил структурный сдвиг. Ждём 3m LH/retest и 1m micro-BOS.',
    nextExpected: '3m LH / retest',
    payload: { rsi: 55.8, volumeRatio: 1.5 }
  },
  {
    eventId: 'e9', sequenceId: 9, instrument: 'BTCUSDT', timeframe: '3m',
    type: 'LH', timestamp: 1791192480000, price: 86810, session: 'NEW_YORK',
    level: '3m RETEST', direction: 'SHORT',
    explanation: 'Ретест сформировал lower high. Теперь нужен micro-BOS на 1m.',
    nextExpected: '1m BOS down',
    payload: { rsi: 53.4, lostMovePct: 24 }
  },
  {
    eventId: 'e10', sequenceId: 10, instrument: 'BTCUSDT', timeframe: '1m',
    type: 'BOS', timestamp: 1791192660000, price: 86710, session: 'NEW_YORK',
    level: '1m MICRO STRUCTURE', direction: 'SHORT',
    explanation: '1m micro-BOS вниз завершает структурную лестницу подтверждения.',
    nextExpected: 'Risk / route gate',
    payload: { lostMovePct: 31, remainingRangePct: 69, rr: 2.4 }
  },
  {
    eventId: 'e11', sequenceId: 11, instrument: 'BTCUSDT', timeframe: '1m',
    type: 'CONFIRMED', timestamp: 1791192780000, price: 86680, session: 'NEW_YORK',
    level: 'UPPER WALL REJECTION', direction: 'SHORT',
    explanation: 'Reclaim + 10m CHOCH + SHIFTING + 5m MSS + 3m LH + 1m BOS подтвердили SHORT. Теперь решение проходит поздность и R:R.',
    nextExpected: 'ENTER if remaining move and R:R pass, otherwise SKIP',
    payload: { lostMovePct: 31, remainingRangePct: 69, potentialMovePct: 0.96, riskPct: 0.38, rr: 2.4 }
  }
];

export const stageOrder: AscendEventType[] = [
  'APPROACH','TOUCH','SWEEP','RECLAIM','WATCH','CHOCH','SHIFTING','MSS','LH','BOS','CONFIRMED'
];
