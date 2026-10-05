import { chromium } from 'playwright';
const port = process.argv[2] ?? '9333';
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
await browser.close(); // CDP 的 Browser.close：让浏览器自己退，偏好才会落盘