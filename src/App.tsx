import {
  Activity,
  AlertTriangle,
  Boxes,
  Cable,
  CheckCircle2,
  ClipboardList,
  Download,
  FileDown,
  Gauge,
  GitBranch,
  KeyRound,
  ListFilter,
  Network,
  Pause,
  Play,
  PlayCircle,
  RefreshCw,
  Router,
  Search,
  ShieldAlert,
  TimerReset,
  TerminalSquare
} from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { backupConfig, fetchNeighbors, fetchPorts, fetchSystemInfo, fetchVlans, runCommands } from "./api";
import type { CliResult, Credentials, SwitchNeighbor, SwitchPort, SystemInfo, VlanInfo } from "./types";

const PRESETS = [
  { label: "Version", commands: ["show version"] },
  { label: "Flash", commands: ["show flash"] },
  { label: "IP Config", commands: ["show ip"] },
  { label: "Interfaces", commands: ["show interfaces brief"] },
  { label: "Counters", commands: ["show interfaces counters"] },
  { label: "VLANs", commands: ["show vlans"] },
  { label: "Trunks", commands: ["show trunks"] },
  { label: "MAC Table", commands: ["show mac-address"] },
  { label: "LLDP", commands: ["show lldp info remote-device"] },
  { label: "STP", commands: ["show spanning-tree"] },
  { label: "Event Log", commands: ["show logging -r"] },
  { label: "Running Config", commands: ["show running-config"] }
];

type View = "dashboard" | "ports" | "vlans" | "neighbors" | "config" | "console";

