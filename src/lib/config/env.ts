function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.length > 0 ? raw : fallback;
}

function opt(name: string): string | undefined {
  const raw = process.env[name];
  return raw && raw.length > 0 ? raw : undefined;
}

export const env = {
  appUrl: str("APP_URL", "http://localhost:3000"),
  maxFileSizeBytes: num("MAX_FILE_SIZE", 100 * 1024 * 1024), // 100 MB
  jobTimeoutMs: num("JOB_TIMEOUT", 90_000), // 90s
  maxConcurrentDownloads: num("MAX_CONCURRENT_DOWNLOADS", 2),
  rateLimitRequests: num("RATE_LIMIT_REQUESTS", 10),
  rateLimitWindowMs: num("RATE_LIMIT_WINDOW", 60_000),
  ytDlpPath: str("YT_DLP_PATH", "yt-dlp"),
  ffmpegPath: str("FFMPEG_PATH", "ffmpeg"),
  tempDir: str("TEMP_DIR", ""),
  fileTtlMs: num("FILE_TTL_MS", 30 * 60 * 1000),
  // --- Phase 3 ---
  databaseUrl: opt("DATABASE_URL"),
  redisUrl: opt("REDIS_URL"),
  queueDriver: str("QUEUE_DRIVER", opt("REDIS_URL") ? "bullmq" : "local"),
  dbDriver: str("DB_DRIVER", opt("DATABASE_URL") ? "postgres" : "memory"),
  storageEndpoint: opt("STORAGE_ENDPOINT"),
  storageRegion: str("STORAGE_REGION", "us-east-1"),
  storageAccessKey: opt("STORAGE_ACCESS_KEY"),
  storageSecretKey: opt("STORAGE_SECRET_KEY"),
  storageBucket: opt("STORAGE_BUCKET"),
  storageDriver: str(
    "STORAGE_DRIVER",
    opt("STORAGE_BUCKET") && opt("STORAGE_ACCESS_KEY") ? "s3" : "local"
  ),
  signedUrlTtlSeconds: num("SIGNED_URL_TTL_SECONDS", 15 * 60),
  fileTtlMinutes: num("FILE_TTL_MINUTES", 30),
  workerConcurrency: num("WORKER_CONCURRENCY", 2),
  // --- Phase 4: hardening ---
  maxRequestBodyBytes: num("MAX_REQUEST_BODY_SIZE", 8 * 1024),
  maxQueueSize: num("MAX_QUEUE_SIZE", 100),
  // --- Phase 9: batch & archive limits ---
  freeBatchLimit: num("FREE_BATCH_LIMIT", 3),
  premiumBatchLimit: num("PREMIUM_BATCH_LIMIT", 10),
  guestBatchLimit: num("GUEST_BATCH_LIMIT", 2),
  maxBatchItems: num("MAX_BATCH_ITEMS", 25),
  maxArchiveBytes: num("MAX_BATCH_ARCHIVE_SIZE", 500 * 1024 * 1024),
  rateLimitStatusRequests: num("RATE_LIMIT_STATUS_REQUESTS", 60),
  rateLimitStatusWindowMs: num("RATE_LIMIT_STATUS_WINDOW", 60_000),
  rateLimitFileRequests: num("RATE_LIMIT_FILE_REQUESTS", 30),
  rateLimitFileWindowMs: num("RATE_LIMIT_FILE_WINDOW", 60_000),
  trustProxy: str("TRUST_PROXY", "false") === "true",
  logLevel: str("LOG_LEVEL", "info"),
  metricsToken: opt("METRICS_TOKEN"),
  failedRetentionMs: num("FAILED_RETENTION_DAYS", 7) * 24 * 60 * 60 * 1000,
  staleTmpMs: num("STALE_TMP_HOURS", 24) * 60 * 60 * 1000,
  // --- Phase 6: provider rollout (all default off except TikTok) ---
  enableTikTok: str("ENABLE_TIKTOK", "true") === "true",
  enableInstagram: str("ENABLE_INSTAGRAM", "false") === "true",
  enableYoutube: str("ENABLE_YOUTUBE", "false") === "true",
  // --- Phase 7: accounts & billing ---
  enableAuth: str("ENABLE_AUTH", "true") === "true",
  enableCheckout: str("ENABLE_CHECKOUT", "true") === "true",
  enableBilling: str("ENABLE_BILLING", "true") === "true",
  enableGuestDownloads: str("ENABLE_GUEST_DOWNLOADS", "true") === "true",
  billingProvider: opt("BILLING_PROVIDER"),
  stripeSecretKey: opt("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: opt("STRIPE_WEBHOOK_SECRET"),
  stripePricePremium: opt("STRIPE_PRICE_PREMIUM"),
  testWebhookSecret: str("TEST_WEBHOOK_SECRET", "test-only-local"),
  // --- Phase 10: public developer API ---
  apiKeyPepper: opt("API_KEY_PEPPER"),
  webhookSecretKey: opt("WEBHOOK_SECRET_KEY"),
  webhookTimeoutMs: num("WEBHOOK_TIMEOUT_MS", 10_000),
  // Strictly for local development/tests: allow loopback webhook targets.
  // NEVER enable in production — it disables SSRF range blocking.
  webhookAllowPrivate: str("WEBHOOK_ALLOW_PRIVATE", "false") === "true",
  apiRateLimitRequests: num("API_RATE_LIMIT_REQUESTS", 100),
  apiRateLimitWindowMs: num("API_RATE_LIMIT_WINDOW", 60_000),
  // --- Phase 12: growth engine ---
  referralAttributionDays: num("REFERRAL_ATTRIBUTION_DAYS", 30),
  maxReferralRewards: num("MAX_REFERRAL_REWARDS", 50),
  referralTrialDays: num("REFERRAL_TRIAL_DAYS", 7),
  affiliateAttributionDays: num("AFFILIATE_ATTRIBUTION_DAYS", 30),
  affiliateCommissionRate: Number(process.env.AFFILIATE_COMMISSION_RATE ?? 0.2),
  minimumPayoutCents: num("MINIMUM_PAYOUT_CENTS", 5000),
  maxMarketingEmails: num("MAX_MARKETING_EMAILS_PER_PERIOD", 4),
  emailFromAddress: str("EMAIL_FROM_ADDRESS", "noreply@snapflow.app"),
  stallTimeoutMs: num("STALL_TIMEOUT_MS", 150_000),
  // --- Phase 14: performance, scalability & cost engineering ---
  dbStatementTimeoutMs: num("DB_STATEMENT_TIMEOUT_MS", 15_000),
  dbSlowQueryMs: num("DB_SLOW_QUERY_MS", 1000),
  dbIdleTimeoutMs: num("DB_IDLE_TIMEOUT_MS", 30_000),
  dbConnectionTimeoutMs: num("DB_CONNECTION_TIMEOUT_MS", 5000),
  workerLockMs: num("WORKER_LOCK_MS", 300_000),
  maxActiveJobsPerUser: num("MAX_ACTIVE_JOBS_PER_USER", 5),
  archiveConcurrency: num("ARCHIVE_CONCURRENCY", 1),
  adminStatsTtlMs: num("ADMIN_STATS_TTL_MS", 60_000),
  notificationRetentionDays: num("NOTIFICATION_RETENTION_DAYS", 90),
  emailLogRetentionDays: num("EMAIL_LOG_RETENTION_DAYS", 90),
  sentryDsn: opt("SENTRY_DSN"),
} as const;

export type Env = typeof env;
