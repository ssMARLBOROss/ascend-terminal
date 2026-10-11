import type {IndicatorSettings} from './indicatorSettings';

export type ChartLayers=Pick<IndicatorSettings,
 'volume'|'vwap'|'sessions'|'sessionClock'|'dayLevels'|'sessionLevels'|
 'book'|'stops'|'tpo'|'fvg'|'liquidityMap'>;

/**
 * One source of truth for chart-only visibility.
 * Never disables market feeds, cached journals, research panels, or CORE.
 */
export function resolveChartLayers(settings:IndicatorSettings):ChartLayers{
  if(settings.liquidityOnly)return {
    volume:false,vwap:false,sessions:false,sessionClock:false,
    dayLevels:false,sessionLevels:false,book:false,stops:false,
    tpo:false,fvg:false,liquidityMap:true
  };
  return {
    volume:settings.volume,vwap:settings.vwap,sessions:settings.sessions,
    sessionClock:settings.sessionClock,dayLevels:settings.dayLevels,
    sessionLevels:settings.sessionLevels,book:settings.book,
    stops:settings.stops,tpo:settings.tpo,fvg:settings.fvg,
    liquidityMap:settings.liquidityMap
  };
}
