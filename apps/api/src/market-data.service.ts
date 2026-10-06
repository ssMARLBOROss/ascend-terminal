import {Injectable,OnModuleDestroy,OnModuleInit} from '@nestjs/common';
import WebSocket from 'ws';
import {Subject} from 'rxjs';
import type {
  AscendTimeframe,Candle,DexDiscoverySnapshot,Direction,HistoricalCandle,
  MarketBootstrapPayload,MarketConsensusSnapshot,MarketDataSourceId,MarketStreamMessage,
  NormalizedTicker,SourceHealth
} from '@ascend/contracts';

type CexSource='BYBIT'|'MEXC';
type BufferKey=`${CexSource}:${string}:${AscendTimeframe}`;

const TF_MS:Partial<Record<AscendTimeframe,number>>={
  '1m':60000,'3m':180000,'5m':300000,'10m':600000,'15m':900000,'30m':1800000,
  '45m':2700000,'1H':3600000,'2H':7200000,'4H':14400000,'6H':21600000,
  '12H':43200000,'1D':86400000,'1W':604800000
};

const BYBIT_INTERVAL:Partial<Record<AscendTimeframe,string>>={
  '1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1H':'60','2H':'120',
  '4H':'240','6H':'360','12H':'720','1D':'D','1W':'W','1M':'M'
};

const MEXC_INTERVAL:Partial<Record<AscendTimeframe,string>>={
  '1m':'Min1','5m':'Min5','15m':'Min15','30m':'Min30','1H':'Min60',
  '4H':'Hour4','1D':'Day1','1W':'Week1','1M':'Month1'
};

const MEXC_TO_TF:Record<string,AscendTimeframe>={
  Min1:'1m',Min5:'5m',Min15:'15m',Min30:'30m',Min60:'1H',
  Hour4:'4H',Hour8:'8H' as AscendTimeframe,Day1:'1D',Week1:'1W',Month1:'1M'
};

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const mexcSymbol=(symbol:string)=>symbol.toUpperCase().replace(/USDT$/,'_USDT');

function aggregate(candles:HistoricalCandle[],target:AscendTimeframe,source:CexSource,instrument:string){
  const size=TF_MS[target];
  if(!size)return candles;
  const buckets=new Map<number,HistoricalCandle>();
  for(const candle of candles){
    const ts=Math.floor(candle.timestamp/size)*size;
    const prev=buckets.get(ts);
    if(!prev){
      buckets.set(ts,{...candle,timestamp:ts,timeframe:target,source,instrument});
    }else{
      buckets.set(ts,{
        ...prev,
        high:Math.max(prev.high,candle.high),
        low:Math.min(prev.low,candle.low),
        close:candle.close,
        volume:prev.volume+candle.volume,
        closed:prev.closed&&candle.closed
      });
    }
  }
  return [...buckets.values()].sort((a,b)=>a.timestamp-b.timestamp);
}

function trendDirection(candles:HistoricalCandle[]):Direction{
  const closed=candles.filter(c=>c.closed).slice(-5);
  if(closed.length<3)return'NEUTRAL';
  const first=closed[0].close,last=closed[closed.length-1].close;
  const move=(last-first)/Math.max(first,1e-12)*100;
  if(move>.08)return'LONG';
  if(move<-.08)return'SHORT';
  return'NEUTRAL';
}

@Injectable()
export class MarketDataService implements OnModuleInit,OnModuleDestroy{
  private readonly symbols=(process.env.MARKET_SYMBOLS??'BTCUSDT,ETHUSDT,SOLUSDT')
    .split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
  private readonly buffers=new Map<BufferKey,HistoricalCandle[]>();
  private readonly tickers=new Map<string,NormalizedTicker>();
  private readonly health=new Map<MarketDataSourceId,SourceHealth>();
  private readonly streams=new Map<string,Subject<MarketStreamMessage>>();
  private readonly dex=new Map<string,DexDiscoverySnapshot>();
  private bybitWs?:WebSocket;
  private mexcWs?:WebSocket;
  private timers:Array<ReturnType<typeof setInterval>|ReturnType<typeof setTimeout>>=[];
  private stopped=false;

