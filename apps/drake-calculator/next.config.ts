import type { NextConfig } from "next";
import { execSync } from "node:child_process";

const basePath = "/apps/drake-calculator";
const githubAppUrl =
  "https://github.com/seap-udea/seap-udea.github.io/tree/main/apps/drake-calculator";

function resolveLastPushDate() {
  if (process.env.NEXT_PUBLIC_LAST_PUSH_DATE) {
    return process.env.NEXT_PUBLIC_LAST_PUSH_DATE;
  }

  try {
    return execSync("git log -1 --format=%cI", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const sharedPublicEnv = {
  NEXT_PUBLIC_LAST_PUSH_DATE: resolveLastPushDate(),
  NEXT_PUBLIC_GITHUB_APP_URL: githubAppUrl,
};

const nextConfig: NextConfig = {
  ...(process.env.DOCKER_BUILD === "1"
    ? {
        output: "standalone",
        env: {
          NEXT_PUBLIC_BASE_PATH: "",
          ...sharedPublicEnv,
        },
      }
    : {
        output: "export",
        basePath,
        assetPrefix: `${basePath}/`,
        trailingSlash: true,
        images: { unoptimized: true },
        env: {
          NEXT_PUBLIC_BASE_PATH: basePath,
          ...sharedPublicEnv,
        },
      }),
};

export default nextConfig;
