import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs/config"

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  env: {
    NEXT_PUBLIC_CLERK_JS_VERSION: "6.40.1",
    NEXT_PUBLIC_CLERK_UI_VERSION: "1.40.0",
  },
  experimental: {
    agentUpgrade: "security",
  },
  serverExternalPackages: ["@daytona/sdk"],
}

export default withSentryConfig(nextConfig, {
  org: "taufiq-7m",
  project: "mochi",
  silent: !process.env.CI,
  widenClientFileUpload: true,
})
