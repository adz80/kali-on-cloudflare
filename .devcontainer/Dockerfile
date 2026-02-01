FROM mcr.microsoft.com/devcontainers/javascript-node:1-20-bookworm

# Install Cloudflare WARP root certificate for TLS inspection
RUN curl -fsSL https://developers.cloudflare.com/cloudflare-one/static/Cloudflare_CA.crt \
    -o /usr/local/share/ca-certificates/Cloudflare_CA.crt && \
    update-ca-certificates

# Set Node.js to use the system CA certificates
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# Install Wrangler globally for local development
RUN npm install -g wrangler
