import {useEffect,useState} from 'react';
import {CvdAccumulator,parseTradeFrame,type CvdInterval,type CvdSnapshot} from './cvdEngine';

const WSS='wss://stream.bybit.com/v5/public/linear';
export type ContinuousCvd={symbol:string;status:'CONNECTING'|'LIVE'|'GAP'|'STALE';
  data?:CvdSnapshot;lastError?:string;updatedAt?:number};

/**
 * CVD V1: trade-by-trade from Bybit publicTrade for the SELECTED symbol only.
 *
 * Not a background recorder. Each websocket reconnect/new chart session creates
 * an independent segment. No REST approximation or fabricated gap fills.
 */
export function useContinuousCvd(symbol:string,enabled:boolean,interval:CvdInterval){
  const[state,setState]=useState<ContinuousCvd>({symbol,status:'CONNECTING'});
  useEffect(()=>{
    if(!enabled){
      setState({symbol,status:'CONNECTING'});
      return;
    }
    let stopped=false;
    let ws:WebSocket|undefined;
    let retry:number|undefined,ping:number|undefined,flush:number|undefined;
    let retries=0,everConnected=false;
    let engine:CvdAccumulator|undefined;
    let lastMessageAt=Date.now();
    let lastPublishAt=0;
    let connecting=false;
    const publish=()=>{
      if(stopped||!engine)return;
      const snap=engine.snapshot(interval,Date.now());
      setState({symbol,status:snap.health,data:snap,updatedAt:Date.now(),
        lastError:snap.gapReason});
      lastPublishAt=Date.now();
    };
    const terminate=(reason:string)=>{
      if(stopped)return;
      if(engine)engine.gap(reason);
      publish();
      try{ws?.close()}catch{/* safely stop socket */}
    };
    const connect=()=>{
      if(stopped||connecting)return;
      connecting=true;
      if(retry!==undefined){window.clearTimeout(retry);retry=undefined}
      if(ping!==undefined){window.clearInterval(ping);ping=undefined}
      if(flush!==undefined){window.clearInterval(flush);flush=undefined}
      try{
        const socket=new WebSocket(WSS);
        ws=socket;
        socket.onopen=()=>{
          if(stopped){socket.close();return}
          connecting=false;
          engine=new CvdAccumulator(symbol,Date.now(),
            everConnected?'RECONNECTED_AFTER_UNVERIFIED_GAP':'STREAM_STARTED');
          everConnected=true;
          retries=0;
          lastMessageAt=Date.now();
          socket.send(JSON.stringify({op:'subscribe',args:['publicTrade.'+symbol]}));
          publish();
          ping=window.setInterval(()=>{
            if(socket.readyState!==WebSocket.OPEN)return;
            if(Date.now()-lastMessageAt>90000){terminate('WEBSOCKET_TIMEOUT');return}
            socket.send(JSON.stringify({op:'ping'}));
          },20000);
          flush=window.setInterval(()=>{publish()},3000);
        };
        socket.onmessage=(event:MessageEvent<string>)=>{
          if(stopped||socket!==ws||!engine)return;
          lastMessageAt=Date.now();
          let packet:unknown;
          try{packet=JSON.parse(event.data)}catch{return}
          const trades=parseTradeFrame(packet,symbol);
          if(trades.length===0)return;
          const count=engine.add(trades,Date.now());
          if(engine.segment.health==='GAP'){
            terminate(engine.segment.gapReason??'ORDER_UNCERTAIN');return;
          }
          if(count&&Date.now()-lastPublishAt>850)publish();
        };
        socket.onerror=()=>{if(!stopped)terminate('SOCKET_ERROR')};
        socket.onclose=()=>{
          if(ping!==undefined)window.clearInterval(ping);
          if(flush!==undefined)window.clearInterval(flush);
          connecting=false;
          if(stopped)return;
          if(engine&&engine.segment.health!=='GAP')engine.gap('SOCKET_DISCONNECTED');
          publish();
          retries++;
          retry=window.setTimeout(connect,Math.min(30000,1000*2**Math.min(4,retries-1)));
        };
      }catch{
        connecting=false;
        if(stopped)return;
        setState({symbol,status:'GAP',lastError:'WEBSOCKET_UNAVAILABLE'});
        retries++;
        retry=window.setTimeout(connect,Math.min(30000,1000*2**Math.min(4,retries-1)));
      }
    };
    setState({symbol,status:'CONNECTING'});
    connect();
    return()=>{
      stopped=true;
      if(retry!==undefined)window.clearTimeout(retry);
      if(ping!==undefined)window.clearInterval(ping);
      if(flush!==undefined)window.clearInterval(flush);
      if(ws){
        ws.onopen=null;ws.onmessage=null;ws.onerror=null;ws.onclose=null;
        ws.close();
      }
    };
  },[symbol,enabled,interval]);

  return state.symbol===symbol&&enabled?state:{symbol,status:'CONNECTING'} as ContinuousCvd;
}
