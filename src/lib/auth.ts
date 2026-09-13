import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { admin, oAuthProxy } from "better-auth/plugins";
import { getDatabase } from "@/lib/db";

export const auth = betterAuth({
  baseURL: {
    allowedHosts: [
      "localhost:*",
      "openissue-dev.vercel.app",
      "*.vercel.app",
    ],
    protocol: "auto",
  },
  database: drizzleAdapter(getDatabase(), {
    provider: "sqlite",
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      scope: ["read:user", "user:email"],
    },
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    oAuthProxy({
      productionURL: "https://openissue-dev.vercel.app",
      secret: process.env.OAUTH_PROXY_SECRET,
    }),
    nextCookies(),
  ],
});
