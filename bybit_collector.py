from __future__ import annotations

import asyncio
import logging
import os

import history_store

logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("ascend.bybit_collector")


async def main() -> None:
    ready = False
    for attempt in range(8):
        try:
            ready = await history_store.init()
            if ready:
                break
        except Exception:
            logger.exception("history collector init failed (attempt %s/8)", attempt + 1)
        await asyncio.sleep(5)

    if not ready:
        raise RuntimeError("history storage could not initialize")

    logger.info("Bybit history collector running")
    participation_task = None
    if os.getenv("MARKET_PARTICIPATION_ENABLED", "0") == "1":
        import market_participation_collector_v1
        participation_task = asyncio.create_task(
            market_participation_collector_v1.run(history_store._pool),
            name="ascend-market-participation-v1",
        )
    try:
        while True:
            if participation_task is not None and participation_task.done():
                # Do not silently lose the collector: Railway must restart on fatal errors.
                await participation_task
                raise RuntimeError("market participation collector exited")
            await asyncio.sleep(10)
    finally:
        if participation_task is not None:
            participation_task.cancel()
            await asyncio.gather(participation_task, return_exceptions=True)
        await history_store.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
