#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptFile);
const rootDir = path.resolve(scriptDir, '..');
const entryFile = path.join(rootDir, 'dist', 'index.js');

const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const HEALTHY_UPTIME_MS = 60_000;

let shuttingDown = false;
let currentChild = null;
let backoffMs = MIN_BACKOFF_MS;

function log(msg) {
  console.log(`[supervisor] ${msg}`);
}

function spawnChild() {
  const startedAt = Date.now();
  const child = spawn(process.execPath, [entryFile], {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: true,
  });

  currentChild = child;
  log(`已启动 bridge 子进程 PID=${child.pid}`);

  child.once('exit', (code, signal) => {
    currentChild = null;
    const uptime = Date.now() - startedAt;

    if (shuttingDown) {
      log(`bridge 子进程退出 (code=${code}, signal=${signal})，supervisor 同步退出`);
      process.exit(0);
      return;
    }

    if (uptime >= HEALTHY_UPTIME_MS) {
      backoffMs = MIN_BACKOFF_MS;
    }

    log(`bridge 子进程退出 (code=${code}, signal=${signal})，uptime=${uptime}ms，${backoffMs}ms 后重启`);

    const delay = backoffMs;
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);

    setTimeout(() => {
      if (!shuttingDown) {
        spawnChild();
      }
    }, delay);
  });

  child.once('error', (err) => {
    log(`bridge 子进程 spawn error: ${err.message}`);
  });
}

function handleShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`收到 ${signal}，通知 bridge 子进程退出`);
  if (currentChild) {
    currentChild.kill('SIGTERM');
    setTimeout(() => {
      if (currentChild) {
        log('bridge 子进程 10s 未退出，发送 SIGKILL');
        currentChild.kill('SIGKILL');
      }
    }, 10_000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGHUP', () => handleShutdown('SIGHUP'));

if (!fs.existsSync(entryFile)) {
  console.error(`[supervisor] 未找到 ${entryFile}，先执行 npm run build`);
  process.exit(1);
}

log('启动');
spawnChild();