  onModuleInit(){
    this.health.set('BYBIT',{source:'BYBIT',status:'CONNECTING'});
    this.health.set('MEXC',{source:'MEXC',status:'CONNECTING'});
    this.health.set('DEX_SCANNER',{source:'DEX_SCANNER',status:'CONNECTING',note:'discovery only'});
    void this.bootstrap();
  }

  onModuleDestroy(){
    this.stopped=true;
    for(const timer of this.timers)clearInterval(timer as ReturnType<typeof setInterval>);
    this.bybitWs?.close();
    this.mexcWs?.close();
    for(const stream of this.streams.values())stream.complete();
  }

  stream(symbol:string){
    const key=symbol.toUpperCase();
    let subject=this.streams.get(key);
    if(!subject){subject=new Subject<MarketStreamMessage>();this.streams.set(key,subject)}
    return subject.asObservable();
  }

  sourceHealth(){return [...this.health.values()]}

  private emit(symbol:string,message:MarketStreamMessage){
    this.streams.get(symbol.toUpperCase())?.next(message);
  }

  private async bootstrap(){
    await Promise.allSettled(this.symbols.flatMap(symbol=>[
      this.seedSource('BYBIT',symbol),
      this.seedSource('MEXC',symbol),
      this.scanDex(symbol)
    ]));
    this.connectBybit();
    this.connectMexc();
    const dexTimer=setInterval(()=>{for(const symbol of this.symbols)void this.scanDex(symbol)},30000);
    this.timers.push(dexTimer);
  }

  private async seedSource(source:CexSource,symbol:string){
    try{
      const [one,fifteen]=await Promise.all([
        this.fetchHistory(source,symbol,'1m',500),
        this.fetchHistory(source,symbol,'15m',300)
      ]);
      this.setBuffer(source,symbol,'1m',one);
      this.setBuffer(source,symbol,'15m',fifteen);
      const last=fifteen.at(-1)??one.at(-1);
      if(last){
        this.tickers.set(`${source}:${symbol}`,{
          source,instrument:symbol,timestamp:Date.now(),lastPrice:last.close
        });
      }
      this.health.set(source,{source,status:'LIVE',lastUpdate:Date.now(),note:'server rolling buffer'});
    }catch(error){
      this.health.set(source,{source,status:'DEGRADED',note:String((error as Error)?.message??error)});
    }
  }

  private key(source:CexSource,symbol:string,tf:AscendTimeframe):BufferKey{
    return `${source}:${symbol}:${tf}`;
  }

  private getBuffer(source:CexSource,symbol:string,tf:AscendTimeframe){
    return this.buffers.get(this.key(source,symbol,tf))??[];
  }

  private setBuffer(source:CexSource,symbol:string,tf:AscendTimeframe,candles:HistoricalCandle[]){
    this.buffers.set(this.key(source,symbol,tf),candles.slice(-1200));
  }

  private upsert(source:CexSource,symbol:string,tf:AscendTimeframe,candle:HistoricalCandle){
    const key=this.key(source,symbol,tf);
    const list=(this.buffers.get(key)??[]).slice();
    const index=list.findIndex(x=>x.timestamp===candle.timestamp);
    if(index>=0)list[index]=candle;else list.push(candle);
    list.sort((a,b)=>a.timestamp-b.timestamp);
    this.buffers.set(key,list.slice(-1200));
    this.emit(symbol,{type:'candle',source,instrument:symbol,timeframe:tf,candle});
  }

