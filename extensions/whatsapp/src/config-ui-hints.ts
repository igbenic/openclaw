import type { ChannelConfigUiHint } from "openclaw/plugin-sdk/core";

export const whatsAppChannelConfigUiHints = {
  "": {
    label: "WhatsApp",
    help: "WhatsApp channel provider configuration for access policy and message batching behavior. Use this section to tune responsiveness and direct-message routing safety for WhatsApp chats.",
  },
  dmPolicy: {
    label: "WhatsApp DM Policy",
    help: 'Direct message access control ("pairing" recommended). "open" requires channels.whatsapp.allowFrom=["*"].',
  },
  outboundPolicy: {
    label: "WhatsApp Outbound Policy",
    help: 'Visible outbound WhatsApp activity policy. "allowlist" only sends visible output to direct chats listed in outboundAllowFrom; leave outboundAllowFrom empty to keep WhatsApp read-only.',
  },
  outboundAllowFrom: {
    label: "WhatsApp Outbound Allowlist",
    help: 'Allowlist for visible WhatsApp outbound direct chats. Used only when outboundPolicy="allowlist"; groups stay read-only even with "*".',
  },
  selfChatMode: {
    label: "WhatsApp Self-Phone Mode",
    help: "Same-phone setup (bot uses your personal WhatsApp number).",
  },
  debounceMs: {
    label: "WhatsApp Message Debounce (ms)",
    help: "Debounce window (ms) for batching rapid consecutive messages from the same sender (0 to disable).",
  },
  configWrites: {
    label: "WhatsApp Config Writes",
    help: "Allow WhatsApp to write config in response to channel events/commands (default: true).",
  },
} satisfies Record<string, ChannelConfigUiHint>;
