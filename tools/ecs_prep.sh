#!/bin/bash
# Foundation for the self-hosted OA agent: swap, PostgreSQL, nginx, Node 22, pnpm.
set -uo pipefail
export DEBIAN_FRONTEND=noninteractive

step() { echo; echo "########## $* ##########"; }

step "swap"
if ! swapon --show | grep -q '/swapfile'; then
  if fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none; then
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile && echo "swap enabled"
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
    sysctl -w vm.swappiness=10 >/dev/null
  else
    echo "SWAP CREATION FAILED"
  fi
else
  echo "swap already present"
fi
swapon --show
free -m | sed -n '1,3p'

step "apt update"
apt-get update -y 2>&1 | tail -5

step "apt install base packages"
apt-get install -y --no-install-recommends \
  nginx postgresql postgresql-contrib postgresql-client ca-certificates curl gnupg rsync 2>&1 | tail -8

step "node 22"
if command -v node >/dev/null 2>&1; then
  echo "node already installed: $(node --version)"
else
  if curl -fsSL --max-time 60 https://deb.nodesource.com/setup_22.x -o /tmp/nodesource.sh; then
    bash /tmp/nodesource.sh >/dev/null 2>&1 && apt-get install -y nodejs 2>&1 | tail -4
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "NodeSource failed, falling back to the official tarball"
    ARCH=$(dpkg --print-architecture)
    case "$ARCH" in
      amd64) NODE_ARCH=x64 ;;
      arm64) NODE_ARCH=arm64 ;;
      *) NODE_ARCH=x64 ;;
    esac
    NODE_VERSION=v22.20.0
    curl -fsSL --max-time 300 "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -o /tmp/node.tar.xz \
      && mkdir -p /usr/local/lib/nodejs \
      && tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs \
      && ln -sf "/usr/local/lib/nodejs/node-${NODE_VERSION}-linux-${NODE_ARCH}/bin/node" /usr/local/bin/node \
      && ln -sf "/usr/local/lib/nodejs/node-${NODE_VERSION}-linux-${NODE_ARCH}/bin/npm" /usr/local/bin/npm \
      && ln -sf "/usr/local/lib/nodejs/node-${NODE_VERSION}-linux-${NODE_ARCH}/bin/npx" /usr/local/bin/npx \
      && ln -sf "/usr/local/lib/nodejs/node-${NODE_VERSION}-linux-${NODE_ARCH}/bin/corepack" /usr/local/bin/corepack
  fi
fi
echo "node: $(command -v node) $(node --version 2>/dev/null)"
echo "npm:  $(command -v npm) $(npm --version 2>/dev/null)"

step "pnpm"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
if ! command -v pnpm >/dev/null 2>&1; then
  (corepack enable && corepack prepare pnpm@11.19.0 --activate) 2>&1 | tail -3 || true
fi
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@11.19.0 2>&1 | tail -3
fi
echo "pnpm: $(command -v pnpm) $(pnpm --version 2>/dev/null)"

step "services"
systemctl enable --now postgresql >/dev/null 2>&1 || true
systemctl is-active postgresql
systemctl enable --now nginx >/dev/null 2>&1 || true
systemctl is-active nginx
psql --version
nginx -v 2>&1

step "done"
