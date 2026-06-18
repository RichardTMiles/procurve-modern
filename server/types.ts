export type ServiceConfig = {
  port: number;
  switchHost: string;
  switchLabel: string;
  snmpCommunity?: string;
  allowWriteCommands: boolean;
};

export type TcpProbe = {
  port: number;
  name: string;
  open: boolean;
  latencyMs?: number;
  error?: string;
};

export type SystemInfo = {
  host: string;
  label: string;
  sysName?: string;
  sysDescr?: string;
  sysObjectId?: string;
  uptimeTicks?: number;
  uptimeText?: string;
  contact?: string;
  location?: string;
  httpTitle?: string;
  managementPorts: TcpProbe[];
  snmpEnabled: boolean;
  writeCommandsEnabled: boolean;
};

export type PortStatus = "up" | "down" | "testing" | "unknown";

export type SwitchPort = {
  index: number;
  name: string;
  alias?: string;
  adminStatus: PortStatus;
  operStatus: PortStatus;
  speedMbps?: number;
  macAddress?: string;
  inOctets?: number;
  outOctets?: number;
  detectedVia: "snmp" | "fallback";
};

export type VlanInfo = {
  id: number;
  name: string;
  status?: string;
};

export type CliTransport = "ssh" | "telnet";

export type CliRequest = {
  transport: CliTransport;
  username?: string;
  password?: string;
  commands: string[];
  timeoutMs?: number;
};

export type CliResult = {
  transport: CliTransport;
  host: string;
  commands: string[];
  writeBlocked: boolean;
  output: string;
};

export type CommandSafety = {
  writeDetected: boolean;
  blockedCommands: string[];
};
