import type { CliResult, Credentials, SwitchMacEntry, SwitchNeighbor, SwitchPort, SystemInfo, VlanInfo } from "./types";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new Error(payload?.error || `${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export function fetchSystemInfo() {
  return api<SystemInfo>("/api/switch/status");
}

export function fetchPorts() {
  return api<SwitchPort[]>("/api/switch/ports");
}

export function fetchVlans() {
  return api<VlanInfo[]>("/api/switch/vlans");
}

export function fetchNeighbors() {
  return api<SwitchNeighbor[]>("/api/switch/neighbors");
}

export function fetchMacTable() {
  return api<SwitchMacEntry[]>("/api/switch/mac-table");
}

export function runCommands(credentials: Credentials, commands: string[]) {
  return api<CliResult>("/api/switch/cli", {
    method: "POST",
    body: JSON.stringify({
      transport: credentials.transport,
      username: credentials.username || undefined,
      password: credentials.password || undefined,
      commands
    })
  });
}

export function backupConfig(credentials: Credentials) {
  return api<CliResult>("/api/switch/backup", {
    method: "POST",
    body: JSON.stringify({
      transport: credentials.transport,
      username: credentials.username || undefined,
      password: credentials.password || undefined
    })
  });
}
