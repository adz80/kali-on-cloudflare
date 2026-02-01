// Container class - types provided by Cloudflare Workers runtime
// @ts-expect-error - Container is a runtime global provided by Cloudflare
export class KaliContainer extends Container {
  defaultPort = 6901; // noVNC port
  sleepAfter = "30m"; // Stop the instance if requests not sent for 30 minutes
}
