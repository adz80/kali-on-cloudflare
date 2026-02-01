# Kali Sessions

Browser-accessible Kali Linux desktop sessions on Cloudflare using Containers.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/adz80/kali-on-cloudflare)

## Architecture

- **Worker**: Routes requests to per-user containers based on Cloudflare Access identity
- **Container**: Kali Linux with XFCE desktop, TigerVNC, and noVNC web client
- **Cloudflare Access**: Handles authentication

Each authenticated user gets their own dedicated container instance.

## Requirements

- Cloudflare account with Workers and Containers enabled (beta)
- Cloudflare Access configured for authentication
- Node.js 20+

## Project Structure

```
├── src/worker.ts           # Cloudflare Worker entry point
├── container/
│   ├── Dockerfile          # Kali Linux container image
│   └── entrypoint.sh       # VNC and noVNC startup script
├── wrangler.toml           # Main config (builds container)
├── wrangler.worker-only.toml # Worker-only deploy config
└── .github/workflows/deploy.yml
```

## Deployment

### Option 1: GitHub Actions (Recommended)

The workflow automatically handles deployments:

**Worker-only deploy** (default on push to `main`):
- Deploys worker code using existing container image
- Uses `wrangler.worker-only.toml` config

**Container + Worker deploy** (automatic or manual):
- Triggered automatically when files in `container/` change
- Or manually via GitHub Actions UI with `build_container: true`
- Builds new container image and deploys worker

#### Setup GitHub Secrets

Add these secrets to your repository:
- `CF_API_TOKEN`: Cloudflare API token with Workers and Containers permissions
- `CF_ACCOUNT_ID`: Your Cloudflare account ID

### Option 2: Local Wrangler Deploy

#### Full deploy (builds container):
```bash
npm install
npx wrangler deploy
```

> **Note**: EDR (Endpoint Detection and Response) systems may block Docker builds locally. If you encounter issues, use GitHub Actions for container builds instead.

#### Worker-only deploy (uses existing container image):
```bash
npx wrangler deploy --config wrangler.worker-only.toml
```

> **Note**: After a container rebuild via GitHub Actions, update the image tag in `wrangler.worker-only.toml` to match the new tag shown in the deploy output.

## Configuration

### wrangler.toml

Main configuration for full deploys:

```toml
[[containers]]
class_name = "KaliSession"
image = "./container/Dockerfile"    # Builds from Dockerfile
max_instances = 10
instance_type = "standard-2"
```

### wrangler.worker-only.toml

For worker-only deploys (references existing image):

```toml
[[containers]]
class_name = "KaliSession"
image = "registry.cloudflare.com/<account>/kali-sessions-kalisession:<tag>"
max_instances = 10
```

## Authentication

All authentication is handled by Cloudflare Access:

- Worker reads `CF-Access-Authenticated-User-Email` header
- Each user is routed to their own container by email
- Unauthenticated requests return 401

**Setup Cloudflare Access:**
1. Create an Access Application for your Worker domain
2. Configure identity providers (Google, GitHub, etc.)
3. Set access policies as needed

## Container Details

The container runs:
- **Kali Linux** base image
- **XFCE4** desktop environment
- **TigerVNC** server (no authentication, secured by Access)
- **noVNC** web client on port 6901

Container auto-sleeps after 15 minutes of inactivity.

### Customizing Installed Tools

The Dockerfile uses `kali-linux-default` metapackage by default. To customize which tools are installed, edit `container/Dockerfile` and change the metapackage.

See the [Kali Metapackages documentation](https://www.kali.org/docs/general-use/metapackages/) for available options:
- `kali-linux-default` - Default tools (~5GB)
- `kali-linux-large` - Extended toolset (~15GB, may timeout during push)
- `kali-tools-web` - Web application testing
- `kali-tools-passwords` - Password cracking tools
- And many more category-specific packages

## Security

- One container per user (isolation)
- All access gated by Cloudflare Access
- VNC has no password (security handled at Access layer)
- Containers have outbound internet access

## TODO

- [ ] Add R2-backed FUSE mounts for persistent user data storage (`/home/kali/data`)
