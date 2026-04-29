import type { OpenClawConfig } from "openclaw/plugin-sdk/config-types";
import {
  __testing as sessionBindingTesting,
  registerSessionBindingAdapter,
} from "openclaw/plugin-sdk/conversation-runtime";
import { resolveThreadSessionKeys } from "openclaw/plugin-sdk/routing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveTelegramConversationBaseSessionKey,
  resolveTelegramConversationRoute,
} from "./conversation-route.js";

describe("resolveTelegramConversationBaseSessionKey", () => {
  const cfg: OpenClawConfig = {};

  it("keeps default-account DMs on the route session key", () => {
    expect(
      resolveTelegramConversationBaseSessionKey({
        cfg,
        route: {
          agentId: "main",
          accountId: "default",
          matchedBy: "default",
          sessionKey: "agent:main:main",
        },
        chatId: 12345,
        isGroup: false,
        senderId: 12345,
      }),
    ).toBe("agent:main:main");
  });

  it("keeps configured default-account DMs on the route session key", () => {
    expect(
      resolveTelegramConversationBaseSessionKey({
        cfg: {
          channels: {
            telegram: {
              defaultAccount: "work",
              accounts: {
                work: {},
                personal: {},
              },
            },
          },
        },
        route: {
          agentId: "main",
          accountId: "work",
          matchedBy: "default",
          sessionKey: "agent:main:main",
        },
        chatId: 12345,
        isGroup: false,
        senderId: 12345,
      }),
    ).toBe("agent:main:main");
  });

  it("uses the per-account fallback key for named-account DMs without an explicit binding", () => {
    expect(
      resolveTelegramConversationBaseSessionKey({
        cfg,
        route: {
          agentId: "main",
          accountId: "personal",
          matchedBy: "default",
          sessionKey: "agent:main:main",
        },
        chatId: 12345,
        isGroup: false,
        senderId: 12345,
      }),
    ).toBe("agent:main:telegram:personal:direct:12345");
  });

  it("keeps explicit bound DM sessions intact", () => {
    expect(
      resolveTelegramConversationBaseSessionKey({
        cfg,
        route: {
          agentId: "codex-acp",
          accountId: "default",
          matchedBy: "binding.channel",
          sessionKey: "agent:codex-acp:session-dm",
        },
        chatId: 12345,
        isGroup: false,
        senderId: 12345,
      }),
    ).toBe("agent:codex-acp:session-dm");
  });

  it("keeps DM topic isolation on the named-account fallback key", () => {
    const baseSessionKey = resolveTelegramConversationBaseSessionKey({
      cfg,
      route: {
        agentId: "main",
        accountId: "personal",
        matchedBy: "default",
        sessionKey: "agent:main:main",
      },
      chatId: 12345,
      isGroup: false,
      senderId: 12345,
    });

    expect(
      resolveThreadSessionKeys({
        baseSessionKey,
        threadId: "12345:99",
      }).sessionKey,
    ).toBe("agent:main:telegram:personal:direct:12345:thread:12345:99");
  });
});

describe("resolveTelegramConversationRoute runtime bindings", () => {
  const cfg: OpenClawConfig = {};

  beforeEach(() => {
    sessionBindingTesting.resetSessionBindingAdaptersForTests();
  });

  afterEach(() => {
    sessionBindingTesting.resetSessionBindingAdaptersForTests();
  });

  it("does not let a runtime binding capture a top-level direct chat", () => {
    const resolveByConversation = vi.fn(() => ({
      bindingId: "telegram:default:12345",
      targetSessionKey: "agent:codex-acp:dm-hijack",
      targetKind: "session" as const,
      conversation: {
        channel: "telegram",
        accountId: "default",
        conversationId: "12345",
      },
      status: "active" as const,
      boundAt: 1,
    }));
    registerSessionBindingAdapter({
      channel: "telegram",
      accountId: "default",
      listBySession: () => [],
      resolveByConversation,
      touch: vi.fn(),
    });

    const result = resolveTelegramConversationRoute({
      cfg,
      accountId: "default",
      chatId: 12345,
      isGroup: false,
      senderId: 12345,
    });

    expect(resolveByConversation).not.toHaveBeenCalled();
    expect(result.route.sessionKey).not.toBe("agent:codex-acp:dm-hijack");
    expect(result.route.sessionKey).toBe("agent:main:main");
  });

  it("still routes scoped direct-message topics through runtime bindings", () => {
    const touch = vi.fn();
    const resolveByConversation = vi.fn((ref: { conversationId: string }) =>
      ref.conversationId === "12345:topic:99"
        ? {
            bindingId: "telegram:default:12345:topic:99",
            targetSessionKey: "agent:codex-acp:dm-topic",
            targetKind: "session" as const,
            conversation: {
              channel: "telegram",
              accountId: "default",
              conversationId: "12345:topic:99",
            },
            status: "active" as const,
            boundAt: 1,
          }
        : null,
    );
    registerSessionBindingAdapter({
      channel: "telegram",
      accountId: "default",
      listBySession: () => [],
      resolveByConversation,
      touch,
    });

    const result = resolveTelegramConversationRoute({
      cfg,
      accountId: "default",
      chatId: 12345,
      isGroup: false,
      replyThreadId: 99,
      senderId: 12345,
    });

    expect(resolveByConversation).toHaveBeenCalledWith({
      channel: "telegram",
      accountId: "default",
      conversationId: "12345:topic:99",
    });
    expect(result.route.sessionKey).toBe("agent:codex-acp:dm-topic");
    expect(touch).toHaveBeenCalledWith("telegram:default:12345:topic:99", undefined);
  });
});
