import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { loadConfig, projectRoot, runtimePath, ensureRuntimeDirectories } from "./config.mjs";

const config = loadConfig(process.env.FEISHU_QA_CONFIG);
const settings = config.autostart || {};
const processName = settings.appProcessName || "Feishu";
const pollIntervalMs = Math.max(Number(settings.pollIntervalMs) || 10000, 3000);
const lockPath = runtimePath(config, "autostart.lock");
const logPath = runtimePath(config, "autostart.log");
const listenerLogPath = runtimePath(config, "autostart-listener.log");

ensureRuntimeDirectories(config);

function appendLog(message) {
  fs.appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, "utf8");
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  if (fs.existsSync(lockPath)) {
    const oldPid = Number(fs.readFileSync(lockPath, "utf8").trim());
    if (processExists(oldPid)) return false;
    fs.rmSync(lockPath, { force: true });
  }
  fs.writeFileSync(lockPath, String(process.pid), { encoding: "utf8", flag: "wx" });
  return true;
}

function runPowerShell(script) {
  return spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { encoding: "utf8", windowsHide: true, timeout: 10000 }
  );
}

function isFeishuRunning() {
  const result = runPowerShell(`if (Get-Process -Name '${processName.replaceAll("'", "''")}' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`);
  return result.status === 0;
}

function isAnyListenerRunning() {
  const result = runPowerShell("$p = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'src[\\\\/]main\\.mjs listen' }; if ($p) { exit 0 } else { exit 1 }");
  return result.status === 0;
}

if (settings.enabled === false) process.exit(0);
if (!acquireLock()) process.exit(0);

let listener = null;
let externalListenerObserved = false;
let lastStartAt = 0;
let checking = false;

function startListener() {
  const stdout = fs.createWriteStream(listenerLogPath, { flags: "a", encoding: "utf8" });
  listener = spawn(process.execPath, [path.join(projectRoot, "src", "main.mjs"), "listen"], {
    cwd: projectRoot,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  lastStartAt = Date.now();
  appendLog(`listener-started pid=${listener.pid}`);
  listener.stdout.pipe(stdout, { end: false });
  listener.stderr.pipe(stdout, { end: false });
  listener.on("close", (code) => {
    appendLog(`listener-exited code=${code}`);
    stdout.end();
    listener = null;
  });
  listener.on("error", (error) => appendLog(`listener-error ${error.message}`));
}

function stopOwnedListener(reason) {
  if (!listener) return;
  appendLog(`listener-stop-requested reason=${reason}`);
  listener.stdin.end();
}

async function check() {
  if (checking) return;
  checking = true;
  try {
    const feishuRunning = isFeishuRunning();
    if (!feishuRunning) {
      externalListenerObserved = false;
      if (settings.stopWhenAppCloses !== false) stopOwnedListener("feishu-closed");
      return;
    }
    if (listener) return;
    if (isAnyListenerRunning()) {
      if (!externalListenerObserved) appendLog("existing-listener-observed; duplicate-start-skipped");
      externalListenerObserved = true;
      return;
    }
    externalListenerObserved = false;
    if (Date.now() - lastStartAt >= 15000) startListener();
  } catch (error) {
    appendLog(`watch-error ${error.message}`);
  } finally {
    checking = false;
  }
}

function shutdown(signal) {
  appendLog(`watcher-stop signal=${signal}`);
  stopOwnedListener(signal);
  fs.rmSync(lockPath, { force: true });
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", () => {
  try {
    if (fs.existsSync(lockPath) && Number(fs.readFileSync(lockPath, "utf8").trim()) === process.pid) {
      fs.rmSync(lockPath, { force: true });
    }
  } catch {
    // 退出清理失败不会影响下次的陈旧锁检测。
  }
});

appendLog(`watcher-started pid=${process.pid} app=${processName} intervalMs=${pollIntervalMs}`);
await check();
setInterval(check, pollIntervalMs);
