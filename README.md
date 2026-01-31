# Kali Sessions

Browser-accessible, ephemeral Kali Linux sessions on Cloudflare.

## Architecture

- **Worker**: Routes requests, validates Cloudflare Access identity
- **Durable Object (KaliSession)**: Manages session lifecycle, proxies WebSocket
- **Container**: Kali Linux with ttyd terminal server
- **Static Frontend**: xterm.js-based terminal UI

## Requirements

- Cloudflare account with Workers, Durable Objects, and Containers enabled
- Cloudflare Access configured for authentication
- Node.js 20+
- Docker (for container builds)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Cloudflare Access

1. Create an Access Application for your Worker domain
2. Configure identity providers (Google, GitHub, etc.)
3. Create an Access Group named `kali-admins` for admin users

### 3. Configure Environment

Update `wrangler.toml` with your settings:

```toml
[vars]
ADMIN_GROUP = "kali-admins"           # Access group for admins
IDLE_TIMEOUT_MS = "1800000"           # 30 minutes
MAX_SESSIONS_PER_USER = "1"           # Max concurrent sessions
TERMINAL_PORT = "7681"                # ttyd port in container
CONTAINER_IMAGE = "kali-terminal:latest"
```

### 4. Build Container

```bash
npm run build:container
```

Push to Cloudflare Container Registry:

```bash
docker tag kali-terminal:latest registry.cloudflare.com/<ACCOUNT_ID>/kali-terminal:latest
docker push registry.cloudflare.com/<ACCOUNT_ID>/kali-terminal:latest
```

### 5. Deploy

```bash
npm run deploy
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/:id` | Get session status |
| POST | `/api/sessions/:id/start` | Start session container |
| POST | `/api/sessions/:id/stop` | Stop session container |
| DELETE | `/api/sessions/:id` | Destroy session |
| GET | `/session/:id/ws` | WebSocket terminal connection |

## Authentication

All authentication is handled by Cloudflare Access. The application:

- Reads identity from `Cf-Access-Authenticated-User-Email` header
- Parses JWT from `Cf-Access-Jwt-Assertion` for groups
- Returns 403 for requests without valid Access identity

**No application-level authentication is implemented.**

## Session Lifecycle

1. **Create**: Allocates Durable Object, stores owner
2. **Start**: Launches container with internet enabled
3. **Connect**: WebSocket proxied through DO to container
4. **Stop**: Gracefully stops container, closes WebSockets
5. **Destroy**: Deletes container and DO state

## Security

- One container per session (isolation)
- Containers have outbound internet only (no inbound)
- All ingress via Worker → Durable Object → Container
- Session owner or admin required for access
- Idle timeout auto-stops sessions

## Development

```bash
npm run dev
```

## CI/CD

GitHub Actions workflow:

1. Builds and pushes container to Cloudflare registry
2. Deploys Worker with pinned container image tag

Required secrets:
- `CF_API_TOKEN`: Cloudflare API token
- `CF_ACCOUNT_ID`: Cloudflare account ID

## Logs

Events logged (JSON format):
- `session_created`
- `session_started`
- `session_stopped`
- `session_destroyed`
- `websocket_connected`
- `websocket_disconnected`
- `error`

Each entry includes: `sessionId`, `owner`, `timestamp`, `message` (optional)