const NAV_ITEMS: Array<{ id: View; label: string; icon: typeof Router }> = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "ports", label: "Ports", icon: Cable },
  { id: "vlans", label: "VLANs", icon: Network },
  { id: "neighbors", label: "Neighbors", icon: GitBranch },
  { id: "config", label: "Config", icon: ClipboardList },
  { id: "console", label: "Console", icon: TerminalSquare }
];

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [system, setSystem] = useState<SystemInfo>();
  const [ports, setPorts] = useState<SwitchPort[]>([]);
  const [vlans, setVlans] = useState<VlanInfo[]>([]);
  const [neighbors, setNeighbors] = useState<SwitchNeighbor[]>([]);
  const [selectedPort, setSelectedPort] = useState<number>();
  const [credentials, setCredentials] = useState<Credentials>({ transport: "telnet", username: "", password: "" });
  const [customCommands, setCustomCommands] = useState("show version");
  const [result, setResult] = useState<CliResult>();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const [systemInfo, portRows, vlanRows, neighborRows] = await Promise.all([
        fetchSystemInfo(),
        fetchPorts(),
        fetchVlans(),
        fetchNeighbors()
      ]);
      const firstPhysicalPort = portRows.find(isPhysicalPort) ?? portRows[0];
      setSystem(systemInfo);
      setPorts(portRows);
      setVlans(vlanRows);
      setNeighbors(neighborRows);
      setSelectedPort((current) => current ?? firstPhysicalPort?.index);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load switch state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void load();
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [autoRefresh, load]);

  const selectedPortRow = useMemo(
    () => ports.find((port) => port.index === selectedPort) ?? ports[0],
    [ports, selectedPort]
  );
  const physicalPorts = useMemo(() => ports.filter(isPhysicalPort), [ports]);
  const openServices = system?.managementPorts.filter((port) => port.open) ?? [];
  const upPorts = physicalPorts.filter((port) => port.operStatus === "up").length;

  const runPreset = async (commands: string[]) => {
    setLoading(true);
    setError(undefined);

    try {
      setResult(await runCommands(credentials, commands));
      setView("console");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Command failed");
    } finally {
      setLoading(false);
    }
  };

  const runCustom = async () => {
    const commands = customCommands
      .split("\n")
      .map((command) => command.trim())
      .filter(Boolean);

    if (commands.length === 0) {
      setError("Enter at least one command.");
      return;
    }

    await runPreset(commands);
  };

  const runBackup = async () => {
    setLoading(true);
    setError(undefined);

    try {
      setResult(await backupConfig(credentials));
      setView("config");
    } catch (backupError) {
      setError(backupError instanceof Error ? backupError.message : "Backup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Router size={24} />
          </div>
          <div>
            <strong>ProCurve Modern</strong>
            <span>{system?.host ?? "192.168.1.193"}</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={view === item.id ? "nav-item active" : "nav-item"}
                key={item.id}
                onClick={() => setView(item.id)}
                type="button"
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="connection-card">
          <div className="connection-title">
            <KeyRound size={17} />
            Session
          </div>
          <label>
            Transport
            <select
              value={credentials.transport}
              onChange={(event) => setCredentials((current) => ({ ...current, transport: event.target.value as "ssh" | "telnet" }))}
            >
              <option value="telnet">Telnet</option>
              <option value="ssh">SSH</option>
            </select>
          </label>
          <label>
            Username
            <input
              autoComplete="username"
              value={credentials.username}
              onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))}
              placeholder="optional"
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              value={credentials.password}
              onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
              placeholder="not stored"
              type="password"
            />
          </label>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Legacy switch management</p>
            <h1>{system?.sysName || system?.label || "HP ProCurve Switch"}</h1>
            <p className="muted">{system?.sysDescr || system?.httpTitle || "React control surface for ProCurve CLI and SNMP management."}</p>
          </div>
          <div className="topbar-actions">
            <StatusPill label={system?.snmpEnabled ? "SNMP live" : "SNMP optional"} tone={system?.snmpEnabled ? "good" : "warn"} />
            <StatusPill label={system?.writeCommandsEnabled ? "Writes enabled" : "Read-safe"} tone={system?.writeCommandsEnabled ? "warn" : "good"} />
            {lastUpdated ? <StatusPill label={`Updated ${lastUpdated}`} tone="neutral" /> : null}
            <button
              className="icon-button"
              onClick={() => setAutoRefresh((current) => !current)}
              title={autoRefresh ? "Pause auto-refresh" : "Resume auto-refresh"}
              type="button"
            >
              {autoRefresh ? <Pause size={18} /> : <PlayCircle size={18} />}
            </button>
            <button className="icon-button" disabled={loading} onClick={() => void load()} title="Refresh" type="button">
              <RefreshCw size={18} />
            </button>
          </div>
        </header>

        {error ? (
          <div className="alert">
            <ShieldAlert size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        <section className="switch-panel" aria-label="Switch front panel">
          <div className="switch-panel-top">
            <div>
              <strong>{system?.label ?? "HP ProCurve 2810-24G"}</strong>
              <span>{system?.host ?? "192.168.1.193"}</span>
            </div>
            <div className="mini-stats">
              <span>{upPorts}/{physicalPorts.length || 24} up</span>
              <span>{openServices.length} services</span>
            </div>
          </div>
          <PortMap ports={physicalPorts} selectedPort={selectedPortRow?.index} onSelect={setSelectedPort} />
        </section>

        {view === "dashboard" ? (
          <Dashboard system={system} ports={physicalPorts} vlans={vlans} neighbors={neighbors} onRunPreset={runPreset} />
        ) : null}
        {view === "ports" ? <PortsView ports={ports} selectedPort={selectedPortRow} onSelect={setSelectedPort} /> : null}
        {view === "vlans" ? <VlansView vlans={vlans} /> : null}
        {view === "neighbors" ? <NeighborsView neighbors={neighbors} onRunPreset={runPreset} /> : null}
        {view === "config" ? <ConfigView loading={loading} result={result} onBackup={runBackup} onRunPreset={runPreset} /> : null}
        {view === "console" ? (
          <ConsoleView
            customCommands={customCommands}
            loading={loading}
            result={result}
            setCustomCommands={setCustomCommands}
            onRun={runCustom}
            onRunPreset={runPreset}
          />
        ) : null}
      </main>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "good" | "warn" | "neutral" }) {
  return <span className={`status-pill ${tone}`}>{label}</span>;
}

