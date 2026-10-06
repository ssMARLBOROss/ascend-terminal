import type {Candle} from '@ascend/contracts';

export type RsiSignalType='BULL'|'BEAR'|'PIVOT'|'RC30'|'RC70'|'RSI37_UP'|'RSI63_DOWN';

export type RsiPoint={
  timestamp:number;
  value:number;
};

export type RsiSignal={
  timestamp:number;
  value:number;
  type:RsiSignalType;
  direction:'LONG'|'SHORT'|'NEUTRAL';
  label:string;
};

export function computeRsi(candles:Candle[],length=14):RsiPoint[]{
  if(candles.length<=length)return[];
  const points:RsiPoint[]=[];
  let gainSum=0;
  let lossSum=0;

  for(let i=1;i<=length;i++){
    const delta=candles[i].close-candles[i-1].close;
    if(delta>=0)gainSum+=delta;
    else lossSum+=Math.abs(delta);
  }

  let avgGain=gainSum/length;
  let avgLoss=lossSum/length;

  const rsiValue=()=>{
    if(avgLoss===0)return 100;
    if(avgGain===0)return 0;
    const rs=avgGain/avgLoss;
    return 100-(100/(1+rs));
  };

  points.push({timestamp:candles[length].timestamp,value:rsiValue()});

  for(let i=length+1;i<candles.length;i++){
    const delta=candles[i].close-candles[i-1].close;
    const gain=Math.max(delta,0);
    const loss=Math.max(-delta,0);
    avgGain=((avgGain*(length-1))+gain)/length;
    avgLoss=((avgLoss*(length-1))+loss)/length;
    points.push({timestamp:candles[i].timestamp,value:rsiValue()});
  }

  return points;
}

export function deriveRsiSignals(points:RsiPoint[]):RsiSignal[]{
  if(points.length<3)return[];
  const out:RsiSignal[]=[];

  for(let i=2;i<points.length;i++){
    const a=points[i-2];
    const b=points[i-1];
    const c=points[i];

    if(b.value>30&&c.value<=30){
      out.push({timestamp:c.timestamp,value:c.value,type:'RC30',direction:'LONG',label:'RC30'});
    }
    if(b.value<70&&c.value>=70){
      out.push({timestamp:c.timestamp,value:c.value,type:'RC70',direction:'SHORT',label:'RC70'});
    }
    if(b.value<=30&&c.value>30){
      out.push({timestamp:c.timestamp,value:c.value,type:'BULL',direction:'LONG',label:'Bull'});
    }
    if(b.value>=70&&c.value<70){
      out.push({timestamp:c.timestamp,value:c.value,type:'BEAR',direction:'SHORT',label:'Bear'});
    }
    if(b.value<37&&c.value>=37){
      out.push({timestamp:c.timestamp,value:c.value,type:'RSI37_UP',direction:'LONG',label:'RSI 37↑'});
    }
    if(b.value>63&&c.value<=63){
      out.push({timestamp:c.timestamp,value:c.value,type:'RSI63_DOWN',direction:'SHORT',label:'RSI 63↓'});
    }

    const wasFalling=b.value<a.value;
    const nowRising=c.value>b.value;
    const wasRising=b.value>a.value;
    const nowFalling=c.value<b.value;
    const swing=Math.min(Math.abs(b.value-a.value),Math.abs(c.value-b.value));
    if(swing>=1.5&&wasFalling&&nowRising&&b.value<=48){
      out.push({timestamp:c.timestamp,value:c.value,type:'PIVOT',direction:'LONG',label:'Pivot'});
    }else if(swing>=1.5&&wasRising&&nowFalling&&b.value>=52){
      out.push({timestamp:c.timestamp,value:c.value,type:'PIVOT',direction:'SHORT',label:'Pivot'});
    }
  }

  const priority:Record<RsiSignalType,number>={
    RC30:0,RC70:0,BULL:1,BEAR:1,RSI37_UP:2,RSI63_DOWN:2,PIVOT:3
  };
  const compact:RsiSignal[]=[];
  for(const signal of out){
    const sameBar=compact.filter(x=>x.timestamp===signal.timestamp);
    if(sameBar.length>=2)continue;
    if(sameBar.some(x=>priority[x.type]<=priority[signal.type]&&x.direction===signal.direction))continue;
    compact.push(signal);
  }
  return compact.slice(-160);
}
