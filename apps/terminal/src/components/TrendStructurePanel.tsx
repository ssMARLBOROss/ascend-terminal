import type {TrendStructureSnapshot,TrendState,TrendStructureRow} from '../market/trendStructureResearch';
import type {ExpandedTrendSnapshot} from '../market/useExpandedTrendResearch';

const label:Record<TrendState,string>={
  LONG:'ВОСХОДЯЩИЙ',SHORT:'НИСХОДЯЩИЙ',BALANCE:'БАЛАНС',
  TRANSITION:'ПЕРЕХОД', 'NO DATA':'НЕТ ДАННЫХ'
};
const time=(at?:number)=>at?new Date(at).toLocaleTimeString('ru-RU',{
  timeZone:'UTC',hour:'2-digit',minute:'2-digit'}):'—';
const sign=(value?:string)=>value??'—';
function Row({row}:{row:TrendStructureRow}){
  return <div className={'asc-trend-tf asc-trend-'+row.trend.toLowerCase().replace(' ','-')}>
    <div className="asc-trend-tf-head">
      <strong>{row.tf}</strong><b>{label[row.trend]}</b>
    </div>
    <div className="asc-trend-swings">
      <span className={row.high==='HH'?'up':row.high==='LH'?'down':''}>{sign(row.high)}</span>
      <span className={row.low==='HL'?'up':row.low==='LL'?'down':''}>{sign(row.low)}</span>
    </div>
    <small>{row.reason}</small>
    <footer>{row.at?'SWING '+time(row.at)+' UTC':'Нет двух подтверждённых пар экстремумов'}</footer>
  </div>;
}

/** Trend observations are deliberately separate from entry permission:
 * swing sequence != sweep/reclaim, break/retest or confirmed 1m entry.
 */
export default function TrendStructurePanel({snapshot,extended}:{
  snapshot:TrendStructureSnapshot;extended?:ExpandedTrendSnapshot
}){
  const heading=snapshot.alignment==='LONG'?'ВОСХОДЯЩИЙ ТРЕНД':
    snapshot.alignment==='SHORT'?'НИСХОДЯЩИЙ ТРЕНД':
    snapshot.alignment==='CONFLICT'?'КОНФЛИКТ 30m / 15m':'НАПРАВЛЕНИЕ НЕ ПОДТВЕРЖДЕНО';
  const setup=snapshot.setupDirection??'НЕ СФОРМИРОВАНО';
  return <section className="asc-trend-panel"
    aria-label="Структура тренда и направление рынка ASCEND">
    <header>
      <div><strong>STRUCTURE · TREND · DIRECTION</strong>
        <small>1m → 1D · реальные закрытые свечи Bybit · HH/HL, LH/LL · UTC</small></div>
      <span>RESEARCH / не ENTRY</span>
    </header>
    <div className="asc-trend-overview">
      <div>
        <small>НАПРАВЛЕНИЕ РЫНКА · 30m + 15m</small>
        <strong className={'asc-trend-primary '+snapshot.alignment.toLowerCase()}>{heading}</strong>
      </div>
      <div>
        <small>НАПРАВЛЕНИЕ СЕТАПА · SWEEP / RECLAIM</small>
        <strong className="asc-trend-setup">{setup}</strong>
        {snapshot.setupConflict&&<em>КОНФЛИКТ С ПОДТВЕРЖДЁННЫМ ТРЕНДОМ</em>}
      </div>
    </div>
    <div className="asc-trend-grid">{(extended?.rows??snapshot.rows).map(row=>
      <Row key={row.tf} row={row}/>)}</div>
    {extended&&<p className="asc-trend-note">
      Дополнительные 45m / 1H / 2H / 4H / 6H / 12H / 1D — наблюдение,
      не разрешение на сделку. {extended.status==='error'?
        'Ошибка исторического источника: '+(extended.reason??'нет данных'):
        extended.fresh?'История обновлена · 30m/15m наблюдение: '+extended.observed30m15m:
          'Исторический источник загружается или устарел; неопределённые TF = NO DATA'}
    </p>}
    <p className="asc-trend-note">Структура = последовательность подтверждённых максимумов
      и минимумов. Тренд = HH+HL вверх / LH+LL вниз.
      Направление сетапа определяется отдельно после снятия ликвидности.
      Касание уровня или один разворот свечи сами по себе вход не подтверждают.
      При конфликте старших таймфреймов не подменяем результат направлением 1m.</p>
  </section>;
}
