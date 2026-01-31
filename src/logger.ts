import { LogEvent, LogEntry } from "./types";

export function log(
  event: LogEvent,
  sessionId: string,
  owner: string,
  message?: string
): void {
  const entry: LogEntry = {
    event,
    sessionId,
    owner,
    timestamp: Date.now(),
    message,
  };
  console.log(JSON.stringify(entry));
}
