import { Container, getContainer } from '@cloudflare/containers';

interface Env {
	KALI_SESSION: DurableObjectNamespace<KaliSession>;
}

export class KaliSession extends Container<Env> {
	defaultPort = 6901;
	sleepAfter = '15m';
	override onStart() {
		console.log('Container successfully started');
	}

	override onStop() {
		console.log('Container successfully shut down');
	}

	override onError(error: unknown) {
		console.log('Container error:', error);
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// Get the Cloudflare Access user ID from the JWT claims
		// CF-Access-Authenticated-User-Email is set by Cloudflare Access
		const userEmail = request.headers.get('CF-Access-Authenticated-User-Email');
		
		if (!userEmail) {
			return new Response('Unauthorized: No Access user found', { status: 401 });
		}
		
		// Use the user's email as the container ID for per-user session stickiness
		// This ensures each user gets their own dedicated container
		const container = getContainer(env.KALI_SESSION, userEmail);
		return await container.fetch(request);
	},
};