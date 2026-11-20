// Creates the client secret for "Sign in with Apple" (APPLE_CLIENT_SECRET): a JWT signed with the
// .p8 key from the Apple developer account. Apple accepts it for 6 months at most, so run this
// again before it expires and put the new value into .env.
//
//   node scripts/apple-client-secret.mjs <AuthKey_XXXX.p8> <team id> <key id> <services id>
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

const [p8Path, teamId, keyId, clientId] = process.argv.slice(2);
if (!p8Path || !teamId || !keyId || !clientId) {
	console.error(
		"Usage: node scripts/apple-client-secret.mjs <AuthKey_XXXX.p8> <team id> <key id> <services id>",
	);
	process.exit(1);
}

const MAX_AGE_SECONDS = 180 * 24 * 60 * 60; // Apple's limit is 6 months
const now = Math.floor(Date.now() / 1000);
const base64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

const unsigned = [
	base64url({ alg: "ES256", kid: keyId }),
	base64url({
		iss: teamId,
		iat: now,
		exp: now + MAX_AGE_SECONDS,
		aud: "https://appleid.apple.com",
		sub: clientId,
	}),
].join(".");

// JWTs want the raw r||s signature, not DER
const signature = sign("sha256", Buffer.from(unsigned), {
	key: createPrivateKey(readFileSync(p8Path, "utf8")),
	dsaEncoding: "ieee-p1363",
}).toString("base64url");

console.log(`${unsigned}.${signature}`);
console.error(`Valid until ${new Date((now + MAX_AGE_SECONDS) * 1000).toISOString().slice(0, 10)}`);