function isPhysicalPort(port: SwitchPort) {
  return port.index > 0 && port.index <= 96 && /^\d+$/.test(port.name);
}

function hasPortIssues(port: SwitchPort) {
  return Boolean((port.inErrors ?? 0) + (port.outErrors ?? 0) + (port.inDiscards ?? 0) + (port.outDiscards ?? 0));
}

function PortMap({
  ports,
  selectedPort,
  onSelect
}: {
  ports: SwitchPort[];
  selectedPort?: number;
  onSelect: (index: number) => void;
}) {
  const visiblePorts =
    ports.length > 0
      ? ports.slice().sort((a, b) => a.index - b.index)
      : Array.from({ length: 24 }, (_, index) => ({
          index: index + 1,
          name: `${index + 1}`,
          adminStatus: "unknown" as const,
          operStatus: "unknown" as const,
          detectedVia: "fallback" as const
        }));
  const gridColumns = Math.max(12, Math.ceil(Math.max(...visiblePorts.map((port) => port.index)) / 2));
  const gridStyle: CSSProperties & { "--port-columns": string } = { "--port-columns": String(gridColumns) };

  return (
    <div className="front-panel">
      <div className="status-leds">
        <span className="led-label">Power</span>
        <span className="led good" />
        <span className="led-label">Fault</span>
        <span className="led idle" />
      </div>
      <div className="port-grid" style={gridStyle}>
        {visiblePorts.map((port) => {
          const portStyle: CSSProperties = {
            gridColumn: Math.ceil(port.index / 2),
            gridRow: port.index % 2 === 1 ? 1 : 2
          };

          return (
            <button
              className={`port-jack ${port.operStatus} ${hasPortIssues(port) ? "issue" : ""} ${selectedPort === port.index ? "selected" : ""}`}
              key={port.index}
              onClick={() => onSelect(port.index)}
              style={portStyle}
              title={`${port.name}: ${port.operStatus}`}
              type="button"
            >
              <span className="port-led" />
              <span>{port.index}</span>
            </button>
          );
        })}
      </div>
      <div className="sfp-block">
        <span>SFP</span>
        <span className="sfp-slot" />
        <span className="sfp-slot" />
        <span className="sfp-slot" />
        <span className="sfp-slot" />
      </div>
    </div>
  );
}

