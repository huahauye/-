"""Minimal SSH/SFTP helper for the Aliyun ECS box that will host the app.

The host and account live here; the password is read from `ecs.env` beside this
file so it never appears on a command line or in shell history.

    python ecs.py run "uname -a"
    python ecs.py script deploy.sh        # runs a local file remotely via bash -s
    python ecs.py put local.txt /root/x   # upload
    python ecs.py get /root/x local.txt   # download
"""

import os
import pathlib
import sys
import time

import paramiko

# Remote output is UTF-8; the default Windows console code page would mangle it.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HOST = "39.108.58.140"
USER = "root"
ENV_FILE = pathlib.Path(__file__).with_name("ecs.env")


def password() -> str:
    for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith("ECS_PASSWORD="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("ECS_PASSWORD missing from ecs.env")


def connect() -> paramiko.SSHClient:
    """Connects with generous timeouts and retries.

    The box is a small 2 vCPU / 1.6 GB instance: while a build runs, a fresh SSH
    handshake can take much longer than the default timeouts allow.

    Set ECS_SOCKS=host:port to reach the host through a SOCKS5 proxy, which also
    changes the source IP if the direct address has been rate limited.
    """
    last_error: Exception | None = None
    proxy = os.environ.get("ECS_SOCKS", "")
    for attempt in range(1, 6):
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        sock = None
        try:
            if proxy:
                import socks  # provided by PySocks

                host, _, port = proxy.partition(":")
                sock = socks.socksocket()
                sock.set_proxy(socks.SOCKS5, host, int(port or 1080))
                sock.settimeout(60)
                sock.connect((HOST, 22))
                print(f"[ssh] attempt {attempt} via socks {proxy}", file=sys.stderr)
            client.connect(
                HOST,
                username=USER,
                password=password(),
                sock=sock,
                timeout=60,
                banner_timeout=180,
                auth_timeout=180,
                channel_timeout=180,
                look_for_keys=False,
                allow_agent=False,
            )
            transport = client.get_transport()
            if transport is not None:
                transport.set_keepalive(30)
            return client
        except Exception as error:  # noqa: BLE001
            last_error = error
            print(f"[ssh] attempt {attempt} failed: {type(error).__name__}: {error}", file=sys.stderr)
            try:
                client.close()
            except Exception:  # noqa: BLE001
                pass
            time.sleep(10)
    raise SystemExit(f"could not connect to {HOST}: {last_error}")


def run_script(script: str) -> int:
    with connect() as client:
        # stderr is folded into stdout so a single read cannot deadlock.
        stdin, stdout, _ = client.exec_command("bash -s 2>&1", timeout=3600)
        stdin.write(script.encode("utf-8"))
        stdin.flush()
        stdin.channel.shutdown_write()
        sys.stdout.write(stdout.read().decode("utf-8", errors="replace"))
        code = stdout.channel.recv_exit_status()
        print(f"[remote exit {code}]")
        return code


def main() -> int:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    action = sys.argv[1]

    if action == "run":
        return run_script(sys.argv[2] if len(sys.argv) > 2 else sys.stdin.read())

    if action == "script":
        script = pathlib.Path(sys.argv[2]).read_text(encoding="utf-8").lstrip("\ufeff")
        return run_script(script)

    if action in {"put", "get"}:
        local, remote = sys.argv[2], sys.argv[3]
        with connect() as client:
            with client.open_sftp() as sftp:
                if action == "put":
                    sftp.put(local, remote)
                else:
                    sftp.get(remote, local)
        print(f"{action} ok: {local} <-> {remote}")
        return 0

    raise SystemExit(f"unknown action: {action}")


if __name__ == "__main__":
    raise SystemExit(main())
