import { resolveConfigPath, resolveGatewayPort } from "../config/paths.js";
import type { OpenClawConfig } from "../config/types.js";
import { pickPrimaryTailnetIPv4 } from "../infra/tailnet.js";
import { normalizeOptionalString } from "../shared/string-coerce.js";
import { isLoopbackHost, isSecureWebSocketUrl } from "./net.js";

export type GatewayConnectionDetails = {
  url: string;
  urlSource: string;
  bindDetail?: string;
  remoteFallbackNote?: string;
  localConfigTarget?: boolean;
  allowInsecurePrivateWs?: boolean;
  message: string;
};

type GatewayConnectionDetailResolvers = {
  loadConfig?: () => OpenClawConfig;
  resolveConfigPath?: (env: NodeJS.ProcessEnv) => string;
  resolveGatewayPort?: (cfg?: OpenClawConfig, env?: NodeJS.ProcessEnv) => number;
};

function resolvePreferredLocalGatewayTarget(params: {
  bindMode: string;
  customBindHost?: string;
  localUrl: string;
  scheme: "ws" | "wss";
  port: number;
}): {
  url: string;
  urlSource: string;
  allowInsecurePrivateWs: boolean;
} {
  if (params.bindMode === "custom") {
    const host = normalizeOptionalString(params.customBindHost);
    if (host) {
      return {
        url: `${params.scheme}://${host}:${params.port}`,
        urlSource: "local gateway.bind=custom",
        allowInsecurePrivateWs: params.scheme === "ws" && !isLoopbackHost(host),
      };
    }
  }

  if (params.bindMode === "tailnet") {
    const tailnetHost = normalizeOptionalString(pickPrimaryTailnetIPv4());
    if (tailnetHost) {
      return {
        url: `${params.scheme}://${tailnetHost}:${params.port}`,
        urlSource: "local gateway.bind=tailnet",
        allowInsecurePrivateWs: params.scheme === "ws",
      };
    }
  }

  return {
    url: params.localUrl,
    urlSource: "local loopback",
    allowInsecurePrivateWs: false,
  };
}

export function buildGatewayConnectionDetailsWithResolvers(
  options: {
    config?: OpenClawConfig;
    url?: string;
    configPath?: string;
    urlSource?: "cli" | "env";
  } = {},
  resolvers: GatewayConnectionDetailResolvers = {},
): GatewayConnectionDetails {
  const config = options.config ?? resolvers.loadConfig?.() ?? {};
  const configPath =
    options.configPath ??
    resolvers.resolveConfigPath?.(process.env) ??
    resolveConfigPath(process.env);
  const isRemoteMode = config.gateway?.mode === "remote";
  const remote = isRemoteMode ? config.gateway?.remote : undefined;
  const tlsEnabled = config.gateway?.tls?.enabled === true;
  const localPort =
    resolvers.resolveGatewayPort?.(config, process.env) ?? resolveGatewayPort(config);
  const bindMode = config.gateway?.bind ?? "loopback";
  const scheme = tlsEnabled ? "wss" : "ws";
  const localUrl = `${scheme}://127.0.0.1:${localPort}`;
  const preferredLocalTarget = resolvePreferredLocalGatewayTarget({
    bindMode,
    customBindHost: config.gateway?.customBindHost,
    localUrl,
    scheme,
    port: localPort,
  });
  const cliUrlOverride = normalizeOptionalString(options.url);
  const envUrlOverride = cliUrlOverride
    ? undefined
    : normalizeOptionalString(process.env.OPENCLAW_GATEWAY_URL);
  const urlOverride = cliUrlOverride ?? envUrlOverride;
  const remoteUrl = normalizeOptionalString(remote?.url);
  const remoteMisconfigured = isRemoteMode && !urlOverride && !remoteUrl;
  const urlSourceHint =
    options.urlSource ?? (cliUrlOverride ? "cli" : envUrlOverride ? "env" : undefined);
  const url = urlOverride || remoteUrl || preferredLocalTarget.url;
  const urlSource = urlOverride
    ? urlSourceHint === "env"
      ? "env OPENCLAW_GATEWAY_URL"
      : "cli --url"
    : remoteUrl
      ? "config gateway.remote.url"
      : remoteMisconfigured
        ? "missing gateway.remote.url (fallback local)"
        : preferredLocalTarget.urlSource;
  const bindDetail = !urlOverride && !remoteUrl ? `Bind: ${bindMode}` : undefined;
  const remoteFallbackNote = remoteMisconfigured
    ? "Warn: gateway.mode=remote but gateway.remote.url is missing; set gateway.remote.url or switch gateway.mode=local."
    : undefined;
  const localConfigTarget = !urlOverride && !remoteUrl && !remoteMisconfigured;
  const allowInsecurePrivateWs =
    !urlOverride && !remoteUrl ? preferredLocalTarget.allowInsecurePrivateWs : false;

  const allowPrivateWs = process.env.OPENCLAW_ALLOW_INSECURE_PRIVATE_WS === "1";
  if (!isSecureWebSocketUrl(url, { allowPrivateWs: allowPrivateWs || allowInsecurePrivateWs })) {
    throw new Error(
      [
        `SECURITY ERROR: Gateway URL "${url}" uses plaintext ws:// to a non-loopback address.`,
        "Both credentials and chat data would be exposed to network interception.",
        `Source: ${urlSource}`,
        `Config: ${configPath}`,
        "Fix: Use wss:// for remote gateway URLs.",
        "Safe remote access defaults:",
        "- keep gateway.bind=loopback and use an SSH tunnel (ssh -N -L 18789:127.0.0.1:18789 user@gateway-host)",
        "- or use Tailscale Serve/Funnel for HTTPS remote access",
        allowPrivateWs
          ? undefined
          : "Break-glass (trusted private networks only): set OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1",
        "Doctor: openclaw doctor --fix",
        "Docs: https://docs.openclaw.ai/gateway/remote",
      ].join("\n"),
    );
  }

  const message = [
    `Gateway target: ${url}`,
    `Source: ${urlSource}`,
    `Config: ${configPath}`,
    bindDetail,
    remoteFallbackNote,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    url,
    urlSource,
    bindDetail,
    remoteFallbackNote,
    localConfigTarget,
    allowInsecurePrivateWs,
    message,
  };
}
