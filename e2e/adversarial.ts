import { test as base } from '@playwright/test';

// Adversarial slow-frames fixture. When ADVERSARIAL_CPU_THROTTLE is set (a
// Chromium CPU-throttling rate, e.g. 20), every page's renderer is throttled
// via CDP so frame times stretch into the seconds — the same failure class as
// a heavily loaded CI runner rasterizing WebGL in software. Tests must remain
// green under this fixture; it exists to reproduce and regression-test
// input-timing defects deterministically.
export const test = base.extend({
  page: async ({ page }, use) => {
    const rate = Number(process.env.ADVERSARIAL_CPU_THROTTLE ?? 0);
    if (rate > 0) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    }
    await use(page);
  },
});

export { expect } from '@playwright/test';
