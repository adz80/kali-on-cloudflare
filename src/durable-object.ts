import { Env, SessionState, SessionStatus, Identity } from "./types";
import { log } from "./logger";
import { getOwnerIdentifier, isAdmin } from "./identity";

export class KaliSession implements DurableObject {
  private ctx: DurableObjectState;
  private env: Env;
  private sessionData: SessionState | null = null;
  private activeWebSockets: Set<WebSocket> = new Set();
  private idleCheckInterval: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    this.ctx.blockConcurrencyWhile(async () => {
      this.sessionData = await this.ctx.storage.get<SessionState>("session") || null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    const identityHeader = request.headers.get("X-Identity");
    if (!identityHeader) {
      return new Response("Forbidden", { status: 403 });
    }

    let identity: Identity;
    try {
      identity = JSON.parse(identityHeader);
    } catch {
      return new Response("Forbidden", { status: 403 });
    }

    if (!this.isAuthorized(identity)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (path === "/create" && request.method === "POST") {
      return this.handleCreate(identity, request);
    }

    if (path === "/start" && request.method === "POST") {
      return this.handleStart();
    }

    if (path === "/stop" && request.method === "POST") {
      return this.handleStop();
    }

    if (path === "/destroy" && request.method === "DELETE") {
      return this.handleDestroy();
    }

    if (path === "/status" && request.method === "GET") {
      return this.handleStatus();
    }

    if (path === "/ws") {
      return this.handleWebSocket(request, identity);
    }

    return new Response("Not Found", { status: 404 });
  }

  private isAuthorized(identity: Identity): boolean {
    if (!this.sessionData) {
      return true;
    }
    const owner = getOwnerIdentifier(identity);
    if (this.sessionData.owner === owner) {
      return true;
    }
    if (isAdmin(identity, this.env.ADMIN_GROUP)) {
      return true;
    }
    return false;
  }

  private async handleCreate(identity: Identity, request: Request): Promise<Response> {
    if (this.sessionData) {
      return Response.json({ error: "Session already exists" }, { status: 409 });
    }

    const owner = getOwnerIdentifier(identity);
    const sessionId = request.headers.get("X-Session-Id") || this.ctx.id.toString();

    this.sessionData = {
      sessionId,
      owner,
      status: "created",
      createdAt: Date.now(),
      lastSeen: Date.now(),
    };

    await this.ctx.storage.put("session", this.sessionData);
    log("session_created", sessionId, owner);

    return Response.json({ sessionId, status: this.sessionData.status });
  }

  private async handleStart(): Promise<Response> {
    if (!this.sessionData) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    if (this.sessionData.status === "running") {
      return Response.json({ sessionId: this.sessionData.sessionId, status: "running" });
    }

    try {
      this.sessionData.status = "starting";
      await this.saveSession();

      // Start container with internet enabled
      // The container binding is configured in wrangler.toml
      if (!this.ctx.container) {
        throw new Error("Container binding not available");
      }

      await this.ctx.container.start({
        enableInternet: true,
      });

      this.sessionData.status = "running";
      this.sessionData.lastSeen = Date.now();
      await this.saveSession();

      this.startIdleCheck();

      log("session_started", this.sessionData.sessionId, this.sessionData.owner);

      return Response.json({ sessionId: this.sessionData.sessionId, status: "running" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.sessionData.status = "error";
      this.sessionData.errorMessage = message;
      await this.saveSession();

      log("error", this.sessionData.sessionId, this.sessionData.owner, message);

      return Response.json({ error: message }, { status: 500 });
    }
  }

  private async handleStop(): Promise<Response> {
    if (!this.sessionData) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    if (this.sessionData.status === "stopped") {
      return Response.json({ sessionId: this.sessionData.sessionId, status: "stopped" });
    }

    await this.stopContainer();

    return Response.json({ sessionId: this.sessionData.sessionId, status: "stopped" });
  }

  private async handleDestroy(): Promise<Response> {
    if (!this.sessionData) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const sessionId = this.sessionData.sessionId;
    const owner = this.sessionData.owner;

    await this.stopContainer();
    await this.ctx.storage.deleteAll();
    this.sessionData = null;

    log("session_destroyed", sessionId, owner);

    return Response.json({ success: true });
  }

  private handleStatus(): Response {
    if (!this.sessionData) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    return Response.json({
      sessionId: this.sessionData.sessionId,
      owner: this.sessionData.owner,
      status: this.sessionData.status,
      createdAt: this.sessionData.createdAt,
      lastSeen: this.sessionData.lastSeen,
    });
  }

  private async handleWebSocket(request: Request, identity: Identity): Promise<Response> {
    if (!this.sessionData) {
      return new Response("Session not found", { status: 404 });
    }

    if (this.sessionData.status !== "running" || !this.ctx.container) {
      return new Response("Session not running", { status: 400 });
    }

    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const terminalPort = parseInt(this.env.TERMINAL_PORT, 10);

    try {
      // Get the container's TCP port as a Fetcher
      const containerFetcher = this.ctx.container.getTcpPort(terminalPort);

      // Forward the WebSocket upgrade request to the container's ttyd server
      // ttyd serves WebSocket connections for terminal access
      const containerUrl = new URL(request.url);
      containerUrl.pathname = "/ws";

      const containerResponse = await containerFetcher.fetch(
        new Request(containerUrl.toString(), {
          method: request.method,
          headers: request.headers,
        })
      );

      // If the container returns a WebSocket upgrade response, return it
      if (containerResponse.webSocket) {
        this.updateLastSeen();
        log("websocket_connected", this.sessionData.sessionId, this.sessionData.owner);

        // Track the WebSocket for cleanup
        containerResponse.webSocket.addEventListener("close", () => {
          log("websocket_disconnected", this.sessionData!.sessionId, this.sessionData!.owner);
        });

        return containerResponse;
      }

      return new Response("Failed to establish WebSocket connection", { status: 500 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "WebSocket error";
      log("error", this.sessionData.sessionId, this.sessionData.owner, message);
      return new Response(message, { status: 500 });
    }
  }

  private async stopContainer(): Promise<void> {
    if (this.idleCheckInterval !== null) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }

    for (const ws of this.activeWebSockets) {
      try {
        ws.close(1000, "Session stopped");
      } catch {
        // Ignore close errors
      }
    }
    this.activeWebSockets.clear();

    if (this.ctx.container) {
      try {
        await this.ctx.container.destroy();
      } catch {
        // Container may already be destroyed
      }
    }

    if (this.sessionData) {
      this.sessionData.status = "stopped";
      await this.saveSession();
      log("session_stopped", this.sessionData.sessionId, this.sessionData.owner);
    }
  }

  private async saveSession(): Promise<void> {
    if (this.sessionData) {
      await this.ctx.storage.put("session", this.sessionData);
    }
  }

  private updateLastSeen(): void {
    if (this.sessionData) {
      this.sessionData.lastSeen = Date.now();
    }
  }

  private startIdleCheck(): void {
    const idleTimeout = parseInt(this.env.IDLE_TIMEOUT_MS, 10);
    
    this.idleCheckInterval = setInterval(async () => {
      if (!this.sessionData || this.sessionData.status !== "running") {
        return;
      }

      const idleTime = Date.now() - this.sessionData.lastSeen;
      if (idleTime > idleTimeout) {
        await this.stopContainer();
      }
    }, 60000) as unknown as number;
  }
}

