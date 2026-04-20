import { describe, expect, it, vi } from "vitest";
import type { ChannelPlugin } from "../../channels/plugins/types.js";
import { buildChannelsTable } from "./channels.js";

const activeChannelPlugins = vi.hoisted(() => [] as ChannelPlugin[]);

vi.mock("../../channels/plugins/index.js", () => ({
  listChannelPlugins: () => activeChannelPlugins,
}));

function makeTestPlugin(): ChannelPlugin {
  const account = {
    accountId: "default",
    name: "Primary",
    enabled: true,
    configured: true,
    dmPolicy: "pairing",
    outboundPolicy: "allowlist",
    allowFrom: ["+15550001111"],
    outboundAllowFrom: ["+15550002222"],
  };

  return {
    id: "whatsapp",
    meta: {
      id: "whatsapp",
      label: "WhatsApp",
      selectionLabel: "WhatsApp",
      docsPath: "/channels/whatsapp",
      blurb: "test",
    },
    capabilities: { chatTypes: ["direct"] },
    config: {
      listAccountIds: () => ["default"],
      defaultAccountId: () => "default",
      inspectAccount: () => account,
      resolveAccount: () => account,
      isConfigured: () => true,
      isEnabled: () => true,
      formatAllowFrom: () => ["+15550001111"],
    },
    actions: {
      describeMessageTool: () => ({ actions: ["send"] }),
    },
  };
}

describe("status-all channels outbound policy notes", () => {
  it("includes outbound policy notes for configured accounts", async () => {
    activeChannelPlugins.splice(0, activeChannelPlugins.length, makeTestPlugin());

    const table = await buildChannelsTable({ channels: {} } as never);

    expect(table.details).toHaveLength(1);
    expect(table.details[0]?.rows[0]?.Notes).toContain("outbound:allowlist");
    expect(table.details[0]?.rows[0]?.Notes).toContain("outbound-allow:+15550001111");
  });
});
