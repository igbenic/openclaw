import type { OpenClawConfig } from "openclaw/plugin-sdk/config-runtime";
import { resolveWhatsAppAccount, type ResolvedWhatsAppAccount } from "./accounts.js";
import {
  isWhatsAppGroupJid,
  normalizeWhatsAppAllowFromEntries,
  normalizeWhatsAppTarget,
} from "./normalize-target.js";

export type WhatsAppVisibleOutboundPolicy = "open" | "allowlist" | "disabled";

type ResolveWhatsAppVisibleOutboundContextParams =
  | { cfg: OpenClawConfig; accountId?: string | null }
  | { account: ResolvedWhatsAppAccount };

export type WhatsAppVisibleOutboundDecision =
  | {
      allowed: true;
      account: ResolvedWhatsAppAccount;
      outboundPolicy: WhatsAppVisibleOutboundPolicy;
      normalizedTarget?: string;
    }
  | {
      allowed: false;
      account: ResolvedWhatsAppAccount;
      outboundPolicy: WhatsAppVisibleOutboundPolicy;
      normalizedTarget?: string;
      reason:
        | "Global presence stays unavailable while outboundPolicy is not open."
        | `Visible outbound WhatsApp activity is disabled for account "${string}".`
        | `Visible outbound WhatsApp activity for account "${string}" only allows direct chats listed in allowFrom; group chats stay read-only.`
        | `Visible outbound WhatsApp activity for account "${string}" only allows direct chats listed in allowFrom; target "${string}" is not allowlisted.`
        | `Visible outbound WhatsApp activity for account "${string}" could not normalize target "${string}".`;
    };

function resolveWhatsAppVisibleOutboundContext(
  params: ResolveWhatsAppVisibleOutboundContextParams,
): {
  account: ResolvedWhatsAppAccount;
  outboundPolicy: WhatsAppVisibleOutboundPolicy;
  normalizedAllowFrom: string[];
  allowAllDirect: boolean;
} {
  const account =
    "account" in params
      ? params.account
      : resolveWhatsAppAccount({
          cfg: params.cfg,
          accountId: params.accountId,
        });
  const outboundPolicy = account.outboundPolicy ?? "open";
  const normalizedAllowFrom = normalizeWhatsAppAllowFromEntries(account.allowFrom ?? []);
  return {
    account,
    outboundPolicy,
    normalizedAllowFrom,
    allowAllDirect: normalizedAllowFrom.includes("*"),
  };
}

export function resolveWhatsAppVisibleOutboundDecision(params: {
  cfg?: OpenClawConfig;
  accountId?: string | null;
  account?: ResolvedWhatsAppAccount;
  target?: string | null;
}): WhatsAppVisibleOutboundDecision {
  const context = (() => {
    if (params.account) {
      return resolveWhatsAppVisibleOutboundContext({ account: params.account });
    }
    if (!params.cfg) {
      throw new Error("resolveWhatsAppVisibleOutboundDecision requires cfg or account.");
    }
    return resolveWhatsAppVisibleOutboundContext({
      cfg: params.cfg,
      accountId: params.accountId,
    });
  })();
  const { account, outboundPolicy, normalizedAllowFrom, allowAllDirect } = context;
  const trimmedTarget = params.target?.trim() ?? "";

  if (!trimmedTarget) {
    if (outboundPolicy === "open") {
      return {
        allowed: true,
        account,
        outboundPolicy,
      };
    }
    return {
      allowed: false,
      account,
      outboundPolicy,
      reason: "Global presence stays unavailable while outboundPolicy is not open.",
    };
  }

  const normalizedTarget = normalizeWhatsAppTarget(trimmedTarget);
  if (!normalizedTarget) {
    return {
      allowed: false,
      account,
      outboundPolicy,
      reason: `Visible outbound WhatsApp activity for account "${account.accountId}" could not normalize target "${trimmedTarget}".`,
    };
  }

  if (outboundPolicy === "open") {
    return {
      allowed: true,
      account,
      outboundPolicy,
      normalizedTarget,
    };
  }

  if (outboundPolicy === "disabled") {
    return {
      allowed: false,
      account,
      outboundPolicy,
      normalizedTarget,
      reason: `Visible outbound WhatsApp activity is disabled for account "${account.accountId}".`,
    };
  }

  if (isWhatsAppGroupJid(normalizedTarget)) {
    return {
      allowed: false,
      account,
      outboundPolicy,
      normalizedTarget,
      reason: `Visible outbound WhatsApp activity for account "${account.accountId}" only allows direct chats listed in allowFrom; group chats stay read-only.`,
    };
  }

  if (
    allowAllDirect ||
    normalizedAllowFrom.filter((entry) => entry !== "*").includes(normalizedTarget)
  ) {
    return {
      allowed: true,
      account,
      outboundPolicy,
      normalizedTarget,
    };
  }

  return {
    allowed: false,
    account,
    outboundPolicy,
    normalizedTarget,
    reason: `Visible outbound WhatsApp activity for account "${account.accountId}" only allows direct chats listed in allowFrom; target "${normalizedTarget}" is not allowlisted.`,
  };
}

export function assertWhatsAppVisibleOutboundAllowed(params: {
  cfg?: OpenClawConfig;
  accountId?: string | null;
  account?: ResolvedWhatsAppAccount;
  target?: string | null;
  action: string;
}): WhatsAppVisibleOutboundDecision & { allowed: true } {
  const decision = resolveWhatsAppVisibleOutboundDecision(params);
  if (!decision.allowed) {
    throw new Error(`WhatsApp ${params.action} blocked: ${decision.reason}`);
  }
  return decision;
}
