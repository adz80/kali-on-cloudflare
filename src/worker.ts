import { Env, Identity, SessionListItem } from "./types";
import { extractIdentity, isAdmin, getOwnerIdentifier } from "./identity";
import { KaliSession } from "./durable-object";
import { getAssetFromKV, NotFoundError } from "@cloudflare/kv-asset-handler";
// @ts-ignore - This is injected by wrangler at build time
import manifestJSON from "__STATIC_CONTENT_MANIFEST";

const assetManifest = JSON.parse(manifestJSON);

export { KaliSession };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Serve static assets
    if (!path.startsWith("/api/") && !path.startsWith("/session/")) {
      try {
        return await getAssetFromKV(
          { request, waitUntil: ctx.waitUntil.bind(ctx) },
          {
            ASSET_NAMESPACE: env.__STATIC_CONTENT,
            ASSET_MANIFEST: assetManifest,
          }
        );
      } catch (e) {
        if (e instanceof NotFoundError) {
          return new Response("Not Found", { status: 404 });
        }
        throw e;
      }
    }

    // Extract and validate identity
    const identity = extractIdentity(request);
    if (!identity) {
      return new Response("Forbidden: No valid Cloudflare Access identity", { status: 403 });
    }

    // API Routes
    if (path === "/api/sessions" && request.method === "POST") {
      return handleCreateSession(request, env, identity);
    }

    if (path === "/api/sessions" && request.method === "GET") {
      return handleListSessions(request, env, identity);
    }

    const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      if (request.method === "DELETE") {
        return routeToDurableObject(env, sessionId, "/destroy", "DELETE", identity);
      }
      if (request.method === "GET") {
        return routeToDurableObject(env, sessionId, "/status", "GET", identity);
      }
    }

    const sessionActionMatch = path.match(/^\/api\/sessions\/([^/]+)\/(start|stop)$/);
    if (sessionActionMatch && request.method === "POST") {
      const sessionId = sessionActionMatch[1];
      const action = sessionActionMatch[2];
      return routeToDurableObject(env, sessionId, `/${action}`, "POST", identity);
    }

    // WebSocket endpoint
    const wsMatch = path.match(/^\/session\/([^/]+)\/ws$/);
    if (wsMatch) {
      const sessionId = wsMatch[1];
      return routeToDurableObject(env, sessionId, "/ws", "GET", identity, request);
    }

    return new Response("Not Found", { status: 404 });
  },
};

async function handleCreateSession(
  request: Request,
  env: Env,
  identity: Identity
): Promise<Response> {
  const owner = getOwnerIdentifier(identity);
  const maxSessions = parseInt(env.MAX_SESSIONS_PER_USER, 10);

  // Check session quota for non-admins
  if (!isAdmin(identity, env.ADMIN_GROUP)) {
    const existingSessions = await getSessionsForOwner(env, owner);
    const runningSessions = existingSessions.filter(
      (s) => s.status !== "stopped" && s.status !== "error"
    );
    if (runningSessions.length >= maxSessions) {
      return Response.json(
        { error: `Maximum ${maxSessions} active session(s) allowed` },
        { status: 429 }
      );
    }
  }

  // Create new session with unique ID
  const sessionId = crypto.randomUUID();
  const stub = env.KALI_SESSION.get(env.KALI_SESSION.idFromName(sessionId));

  const response = await stub.fetch(
    new Request("https://internal/create", {
      method: "POST",
      headers: { "X-Identity": JSON.stringify(identity) },
    })
  );

  return response;
}

async function handleListSessions(
  request: Request,
  env: Env,
  identity: Identity
): Promise<Response> {
  const owner = getOwnerIdentifier(identity);
  const admin = isAdmin(identity, env.ADMIN_GROUP);

  // Note: In production, you'd need a separate index to track all session IDs
  // For now, we return sessions the user knows about via their own records
  // This is a limitation - a full implementation would use D1 or KV for indexing
  
  const sessions = admin 
    ? await getAllSessions(env) 
    : await getSessionsForOwner(env, owner);

  return Response.json({ sessions });
}

async function routeToDurableObject(
  env: Env,
  sessionId: string,
  path: string,
  method: string,
  identity: Identity,
  originalRequest?: Request
): Promise<Response> {
  const stub = env.KALI_SESSION.get(env.KALI_SESSION.idFromName(sessionId));

  const headers: HeadersInit = {
    "X-Identity": JSON.stringify(identity),
  };

  // Forward WebSocket upgrade headers
  if (originalRequest) {
    const upgrade = originalRequest.headers.get("Upgrade");
    if (upgrade) {
      headers["Upgrade"] = upgrade;
    }
    const connection = originalRequest.headers.get("Connection");
    if (connection) {
      headers["Connection"] = connection;
    }
    const wsKey = originalRequest.headers.get("Sec-WebSocket-Key");
    if (wsKey) {
      headers["Sec-WebSocket-Key"] = wsKey;
    }
    const wsVersion = originalRequest.headers.get("Sec-WebSocket-Version");
    if (wsVersion) {
      headers["Sec-WebSocket-Version"] = wsVersion;
    }
    const wsProtocol = originalRequest.headers.get("Sec-WebSocket-Protocol");
    if (wsProtocol) {
      headers["Sec-WebSocket-Protocol"] = wsProtocol;
    }
  }

  return stub.fetch(
    new Request(`https://internal${path}`, {
      method,
      headers,
    })
  );
}

// Placeholder implementations - in production, use D1 or KV for session indexing
async function getSessionsForOwner(env: Env, owner: string): Promise<SessionListItem[]> {
  // This would query a D1 database or KV store that indexes sessions by owner
  // For now, return empty - the DO itself is the source of truth
  return [];
}

async function getAllSessions(env: Env): Promise<SessionListItem[]> {
  // This would query a D1 database or KV store for all sessions
  // For now, return empty - requires external indexing
  return [];
}
