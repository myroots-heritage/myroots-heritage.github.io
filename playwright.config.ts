import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./frontend/e2e',fullyParallel:false,workers:1,retries:0,reporter:'list',use:{baseURL:'http://127.0.0.1:5173',launchOptions:{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'},headless:true},outputDir:'/private/tmp/myroots-browser-results'});
