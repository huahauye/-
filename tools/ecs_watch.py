"""Waits for the ECS host to start answering SSH again.

The instance's sshd stopped sending protocol banners (TCP connects, no data) while
nginx and the worker stayed up. This polls until a real login works, then exits
so the caller can resume deployment.

    python ecs_watch.py [minutes]
"""

import pathlib
import socket
import sys
import time

import paramiko

ENV_FILE = pathlib.Path(__file__).with_name("ecs.env")
PASSWORD = ""
for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
    if raw.strip().startswith("ECS_PASSWORD="):
        PASSWORD = raw.strip().split("=", 1)[1]

HOST = "39.108.58.140"
DEADLINE = time.time() + float(sys.argv[1] if len(sys.argv) > 1 else 30) * 60
attempt = 0

while time.time() < DEADLINE:
    attempt += 1
    stamp = time.strftime("%H:%M:%S")
    banner = None
    try:
        with socket.create_connection((HOST, 22), timeout=15) as probe:
            probe.settimeout(15)
            banner = probe.recv(64)
    except Exception as error:  # noqa: BLE001
        print(f"[{stamp}] attempt {attempt}: banner probe failed: {type(error).__name__}", flush=True)

    if banner and banner.startswith(b"SSH-"):
        print(f"[{stamp}] attempt {attempt}: banner received: {banner!r}", flush=True)
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(HOST, username="root", password=PASSWORD, timeout=60, banner_timeout=120,
                           auth_timeout=120, look_for_keys=False, allow_agent=False)
            _, stdout, _ = client.exec_command("uptime; systemctl is-active oa-web oa-worker nginx 2>&1", timeout=60)
            print("SSH IS BACK:\n" + stdout.read().decode("utf-8", errors="replace"), flush=True)
            client.close()
            raise SystemExit(0)
        except SystemExit:
            raise
        except Exception as error:  # noqa: BLE001
            print(f"[{stamp}] attempt {attempt}: login failed: {type(error).__name__}: {error}", flush=True)
    else:
        print(f"[{stamp}] attempt {attempt}: no banner yet", flush=True)

    time.sleep(45)

print("watcher timed out without regaining SSH", flush=True)
raise SystemExit(1)
