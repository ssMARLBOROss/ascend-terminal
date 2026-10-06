import 'reflect-metadata';
import {Controller,Get,Module,Param,Query,Sse} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {FastifyAdapter,NestFastifyApplication} from '@nestjs/platform-fastify';
import {interval,merge,map} from 'rxjs';
import type {AscendTimeframe,MarketDataSource} from '@ascend/contracts';
import {MarketDataService} from './market-data.service.js';

const sources:MarketDataSource[]=[
 {id:'MEXC',kind:'CEX',enabled:true,capabilities:['UNIVERSE','CANDLES','TRADES','VOLUME','FUNDING','OPEN_INTEREST'],decisionAuthority:'VALIDATION'},
 {id:'BYBIT',kind:'CEX',enabled:true,capabilities:['UNIVERSE','CANDLES','TRADES','VOLUME','FUNDING','OPEN_INTEREST'],decisionAuthority:'VALIDATION'},
 {id:'DEX_SCANNER',kind:'DEX',enabled:true,capabilities:['LIQUIDITY','VOLUME','DISCOVERY'],decisionAuthority:'DISCOVERY_ONLY'}
];

const asTf=(value:string):AscendTimeframe=>value as AscendTimeframe;

@Controller()
class AppController{
 constructor(private readonly market:MarketDataService){}

 @Get('/health')
 health(){
  return{
   ok:true,service:'ascend-data-engine',mode:'LIVE_PUBLIC',
   architecture:'server rolling buffers + source-lazy history',
   storage:{hot:'IN_MEMORY',redis:'PLANNED',postgres:'PLANNED'},
   sources:this.market.sourceHealth()
  };
 }

 @Get('/market/sources')
 marketSources(){
  return{
   mode:'LIVE_PUBLIC',items:sources,health:this.market.sourceHealth(),
   note:'Bybit + MEXC validate market state. DEX scanner is discovery-only and cannot create CONFIRMED/ENTRY.'
  };
 }

 @Get('/market/bootstrap/:symbol')
 bootstrap(
  @Param('symbol')symbol:string,
  @Query('tf')tf='15m',
  @Query('limit')limit='360'
 ){
  return this.market.bootstrapPayload(symbol,asTf(tf),Number(limit)||360);
 }

 @Get('/market/history/:symbol')
 history(
  @Param('symbol')symbol:string,
  @Query('tf')tf='15m',
  @Query('source')source='BYBIT',
  @Query('limit')limit='300',
  @Query('before')before?:string
 ){
  const normalized=source.toUpperCase()==='MEXC'?'MEXC':'BYBIT';
  return this.market.history(symbol,asTf(tf),normalized,Number(limit)||300,before?Number(before):undefined);
 }

 @Get('/market/dex/:symbol')
 dex(@Param('symbol')symbol:string){
  return this.market.scanDex(symbol);
 }

 @Sse('/market/stream/:symbol')
 stream(@Param('symbol')symbol:string){
  const key=symbol.toUpperCase();
  const live=this.market.stream(key).pipe(map(data=>({data})));
  const heartbeat=interval(15000).pipe(map(()=>({data:{type:'heartbeat',instrument:key,timestamp:Date.now()}})));
  return merge(live,heartbeat);
 }
}

@Module({controllers:[AppController],providers:[MarketDataService]})
class AppModule{}

async function bootstrap(){
 const app=await NestFactory.create<NestFastifyApplication>(AppModule,new FastifyAdapter(),{bufferLogs:true});
 app.enableCors({origin:true,credentials:true});
 await app.listen(Number(process.env.PORT??process.env.API_PORT??3001),'0.0.0.0');
}
void bootstrap();
