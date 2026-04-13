import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/usgs-nwis": {
        target: "https://waterservices.usgs.gov",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/usgs-nwis/, "/nwis"),
      },
    },
  },
});
