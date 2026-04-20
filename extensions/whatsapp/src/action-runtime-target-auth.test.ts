import { describe, expect, it } from "vitest";
import { resolveAuthorizedWhatsAppOutboundTarget } from "./action-runtime-target-auth.js";

describe("resolveAuthorizedWhatsAppOutboundTarget", () => {
  it("authorizes implicit chat targets from outboundAllowFrom, not allowFrom", () => {
    expect(
      resolveAuthorizedWhatsAppOutboundTarget({
        cfg: {
          channels: {
            whatsapp: {
              allowFrom: ["+1666"],
              outboundPolicy: "allowlist",
              outboundAllowFrom: ["+1555"],
            },
          },
        } as never,
        chatJid: "1555@s.whatsapp.net",
        actionLabel: "reaction",
      }),
    ).toEqual({
      to: "+1555",
      accountId: "default",
    });
  });

  it("blocks implicit chat targets missing from outboundAllowFrom even when allowFrom permits inbound", () => {
    expect(() =>
      resolveAuthorizedWhatsAppOutboundTarget({
        cfg: {
          channels: {
            whatsapp: {
              allowFrom: ["+1555"],
              outboundPolicy: "allowlist",
            },
          },
        } as never,
        chatJid: "1555@s.whatsapp.net",
        actionLabel: "reaction",
      }),
    ).toThrow(/outboundallowfrom/i);
  });
});
