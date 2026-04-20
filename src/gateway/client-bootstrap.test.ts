import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  buildGatewayConnectionDetailsWithResolvers: vi.fn(),
  resolveGatewayConnectionAuth: vi.fn(),
}));

vi.mock("./connection-details.js", () => ({
  buildGatewayConnectionDetailsWithResolvers: (...args: unknown[]) =>
    mockState.buildGatewayConnectionDetailsWithResolvers(...args),
}));

vi.mock("./connection-auth.js", () => ({
  resolveGatewayConnectionAuth: (...args: unknown[]) =>
    mockState.resolveGatewayConnectionAuth(...args),
}));

const { resolveGatewayClientBootstrap, resolveGatewayUrlOverrideSource } =
  await import("./client-bootstrap.js");

describe("resolveGatewayUrlOverrideSource", () => {
  it("maps override url sources only", () => {
    expect(resolveGatewayUrlOverrideSource("cli --url")).toBe("cli");
    expect(resolveGatewayUrlOverrideSource("env OPENCLAW_GATEWAY_URL")).toBe("env");
    expect(resolveGatewayUrlOverrideSource("config gateway.remote.url")).toBeUndefined();
  });
});

describe("resolveGatewayClientBootstrap", () => {
  beforeEach(() => {
    mockState.buildGatewayConnectionDetailsWithResolvers.mockReset();
    mockState.resolveGatewayConnectionAuth.mockReset();
    mockState.resolveGatewayConnectionAuth.mockResolvedValue({
      token: undefined,
      password: undefined,
    });
  });

  it("passes cli override context into shared auth resolution", async () => {
    mockState.buildGatewayConnectionDetailsWithResolvers.mockReturnValue({
      url: "wss://override.example/ws",
      urlSource: "cli --url",
      allowInsecurePrivateWs: false,
    });

    const result = await resolveGatewayClientBootstrap({
      config: {} as never,
      gatewayUrl: "wss://override.example/ws",
      env: process.env,
    });

    expect(result).toEqual({
      url: "wss://override.example/ws",
      urlSource: "cli --url",
      allowInsecurePrivateWs: false,
      auth: {
        token: undefined,
        password: undefined,
      },
    });
    expect(mockState.resolveGatewayConnectionAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        env: process.env,
        urlOverride: "wss://override.example/ws",
        urlOverrideSource: "cli",
      }),
    );
  });

  it("does not mark config-derived urls as overrides", async () => {
    mockState.buildGatewayConnectionDetailsWithResolvers.mockReturnValue({
      url: "wss://gateway.example/ws",
      urlSource: "config gateway.remote.url",
      allowInsecurePrivateWs: false,
    });

    await resolveGatewayClientBootstrap({
      config: {} as never,
      env: process.env,
    });

    expect(mockState.resolveGatewayConnectionAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        env: process.env,
        urlOverride: undefined,
        urlOverrideSource: undefined,
      }),
    );
  });

  it("preserves trusted local bind ws allowances", async () => {
    mockState.buildGatewayConnectionDetailsWithResolvers.mockReturnValue({
      url: "ws://10.121.15.240:18789",
      urlSource: "local gateway.bind=custom",
      allowInsecurePrivateWs: true,
    });

    const result = await resolveGatewayClientBootstrap({
      config: {} as never,
      env: process.env,
    });

    expect(result.allowInsecurePrivateWs).toBe(true);
  });
});
