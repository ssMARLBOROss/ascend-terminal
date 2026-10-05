import 'reflect-metadata';
import {Controller,Get,Module,Param,Query}from '@nestjs/common';
import {NestFactory}from '@nestjs/core';
import {FastifyAdapter,NestFastifyApplication}from '@nestjs/platform-fastify';
import type {MarketChronologyEvent,MarketDataSource,MarketHistoryMeta} from '@ascend/contracts';

const sources:MarketDataSource[]=[
 {id:'MEXC',kind:'CEX',enabled:true,capabilities:['UNIVERSE','CANDLES','TRADES','VOLUME','FUNDING','OPEN_INTEREST'],decisionAuthority:'VALIDATION'},
 {id:'BYBIT',kind:'CEX',enabled:true,capabilities:['UNIVERSE','CANDLES','TRADES','VOLUME','FUNDING','OPEN_INTEREST'],decisionAuthority:'VALIDATION'},
 {id:'OKX',kind:'CEX',enabled:true,capabilities:['UNIVERSE','CANDLES','TRADES','VOLUME','FUNDING','OPEN_INTEREST'],decisionAuthority:'VALIDATION'},
 {id:'BINANCE',kind:'CEX',enabled:true,capabilities:['UNIVERSE','CANDLES','TRADES','VOLUME','FUNDING','OPEN_INTEREST'],decisionAuthority:'VALIDATION'},
 {id:'DEX_SCANNER',kind:'DEX',enabled:true,capabilities:['LIQUIDITY','VOLUME','DISCOVERY'],decisionAuthority:'DISCOVERY_ONLY'}
];

const sampleChronology:MarketChronologyEvent[]=[
 {eventId:'hist-dex-1',sequenceId:-4,instrument:'BTCUSDT',timeframe:'1m',type:'OBSERVE',timestamp:1791189600000,price:86540,session:'NEW_YORK',level:'DEX DISCOVERY',direction:'NEUTRAL',explanation:'DEX volume spike: раннее предупреждение, не торговое подтверждение.',nextExpected:'CEX validation + approach to known liquidity',payload:{dexVolumeRatio:2.8,canConfirmTrade:false},source:'DEX_SCANNER',status:'OBSERVED'},
 {eventId:'hist-break-1',sequenceId:-3,instrument:'BTCUSDT',timeframe:'15m',type:'BREAK',timestamp:1791190200000,price:86620,session:'NEW_YORK',level:'YH 86,590',direction:'LONG',explanation:'Цена закрылась выше YH. Это пробой уровня, но ещё не подтверждение продолжения.',nextExpected:'Acceptance above or reclaim below',payload:{closeAbovePct:0.035},source:'BINANCE',status:'OBSERVED',levelRole:'UNDER_ATTACK',confirmationTimeframe:'15m'},
 {eventId:'hist-flip-1',sequenceId:-2,instrument:'BTCUSDT',timeframe:'10m',type:'FLIP',timestamp:1791190500000,price:86592,session:'NEW_YORK',level:'YH 86,590',direction:'LONG',explanation:'Ретест удержал бывшее сопротивление как поддержку.',nextExpected:'Continuation toward ONH / upper liquidity',payload:{retestHold:true},source:'MEXC',status:'CONFIRMED',levelRole:'FLIPPED',confirmationTimeframe:'10m'}
];

@Controller() class AppController{
 @Get('/health')health(){return{ok:true,service:'ascend-api',mode:'MOCK',architecture:'management-api'}}

 @Get('/market/sources')marketSources(){return{mode:'MOCK',items:sources,note:'DEX is discovery-only and cannot create CONFIRMED/ENTRY'}}

 @Get('/market/history/:symbol/meta')
 historyMeta(@Param('symbol')symbol:string,@Query('tf')tf='1m'):MarketHistoryMeta&{requestedTimeframe:string;mode:'MOCK'}{
  return{
   instrument:symbol.toUpperCase(),
   oldestTimestamp:1767225600000,
   newestTimestamp:1791200000000,
   estimatedCandles:500000,
   storedBaseTimeframe:'1m',
   derivedTimeframes:['1m','3m','5m','10m','15m','30m','45m','1H','2H','4H','6H','12H','1D','1W','1M'],
   pagination:'CURSOR',lazyLoading:true,requestedTimeframe:tf,mode:'MOCK'
  }
 }

 @Get('/market/chronology/:symbol')
 chronology(@Param('symbol')symbol:string){
  return{mode:'MOCK',instrument:symbol.toUpperCase(),items:sampleChronology.filter(x=>x.instrument===symbol.toUpperCase())}
 }
}

@Module({controllers:[AppController]}) class AppModule{}
async function bootstrap(){const app=await NestFactory.create<NestFastifyApplication>(AppModule,new FastifyAdapter());app.enableCors({origin:true,credentials:true});await app.listen(Number(process.env.API_PORT??3001),'0.0.0.0')}
bootstrap();
