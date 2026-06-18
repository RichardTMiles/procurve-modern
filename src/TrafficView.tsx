import { Activity, Eye, Search, Server, TerminalSquare } from "lucide-react";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { formatDuplexRate, formatLineRate, formatPercent, formatRate, sumPortRates, type PortRateMap } from "./traffic";
import type { SwitchMacEntry, SwitchPort } from "./types";

type TrafficViewProps = {
  ports: SwitchPort[];
  portRates: PortRateMap;
  macEntries: SwitchMacEntry[];
  onRunPreset: (commands: string[]) => Promise<void>;
};

const FLOW_POSITIONS = [
  { left: 78, top: 20, angle: -28 },
  { left: 83, top: 44, angle: -4 },
  { left: 70, top: 72, angle: 34 },
  { left: 50, top: 82, angle: 88 },
  { left: 28, top: 70, angle: 146 },
  { left: 18, top: 43, angle: 184 },
  { left: 31, top: 20, angle: 220 },
  { left: 63, top: 18, angle: 292 },
  { left: 88, top: 63, angle: 18 },
  { left: 12, top: 61, angle: 164 },
  { left: 44, top: 14, angle: 250 },
  { left: 58, top: 88, angle: 72 }
];

export function TrafficView({ ports, portRates, macEntries, onRunPreset }: TrafficViewProps) {
  const [macQuery, setMacQuery] = useState("");
  const totalRate = sumPortRates(ports, portRates);
  const learnedMacEntries = useMemo(() => macEntries.filter((entry) => entry.status !== "self"), [macEntries]);
  const macCountByPort = useMemo(() => countMacsByPort(learnedMacEntries), [learnedMacEntries]);
  const trafficRows = useMemo(
    () =>
      ports
        .map((port) => ({
          port,
          rate: portRates[port.index],
          macCount: macCountByPort.get(port.index) ?? 0
        }))
        .sort((a, b) => (b.rate?.totalBytesPerSecond ?? 0) - (a.rate?.totalBytesPerSecond ?? 0) || a.port.index - b.port.index),
    [macCountByPort, portRates, ports]
  );
  const maxRate = Math.max(...trafficRows.map((row) => row.rate?.totalBytesPerSecond ?? 0), 1);
  const activeRows = trafficRows.filter((row) => (row.rate?.totalBytesPerSecond ?? 0) > 0).slice(0, 12);
  const filteredMacs = learnedMacEntries
    .filter((entry) => `${entry.macAddress} ${entry.portName ?? ""} ${entry.portIndex ?? ""} ${entry.status ?? ""}`.toLowerCase().includes(macQuery.toLowerCase()))
    .slice(0, 80);

  return (
    <div className="traffic-console">
      <section className="traffic-panel traffic-left">
        <div className="section-heading">
          <div>
            <h2>Live Rates</h2>
            <p>Counter deltas from IF-MIB.</p>
          </div>
          <Activity size={20} />
        </div>

        <div className="traffic-total">
          <div>
            <span>Downstream</span>
            <strong>{formatRate(totalRate.inBytesPerSecond)}</strong>
          </div>
          <div>
            <span>Upstream</span>
            <strong>{formatRate(totalRate.outBytesPerSecond)}</strong>
          </div>
        </div>

        <div className="traffic-port-list">
          {trafficRows.slice(0, 24).map((row) => {
            const strength = Math.min(((row.rate?.totalBytesPerSecond ?? 0) / maxRate) * 100, 100);
            return (
              <div
                className={`traffic-port-row ${row.port.operStatus}`}
                key={row.port.index}
                style={{ "--traffic-level": `${Math.max(strength, row.port.operStatus === "up" ? 4 : 0)}%` } as CSSProperties}
              >
                <span className="traffic-port-index">{row.port.index}</span>
                <span className="traffic-port-meter" />
                <span className="traffic-port-rate">
                  <strong>{formatRate(row.rate?.totalBytesPerSecond)}</strong>
                  <em>{formatLineRate(row.port.maxSpeedMbps)} line</em>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="traffic-map-panel">
        <div className="traffic-map-grid" />
        {activeRows.map((row, index) => {
          const position = FLOW_POSITIONS[index % FLOW_POSITIONS.length] ?? FLOW_POSITIONS[0];
          const strength = Math.max(Math.min((row.rate?.totalBytesPerSecond ?? 0) / maxRate, 1), 0.08);
          return (
            <div className="flow-group" key={row.port.index}>
              <span
                className="flow-beam"
                style={
                  {
                    left: "50%",
                    top: "50%",
                    opacity: 0.24 + strength * 0.58,
                    transform: `rotate(${position.angle}deg)`,
                    width: `${22 + strength * 36}%`
                  } as CSSProperties
                }
              />
              <span className="flow-node" style={{ left: `${position.left}%`, top: `${position.top}%` }}>
                <strong>{row.port.index}</strong>
                <span>{formatRate(row.rate?.totalBytesPerSecond)}</span>
              </span>
            </div>
          );
        })}
        <div className="traffic-switch-core">
          <Eye size={26} />
          <strong>2810-24G</strong>
          <span>{formatRate(totalRate.totalBytesPerSecond)}</span>
        </div>
        <div className="traffic-map-footer">
          <span>{activeRows.length} active ports</span>
          <span>{learnedMacEntries.length} learned MACs</span>
          <span>{formatPercent(Math.max(...trafficRows.map((row) => row.rate?.utilizationPercent ?? 0), 0))} peak link</span>
        </div>
      </section>

      <section className="traffic-panel traffic-right">
        <div className="section-heading">
          <div>
            <h2>Learned Devices</h2>
            <p>BRIDGE-MIB forwarding table.</p>
          </div>
          <Server size={20} />
        </div>

        <label className="compact-field">
          <Search size={16} />
          <input value={macQuery} onChange={(event) => setMacQuery(event.target.value)} placeholder="Filter MACs" />
        </label>

        <div className="traffic-summary-list">
          <div>
            <span>Total MACs</span>
            <strong>{learnedMacEntries.length}</strong>
          </div>
          <div>
            <span>Visible Ports</span>
            <strong>{new Set(learnedMacEntries.map((entry) => entry.portIndex).filter(Boolean)).size}</strong>
          </div>
          <div>
            <span>Top Port</span>
            <strong>{trafficRows[0] ? `${trafficRows[0].port.index} / ${formatDuplexRate(trafficRows[0].port.maxSpeedMbps)}` : "-"}</strong>
          </div>
        </div>

        <div className="mac-table-wrap">
          <table className="compact-table">
            <thead>
              <tr>
                <th>MAC</th>
                <th>Port</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredMacs.map((entry) => (
                <tr key={`${entry.macAddress}-${entry.portIndex ?? "unknown"}`}>
                  <td>{entry.macAddress}</td>
                  <td>{entry.portName || entry.portIndex || "?"}</td>
                  <td>{entry.status || "learned"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredMacs.length === 0 ? <div className="traffic-empty">No learned MAC rows.</div> : null}
        </div>

        <div className="inspection-boundary">
          <strong>Packet Capture</strong>
          <span>Payload capture needs an explicit mirror destination and a capture host.</span>
          <button className="secondary-button" onClick={() => void onRunPreset(["show monitor"])} type="button">
            <TerminalSquare size={16} />
            Mirror Status
          </button>
        </div>
      </section>
    </div>
  );
}

function countMacsByPort(entries: SwitchMacEntry[]) {
  const counts = new Map<number, number>();

  for (const entry of entries) {
    if (entry.portIndex == null) {
      continue;
    }

    counts.set(entry.portIndex, (counts.get(entry.portIndex) ?? 0) + 1);
  }

  return counts;
}
