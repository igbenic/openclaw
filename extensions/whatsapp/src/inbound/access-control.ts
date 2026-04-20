import { createChannelPairingChallengeIssuer } from "openclaw/plugin-sdk/channel-pairing";
import { loadConfig } from "openclaw/plugin-sdk/config-runtime";
import { warnMissingProviderGroupPolicyFallbackOnce } from "openclaw/plugin-sdk/config-runtime";
import { upsertChannelPairingRequest } from "openclaw/plugin-sdk/conversation-runtime";
import { defaultRuntime } from "openclaw/plugin-sdk/runtime-env";
import {
  readStoreAllowFromForDmPolicy,
  resolveDmGroupAccessWithLists,
} from "openclaw/plugin-sdk/security-runtime";
import { resolveWhatsAppInboundPolicy } from "../inbound-policy.js";
import { resolveWhatsAppVisibleOutboundDecision } from "../outbound-policy.js";

export type InboundAccessControlResult = {
  allowed: boolean;
  shouldMarkRead: boolean;
  isSelfChat: boolean;
  resolvedAccountId: string;
  visibleOutboundAllowed: boolean;
  outboundPolicy: string;
  visibleOutboundBlockReason?: string;
};

const PAIRING_REPLY_HISTORY_GRACE_MS = 30_000;

function logWhatsAppVerbose(enabled: boolean | undefined, message: string) {
  if (!enabled) {
    return;
  }
  defaultRuntime.log(message);
}

