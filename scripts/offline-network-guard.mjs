import http from "node:http";
import https from "node:https";

const guardKey = Symbol.for("legisflashcards.offline-network-guard");

function describeTarget(input, fallbackProtocol = "network:") {
  const rawTarget =
    typeof input === "string" || input instanceof URL
      ? input
      : input?.url ?? input?.href;

  try {
    const url = new URL(rawTarget);
    return url.origin;
  } catch {
    const host = input?.hostname ?? input?.host;
    return host ? `${fallbackProtocol}//${host}` : "an unknown target";
  }
}

function blockedRequest(channel, fallbackProtocol) {
  return function blockOfflineRequest(input) {
    const target = describeTarget(input, fallbackProtocol);
    throw new Error(`[build:offline] Blocked ${channel} access to ${target}`);
  };
}

if (process.env.BUILD_OFFLINE === "true" && !globalThis[guardKey]) {
  globalThis[guardKey] = true;

  globalThis.fetch = blockedRequest("fetch", "http:");
  http.request = blockedRequest("HTTP", "http:");
  http.get = blockedRequest("HTTP", "http:");
  https.request = blockedRequest("HTTPS", "https:");
  https.get = blockedRequest("HTTPS", "https:");
}
