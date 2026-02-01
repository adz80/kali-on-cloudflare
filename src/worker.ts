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
		// Use a fixed container ID for session stickiness
		// This ensures WebSocket connections go to the same container as the HTML page
		const container = getContainer(env.KALI_SESSION, 'default-session');
		return await container.fetch(request);
	},
};