import { ToolAuthorizationError } from "openclaw/plugin-sdk/channel-actions";
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { resolveWhatsAppAccount } from "./accounts.js";
import { resolveWhatsAppVisibleOutboundDecision } from "./outbound-policy.js";
import { resolveWhatsAppOutboundTarget } from "./resolve-outbound-target.js";

export function resolveAuthorizedWhatsAppOutboundTarget(params: {
  cfg: OpenClawConfig;
  chatJid: string;
  accountId?: string;
  actionLabel: string;
}): { to: string; accountId: string } {
  const account = resolveWhatsAppAccount({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  const resolution = resolveWhatsAppOutboundTarget({
    to: params.chatJid,
    allowFrom: account.outboundAllowFrom ?? [],
    mode: "implicit",
  });
  if (!resolution.ok) {
    throw new ToolAuthorizationError(
      `WhatsApp ${params.actionLabel} blocked: ${resolution.error.message}`,
    );
  }
  const outboundDecision = resolveWhatsAppVisibleOutboundDecision({
    account,
    target: resolution.to,
  });
  if (!outboundDecision.allowed) {
    throw new ToolAuthorizationError(
      `WhatsApp ${params.actionLabel} blocked: ${outboundDecision.reason}`,
    );
  }
  return { to: resolution.to, accountId: account.accountId };
}
