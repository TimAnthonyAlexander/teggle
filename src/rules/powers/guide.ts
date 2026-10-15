// Guide (Unicorn, spec 7): for the next 3 shots the aim guide is twice as long and runs through
// the first bounce. A green hit while it runs adds 3 more shots (the original's tip text).

import type { Power } from '../power';
import { GUIDE_AIM_TICKS, GUIDE_SHOTS } from '../tuning';

export const GUIDE: Power = {
  id: 'guide',
  name: 'Guide',
  onGreen(ctx) {
    ctx.grant('guide', GUIDE_SHOTS, 'next');
  },
  aimGuide() {
    return { ticks: GUIDE_AIM_TICKS, throughFirstBounce: true };
  },
};
