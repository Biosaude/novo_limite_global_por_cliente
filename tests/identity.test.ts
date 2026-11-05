import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createLocalJWKSet,
  createRemoteJWKSet,
  customFetch,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import { createIdentityVerifier } from "../server/security/identity";

// Todas as chaves e identidades são sintéticas. Nenhuma rede ou banco é utilizado.
const issuer = "https://auth.example.invalid";
const audience = issuer;
const jwksUrl = `${issuer}/neondb/auth/.well-known/jwks.json`;
const environment = {
  FINANCIAL_AUTH_ISSUER: issuer,
  FINANCIAL_AUTH_AUDIENCE: audience,
  FINANCIAL_AUTH_JWKS_URL: jwksUrl,
};
const denied = { code: "UNAUTHENTICATED" };

for (const algorithm of ["RS256", "EdDSA"] as const) {
  async function setup() {
    const key = await generateKeyPair(algorithm);
    const jwk = { ...(await exportJWK(key.publicKey)), kid: "current", alg: algorithm };
    const verifier = createIdentityVerifier(environment, createLocalJWKSet({ keys: [jwk] }));
    const claims = {
      iss: issuer,
      aud: audience,
      sub: "synthetic-user",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    };
    async function sign(
      payload: Record<string, unknown> = claims,
      signingKey = key.privateKey,
      header: Record<string, unknown> = {},
    ) {
      return new SignJWT(payload)
        .setProtectedHeader({ alg: algorithm, kid: "current", ...header })
        .sign(signingKey);
    }
    return { key, jwk, verifier, claims, sign };
  }

  test(`JWT ${algorithm}: assinatura válida e identidade canônica`, async () => {
    const { key, verifier, sign } = await setup();
    if (algorithm === "EdDSA") assert.equal(key.publicKey.algorithm.name, "Ed25519");
    assert.deepEqual(await verifier.verify(`Bearer ${await sign()}`), {
      issuer,
      subject: "synthetic-user",
      actor: JSON.stringify([issuer, "synthetic-user"]),
    });
  });

  test(`JWT ${algorithm}: rejeita assinatura falsa, kid desconhecido e formato inválido`, async () => {
    const { verifier, claims, sign } = await setup();
    const attacker = await generateKeyPair(algorithm);
    await assert.rejects(verifier.verify(`Bearer ${await sign(claims, attacker.privateKey)}`), denied);
    const unknown = new SignJWT(claims).setProtectedHeader({ alg: algorithm, kid: "unknown" });
    await assert.rejects(verifier.verify(`Bearer ${await unknown.sign(attacker.privateKey)}`), denied);
    for (const header of [undefined, ["Bearer invalid"], "Bearer a.b.c", "Bearer opaque-session-cookie"])
      await assert.rejects(verifier.verify(header), denied);
  });

  test(`JWT ${algorithm}: rejeita expiração, nbf, emissor e audiência incorretos`, async () => {
    const { verifier, claims, sign } = await setup();
    for (const changes of [
      { exp: 1 },
      { nbf: Math.floor(Date.now() / 1000) + 3600 },
      { iat: Math.floor(Date.now() / 1000) + 3600 },
      { iss: "https://other.example.invalid" },
      { aud: "other-api" },
    ])
      await assert.rejects(verifier.verify(`Bearer ${await sign({ ...claims, ...changes })}`), denied);
  });

  test(`JWT ${algorithm}: exige todas as claims e rejeita redirecionamento de chaves`, async () => {
    const { key, verifier, claims, sign } = await setup();
    for (const claim of ["iss", "aud", "sub", "iat", "exp"]) {
      const payload: Record<string, unknown> = { ...claims };
      delete payload[claim];
      await assert.rejects(verifier.verify(`Bearer ${await sign(payload)}`), denied);
    }
    await assert.rejects(verifier.verify(`Bearer ${await sign({ ...claims, sub: "  " })}`), denied);
    for (const header of [
      { jku: "https://attacker.example.invalid/jwks" },
      { x5u: "https://attacker.example.invalid/certificate" },
    ])
      await assert.rejects(verifier.verify(`Bearer ${await sign(claims, key.privateKey, header)}`), denied);
  });

  test(`JWT ${algorithm}: rotação de kid recarrega JWKS e preserva chaves em transição`, async () => {
    const { key, jwk, claims } = await setup();
    const nextKey = await generateKeyPair(algorithm);
    const nextJwk = { ...(await exportJWK(nextKey.publicKey)), kid: "next", alg: algorithm };
    let publishedKeys = [jwk];
    let requests = 0;
    const resolver = createRemoteJWKSet(new URL(jwksUrl), {
      // Sem espera real no teste. Produção conserva cooldownDuration=30000.
      cooldownDuration: 0,
      [customFetch]: async (url) => {
        assert.equal(String(url), jwksUrl);
        requests++;
        return new Response(JSON.stringify({ keys: publishedKeys }), {
          headers: { "content-type": "application/json" },
        });
      },
    });
    const verifier = createIdentityVerifier(environment, resolver);
    const oldToken = await new SignJWT(claims)
      .setProtectedHeader({ alg: algorithm, kid: "current" }).sign(key.privateKey);
    const nextToken = await new SignJWT(claims)
      .setProtectedHeader({ alg: algorithm, kid: "next" }).sign(nextKey.privateKey);
    await verifier.verify(`Bearer ${oldToken}`);
    assert.equal(requests, 1);
    publishedKeys = [jwk, nextJwk];
    await verifier.verify(`Bearer ${nextToken}`);
    assert.equal(requests, 2);
    await verifier.verify(`Bearer ${oldToken}`);
    assert.equal(requests, 2);
    const forged = await new SignJWT(claims)
      .setProtectedHeader({ alg: algorithm, kid: "next" }).sign(key.privateKey);
    await assert.rejects(verifier.verify(`Bearer ${forged}`), denied);
  });
}

test("JWT: rejeita HMAC, none e algoritmo fora da lista antes de resolver chaves", async () => {
  let resolutions = 0;
  const verifier = createIdentityVerifier(environment, async () => {
    resolutions++;
    throw new Error("Resolver não deve ser chamado");
  });
  const claims = { iss: issuer, aud: audience, sub: "synthetic", iat: 1, exp: 2 };
  const hmac = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).sign(new Uint8Array(32));
  const ec = await generateKeyPair("ES256");
  const es = await new SignJWT(claims).setProtectedHeader({ alg: "ES256" }).sign(ec.privateKey);
  const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.`;
  for (const token of [hmac, es, none])
    await assert.rejects(verifier.verify(`Bearer ${token}`), denied);
  assert.equal(resolutions, 0);
});
