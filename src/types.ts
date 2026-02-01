export interface Env {
  KALI_SESSION: DurableObjectNamespace;
  SESSION_INDEX: KVNamespace;
  ADMIN_GROUP: string;
  IDLE_TIMEOUT_MS: string;
  MAX_SESSIONS_PER_USER: string;
  NOVNC_PORT: string;
  __STATIC_CONTENT?: KVNamespace;
  __STATIC_CONTENT_MANIFEST?: string;
}

export interface Identity {
  email: string;
  userId: string;
  groups: string[];
}

export type SessionStatus = "created" | "starting" | "running" | "stopped" | "error";

export interface SessionState {
  sessionId: string;
  owner: string;
  status: SessionStatus;
  createdAt: number;
  lastSeen: number;
  errorMessage?: string;
}

export interface SessionListItem {
  sessionId: string;
  owner: string;
  status: SessionStatus;
  createdAt: number;
  lastSeen: number;
}

export type LogEvent =
  | "session_created"
  | "session_started"
  | "session_stopped"
  | "session_destroyed"
  | "websocket_connected"
  | "websocket_disconnected"
  | "error";

export interface LogEntry {
  event: LogEvent;
  sessionId: string;
  owner: string;
  timestamp: number;
  message?: string;
}
