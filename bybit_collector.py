from __future__ import annotations

import asyncio
import logging

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
    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        await history_store.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
