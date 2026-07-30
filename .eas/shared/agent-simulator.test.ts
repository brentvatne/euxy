import { describe, expect, test } from "bun:test";

import {
  parseSimulatorAvailability,
  parseSimulatorSessionId,
  parseSimulatorSessionUrl,
} from "./agent-simulator";

const SESSION_ID = "019fb1af-10f1-761d-a740-5d41b013d189";
const SESSION_URL =
  `https://expo.dev/accounts/brent-org/projects/euxy/simulator-sessions/${SESSION_ID}`;

function listing(sessions: unknown[]): string {
  return JSON.stringify({ sessions, pageInfo: { hasNextPage: false } });
}

describe("agent simulator", () => {
  test("recognizes enabled availability responses", () => {
    expect(parseSimulatorAvailability('{"available":true,"accountName":"brent-org"}')).toBe(true);
  });

  test("fails closed for unavailable or malformed responses", () => {
    expect(parseSimulatorAvailability('{"available":false}')).toBe(false);
    expect(parseSimulatorAvailability("{}")).toBe(false);
    expect(parseSimulatorAvailability("not json")).toBe(false);
  });
});

describe("simulator session id", () => {
  test("reads the id eas-cli writes into the session dotenv", () => {
    expect(parseSimulatorSessionId(`# managed by eas-cli\nEAS_SIMULATOR_SESSION_ID=${SESSION_ID}\n`)).toBe(
      SESSION_ID
    );
    // Quoted and `export`-prefixed forms both appear depending on the writer.
    expect(parseSimulatorSessionId(`EAS_SIMULATOR_SESSION_ID="${SESSION_ID}"`)).toBe(SESSION_ID);
    expect(parseSimulatorSessionId(`export EAS_SIMULATOR_SESSION_ID='${SESSION_ID}'`)).toBe(SESSION_ID);
    // Other keys in the file must not shift the match.
    expect(
      parseSimulatorSessionId(`EAS_SIMULATOR_URL=wss://x\nEAS_SIMULATOR_SESSION_ID=${SESSION_ID}\n`)
    ).toBe(SESSION_ID);
  });

  test("returns null rather than echoing a value that is not a session id", () => {
    expect(parseSimulatorSessionId("# managed by eas-cli\n")).toBe(null);
    expect(parseSimulatorSessionId("")).toBe(null);
    // A session id goes into a public pull request body, so refuse anything
    // that is not a UUID instead of passing it through.
    expect(parseSimulatorSessionId("EAS_SIMULATOR_SESSION_ID=../../etc/passwd")).toBe(null);
    expect(parseSimulatorSessionId("EAS_SIMULATOR_SESSION_ID=")).toBe(null);
    expect(parseSimulatorSessionId("EAS_SIMULATOR_SESSION_ID_OLD=" + SESSION_ID)).toBe(null);
  });
});

describe("simulator session URL", () => {
  test("takes the dashboard URL for the matching session", () => {
    const raw = listing([
      { id: "019fb422-2b68-7699-b892-106eeb8f5022", deviceRunSessionUrl: "https://expo.dev/accounts/brent-org/projects/euxy/simulator-sessions/019fb422-2b68-7699-b892-106eeb8f5022" },
      { id: SESSION_ID, deviceRunSessionUrl: SESSION_URL },
    ]);
    expect(parseSimulatorSessionUrl(raw, SESSION_ID)).toBe(SESSION_URL);
  });

  test("returns null when the session is absent or the listing is unusable", () => {
    expect(parseSimulatorSessionUrl(listing([]), SESSION_ID)).toBe(null);
    expect(parseSimulatorSessionUrl(listing([{ id: "other", deviceRunSessionUrl: SESSION_URL }]), SESSION_ID)).toBe(null);
    expect(parseSimulatorSessionUrl("not json", SESSION_ID)).toBe(null);
    expect(parseSimulatorSessionUrl("{}", SESSION_ID)).toBe(null);
    expect(parseSimulatorSessionUrl(listing([{ id: SESSION_ID }]), SESSION_ID)).toBe(null);
  });

  test("refuses a URL that is not this session on expo.dev", () => {
    const cases = [
      // Right session id, wrong host — an attacker-controlled listing must not
      // put an arbitrary link into a pull request.
      `https://evil.example.com/accounts/a/projects/b/simulator-sessions/${SESSION_ID}`,
      `http://expo.dev/accounts/a/projects/b/simulator-sessions/${SESSION_ID}`,
      `https://user:pw@expo.dev/accounts/a/projects/b/simulator-sessions/${SESSION_ID}`,
      `https://expo.dev/accounts/a/projects/b/simulator-sessions/${SESSION_ID}?token=x`,
      `https://expo.dev/accounts/a/projects/b/simulator-sessions/${SESSION_ID}#x`,
      // Points at a different session than the one we stopped.
      "https://expo.dev/accounts/a/projects/b/simulator-sessions/019fb422-2b68-7699-b892-106eeb8f5022",
      "https://expo.dev/",
      "not a url",
    ];
    for (const url of cases) {
      expect(parseSimulatorSessionUrl(listing([{ id: SESSION_ID, deviceRunSessionUrl: url }]), SESSION_ID)).toBe(
        null
      );
    }
  });
});