export async function checkInboundAccessControl(params: {
  accountId: string;
  from: string;
  selfE164: string | null;
  senderE164: string | null;
  group: boolean;
  pushName?: string;
  isFromMe: boolean;
  messageTimestampMs?: number;
  connectedAtMs?: number;
  pairingGraceMs?: number;
  verbose?: boolean;
  sock: {
    sendMessage: (jid: string, content: { text: string }) => Promise<unknown>;
  };
  remoteJid: string;
}): Promise<InboundAccessControlResult> {
  const cfg = loadConfig();
  const policy = resolveWhatsAppInboundPolicy({
    cfg,
    accountId: params.accountId,
    selfE164: params.selfE164,
  });
  const storeAllowFrom = await readStoreAllowFromForDmPolicy({
    provider: "whatsapp",
    accountId: policy.account.accountId,
    dmPolicy: policy.dmPolicy,
    shouldRead: policy.shouldReadStorePairingApprovals,
  });
  const pairingGraceMs =
    typeof params.pairingGraceMs === "number" && params.pairingGraceMs > 0
      ? params.pairingGraceMs
      : PAIRING_REPLY_HISTORY_GRACE_MS;
  const suppressPairingReply =
    typeof params.connectedAtMs === "number" &&
    typeof params.messageTimestampMs === "number" &&
    params.messageTimestampMs < params.connectedAtMs - pairingGraceMs;
  const visibleOutbound = resolveWhatsAppVisibleOutboundDecision({
    account: policy.account,
    // For direct chats, prefer the resolved phone identity over the raw remote JID so
    // LID/device JIDs still honor the same allowFrom entries as the inbound route.
    target: params.group ? params.remoteJid : params.from,
  });
  const buildResult = (overrides: Pick<InboundAccessControlResult, "allowed" | "shouldMarkRead">) =>
    ({
      ...overrides,
      shouldMarkRead: overrides.shouldMarkRead && !policy.isSelfChat,
      isSelfChat: policy.isSelfChat,
      resolvedAccountId: policy.account.accountId,
      visibleOutboundAllowed: visibleOutbound.allowed,
      outboundPolicy: visibleOutbound.outboundPolicy,
      ...(!visibleOutbound.allowed ? { visibleOutboundBlockReason: visibleOutbound.reason } : {}),
    }) satisfies InboundAccessControlResult;

  // Group policy filtering:
  // - "open": groups bypass allowFrom, only mention-gating applies
  // - "disabled": block all group messages entirely
  // - "allowlist": only allow group messages from senders in groupAllowFrom/allowFrom
  warnMissingProviderGroupPolicyFallbackOnce({
    providerMissingFallbackApplied: policy.providerMissingFallbackApplied,
    providerKey: "whatsapp",
    accountId: policy.account.accountId,
    log: (message) => logWhatsAppVerbose(params.verbose, message),
  });
  const access = resolveDmGroupAccessWithLists({
    isGroup: params.group,
    dmPolicy: policy.dmPolicy,
    groupPolicy: policy.groupPolicy,
    allowFrom: params.group ? policy.configuredAllowFrom : policy.dmAllowFrom,
    groupAllowFrom: policy.groupAllowFrom,
    storeAllowFrom,
    isSenderAllowed: (allowEntries) => {
      return params.group
        ? policy.isGroupSenderAllowed(allowEntries, params.senderE164)
        : policy.isDmSenderAllowed(allowEntries, params.from);
    },
  });
  if (params.group && access.decision !== "allow") {
    if (access.reason === "groupPolicy=disabled") {
      logWhatsAppVerbose(params.verbose, "Blocked group message (groupPolicy: disabled)");
    } else if (access.reason === "groupPolicy=allowlist (empty allowlist)") {
      logWhatsAppVerbose(
        params.verbose,
        "Blocked group message (groupPolicy: allowlist, no groupAllowFrom)",
      );
    } else {
      logWhatsAppVerbose(
        params.verbose,
        `Blocked group message from ${params.senderE164 ?? "unknown sender"} (groupPolicy: allowlist)`,
      );
    }
    return buildResult({ allowed: false, shouldMarkRead: false });
  }

  // DM access control (secure defaults): "pairing" (default) / "allowlist" / "open" / "disabled".
  if (!params.group) {
    if (params.isFromMe && !policy.isSamePhone(params.from)) {
      logWhatsAppVerbose(params.verbose, "Skipping outbound DM (fromMe); no pairing reply needed.");
      return buildResult({ allowed: false, shouldMarkRead: false });
    }
    if (access.decision === "block" && access.reason === "dmPolicy=disabled") {
      logWhatsAppVerbose(params.verbose, "Blocked dm (dmPolicy: disabled)");
      return buildResult({ allowed: false, shouldMarkRead: false });
    }
    if (access.decision === "pairing" && !policy.isSamePhone(params.from)) {
      const candidate = params.from;
      if (suppressPairingReply) {
        logWhatsAppVerbose(
          params.verbose,
          `Skipping pairing reply for historical DM from ${candidate}.`,
        );
      } else if (!visibleOutbound.allowed) {
        logWhatsAppVerbose(
          params.verbose,
          `Skipping pairing reply for ${candidate}: ${visibleOutbound.reason}`,
        );
      } else {
        await createChannelPairingChallengeIssuer({
          channel: "whatsapp",
          upsertPairingRequest: async ({ id, meta }) =>
            await upsertChannelPairingRequest({
              channel: "whatsapp",
              id,
              accountId: policy.account.accountId,
              meta,
            }),
        })({
          senderId: candidate,
          senderIdLine: `Your WhatsApp phone number: ${candidate}`,
          meta: { name: (params.pushName ?? "").trim() || undefined },
          onCreated: () => {
            logWhatsAppVerbose(
              params.verbose,
              `whatsapp pairing request sender=${candidate} name=${params.pushName ?? "unknown"}`,
            );
          },
          sendPairingReply: async (text) => {
            await params.sock.sendMessage(params.remoteJid, { text });
          },
          onReplyError: (err) => {
            logWhatsAppVerbose(
              params.verbose,
              `whatsapp pairing reply failed for ${candidate}: ${String(err)}`,
            );
          },
        });
      }
      return buildResult({ allowed: false, shouldMarkRead: false });
    }
    if (access.decision !== "allow") {
      logWhatsAppVerbose(
        params.verbose,
        `Blocked unauthorized sender ${params.from} (dmPolicy=${policy.dmPolicy})`,
      );
      return buildResult({ allowed: false, shouldMarkRead: false });
    }
  }

  return buildResult({
    allowed: true,
    shouldMarkRead: visibleOutbound.allowed,
  });
}

export const __testing = {
  resolveWhatsAppInboundPolicy,
};
