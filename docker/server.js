// Entry point for the Docker image: starts the SvelteKit Node server (build/index.js).
//
// SvelteKit 3's Node adapter assumes https unless told otherwise, and rejects form posts (such as
// the login) whose Origin doesn't match with "Cross-site POST form submissions are forbidden".
// For a home/LAN install served over plain http there is no proxy to say so, so PLAIN_HTTP=true
// (the default in docker-compose.yml) tells the server that requests arrive over http.
//
// Behind an https reverse proxy, set PLAIN_HTTP=false and PROTOCOL_HEADER=x-forwarded-proto
// (and HOST_HEADER=x-forwarded-host if the proxy rewrites the Host header) instead.
const plainHttp = process.env.PLAIN_HTTP === 'true';

// The adapter reads its environment when it is imported, so set this first.
if (plainHttp) process.env.PROTOCOL_HEADER = 'x-forwarded-proto';

const { server } = await import('./build/index.js');

if (plainHttp) {
	// Always overwrite (never trust) the header: with no proxy in front, a client could forge it.
	server.prependListener('request', (req) => {
		req.headers['x-forwarded-proto'] = 'http';
	});
}
