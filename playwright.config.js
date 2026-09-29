import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir:"./tests",
  timeout:30000,
  use:{baseURL:process.env.LOCALE_BASE_URL||"http://127.0.0.1:4173",headless:true},
  webServer:process.env.LOCALE_BASE_URL?undefined:{command:"python3 -m http.server 4173",port:4173,reuseExistingServer:true},
  reporter:"line"
});
