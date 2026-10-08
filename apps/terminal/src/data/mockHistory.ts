import type { MarketChronologyEvent, MarketDataSource, MarketHistoryMeta } from '@ascend/contracts';

export const marketSources:MarketDataSource[]=[
  {id:'MEXC',kind:'CEX',enabled:true,capabilities:['UNIVERSE','CANDLES','TRADES','VOLUME','FUNDING','OPEN_INTEREST'],decisionAuthority:'VALIDATION'},
  {id:'BYBIT',kind:'CEX',enabled:true,capabilities:['UNIVERSE','CANDLES','TRADES','VOLUME','FUNDING','OPEN_INTEREST'],decisionAuthority:'VALIDATION'},
  {id:'OKX',kind:'CEX',enabled:true,capabilities:['UNIVERSE','CANDLES','TRADES','VOLUME','FUNDING','OPEN_INTEREST'],decisionAuthority:'VALIDATION'},
  {id:'BINANCE',kind:'CEX',enabled:true,capabilities:['UNIVERSE','CANDLES','TRADES','VOLUME','FUNDING','OPEN_INTEREST'],decisionAuthority:'VALIDATION'},
  {id:'DEX_SCANNER',kind:'DEX',enabled:true,capabilities:['LIQUIDITY','VOLUME','DISCOVERY'],decisionAuthority:'DISCOVERY_ONLY'}
];

export const historyMeta:MarketHistoryMeta={
  instrument:'BTCUSDT',
  oldestTimestamp:1767225600000,
  newestTimestamp:1791200000000,
  estimatedCandles:500000,
  storedBaseTimeframe:'1m',
  derivedTimeframes:['1m','3m','5m','10m','15m','30m','45m','1H','2H','4H','6H','12H','1D','1W','1M'],
  pagination:'CURSOR',
  lazyLoading:true
};

export const historicalChronology:MarketChronologyEvent[]=[
  {
    eventId:'h1',sequenceId:-8,instrument:'BTCUSDT',timeframe:'1m',type:'OBSERVE',
    timestamp:1791189300000,price:86480,session:'NEW_YORK',level:'DEX DISCOVERY',direction:'NEUTRAL',
    explanation:'DEX-объём вырос до 2.8× среднего. Это раннее предупреждение и только повод поднять монету в Radar.',
    nextExpected:'Проверка CEX: цена, объём, известный уровень, структура.',
    payload:{dexVolumeRatio:2.8,liquidityInflowPct:14.2,canConfirmTrade:false},
    source:'DEX_SCANNER',status:'OBSERVED'
  },
  {
    eventId:'h2',sequenceId:-7,instrument:'BTCUSDT',timeframe:'1m',type:'OBSERVE',
    timestamp:1791189600000,price:86512,session:'NEW_YORK',level:'DEX/CEX GAP',direction:'LONG',
    explanation:'На DEX цена временно опережает CEX на 0.34%. ASCEND отмечает расхождение как контекст, но не как вход.',
    nextExpected:'Ждём подтверждение движения на CEX.',
    payload:{gapPct:0.34,dexVolumeRatio:2.3,canConfirmTrade:false},
    source:'DEX_SCANNER',status:'OBSERVED'
  },
  {
    eventId:'h3',sequenceId:-6,instrument:'BTCUSDT',timeframe:'15m',type:'APPROACH',
    timestamp:1791189900000,price:86552,session:'NEW_YORK',level:'YH 86,590',direction:'LONG',
    explanation:'Цена подошла к максимуму прошлого дня YH. Начинаем наблюдение за реакцией.',
    nextExpected:'Touch / break / sweep.',
    payload:{distancePct:0.044,volumeRatio:1.3},
    source:'MEXC',status:'OBSERVED',levelRole:'UNDER_ATTACK'
  },
  {
    eventId:'h4',sequenceId:-5,instrument:'BTCUSDT',timeframe:'15m',type:'TOUCH',
    timestamp:1791190020000,price:86590,session:'NEW_YORK',level:'YH 86,590',direction:'LONG',
    explanation:'Первое касание YH. Само касание направление не подтверждает.',
    nextExpected:'Break + close or rejection.',
    payload:{touchCount:1,volumeRatio:1.4},
    source:'BYBIT',status:'OBSERVED',levelRole:'UNDER_ATTACK'
  },
  {
    eventId:'h5',sequenceId:-4,instrument:'BTCUSDT',timeframe:'15m',type:'BREAK',
    timestamp:1791190200000,price:86620,session:'NEW_YORK',level:'YH 86,590',direction:'LONG',
    explanation:'15m закрылась выше YH. Фиксируем пробой поддержки/сопротивления в хронологии.',
    nextExpected:'Acceptance above or reclaim below.',
    payload:{closeAbovePct:0.035,closeConfirmed:true,volumeRatio:1.6},
    source:'BINANCE',status:'OBSERVED',levelRole:'UNDER_ATTACK',confirmationTimeframe:'15m'
  },
  {
    eventId:'h6',sequenceId:-3,instrument:'BTCUSDT',timeframe:'10m',type:'ACCEPT',
    timestamp:1791190380000,price:86642,session:'NEW_YORK',level:'YH 86,590',direction:'LONG',
    explanation:'Цена удержалась выше YH после закрытия. Уровень принят сверху.',
    nextExpected:'Retest of YH as support.',
    payload:{acceptanceMinutes:3,volumeRatio:1.5},
    source:'OKX',status:'CONFIRMED',levelRole:'ACCEPTED_ABOVE',confirmationTimeframe:'10m'
  },
  {
    eventId:'h7',sequenceId:-2,instrument:'BTCUSDT',timeframe:'10m',type:'RETEST',
    timestamp:1791190500000,price:86596,session:'NEW_YORK',level:'YH 86,590',direction:'LONG',
    explanation:'Ретест вернулся к YH и удержал уровень.',
    nextExpected:'Flip confirmation or continuation.',
    payload:{retestDepthPct:0.007,hold:true},
    source:'MEXC',status:'CONFIRMED',levelRole:'ACCEPTED_ABOVE',confirmationTimeframe:'10m'
  },
  {
    eventId:'h8',sequenceId:-1,instrument:'BTCUSDT',timeframe:'10m',type:'FLIP',
    timestamp:1791190620000,price:86608,session:'NEW_YORK',level:'YH 86,590',direction:'LONG',
    explanation:'Бывшее сопротивление YH подтвердилось как поддержка. Роль уровня изменилась.',
    nextExpected:'Continuation to ONH / upper liquidity.',
    payload:{oldRole:'RESISTANCE',newRole:'SUPPORT'},
    source:'ASCEND_CORE',status:'CONFIRMED',levelRole:'FLIPPED',confirmationTimeframe:'10m'
  }
];
