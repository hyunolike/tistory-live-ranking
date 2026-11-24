import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests',testMatch:'*.spec.ts',fullyParallel:true,workers:2,
  use:{baseURL:'http://127.0.0.1:8787',viewport:{width:1440,height:1000},trace:'retain-on-failure'},
  webServer:{command:'pnpm dev',url:'http://127.0.0.1:8787/health',reuseExistingServer:!process.env.CI,timeout:60_000},
  reporter:'list'
});