  private connectBybit(){
    if(this.stopped)return;
    const ws=new WebSocket('wss://stream.bybit.com/v5/public/linear');
    this.bybitWs=ws;
    ws.on('open',()=>{
      this.health.set('BYBIT',{source:'BYBIT',status:'LIVE',lastUpdate:Date.now(),note:'public linear websocket'});
      const args=this.symbols.flatMap(symbol=>[
        `kline.1.${symbol}`,`kline.15.${symbol}`,`tickers.${symbol}`
      ]);
      ws.send(JSON.stringify({op:'subscribe',args}));
    });
    ws.on('message',(raw)=>{
      try{
        const msg=JSON.parse(String(raw));
        const now=Date.now();
        this.health.set('BYBIT',{source:'BYBIT',status:'LIVE',lastUpdate:now,latencyMs:typeof msg.ts==='number'?Math.max(0,now-msg.ts):undefined,note:'public linear websocket'});
        if(typeof msg.topic==='string'&&msg.topic.startsWith('kline.')){
          const item=Array.isArray(msg.data)?msg.data[0]:undefined;
          if(!item)return;
          const [,interval,symbol]=msg.topic.split('.');
          const tf:AscendTimeframe=interval==='1'?'1m':'15m';
          const candle:HistoricalCandle={
            source:'BYBIT',instrument:symbol,timeframe:tf,closed:Boolean(item.confirm),
            timestamp:Number(item.start),open:Number(item.open),high:Number(item.high),
            low:Number(item.low),close:Number(item.close),volume:Number(item.volume)
          };
          this.upsert('BYBIT',symbol,tf,candle);
        }else if(typeof msg.topic==='string'&&msg.topic.startsWith('tickers.')){
          const symbol=msg.topic.split('.')[1];
          const item=Array.isArray(msg.data)?msg.data[0]:msg.data;
          const prev=this.tickers.get(`BYBIT:${symbol}`);
          const ticker:NormalizedTicker={
            source:'BYBIT',instrument:symbol,timestamp:now,
            lastPrice:item?.lastPrice!==undefined?Number(item.lastPrice):(prev?.lastPrice??0),
            change24hPct:item?.price24hPcnt!==undefined?Number(item.price24hPcnt)*100:prev?.change24hPct,
            high24h:item?.highPrice24h!==undefined?Number(item.highPrice24h):prev?.high24h,
            low24h:item?.lowPrice24h!==undefined?Number(item.lowPrice24h):prev?.low24h,
            turnover24h:item?.turnover24h!==undefined?Number(item.turnover24h):prev?.turnover24h
          };
          this.tickers.set(`BYBIT:${symbol}`,ticker);
          this.emit(symbol,{type:'ticker',source:'BYBIT',instrument:symbol,ticker});
          this.emitConsensus(symbol);
        }
      }catch{}
    });
    ws.on('error',()=>this.health.set('BYBIT',{source:'BYBIT',status:'ERROR',note:'websocket error'}));
    ws.on('close',()=>{
      if(this.stopped)return;
      this.health.set('BYBIT',{source:'BYBIT',status:'OFFLINE',note:'reconnecting'});
      const timer=setTimeout(()=>this.connectBybit(),1800);this.timers.push(timer);
    });
    const ping=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({op:'ping'}))},20000);
    this.timers.push(ping);
  }

  private connectMexc(){
    if(this.stopped)return;
    const ws=new WebSocket('wss://contract.mexc.com/edge');
    this.mexcWs=ws;
    ws.on('open',()=>{
      this.health.set('MEXC',{source:'MEXC',status:'LIVE',lastUpdate:Date.now(),note:'contract websocket'});
      for(const symbol of this.symbols){
        for(const interval of ['Min1','Min15']){
          ws.send(JSON.stringify({method:'sub.kline',param:{symbol:mexcSymbol(symbol),interval}}));
        }
      }
    });
    ws.on('message',(raw)=>{
      try{
        const msg=JSON.parse(String(raw));
        const now=Date.now();
        if(msg.channel==='pong')return;
        this.health.set('MEXC',{source:'MEXC',status:'LIVE',lastUpdate:now,latencyMs:typeof msg.ts==='number'?Math.max(0,now-msg.ts):undefined,note:'contract websocket'});
        if(msg.channel!=='push.kline'||!msg.data)return;
        const item=msg.data;
        const symbol=String(item.symbol??msg.symbol??'').replace('_','');
        const tf:AscendTimeframe=item.interval==='Min1'?'1m':'15m';
        const ts=Number(item.t)*1000;
        const size=TF_MS[tf]??60000;
        const candle:HistoricalCandle={
          source:'MEXC',instrument:symbol,timeframe:tf,
          closed:Date.now()>=ts+size,
          timestamp:ts,open:Number(item.o),high:Number(item.h),low:Number(item.l),
          close:Number(item.c),volume:Number(item.q??0)
        };
        this.upsert('MEXC',symbol,tf,candle);
        const ticker:NormalizedTicker={source:'MEXC',instrument:symbol,timestamp:now,lastPrice:candle.close};
        this.tickers.set(`MEXC:${symbol}`,ticker);
        this.emit(symbol,{type:'ticker',source:'MEXC',instrument:symbol,ticker});
        this.emitConsensus(symbol);
      }catch{}
    });
    ws.on('error',()=>this.health.set('MEXC',{source:'MEXC',status:'ERROR',note:'websocket error'}));
    ws.on('close',()=>{
      if(this.stopped)return;
      this.health.set('MEXC',{source:'MEXC',status:'OFFLINE',note:'reconnecting'});
      const timer=setTimeout(()=>this.connectMexc(),2200);this.timers.push(timer);
    });
    const ping=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({method:'ping'}))},15000);
    this.timers.push(ping);
  }

  private consensus(symbol:string):MarketConsensusSnapshot{
    const bybitTicker=this.tickers.get(`BYBIT:${symbol}`);
    const mexcTicker=this.tickers.get(`MEXC:${symbol}`);
    const bybitDirection=trendDirection(this.getBuffer('BYBIT',symbol,'15m'));
    const mexcDirection=trendDirection(this.getBuffer('MEXC',symbol,'15m'));
    const bybitPrice=bybitTicker?.lastPrice??this.getBuffer('BYBIT',symbol,'1m').at(-1)?.close;
    const mexcPrice=mexcTicker?.lastPrice??this.getBuffer('MEXC',symbol,'1m').at(-1)?.close;
    const gap=bybitPrice&&mexcPrice?Math.abs(bybitPrice-mexcPrice)/((bybitPrice+mexcPrice)/2)*100:undefined;

    let state:MarketConsensusSnapshot['state']='INSUFFICIENT_DATA';
    if(bybitPrice&&mexcPrice){
      const opposite=(bybitDirection==='LONG'&&mexcDirection==='SHORT')||(bybitDirection==='SHORT'&&mexcDirection==='LONG');
      if(opposite||(gap??0)>.5)state='MARKET_CONFLICT';
      else if((gap??0)>.15||bybitDirection!==mexcDirection)state='SOFT_CONFLICT';
      else state='CONSENSUS';
    }
    return{
      instrument:symbol,timestamp:Date.now(),state,primarySource:bybitPrice?'BYBIT':'MEXC',
      bybitPrice,mexcPrice,priceGapPct:gap,bybitDirection,mexcDirection,
      note:state==='MARKET_CONFLICT'
        ?'CEX sources conflict: Core confirmation must wait.'
        :state==='CONSENSUS'
          ?'Bybit and MEXC public market state aligned.'
          :'Source alignment is incomplete; treat as context only.'
    };
  }

  private emitConsensus(symbol:string){
    this.emit(symbol,{type:'consensus',instrument:symbol,snapshot:this.consensus(symbol)});
  }

  async bootstrapPayload(symbolRaw:string,tf:AscendTimeframe,limit=360):Promise<MarketBootstrapPayload>{
    const symbol=symbolRaw.toUpperCase();
    const safeLimit=clamp(limit,50,500);
    let chart=this.getBuffer('BYBIT',symbol,tf).slice(-safeLimit);
    if(!chart.length){
      try{chart=await this.fetchHistory('BYBIT',symbol,tf,safeLimit)}catch{
        chart=await this.fetchHistory('MEXC',symbol,tf,safeLimit);
      }
    }

    let context=this.getBuffer('BYBIT',symbol,'15m').slice(-400);
    if(context.length<100){
      try{context=await this.fetchHistory('BYBIT',symbol,'15m',400)}catch{
        context=await this.fetchHistory('MEXC',symbol,'15m',400);
      }
    }

    let event=this.getBuffer('BYBIT',symbol,'1m').slice(-900);
    if(event.length<300){
      try{event=await this.fetchHistory('BYBIT',symbol,'1m',900)}catch{
        event=await this.fetchHistory('MEXC',symbol,'1m',900);
      }
    }

    const consensus=this.consensus(symbol);
    const ticker=this.tickers.get(`${consensus.primarySource}:${symbol}`);
    if(!this.dex.has(symbol))void this.scanDex(symbol);
    return{
      instrument:symbol,timeframe:tf,chartCandles:chart,context15m:context,event1m:event,ticker,
      sources:this.sourceHealth(),consensus,dex:this.dex.get(symbol),
      storage:{hot:'IN_MEMORY',history:'SOURCE_LAZY',redis:'PLANNED',postgres:'PLANNED'}
    };
  }

  async history(symbolRaw:string,tf:AscendTimeframe,source:CexSource,limit=300,before?:number){
    const symbol=symbolRaw.toUpperCase();
    return this.fetchHistory(source,symbol,tf,clamp(limit,50,500),before);
  }

  private async fetchHistory(source:CexSource,symbol:string,tf:AscendTimeframe,limit:number,before?:number):Promise<HistoricalCandle[]>{
    if(source==='BYBIT')return this.fetchBybit(symbol,tf,limit,before);
    return this.fetchMexc(symbol,tf,limit,before);
  }

  private async fetchBybit(symbol:string,tf:AscendTimeframe,limit:number,before?:number):Promise<HistoricalCandle[]>{
    const native=BYBIT_INTERVAL[tf];
    const baseTf:AscendTimeframe=tf==='10m'?'5m':tf==='45m'?'15m':tf;
    const interval=native??BYBIT_INTERVAL[baseTf]??'15';
    const multiplier=tf==='10m'?2:tf==='45m'?3:1;
    const qs=new URLSearchParams({category:'linear',symbol,interval,limit:String(Math.min(1000,limit*multiplier+4))});
    if(before!==undefined)qs.set('end',String(before-1));
    const started=Date.now();
    const res=await fetch('https://api.bybit.com/v5/market/kline?'+qs.toString());
    if(!res.ok)throw new Error(`Bybit REST ${res.status}`);
    const json:any=await res.json();
    if(json?.retCode!==0||!Array.isArray(json?.result?.list))throw new Error(json?.retMsg??'Bybit invalid response');
    const size=TF_MS[baseTf]??60000;
    let candles:HistoricalCandle[]=json.result.list.map((row:any[])=>({
      source:'BYBIT',instrument:symbol,timeframe:baseTf,
      timestamp:Number(row[0]),open:Number(row[1]),high:Number(row[2]),low:Number(row[3]),
      close:Number(row[4]),volume:Number(row[5]),closed:Date.now()>=Number(row[0])+size
    })).sort((a:HistoricalCandle,b:HistoricalCandle)=>a.timestamp-b.timestamp);
    if(multiplier>1)candles=aggregate(candles,tf,'BYBIT',symbol);
    this.health.set('BYBIT',{source:'BYBIT',status:'LIVE',lastUpdate:Date.now(),latencyMs:Date.now()-started,note:'REST + websocket'});
    return candles.slice(-limit);
  }

  private async fetchMexc(symbol:string,tf:AscendTimeframe,limit:number,before?:number):Promise<HistoricalCandle[]>{
    const native=MEXC_INTERVAL[tf];
    const baseTf:AscendTimeframe=native?tf:
      tf==='3m'?'1m':tf==='10m'?'5m':tf==='45m'?'15m':
      tf==='2H'||tf==='6H'?'1H':tf==='12H'?'4H':'15m';
    const interval=MEXC_INTERVAL[baseTf]??'Min15';
    const size=TF_MS[baseTf]??900000;
    const targetSize=TF_MS[tf]??size;
    const multiplier=Math.max(1,Math.round(targetSize/size));
    const endMs=before??Date.now();
    const startMs=endMs-(limit*multiplier+8)*size;
    const url=`https://contract.mexc.com/api/v1/contract/kline/${mexcSymbol(symbol)}?interval=${interval}&start=${Math.floor(startMs/1000)}&end=${Math.floor(endMs/1000)}`;
    const started=Date.now();
    const res=await fetch(url);
    if(!res.ok)throw new Error(`MEXC REST ${res.status}`);
    const json:any=await res.json();
    if(!json?.success||!json?.data?.time)throw new Error(json?.message??'MEXC invalid response');
    const d=json.data;
    let candles:HistoricalCandle[]=d.time.map((time:number,index:number)=>({
      source:'MEXC',instrument:symbol,timeframe:baseTf,timestamp:Number(time)*1000,
      open:Number(d.open[index]),high:Number(d.high[index]),low:Number(d.low[index]),close:Number(d.close[index]),
      volume:Number(d.vol[index]??0),closed:Date.now()>=Number(time)*1000+size
    })).sort((a:HistoricalCandle,b:HistoricalCandle)=>a.timestamp-b.timestamp);
    if(multiplier>1)candles=aggregate(candles,tf,'MEXC',symbol);
    this.health.set('MEXC',{source:'MEXC',status:'LIVE',lastUpdate:Date.now(),latencyMs:Date.now()-started,note:'REST + websocket'});
    return candles.slice(-limit);
  }

  async scanDex(symbolRaw:string){
    const symbol=symbolRaw.toUpperCase();
    const query=symbol.replace(/USDT$/,'');
    try{
      const started=Date.now();
      const res=await fetch('https://api.dexscreener.com/latest/dex/search?q='+encodeURIComponent(query));
      if(!res.ok)throw new Error(`DEX Screener ${res.status}`);
      const json:any=await res.json();
      const pairs=Array.isArray(json?.pairs)?json.pairs.slice(0,25):[];
      const liquidityUsd=pairs.reduce((sum:number,p:any)=>sum+Number(p?.liquidity?.usd??0),0);
      const volume24hUsd=pairs.reduce((sum:number,p:any)=>sum+Number(p?.volume?.h24??0),0);
      const score=Math.round(clamp(Math.log10(Math.max(1,liquidityUsd))*8+Math.log10(Math.max(1,volume24hUsd))*5,0,100));
      const snapshot:DexDiscoverySnapshot={
        source:'DEX_SCANNER',instrument:symbol,timestamp:Date.now(),pairCount:pairs.length,
        liquidityUsd,volume24hUsd,score,canConfirmTrade:false,
        note:'DEX Screener discovery only. Cannot create CONFIRMED/ENTRY.'
      };
      this.dex.set(symbol,snapshot);
      this.health.set('DEX_SCANNER',{source:'DEX_SCANNER',status:'LIVE',lastUpdate:Date.now(),latencyMs:Date.now()-started,note:'discovery only'});
      this.emit(symbol,{type:'dex',instrument:symbol,snapshot});
      return snapshot;
    }catch(error){
      this.health.set('DEX_SCANNER',{source:'DEX_SCANNER',status:'DEGRADED',note:String((error as Error)?.message??error)});
      return this.dex.get(symbol);
    }
  }
}
