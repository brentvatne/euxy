#!/usr/bin/env node
// Best-effort fetch of a TestFlight beta-feedback crash detail from the
// App Store Connect API. Prints a JSON object to stdout.
//
// If the ASC key material isn't available in the env, it degrades gracefully:
// it emits what the workflow trigger already gave us (feedback id/type/url) so
// the agent can still work — just without the symbolicated stack trace.
//
// Env (all optional; when absent → degraded mode):
//   ASC_KEY_ID, ASC_ISSUER_ID, ASC_P8   — App Store Connect API key (.p8 raw or base64)
//   FEEDBACK_ID, FEEDBACK_TYPE, FEEDBACK_URL, ASC_APP_ID  — from the trigger
//
// ASC API ref: GET /v1/betaFeedbackCrashSubmissions/{id}
//   https://developer.apple.com/documentation/appstoreconnectapi

import { createSign } from 'node:crypto';

const {
  ASC_KEY_ID,
  ASC_ISSUER_ID,
  ASC_P8,
  FEEDBACK_ID = '',
  FEEDBACK_TYPE = 'crash',
  FEEDBACK_URL = '',
  ASC_APP_ID = '',
} = process.env;

const base = {
  feedbackId: FEEDBACK_ID,
  feedbackType: FEEDBACK_TYPE,
  feedbackUrl: FEEDBACK_URL,
  appId: ASC_APP_ID,
  crashLog: null,
  degraded: true,
  note: 'ASC key material not present — triaging from feedback url/id only.',
};

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function ascJwt() {
  const p8 = ASC_P8.includes('BEGIN') ? ASC_P8 : Buffer.from(ASC_P8, 'base64').toString('utf8');
  const header = { alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ASC_ISSUER_ID, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  const der = signer.sign({ key: p8, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${der.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;
}

async function main() {
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_P8 || !FEEDBACK_ID) {
    process.stdout.write(JSON.stringify(base, null, 2));
    return;
  }
  try {
    const token = ascJwt();
    const res = await fetch(
      `https://api.appstoreconnect.apple.com/v1/betaFeedbackCrashSubmissions/${FEEDBACK_ID}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      base.note = `ASC API ${res.status} ${res.statusText} — falling back to feedback url/id.`;
      process.stdout.write(JSON.stringify(base, null, 2));
      return;
    }
    const data = await res.json();
    const attrs = data?.data?.attributes ?? {};
    process.stdout.write(
      JSON.stringify(
        {
          ...base,
          degraded: false,
          note: 'Fetched from App Store Connect API.',
          deviceModel: attrs.deviceModel,
          osVersion: attrs.osVersion,
          appPlatform: attrs.appPlatform,
          appUptimeMillis: attrs.appUptimeMillis,
          crashLog: attrs.crashLog ?? attrs.logs ?? null,
          raw: attrs,
        },
        null,
        2
      )
    );
  } catch (err) {
    base.note = `ASC fetch error: ${err.message} — falling back to feedback url/id.`;
    process.stdout.write(JSON.stringify(base, null, 2));
  }
}

main();
