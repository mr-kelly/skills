from __future__ import annotations

import os
import signal
import socket
import subprocess
import threading
import time
import urllib.request
from contextlib import contextmanager
from pathlib import Path


def free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def wait_for_http(url: str, process: subprocess.Popen[str], logs: list[str], timeout: float = 45) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise AssertionError(f"Process exited before {url} was ready\n{''.join(logs[-100:])}")
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status < 400:
                    return
        except Exception:
            time.sleep(0.15)
    raise AssertionError(f"Timed out waiting for {url}\n{''.join(logs[-100:])}")


@contextmanager
def managed_process(command: list[str], cwd: Path, env: dict[str, str], ready_url: str, timeout: float = 45):
    logs: list[str] = []
    process = subprocess.Popen(
        command,
        cwd=cwd,
        env={**os.environ, **env},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        start_new_session=True,
    )

    def collect() -> None:
        assert process.stdout is not None
        for line in process.stdout:
            logs.append(line)
            if len(logs) > 500:
                del logs[:100]

    threading.Thread(target=collect, daemon=True).start()
    try:
        wait_for_http(ready_url, process, logs, timeout)
        yield process, logs
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=5)
