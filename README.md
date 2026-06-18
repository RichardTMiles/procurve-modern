# ProCurve Modern

Modern React and Node management console for legacy HP ProCurve switches that still expose Java-era web UI.

The first target is an HP ProCurve 2810-24G on `192.168.1.193`, but the service is intentionally generic for old ProCurve / ArubaOS-Switch devices that expose SNMP and CLI management.

## What It Does

- Shows switch identity, uptime, management service reachability, and HTTP title.
- Renders a front-panel port map in physical odd/even ProCurve order with live SNMP status when SNMP is configured.
- Lists interface counters, errors, discards, MAC addresses, and physical-only filters from standard IF-MIB data.
- Shows VLAN names, status, and egress/tagged/untagged port membership bitmaps where the switch exposes them.
- Shows LLDP remote-device rows when LLDP data is enabled and exposed through SNMP.
- Runs read commands over SSH or Telnet with credentials supplied per browser session.
- Backs up `show running-config` through the same CLI transport.
- Blocks write/config commands by default unless the service is deployed with `ALLOW_WRITE_COMMANDS=true`.

## What It Is Not

This does not patch or replace switch firmware. It is an internal management facade that talks to the switch through supported protocols and presents a modern UI.

## Local Development

```sh
npm install
npm run dev:server
npm run dev
```

Open `http://localhost:5173`.

Useful environment:

```sh
PORT=3000
SWITCH_HOST=192.168.1.193
SWITCH_LABEL="HP ProCurve 2810-24G"
SNMP_COMMUNITY=public
ALLOW_WRITE_COMMANDS=false
```

## Production Build

```sh
npm run typecheck
npm run build
npm start
```

## Docker

```sh
docker buildx build --platform linux/amd64 -t ghcr.io/richardtmiles/procurve-modern:latest .
```

## Kubernetes

The checked-in manifests deploy a single pod and expose it internally through NodePort `30093`.

```sh
kubectl apply -k k8s
```

Optional SNMP secret:

```sh
kubectl apply -f k8s/secret.example.yaml
```

The default deployment targets:

```text
SWITCH_HOST=192.168.1.193
ALLOW_WRITE_COMMANDS=false
```

## Security Notes

- Telnet sends credentials in clear text. Prefer SSH after upgrading/enabling it on the switch.
- Browser-entered CLI credentials are not persisted by this app.
- Write commands are blocked server-side unless explicitly enabled.
- Run this only on a trusted management LAN or behind your own authentication layer.
- Take a config backup before enabling write commands.

## CLI Presets

Built-in presets:

```text
show version
show flash
show interfaces brief
show interfaces counters
show vlans
show trunks
show mac-address
show lldp info remote-device
show spanning-tree
show logging -r
show running-config
```

## License

MIT
