import { describe, expect, it, vi } from "vitest";
import type { ChannelPlugin } from "../channels/plugins/types.js";
import { formatGatewayChannelsStatusLines } from "./channels/status.js";

const activeChannelPlugins = vi.hoisted(() => [] as ChannelPlugin[]);

vi.mock("../channels/plugins/index.js", () => ({
  listChannelPlugins: () => activeChannelPlugins,
  getChannelPlugin: (id: string) => activeChannelPlugins.find((plugin) => plugin.id === id),
}));

function makeTestPlugin(): ChannelPlugin {
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
      resolveAccount: () => ({
        accountId: "default",
      }),
      isConfigured: () => true,
      isEnabled: () => true,
    },
    actions: {
      describeMessageTool: () => ({ actions: ["send"] }),
    },
  };
}

describe("gateway channels status outbound policy", () => {
  it("renders outbound policy bits for channel accounts", () => {
    activeChannelPlugins.splice(0, activeChannelPlugins.length, makeTestPlugin());

    const lines = formatGatewayChannelsStatusLines({
      channelAccounts: {
        whatsapp: [
          {
            accountId: "default",
            enabled: true,
            configured: true,
            linked: true,
            dmPolicy: "pairing",
            outboundPolicy: "allowlist",
            allowFrom: ["+15550001111"],
            outboundAllowFrom: ["+15550002222"],
          },
        ],
      },
    });

    expect(lines.join("\n")).toContain("outbound:allowlist");
    expect(lines.join("\n")).toContain("outbound-allow:+15550002222");
  });
});
