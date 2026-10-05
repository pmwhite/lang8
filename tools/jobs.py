"""Run independent test jobs concurrently within GNU make's job limit.

Under `make -jN`, a recipe marked with `+` inherits the jobserver, and each
extra concurrent job takes one token from it. Without a jobserver, a run
started by make is serial and a direct run uses every CPU.
"""

import os
import re
import select
import threading
from typing import Callable, Sequence, TypeVar

Item = TypeVar("Item")
Result = TypeVar("Result")


def _jobserver() -> tuple[int, int] | None:
    flags = os.environ.get("MAKEFLAGS", "")
    match = re.search(r"--jobserver-auth=(\S+)", flags)
    if not match:
        return None
    auth = match.group(1)
    try:
        if auth.startswith("fifo:"):
            fd = os.open(auth[5:], os.O_RDWR)
            return fd, fd
        read_fd, write_fd = (int(part) for part in auth.split(","))
        os.fstat(read_fd)
        os.fstat(write_fd)
        return read_fd, write_fd
    except (OSError, ValueError):
        return None


def default_limit() -> int:
    if "MAKEFLAGS" in os.environ:
        return 1
    return os.cpu_count() or 1


def run_all(items: Sequence[Item], work: Callable[[Item], Result], limit: int | None = None) -> list[Result]:
    """Return work(item) for each item, in input order."""
    results: list[Result | None] = [None] * len(items)
    server = _jobserver() if limit is None else None
    if server is None and limit is None:
        limit = default_limit()
    free = threading.Semaphore(limit if server is None else 1)
    threads: list[threading.Thread] = []

    def run(index: int, token: bytes | None) -> None:
        try:
            results[index] = work(items[index])
        finally:
            if token is None:
                free.release()
            else:
                os.write(server[1], token)

    for index in range(len(items)):
        token: bytes | None = None
        # Use the implicit slot when no job holds it; with a jobserver, also
        # accept a token for an extra concurrent job.
        while server is not None and not free.acquire(blocking=False):
            ready, _, _ = select.select([server[0]], [], [], 0.05)
            if ready:
                # Another job may take the token first; the pipe can be
                # nonblocking, so keep waiting rather than fail.
                try:
                    token = os.read(server[0], 1)
                except BlockingIOError:
                    continue
                if token:
                    break
                token = None
        if server is None:
            free.acquire()
        thread = threading.Thread(target=run, args=(index, token))
        thread.start()
        threads.append(thread)
    for thread in threads:
        thread.join()
    return results  # type: ignore[return-value]