function Dashboard({
  system,
  ports,
  vlans,
  neighbors,
  onRunPreset
}: {
  system?: SystemInfo;
  ports: SwitchPort[];
  vlans: VlanInfo[];
  neighbors: SwitchNeighbor[];
  onRunPreset: (commands: string[]) => Promise<void>;
}) {
  const upPorts = ports.filter((port) => port.operStatus === "up").length;
  const issuePorts = ports.filter(hasPortIssues).length;
  const services = system?.managementPorts ?? [];

  return (
    <div className="content-grid">
      <InfoPanel icon={Activity} label="Reachability" value={`${services.filter((service) => service.open).length}/${services.length || 4}`} detail="management services open" />
      <InfoPanel icon={Cable} label="Ports" value={`${upPorts}/${ports.length || 24}`} detail="operationally up" />
      <InfoPanel icon={Network} label="VLANs" value={String(vlans.length)} detail={vlans.length ? "reported by SNMP" : "run CLI preset"} />
      <InfoPanel icon={GitBranch} label="Neighbors" value={String(neighbors.length)} detail={neighbors.length ? "LLDP entries" : "none advertised"} />
      <InfoPanel icon={AlertTriangle} label="Port Issues" value={String(issuePorts)} detail="errors or discards" />
      <InfoPanel icon={Boxes} label="Uptime" value={system?.uptimeText || "Unknown"} detail={system?.sysName || system?.host || "waiting for SNMP"} />

      <section className="wide-panel">
        <div className="section-heading">
          <div>
            <h2>Management Surface</h2>
            <p>Non-authenticated reachability plus optional SNMP identity.</p>
          </div>
        </div>
        <div className="service-list">
          {services.map((service) => (
            <div className="service-row" key={service.port}>
              <span className={`service-dot ${service.open ? "good" : "bad"}`} />
              <strong>{service.name}</strong>
              <span>{service.port}</span>
              <span>{service.open ? `${service.latencyMs ?? 0}ms` : service.error || "closed"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="wide-panel">
        <div className="section-heading">
          <div>
            <h2>Quick Reads</h2>
            <p>Commands are sent over the selected session transport.</p>
          </div>
        </div>
        <div className="preset-grid">
          {PRESETS.map((preset) => (
            <button className="preset-button" key={preset.label} onClick={() => void onRunPreset(preset.commands)} type="button">
              <Play size={16} />
              {preset.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function InfoPanel({
  icon: Icon,
  label,
  value,
  detail
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="metric-panel">
      <div className="metric-icon">
        <Icon size={20} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </section>
  );
}

function PortsView({
  ports,
  selectedPort,
  onSelect
}: {
  ports: SwitchPort[];
  selectedPort?: SwitchPort;
  onSelect: (index: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "up" | "down" | "issues">("all");
  const [physicalOnly, setPhysicalOnly] = useState(true);
  const filteredPorts = ports.filter((port) => {
    if (physicalOnly && !isPhysicalPort(port)) {
      return false;
    }

    if (statusFilter === "up" && port.operStatus !== "up") {
      return false;
    }

    if (statusFilter === "down" && port.operStatus !== "down") {
      return false;
    }

    if (statusFilter === "issues" && !hasPortIssues(port)) {
      return false;
    }

    const text = `${port.index} ${port.name} ${port.alias ?? ""} ${port.macAddress ?? ""}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  return (
    <div className="split-layout">
      <section className="table-panel">
        <div className="section-heading">
          <div>
            <h2>Ports</h2>
            <p>{ports[0]?.detectedVia === "snmp" ? "Live interface table from SNMP." : "Fallback port map until SNMP is configured."}</p>
          </div>
        </div>
        <div className="toolbar">
          <label className="compact-field">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter ports" />
          </label>
          <label className="compact-field">
            <ListFilter size={16} />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "up" | "down" | "issues")}>
              <option value="all">All</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
              <option value="issues">Issues</option>
            </select>
          </label>
          <label className="check-field">
            <input checked={physicalOnly} onChange={(event) => setPhysicalOnly(event.target.checked)} type="checkbox" />
            Physical
          </label>
        </div>
        <table>
          <thead>
            <tr>
              <th>Port</th>
              <th>Name</th>
              <th>Admin</th>
              <th>Link</th>
              <th>Speed</th>
              <th>Errors</th>
              <th>Discards</th>
            </tr>
          </thead>
          <tbody>
            {filteredPorts.map((port) => (
              <tr className={selectedPort?.index === port.index ? "selected-row" : ""} key={port.index} onClick={() => onSelect(port.index)}>
                <td>{port.index}</td>
                <td>{port.alias || port.name}</td>
                <td>
                  <StateBadge status={port.adminStatus} />
                </td>
                <td>
                  <StateBadge status={port.operStatus} />
                </td>
                <td>{port.speedMbps ? `${port.speedMbps} Mbps` : "Unknown"}</td>
                <td>{formatNumber((port.inErrors ?? 0) + (port.outErrors ?? 0))}</td>
                <td>{formatNumber((port.inDiscards ?? 0) + (port.outDiscards ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="detail-panel">
        <div className="section-heading">
          <div>
            <h2>Port Detail</h2>
            <p>{selectedPort ? `Interface ${selectedPort.index}` : "Select a port."}</p>
          </div>
        </div>
        {selectedPort ? (
          <dl className="detail-list">
            <div>
              <dt>Name</dt>
              <dd>{selectedPort.name}</dd>
            </div>
            <div>
              <dt>Alias</dt>
              <dd>{selectedPort.alias || "None"}</dd>
            </div>
            <div>
              <dt>Admin</dt>
              <dd>{selectedPort.adminStatus}</dd>
            </div>
            <div>
              <dt>Link</dt>
              <dd>{selectedPort.operStatus}</dd>
            </div>
            <div>
              <dt>MAC</dt>
              <dd>{selectedPort.macAddress || "None"}</dd>
            </div>
            <div>
              <dt>In Octets</dt>
              <dd>{formatNumber(selectedPort.inOctets)}</dd>
            </div>
            <div>
              <dt>Out Octets</dt>
              <dd>{formatNumber(selectedPort.outOctets)}</dd>
            </div>
            <div>
              <dt>Errors</dt>
              <dd>{formatNumber((selectedPort.inErrors ?? 0) + (selectedPort.outErrors ?? 0))}</dd>
            </div>
            <div>
              <dt>Discards</dt>
              <dd>{formatNumber((selectedPort.inDiscards ?? 0) + (selectedPort.outDiscards ?? 0))}</dd>
            </div>
          </dl>
        ) : null}
      </section>
    </div>
  );
}

function VlansView({ vlans }: { vlans: VlanInfo[] }) {
  return (
    <section className="table-panel">
      <div className="section-heading">
        <div>
          <h2>VLANs</h2>
          <p>SNMP Q-BRIDGE VLAN names when exposed by the switch.</p>
        </div>
      </div>
      {vlans.length ? (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Status</th>
              <th>Untagged</th>
              <th>Tagged</th>
              <th>Egress</th>
            </tr>
          </thead>
          <tbody>
            {vlans.map((vlan) => (
              <tr key={vlan.id}>
                <td>{vlan.id}</td>
                <td>{vlan.name}</td>
                <td>{vlan.status || "Unknown"}</td>
                <td>
                  <PortList ports={vlan.untaggedPorts} />
                </td>
                <td>
                  <PortList ports={vlan.taggedPorts} />
                </td>
                <td>
                  <PortList ports={vlan.egressPorts} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title="No VLAN rows yet" text="Configure SNMP community access or run the VLAN CLI preset from the console." />
      )}
    </section>
  );
}

function NeighborsView({
  neighbors,
  onRunPreset
}: {
  neighbors: SwitchNeighbor[];
  onRunPreset: (commands: string[]) => Promise<void>;
}) {
  return (
    <section className="table-panel">
      <div className="section-heading">
        <div>
          <h2>Neighbors</h2>
          <p>LLDP remote-device rows from the switch.</p>
        </div>
        <button className="secondary-button" onClick={() => void onRunPreset(["show lldp info remote-device"])} type="button">
          <TerminalSquare size={16} />
          CLI
        </button>
      </div>
      {neighbors.length ? (
        <table>
          <thead>
            <tr>
              <th>Local Port</th>
              <th>System</th>
              <th>Remote Port</th>
              <th>Chassis</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {neighbors.map((neighbor) => (
              <tr key={neighbor.key}>
                <td>{neighbor.localPortName || neighbor.localPort || "Unknown"}</td>
                <td>{neighbor.systemName || "Unknown"}</td>
                <td>{neighbor.portDescription || neighbor.portId || "Unknown"}</td>
                <td>{neighbor.chassisId || "Unknown"}</td>
                <td className="bounded-cell">{neighbor.systemDescription || "Unknown"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title="No LLDP neighbors" text="Run the LLDP CLI preset if the switch has LLDP disabled or does not expose the LLDP MIB." />
      )}
    </section>
  );
}

function ConfigView({
  loading,
  result,
  onBackup,
  onRunPreset
}: {
  loading: boolean;
  result?: CliResult;
  onBackup: () => Promise<void>;
  onRunPreset: (commands: string[]) => Promise<void>;
}) {
  return (
    <div className="content-grid">
      <section className="wide-panel">
        <div className="section-heading">
          <div>
            <h2>Configuration Backup</h2>
            <p>Pulls running config through the selected Telnet or SSH session.</p>
          </div>
          <button className="primary-button" disabled={loading} onClick={() => void onBackup()} type="button">
            <Download size={17} />
            Backup
          </button>
        </div>
      </section>

      <section className="wide-panel">
        <div className="section-heading">
          <div>
            <h2>Config Reads</h2>
            <p>Write commands stay blocked unless the server is explicitly deployed with writes enabled.</p>
          </div>
        </div>
        <div className="preset-grid">
          {PRESETS.map((preset) => (
            <button className="preset-button" key={preset.label} onClick={() => void onRunPreset(preset.commands)} type="button">
              <Play size={16} />
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <Transcript result={result} />
    </div>
  );
}

function ConsoleView({
  customCommands,
  loading,
  result,
  setCustomCommands,
  onRun,
  onRunPreset
}: {
  customCommands: string;
  loading: boolean;
  result?: CliResult;
  setCustomCommands: (value: string) => void;
  onRun: () => Promise<void>;
  onRunPreset: (commands: string[]) => Promise<void>;
}) {
  return (
    <div className="console-layout">
      <section className="console-panel">
        <div className="section-heading">
          <div>
            <h2>Command Console</h2>
            <p>One command per line. Credentials remain in this browser session.</p>
          </div>
        </div>
        <textarea value={customCommands} onChange={(event) => setCustomCommands(event.target.value)} spellCheck={false} />
        <div className="button-row">
          <button className="primary-button" disabled={loading} onClick={() => void onRun()} type="button">
            <TerminalSquare size={17} />
            Run
          </button>
          {PRESETS.map((preset) => (
            <button className="secondary-button" key={preset.label} onClick={() => void onRunPreset(preset.commands)} type="button">
              {preset.label}
            </button>
          ))}
        </div>
      </section>
      <Transcript result={result} />
    </div>
  );
}

function Transcript({ result }: { result?: CliResult }) {
  return (
    <section className="transcript-panel">
      <div className="section-heading">
        <div>
          <h2>Transcript</h2>
          <p>{result ? `${result.transport.toUpperCase()} ${result.host}` : "No command output yet."}</p>
        </div>
        <div className="section-actions">
          {result ? (
            <button className="secondary-button" onClick={() => downloadTranscript(result)} type="button">
              <FileDown size={16} />
              Download
            </button>
          ) : null}
          {result?.writeBlocked ? <StatusPill label="blocked" tone="warn" /> : result ? <StatusPill label="complete" tone="good" /> : null}
        </div>
      </div>
      <pre>{result?.output || "Run a preset or custom command to populate this panel."}</pre>
    </section>
  );
}

function PortList({ ports }: { ports?: number[] }) {
  if (!ports?.length) {
    return <span className="muted-inline">None</span>;
  }

  const ranges = toPortRanges(ports);

  return (
    <span className="chip-list">
      {ranges.slice(0, 12).map((range) => (
        <span className="port-chip" key={range}>
          {range}
        </span>
      ))}
      {ranges.length > 12 ? <span className="muted-inline">+{ranges.length - 12}</span> : null}
    </span>
  );
}

function StateBadge({ status }: { status: string }) {
  const tone = status === "up" ? "good" : status === "down" ? "bad" : "neutral";
  return <span className={`state-badge ${tone}`}>{status}</span>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <CheckCircle2 size={26} />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function formatNumber(value: number | undefined) {
  return value == null ? "Unknown" : Intl.NumberFormat().format(value);
}

function toPortRanges(ports: number[]) {
  const sorted = [...new Set(ports)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (const port of sorted.slice(1)) {
    if (start == null || previous == null) {
      start = port;
      previous = port;
      continue;
    }

    if (port === previous + 1) {
      previous = port;
      continue;
    }

    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = port;
    previous = port;
  }

  if (start != null && previous != null) {
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
  }

  return ranges;
}

function downloadTranscript(result: CliResult) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const commands = result.commands.join("_").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 48) || "command";
  const blob = new Blob([result.output], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `procurve-${commands}-${stamp}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}
