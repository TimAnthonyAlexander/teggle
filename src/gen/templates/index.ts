// Template registry: name, parameter schema, default region and the build function.

import type { z } from 'zod';
import type { RegionName, TemplateContext } from '../template';
import { architectureParams, buildArchitecture } from './architecture';
import { buildHelix, helixParams } from './helix';
import { buildOutline, outlineParams } from './outline';
import { buildPlatforms, platformParams } from './platforms';
import { buildPlinko, plinkoParams } from './plinko';
import { buildPortals, portalParams } from './portals';
import { buildRotating, rotatingParams } from './rotating';
import { buildSpiral, spiralParams } from './spiral';
import { buildWeb, webParams } from './web';

export interface TemplateDef {
  readonly defaultRegion: RegionName;
  /** Validates the raw parameters and builds. Throws a ZodError on bad parameters. */
  run(ctx: TemplateContext, raw: unknown): void;
}

function define<S extends z.ZodType>(
  schema: S,
  defaultRegion: RegionName,
  build: (ctx: TemplateContext, params: z.output<S>) => void,
): TemplateDef {
  return {
    defaultRegion,
    run(ctx, raw) {
      build(ctx, schema.parse(raw ?? {}));
    },
  };
}

export const TEMPLATES = {
  plinko: define(plinkoParams, 'full', buildPlinko),
  spiral: define(spiralParams, 'full', buildSpiral),
  web: define(webParams, 'full', buildWeb),
  architecture: define(architectureParams, 'full', buildArchitecture),
  rotating: define(rotatingParams, 'full', buildRotating),
  platforms: define(platformParams, 'full', buildPlatforms),
  helix: define(helixParams, 'full', buildHelix),
  portals: define(portalParams, 'full', buildPortals),
  outline: define(outlineParams, 'full', buildOutline),
} as const satisfies Record<string, TemplateDef>;

export type TemplateName = keyof typeof TEMPLATES;
export const TEMPLATE_NAMES = Object.keys(TEMPLATES) as [TemplateName, ...TemplateName[]];
