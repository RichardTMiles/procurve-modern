import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { z } from "zod";
import { runCli } from "./cli.js";
import { loadConfig } from "./env.js";
import { fetchHttpTitle, probeManagementPorts } from "./probe.js";
import { getPorts, getSystemInfo, getVlans } from "./snmp.js";
import type { CliRequest, SystemInfo } from "./types.js";

const config = loadConfig();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../client");

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const cliRequestSchema = z.object({
  transport: z.enum(["ssh", "telnet"]),
  username: z.string().optional(),
  password: z.string().optional(),
  commands: z.array(z.string().min(1)).min(1).max(20),
  timeoutMs: z.number().int().min(3000).max(120000).optional()
});

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    switchHost: config.switchHost,
    writeCommandsEnabled: config.allowWriteCommands,
    snmpConfigured: Boolean(config.snmpCommunity)
  });
});

app.get("/api/switch/status", async (_request, response, next) => {
  try {
    const [managementPorts, snmpInfo, httpTitle] = await Promise.all([
      probeManagementPorts(config.switchHost),
      getSystemInfo(config),
      fetchHttpTitle(config.switchHost)
    ]);

    const payload: SystemInfo = {
      host: config.switchHost,
      label: config.switchLabel,
      ...snmpInfo,
      httpTitle,
      managementPorts,
      snmpEnabled: Boolean(snmpInfo.snmpEnabled),
      writeCommandsEnabled: config.allowWriteCommands
    };

    response.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get("/api/switch/ports", async (_request, response, next) => {
  try {
    response.json(await getPorts(config));
  } catch (error) {
    next(error);
  }
});

app.get("/api/switch/vlans", async (_request, response, next) => {
  try {
    response.json(await getVlans(config));
  } catch (error) {
    next(error);
  }
});

app.post("/api/switch/cli", async (request, response, next) => {
  try {
    const cliRequest: CliRequest = cliRequestSchema.parse(request.body);
    response.json(await runCli(config, cliRequest));
  } catch (error) {
    next(error);
  }
});

app.post("/api/switch/backup", async (request, response, next) => {
  try {
    const cliRequest = cliRequestSchema.omit({ commands: true }).parse(request.body);
    response.json(
      await runCli(config, {
        ...cliRequest,
        commands: ["show running-config"]
      })
    );
  } catch (error) {
    next(error);
  }
});

app.use(express.static(clientDist));
app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(clientDist, "index.html"));
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const status = error instanceof z.ZodError ? 400 : 500;
  response.status(status).json({
    error: error instanceof Error ? error.message : "Unknown error"
  });
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(`procurve-modern listening on :${config.port} for ${config.switchHost}`);
});
