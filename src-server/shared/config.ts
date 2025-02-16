interface RateLimitConfig {
  capacity: number;
  leakRatePerMinute: number;
  capacityPerSecond: number;
  leakRatePerSecond: number;
  socketTimeoutMs: number;
}

const productionConfig: RateLimitConfig = {
  capacity: 18,
  leakRatePerMinute: 12,
  capacityPerSecond: 3,
  leakRatePerSecond: 1,
  socketTimeoutMs: 5000,
};

const developmentConfig: RateLimitConfig = {
  capacity: 180,
  leakRatePerMinute: 120,
  capacityPerSecond: 30,
  leakRatePerSecond: 10,
  socketTimeoutMs: 2000,
};

export const config =
  process.env.NODE_ENV === "production" ? productionConfig : developmentConfig;
