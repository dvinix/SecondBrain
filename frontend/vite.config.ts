import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    publicDir: "public",
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    preset: "vercel",
    publicAssets: [
      {
        dir: "public",
        maxAge: 60 * 60 * 24 * 365, // 1 year
      },
    ],
  },
});
