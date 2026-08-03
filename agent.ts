import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { once } from "node:events";
import { Readable, Writable } from "node:stream";

import * as acp from "@agentclientprotocol/sdk";

export type AgentSessionInfo = {
  sessionId: string;
  title?: string | null;
  updatedAt?: string | null;
};

export type AgentRuntimeServices = {
  write: (text: string) => void;
  info: (message: string) => void;
  error: (message: string) => void;
  choosePermission: (
    message: string,
    choices: Array<{ name: string; value: string; description?: string }>,
  ) => Promise<string | undefined>;
};

export type AgentTurnRequest = {
  cwd: string;
  prompt: string;
  sessionId?: string;
};

export type AgentTurnResult = {
  sessionId: string;
  stopReason: string;
};

export interface TaskAgent {
  runTurn(request: AgentTurnRequest): Promise<AgentTurnResult>;
  listSessions(cwd: string): Promise<AgentSessionInfo[]>;
  firstUserMessage(sessionId: string, cwd: string): Promise<string | undefined>;
}

export class CodexAcpAgent implements TaskAgent {
  private readonly services: AgentRuntimeServices;

  constructor(services: AgentRuntimeServices) {
    this.services = services;
  }

  async runTurn(request: AgentTurnRequest): Promise<AgentTurnResult> {
    return await this.withConnection(async (connection, capabilities) => {
      let sessionId = request.sessionId;
      if (sessionId) {
        if (capabilities.sessionCapabilities?.resume) {
          await connection.resumeSession({
            sessionId,
            cwd: request.cwd,
            mcpServers: [],
          });
        } else if (capabilities.loadSession) {
          await connection.loadSession({
            sessionId,
            cwd: request.cwd,
            mcpServers: [],
          });
        } else {
          throw new Error("The Codex ACP adapter cannot resume sessions");
        }
      } else {
        const created = await connection.newSession({
          cwd: request.cwd,
          mcpServers: [],
        });
        sessionId = created.sessionId;
      }

      const activeSessionId = sessionId;
      let interrupted = false;
      const onInterrupt = () => {
        if (interrupted) return;
        interrupted = true;
        this.services.info("Cancelling Codex turn...");
        void connection.cancel({ sessionId: activeSessionId });
      };
      process.once("SIGINT", onInterrupt);
      try {
        const result = await connection.prompt({
          sessionId: activeSessionId,
          prompt: [{ type: "text", text: request.prompt }],
        });
        if (result.stopReason !== "end_turn") {
          throw new Error(`Codex stopped with reason: ${result.stopReason}`);
        }
        return { sessionId: activeSessionId, stopReason: result.stopReason };
      } finally {
        process.removeListener("SIGINT", onInterrupt);
      }
    });
  }

  async listSessions(cwd: string): Promise<AgentSessionInfo[]> {
    return await this.withConnection(async (connection, capabilities) => {
      if (!capabilities.sessionCapabilities?.list) {
        throw new Error("The Codex ACP adapter does not support session listing");
      }
      const sessions: AgentSessionInfo[] = [];
      let cursor: string | null = null;
      do {
        const response = await connection.listSessions({ cwd, cursor });
        sessions.push(...response.sessions.map((session) => ({
          sessionId: session.sessionId,
          title: session.title,
          updatedAt: session.updatedAt,
        })));
        cursor = response.nextCursor ?? null;
      } while (cursor);
      return sessions;
    });
  }

  async firstUserMessage(
    sessionId: string,
    cwd: string,
  ): Promise<string | undefined> {
    let firstMessage: string | undefined;
    await this.withConnection(
      async (connection, capabilities) => {
        if (!capabilities.loadSession) {
          throw new Error("The Codex ACP adapter cannot replay session history");
        }
        await connection.loadSession({ sessionId, cwd, mcpServers: [] });
      },
      (notification) => {
        if (firstMessage) return;
        const update = notification.update;
        if (
          update.sessionUpdate === "user_message_chunk" &&
          update.content.type === "text"
        ) {
          firstMessage = update.content.text;
        }
      },
      false,
    );
    return firstMessage;
  }

  private async withConnection<T>(
    operation: (
      connection: acp.ClientSideConnection,
      capabilities: acp.AgentCapabilities,
    ) => Promise<T>,
    observeUpdate?: (notification: acp.SessionNotification) => void,
    renderUpdates = true,
  ): Promise<T> {
    const child = spawnAdapter();
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const stream = acp.ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    );
    const client: acp.Client = {
      requestPermission: async (params) => {
        const selected = await this.services.choosePermission(
          params.toolCall.title ?? "Codex requests permission",
          params.options.map((option) => ({
            name: option.name,
            value: option.optionId,
            description: option.kind,
          })),
        );
        return selected
          ? { outcome: { outcome: "selected", optionId: selected } }
          : { outcome: { outcome: "cancelled" } };
      },
      sessionUpdate: (notification) => {
        observeUpdate?.(notification);
        if (renderUpdates) this.renderUpdate(notification);
      },
    };
    const connection = new acp.ClientSideConnection(() => client, stream);

    try {
      const initialized = await connection.initialize({
        protocolVersion: acp.PROTOCOL_VERSION,
        clientCapabilities: {},
        clientInfo: { name: "task-cli", version: "1.0.0" },
      });
      return await operation(connection, initialized.agentCapabilities ?? {});
    } catch (error) {
      const detail = stderr.trim();
      if (detail) this.services.error(detail);
      throw error;
    } finally {
      await stopChild(child);
    }
  }

  private renderUpdate(notification: acp.SessionNotification): void {
    const update = notification.update;
    if (
      update.sessionUpdate === "agent_message_chunk" &&
      update.content.type === "text"
    ) {
      this.services.write(update.content.text);
    } else if (update.sessionUpdate === "tool_call") {
      this.services.info(`[${update.status}] ${update.title}`);
    } else if (
      update.sessionUpdate === "tool_call_update" &&
      update.status === "failed"
    ) {
      this.services.info(`[failed] tool ${update.toolCallId}`);
    }
  }
}

function spawnAdapter(): ChildProcessWithoutNullStreams {
  const entry = createRequire(import.meta.url).resolve(
    "@agentclientprotocol/codex-acp",
  );
  return spawn(process.execPath, [entry], {
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}
