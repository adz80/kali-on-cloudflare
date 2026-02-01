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

    // noVNC proxy - serve static files and WebSocket
    const vncMatch = path.match(/^\/session\/([^/]+)\/vnc(.*)$/);
    if (vncMatch) {
      const sessionId = vncMatch[1];
      const vncPath = vncMatch[2] || "/";
      return routeToDurableObject(env, sessionId, `/vnc${vncPath}`, request.method, identity, request);
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
      headers: { 
        "X-Identity": JSON.stringify(identity),
        "X-Session-Id": sessionId,
      },
    })
  );

  if (response.ok) {
    await indexSession(env, sessionId, owner, "created");
  }

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

async function getSessionsForOwner(env: Env, owner: string): Promise<SessionListItem[]> {
  const ownerKey = `owner:${owner}`;
  const sessionIds = await env.SESSION_INDEX.get<string[]>(ownerKey, "json") || [];
  
  const sessions: SessionListItem[] = [];
  for (const sessionId of sessionIds) {
    const session = await env.SESSION_INDEX.get<SessionListItem>(`session:${sessionId}`, "json");
    if (session) {
      sessions.push(session);
    }
  }
  return sessions;
}

async function getAllSessions(env: Env): Promise<SessionListItem[]> {
  const list = await env.SESSION_INDEX.list({ prefix: "session:" });
  const sessions: SessionListItem[] = [];
  
  for (const key of list.keys) {
    const session = await env.SESSION_INDEX.get<SessionListItem>(key.name, "json");
    if (session) {
      sessions.push(session);
    }
  }
  return sessions;
}

async function indexSession(env: Env, sessionId: string, owner: string, status: string): Promise<void> {
  const now = Date.now();
  const sessionData: SessionListItem = {
    sessionId,
    owner,
    status: status as SessionListItem["status"],
    createdAt: now,
    lastSeen: now,
  };
  
  await env.SESSION_INDEX.put(`session:${sessionId}`, JSON.stringify(sessionData));
  
  const ownerKey = `owner:${owner}`;
  const sessionIds = await env.SESSION_INDEX.get<string[]>(ownerKey, "json") || [];
  if (!sessionIds.includes(sessionId)) {
    sessionIds.push(sessionId);
    await env.SESSION_INDEX.put(ownerKey, JSON.stringify(sessionIds));
  }
}

async function removeSessionIndex(env: Env, sessionId: string, owner: string): Promise<void> {
  await env.SESSION_INDEX.delete(`session:${sessionId}`);
  
  const ownerKey = `owner:${owner}`;
  const sessionIds = await env.SESSION_INDEX.get<string[]>(ownerKey, "json") || [];
  const filtered = sessionIds.filter(id => id !== sessionId);
  await env.SESSION_INDEX.put(ownerKey, JSON.stringify(filtered));
}
