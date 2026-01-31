import { Identity } from "./types";

export function extractIdentity(request: Request): Identity | null {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  const jwtAssertion = request.headers.get("Cf-Access-Jwt-Assertion");

  if (!email) {
    return null;
  }

  let userId = email;
  let groups: string[] = [];

  if (jwtAssertion) {
    try {
      const parts = jwtAssertion.split(".");
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        userId = payload.sub || payload.email || email;
        groups = payload.groups || payload["custom:groups"] || [];
      }
    } catch {
      // Fall back to email as userId
    }
  }

  return { email, userId, groups };
}

export function isAdmin(identity: Identity, adminGroup: string): boolean {
  return identity.groups.includes(adminGroup);
}

export function getOwnerIdentifier(identity: Identity): string {
  return identity.email;
}
