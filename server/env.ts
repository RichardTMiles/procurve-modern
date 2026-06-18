import type { ServiceConfig } from "./types.js";

function readBoolean(value: string | undefined, fallback: boolean) {
  if (value == null || value.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readNumber(value: string | undefined, fallback: number) {
  if (value == null || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): ServiceConfig {
  return {
    port: readNumber(process.env.PORT, 3000),
    switchHost: process.env.SWITCH_HOST || "192.168.1.193",
    switchLabel: process.env.SWITCH_LABEL || "HP ProCurve 2810-24G",
    snmpCommunity: process.env.SNMP_COMMUNITY || undefined,
    allowWriteCommands: readBoolean(process.env.ALLOW_WRITE_COMMANDS, false)
  };
}
