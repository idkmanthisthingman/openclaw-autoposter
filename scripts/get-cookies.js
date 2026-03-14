/**
 * One-time script: logs in and prints cookies JSON for use as X_COOKIES GitHub secret.
 * Usage: X_USERNAME=... X_PASSWORD=... X_EMAIL=... node scripts/get-cookies.js
 */
import { Scraper } from 'agent-twitter-client';

const username = process.env.X_USERNAME;
const password = process.env.X_PASSWORD;
const email = process.env.X_EMAIL;

if (!username || !password) {
  console.error('Set X_USERNAME, X_PASSWORD, and X_EMAIL env vars first.');
  process.exit(1);
}

// X blocks Node.js's default User-Agent — inject a browser UA on all requests.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
function fetchWithUA(url, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('User-Agent')) headers.set('User-Agent', UA);
  return fetch(url, { ...init, headers });
}

const scraper = new Scraper({ fetch: fetchWithUA });
console.log(`Logging in as @${username}...`);
await scraper.login(username, password, email);

if (!(await scraper.isLoggedIn())) {
  console.error('Login failed.');
  process.exit(1);
}

const cookies = await scraper.getCookies();
console.log('\n=== COPY THIS AS YOUR X_COOKIES SECRET ===\n');
console.log(JSON.stringify(cookies));
console.log('\n==========================================\n');
