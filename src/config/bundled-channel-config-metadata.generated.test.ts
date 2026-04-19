import { describe, expect, it } from "vitest";
import { validateJsonSchemaValue } from "../plugins/schema-validator.js";
import { GENERATED_BUNDLED_CHANNEL_CONFIG_METADATA } from "./bundled-channel-config-metadata.generated.js";
import { validateConfigObject } from "./validation.js";

describe("bundled channel config metadata", () => {
  it("keeps WhatsApp defaults valid for plugin-aware revalidation", () => {
    const whatsappEntry = GENERATED_BUNDLED_CHANNEL_CONFIG_METADATA.find(
      (entry) => entry.channelId === "whatsapp",
    );
    expect(whatsappEntry).toBeDefined();
    expect(whatsappEntry?.uiHints?.outboundPolicy).toBeDefined();

    const base = validateConfigObject({
      channels: {
        whatsapp: {
          enabled: true,
        },
      },
    });
    expect(base.ok).toBe(true);
    if (!base.ok || !whatsappEntry) {
      return;
    }

    const result = validateJsonSchemaValue({
      schema: whatsappEntry.schema,
      cacheKey: "test:whatsapp-bundled-channel-metadata",
      value: base.config.channels?.whatsapp,
      applyDefaults: true,
    });
    expect(result.ok).toBe(true);
  });
});
