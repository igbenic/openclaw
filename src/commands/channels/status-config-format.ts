import {
  hasConfiguredUnavailableCredentialStatus,
  hasResolvedCredentialValue,
} from "../../channels/account-snapshot-fields.js";
import { listChannelPlugins } from "../../channels/plugins/index.js";
import {
  buildChannelAccountSnapshot,
  buildReadOnlySourceChannelAccountSnapshot,
} from "../../channels/plugins/status.js";
import type { ChannelAccountSnapshot } from "../../channels/plugins/types.public.js";
import type { OpenClawConfig } from "../../config/config.js";
import { formatDocsLink } from "../../terminal/links.js";
import { theme } from "../../terminal/theme.js";
import {
  appendBaseUrlBit,
  appendEnabledConfiguredLinkedBits,
  appendModeBit,
  appendTokenSourceBits,
  buildChannelAccountLine,
  type ChatChannel,
} from "./shared.js";

export async function formatConfigChannelsStatusLines(
  cfg: OpenClawConfig,
  meta: { path?: string; mode?: "local" | "remote" },
  opts?: { sourceConfig?: OpenClawConfig },
): Promise<string[]> {
  const lines: string[] = [];
  lines.push(theme.warn("Gateway not reachable; showing config-only status."));
  if (meta.path) {
    lines.push(`Config: ${meta.path}`);
  }
  if (meta.mode) {
    lines.push(`Mode: ${meta.mode}`);
  }
  if (meta.path || meta.mode) {
    lines.push("");
  }

  const accountLines = (provider: ChatChannel, accounts: Array<Record<string, unknown>>) =>
    accounts.map((account) => {
      const bits: string[] = [];
      appendEnabledConfiguredLinkedBits(bits, account);
      appendModeBit(bits, account);
      if (typeof account.dmPolicy === "string" && account.dmPolicy.length > 0) {
        bits.push(`dm:${account.dmPolicy}`);
      }
      if (typeof account.outboundPolicy === "string" && account.outboundPolicy.length > 0) {
        bits.push(`outbound:${account.outboundPolicy}`);
      }
      if (Array.isArray(account.allowFrom) && account.allowFrom.length > 0) {
        bits.push(`allow:${account.allowFrom.slice(0, 2).join(",")}`);
      }
      if (Array.isArray(account.outboundAllowFrom) && account.outboundAllowFrom.length > 0) {
        bits.push(`outbound-allow:${account.outboundAllowFrom.slice(0, 2).join(",")}`);
      }
      appendTokenSourceBits(bits, account);
      appendBaseUrlBit(bits, account);
      return buildChannelAccountLine(provider, account, bits);
    });

  const plugins = listChannelPlugins();
  const sourceConfig = opts?.sourceConfig ?? cfg;
  for (const plugin of plugins) {
    const accountIds = plugin.config.listAccountIds(cfg);
    if (!accountIds.length) {
      continue;
    }
    const snapshots: ChannelAccountSnapshot[] = [];
    for (const accountId of accountIds) {
      const sourceSnapshot = await buildReadOnlySourceChannelAccountSnapshot({
        plugin,
        cfg: sourceConfig,
        accountId,
      });
      const resolvedSnapshot = await buildChannelAccountSnapshot({
        plugin,
        cfg,
        accountId,
      });
      snapshots.push(
        sourceSnapshot &&
          hasConfiguredUnavailableCredentialStatus(sourceSnapshot) &&
          (!hasResolvedCredentialValue(resolvedSnapshot) ||
            (sourceSnapshot.configured === true && resolvedSnapshot.configured === false))
          ? sourceSnapshot
          : resolvedSnapshot,
      );
    }
    if (snapshots.length > 0) {
      lines.push(...accountLines(plugin.id, snapshots));
    }
  }

  lines.push("");
  lines.push(
    `Tip: ${formatDocsLink("/cli#status", "status --deep")} adds gateway health probes to status output (requires a reachable gateway).`,
  );
  return lines;
}
