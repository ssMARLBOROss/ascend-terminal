/**
 * Русские подписи пользовательского интерфейса ASCEND.
 * ВАЖНО: торговые статусы и ключи API остаются неизменными (машинный язык).
 * Преобразование делается только при отображении.
 */
export const RU_LABELS:Readonly<Record<string,string>>=Object.freeze({
 'BULLISH':'РОСТ','BEARISH':'ПАДЕНИЕ','BALANCE':'БОКОВИК',
 'SHIFTING':'СМЕНА ФАЗЫ','CORRECTION':'КОРРЕКЦИЯ',
 'ALIGNED':'СОВПАДАЮТ','CONFLICT':'РАСХОЖДЕНИЕ','NEUTRAL':'НЕЙТРАЛЬНО',
 'NO_DATA':'НЕТ ДАННЫХ','NO DATA':'НЕТ ДАННЫХ','NODATA':'НЕТ ДАННЫХ',
 'LONG':'ЛОНГ','SHORT':'ШОРТ',
 'WAIT':'ОЖИДАНИЕ','WATCH':'НАБЛЮДЕНИЕ','SKIP':'ПРОПУСК',
 'ENTRY READY':'ВХОД ПОДТВЕРЖДЁН','READY':'ГОТОВО','OK':'ГОТОВО',
 'BLOCKED':'ЗАБЛОКИРОВАНО','ERROR':'ОШИБКА',
 'EARLY WATCH':'РАННЕЕ НАБЛЮДЕНИЕ','EARLY CANDIDATE':'РАННИЙ КАНДИДАТ',
 'EARLY SKIP':'РАННИЙ СЕТАП ОТКЛОНЁН',
 'SWEEP':'СНЯТИЕ ЛИКВИДНОСТИ','RECLAIM':'ВОЗВРАТ ЗА УРОВЕНЬ',
 'ACCEPTANCE':'ЗАКРЕПЛЕНИЕ','CHECK 1M':'ПРОВЕРКА 1М',
 'BUILDING':'ФОРМИРОВАНИЕ','SCANNING':'СКАНИРОВАНИЕ',
 'TREND':'ТРЕНД','TRANSITION':'ПЕРЕХОД','RANGE':'БОКОВИК',
 'FROZEN':'ЗАФИКСИРОВАН','LIVE':'В ПРЯМОМ ЭФИРЕ',
 'NONE':'НЕТ','EXPIRED':'СРОК ИСТЁК','UNAVAILABLE':'НЕТ ДАННЫХ'
});
export function ruStatus(status:string|undefined|null):string {
 if(!status)return '—';
 return RU_LABELS[status]??status;
}
export function ruDirection(status:string|undefined|null):string{
 return ruStatus(status);
}
/** Только поверхностная подстановка терминов в пояснительном тексте. */
export function ruExplanation(value:string|undefined|null):string{
 if(!value)return '—';
 return value
 .replace(/\bENTRY READY\b/g,'ВХОД ПОДТВЕРЖДЁН')
 .replace(/\bEARLY CANDIDATE\b/g,'РАННИЙ КАНДИДАТ')
 .replace(/\bNO DATA\b/g,'НЕТ ДАННЫХ')
 .replace(/\bSHIFTING\b/g,'СМЕНА ФАЗЫ')
 .replace(/\bLONG\b/g,'ЛОНГ').replace(/\bSHORT\b/g,'ШОРТ')
 .replace(/\bWAIT\b/g,'ОЖИДАНИЕ')
 .replace(/\bSWEEP\b/g,'СНЯТИЕ ЛИКВИДНОСТИ')
 .replace(/\bRECLAIM\b/g,'ВОЗВРАТ ЗА УРОВЕНЬ')
 .replace(/\bACCEPTANCE\b/g,'ЗАКРЕПЛЕНИЕ');
}
