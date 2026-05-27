// TODO: Implement authenticated Kalshi WebSocket connection.
// Required v1 channels: user_fills and user_orders.
// Keep private-key signing server/worker-side only.

export type KalshiUserChannel = "user_fills" | "user_orders";

export function assertSupportedUserChannel(channel: string): asserts channel is KalshiUserChannel {
  if (channel !== "user_fills" && channel !== "user_orders") {
    throw new Error(`Unsupported user channel: ${channel}`);
  }
}
