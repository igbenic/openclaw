import type { GatewayConnectionDetails } from "../../../src/gateway/call.js";

export function shouldFetchRemotePolicyConfig(details: GatewayConnectionDetails): boolean {
  if (details.localConfigTarget === true) {
    return false;
  }
  return details.urlSource !== "local loopback";
}
