import type {
  CandleHistoryPage,
  CandleHistoryQuery,
  MarketDataSource,
  MarketDataSourceId,
  MarketDiscoveryEvent
} from '@ascend/contracts';

export interface MarketDataAdapter {
  source: MarketDataSource;
  listUniverse(): Promise<string[]>;
  fetchCandles(query:CandleHistoryQuery): Promise<CandleHistoryPage>;
}

export interface DexDiscoveryAdapter {
  source: MarketDataSource & { id:'DEX_SCANNER'; kind:'DEX'; decisionAuthority:'DISCOVERY_ONLY' };
  scan(): Promise<MarketDiscoveryEvent[]>;
}

export const MARKET_SOURCES:Record<MarketDataSourceId,MarketDataSource>={
  MEXC:{
    id:'MEXC',kind:'CEX',enabled:true,
    capabilities:['UNIVERSE','CANDLES','TRADES','VOLUME','FUNDING','OPEN_INTEREST'],
    decisionAuthority:'VALIDATION'
  },
  BYBIT:{
    id:'BYBIT',kind:'CEX',enabled:true,
    capabilities:['UNIVERSE','CANDLES','TRADES','VOLUME','FUNDING','OPEN_INTEREST'],
    decisionAuthority:'VALIDATION'
  },
  OKX:{
    id:'OKX',kind:'CEX',enabled:true,
    capabilities:['UNIVERSE','CANDLES','TRADES','VOLUME','FUNDING','OPEN_INTEREST'],
    decisionAuthority:'VALIDATION'
  },
  BINANCE:{
    id:'BINANCE',kind:'CEX',enabled:true,
    capabilities:['UNIVERSE','CANDLES','TRADES','VOLUME','FUNDING','OPEN_INTEREST'],
    decisionAuthority:'VALIDATION'
  },
  DEX_SCANNER:{
    id:'DEX_SCANNER',kind:'DEX',enabled:true,
    capabilities:['LIQUIDITY','VOLUME','DISCOVERY'],
    decisionAuthority:'DISCOVERY_ONLY'
  }
};

export function canSourceValidateTrade(source:MarketDataSourceId){
  return MARKET_SOURCES[source].decisionAuthority==='VALIDATION';
}

export function assertDiscoveryCannotConfirm(event:MarketDiscoveryEvent){
  if(event.canConfirmTrade!==false) throw new Error('DEX discovery event cannot confirm a trade');
  return event;
}

/**
 * Architecture-ready registry.
 * Real exchange/DEX clients are intentionally not connected yet.
 * Adapters will be injected here after public market-data integration is approved.
 */
export class MarketDataRegistry{
  private adapters=new Map<MarketDataSourceId,MarketDataAdapter|DexDiscoveryAdapter>();

  register(adapter:MarketDataAdapter|DexDiscoveryAdapter){
    this.adapters.set(adapter.source.id,adapter);
  }

  get(source:MarketDataSourceId){
    return this.adapters.get(source);
  }

  status(){
    return Object.values(MARKET_SOURCES).map(source=>({
      ...source,
      adapterRegistered:this.adapters.has(source.id)
    }));
  }
}
