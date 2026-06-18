import * as snmp from "net-snmp";
import type { ServiceConfig, SwitchPort, SystemInfo, VlanInfo } from "./types.js";

const SYSTEM_OIDS = {
  sysDescr: "1.3.6.1.2.1.1.1.0",
  sysObjectId: "1.3.6.1.2.1.1.2.0",
  sysUpTime: "1.3.6.1.2.1.1.3.0",
  sysContact: "1.3.6.1.2.1.1.4.0",
  sysName: "1.3.6.1.2.1.1.5.0",
  sysLocation: "1.3.6.1.2.1.1.6.0"
};

const IF_OIDS = {
  descr: "1.3.6.1.2.1.2.2.1.2",
  speed: "1.3.6.1.2.1.2.2.1.5",
  adminStatus: "1.3.6.1.2.1.2.2.1.7",
  operStatus: "1.3.6.1.2.1.2.2.1.8",
  inOctets: "1.3.6.1.2.1.2.2.1.10",
  outOctets: "1.3.6.1.2.1.2.2.1.16",
  alias: "1.3.6.1.2.1.31.1.1.1.18"
};

const VLAN_NAME_OID = "1.3.6.1.2.1.17.7.1.4.3.1.1";
const VLAN_STATUS_OID = "1.3.6.1.2.1.17.7.1.4.3.1.5";

type Varbind = {
  oid: string;
  value: snmp.VarbindValue;
};

function createSession(config: ServiceConfig) {
  if (!config.snmpCommunity) {
    return undefined;
  }

  return snmp.createSession(config.switchHost, config.snmpCommunity, {
    version: snmp.Version2c,
    timeout: 900,
    retries: 0
  });
}

function valueToString(value: unknown) {
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8").replace(/\0/g, "").trim();
  }

  return String(value ?? "").trim();
}

function valueToNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  const parsed = Number(valueToString(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function statusFromNumber(value: unknown): SwitchPort["operStatus"] {
  switch (valueToNumber(value)) {
    case 1:
      return "up";
    case 2:
      return "down";
    case 3:
      return "testing";
    default:
      return "unknown";
  }
}

function formatUptime(ticks: number | undefined) {
  if (ticks == null) {
    return undefined;
  }

  const totalSeconds = Math.floor(ticks / 100);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function getOne(session: snmp.Session, oid: string): Promise<snmp.VarbindValue | undefined> {
  return new Promise((resolve) => {
    session.get([oid], (error, varbinds) => {
      if (error || !varbinds?.[0] || snmp.isVarbindError(varbinds[0])) {
        resolve(undefined);
        return;
      }

      resolve(varbinds[0].value);
    });
  });
}

function walk(session: snmp.Session, oid: string): Promise<Varbind[]> {
  return new Promise((resolve) => {
    const rows: Varbind[] = [];

    session.subtree(
      oid,
      (varbinds) => {
        for (const varbind of varbinds) {
          if (!snmp.isVarbindError(varbind)) {
            rows.push({ oid: varbind.oid, value: varbind.value });
          }
        }
      },
      () => resolve(rows)
    );
  });
}

function indexFromOid(oid: string, baseOid: string) {
  const suffix = oid.startsWith(`${baseOid}.`) ? oid.slice(baseOid.length + 1) : "";
  const parsed = Number(suffix.split(".").at(-1));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapByIndex(rows: Varbind[], baseOid: string) {
  const map = new Map<number, unknown>();

  for (const row of rows) {
    const index = indexFromOid(row.oid, baseOid);
    if (index != null) {
      map.set(index, row.value);
    }
  }

  return map;
}

export async function getSystemInfo(config: ServiceConfig): Promise<Partial<SystemInfo>> {
  const session = createSession(config);
  if (!session) {
    return { snmpEnabled: false };
  }

  try {
    const [sysDescr, sysObjectId, uptimeTicksRaw, contact, sysName, location] = await Promise.all([
      getOne(session, SYSTEM_OIDS.sysDescr),
      getOne(session, SYSTEM_OIDS.sysObjectId),
      getOne(session, SYSTEM_OIDS.sysUpTime),
      getOne(session, SYSTEM_OIDS.sysContact),
      getOne(session, SYSTEM_OIDS.sysName),
      getOne(session, SYSTEM_OIDS.sysLocation)
    ]);
    const uptimeTicks = valueToNumber(uptimeTicksRaw);
    const hasSnmpData = Boolean(sysDescr || sysObjectId || uptimeTicksRaw || contact || sysName || location);

    return {
      snmpEnabled: hasSnmpData,
      sysDescr: sysDescr ? valueToString(sysDescr) : undefined,
      sysObjectId: sysObjectId ? valueToString(sysObjectId) : undefined,
      uptimeTicks,
      uptimeText: formatUptime(uptimeTicks),
      contact: contact ? valueToString(contact) : undefined,
      sysName: sysName ? valueToString(sysName) : undefined,
      location: location ? valueToString(location) : undefined
    };
  } finally {
    session.close();
  }
}

export async function getPorts(config: ServiceConfig): Promise<SwitchPort[]> {
  const session = createSession(config);
  if (!session) {
    return fallbackPorts();
  }

  try {
    const [descrRows, aliasRows, speedRows, adminRows, operRows, inRows, outRows] = await Promise.all([
      walk(session, IF_OIDS.descr),
      walk(session, IF_OIDS.alias),
      walk(session, IF_OIDS.speed),
      walk(session, IF_OIDS.adminStatus),
      walk(session, IF_OIDS.operStatus),
      walk(session, IF_OIDS.inOctets),
      walk(session, IF_OIDS.outOctets)
    ]);

    const descr = mapByIndex(descrRows, IF_OIDS.descr);
    const alias = mapByIndex(aliasRows, IF_OIDS.alias);
    const speed = mapByIndex(speedRows, IF_OIDS.speed);
    const admin = mapByIndex(adminRows, IF_OIDS.adminStatus);
    const oper = mapByIndex(operRows, IF_OIDS.operStatus);
    const inOctets = mapByIndex(inRows, IF_OIDS.inOctets);
    const outOctets = mapByIndex(outRows, IF_OIDS.outOctets);
    const indexes = [...descr.keys()].sort((a, b) => a - b);

    if (indexes.length === 0) {
      return fallbackPorts();
    }

    return indexes.map((index) => ({
      index,
      name: valueToString(descr.get(index)) || `Port ${index}`,
      alias: valueToString(alias.get(index)) || undefined,
      adminStatus: statusFromNumber(admin.get(index)),
      operStatus: statusFromNumber(oper.get(index)),
      speedMbps: Math.round((valueToNumber(speed.get(index)) ?? 0) / 1_000_000) || undefined,
      inOctets: valueToNumber(inOctets.get(index)),
      outOctets: valueToNumber(outOctets.get(index)),
      detectedVia: "snmp"
    }));
  } finally {
    session.close();
  }
}

export async function getVlans(config: ServiceConfig): Promise<VlanInfo[]> {
  const session = createSession(config);
  if (!session) {
    return [];
  }

  try {
    const [names, statuses] = await Promise.all([walk(session, VLAN_NAME_OID), walk(session, VLAN_STATUS_OID)]);
    const statusById = mapByIndex(statuses, VLAN_STATUS_OID);

    const rows: VlanInfo[] = [];

    for (const row of names) {
      const id = indexFromOid(row.oid, VLAN_NAME_OID);
      if (id == null) {
        continue;
      }

      const status = vlanStatus(valueToNumber(statusById.get(id)));
      rows.push({
        id,
        name: valueToString(row.value) || `VLAN ${id}`,
        ...(status ? { status } : {})
      });
    }

    return rows.sort((a, b) => a.id - b.id);
  } finally {
    session.close();
  }
}

function vlanStatus(value: number | undefined) {
  switch (value) {
    case 1:
      return "other";
    case 2:
      return "permanent";
    case 3:
      return "dynamic";
    default:
      return undefined;
  }
}

function fallbackPorts(): SwitchPort[] {
  return Array.from({ length: 24 }, (_, index) => ({
    index: index + 1,
    name: `${index + 1}`,
    adminStatus: "unknown",
    operStatus: "unknown",
    detectedVia: "fallback"
  }));
}
