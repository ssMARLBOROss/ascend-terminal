import type{AscendEvent,LiquidityCluster,MarketLevel}from '@ascend/contracts';
export interface ChartAdapter{mount(container:HTMLElement):void;setInstrument(symbol:string):void;setLevels(levels:MarketLevel[]):void;setClusters(clusters:LiquidityCluster[]):void;setEvents(events:AscendEvent[]):void;destroy():void;}
export class MockChartAdapter implements ChartAdapter{private container?:HTMLElement;mount(container:HTMLElement){this.container=container}setInstrument(){}setLevels(){}setClusters(){}setEvents(){}destroy(){if(this.container)this.container.innerHTML=''}}
// Phase 2: implement LightweightChartsAdapter behind this contract. Terminal/Core must not depend on a concrete chart library.
