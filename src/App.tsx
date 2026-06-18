import {
  Activity,
  Boxes,
  Cable,
  CheckCircle2,
  ClipboardList,
  Download,
  Gauge,
  KeyRound,
  Network,
  Play,
  RefreshCw,
  Router,
  ShieldAlert,
  TerminalSquare
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { backupConfig, fetchPorts, fetchSystemInfo, fetchVlans, runCommands } from "./api";
import type { CliResult, Credentials, SwitchPort, SystemInfo, VlanInfo } from "./types";

const PRESETS = [
  { label: "Version", commands: ["show version"] },
  { label: "Flash", commands: ["show flash"] },
  { label: "Interfaces", commands: ["show interfaces brief"] },
  { label: "VLANs", commands: ["show vlans"] },
  { label: "Trunks", commands: ["show trunks"] },
  { label: "Running Config", commands: ["show running-config"] }
];

type View = "dashboard" | "ports" | "vlans" | "config" | "console";

const NAV_ITEMS: Array<{ id: View; label: string; icon: typeof Router }> = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "ports", label: "Ports", icon: Cable },
  { id: "vlans", label: "VLANs", icon: Network },
  { id: "config", label: "Config", icon: ClipboardList },
  { id: "console", label: "Console", icon: TerminalSquare }
];

export function App() {
  const [view, setView] = useState<View>("dashboard");
  const [system, setSystem] = useState<SystemInfo>();
  const [ports, setPorts] = useState<SwitchPort[]>([]);
  const [vlans, setVlans] = useState<VlanInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<number>();
  const [credentials, setCredentials] = useState<Credentials>({ transport: "telnet", username: "", password: "" });
  const [customCommands, setCustomCommands] = useState("show version");
  const [result, setResult] = useState<CliResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const [systemInfo, portRows, vlanRows] = await Promise.all([fetchSystemInfo(), fetchPorts(), fetchVlans()]);
      setSystem(systemInfo);
      setPorts(portRows);
      setVlans(vlanRows);
      setSelectedPort((current) => current ?? portRows[0]?.index);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load switch state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
          <Dashboard system={system} ports={physicalPorts} vlans={vlans} onRunPreset={runPreset} />
        ) : null}
        {view === "ports" ? <PortsView ports={ports} selectedPort={selectedPortRow} onSelect={setSelectedPort} /> : null}
        {view === "vlans" ? <VlansView vlans={vlans} /> : null}
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
      ? ports.slice(0, 28)
      : Array.from({ length: 24 }, (_, index) => ({
          index: index + 1,
          name: `${index + 1}`,
          adminStatus: "unknown" as const,
          operStatus: "unknown" as const,
          detectedVia: "fallback" as const
        }));

  return (
    <div className="front-panel">
      <div className="status-leds">
        <span className="led-label">Power</span>
        <span className="led good" />
        <span className="led-label">Fault</span>
        <span className="led idle" />
      </div>
      <div className="port-grid">
        {visiblePorts.map((port) => (
          <button
            className={`port-jack ${port.operStatus} ${selectedPort === port.index ? "selected" : ""}`}
            key={port.index}
            onClick={() => onSelect(port.index)}
            title={`${port.name}: ${port.operStatus}`}
            type="button"
          >
            <span className="port-led" />
            <span>{port.index}</span>
          </button>
        ))}
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
  onRunPreset
}: {
  system?: SystemInfo;
  ports: SwitchPort[];
  vlans: VlanInfo[];
  onRunPreset: (commands: string[]) => Promise<void>;
}) {
  const upPorts = ports.filter((port) => port.operStatus === "up").length;
  const services = system?.managementPorts ?? [];

  return (
    <div className="content-grid">
      <InfoPanel icon={Activity} label="Reachability" value={`${services.filter((service) => service.open).length}/${services.length || 4}`} detail="management services open" />
      <InfoPanel icon={Cable} label="Ports" value={`${upPorts}/${ports.length || 24}`} detail="operationally up" />
      <InfoPanel icon={Network} label="VLANs" value={String(vlans.length)} detail={vlans.length ? "reported by SNMP" : "run CLI preset"} />
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
  return (
    <div className="split-layout">
      <section className="table-panel">
        <div className="section-heading">
          <div>
            <h2>Ports</h2>
            <p>{ports[0]?.detectedVia === "snmp" ? "Live interface table from SNMP." : "Fallback port map until SNMP is configured."}</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Port</th>
              <th>Name</th>
              <th>Admin</th>
              <th>Link</th>
              <th>Speed</th>
            </tr>
          </thead>
          <tbody>
            {ports.map((port) => (
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
              <dt>In Octets</dt>
              <dd>{formatNumber(selectedPort.inOctets)}</dd>
            </div>
            <div>
              <dt>Out Octets</dt>
              <dd>{formatNumber(selectedPort.outOctets)}</dd>
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
            </tr>
          </thead>
          <tbody>
            {vlans.map((vlan) => (
              <tr key={vlan.id}>
                <td>{vlan.id}</td>
                <td>{vlan.name}</td>
                <td>{vlan.status || "Unknown"}</td>
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
          {PRESETS.slice(0, 4).map((preset) => (
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
        {result?.writeBlocked ? <StatusPill label="blocked" tone="warn" /> : result ? <StatusPill label="complete" tone="good" /> : null}
      </div>
      <pre>{result?.output || "Run a preset or custom command to populate this panel."}</pre>
    </section>
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
