// How well an aim error matches the player (tools/agents/calibrate.ts): the binomial likelihood
// of the player's wins given the agent's clear rates, and the mean absolute error between them.

export interface PlayedLevel {
  readonly id: string;
  readonly tries: number;
  readonly wins: number;
}

export interface Fit {
  readonly noise: number;
  /** Binomial log likelihood of the player's wins under the agent's clear rates. */
  readonly logLikelihood: number;
  /** Mean absolute error between the agent's and the player's clear rates, per level. */
  readonly mae: number;
  /** The same, each level weighted by the player's tries. */
  readonly weightedMae: number;
  readonly levels: readonly { id: string; agent: number; player: number }[];
}

/**
 * Scores one aim error from the agent's clear rate on each played level (same order). Rates
 * are kept half a run off 0 and 1, so one unlucky level cannot make the likelihood infinite.
 */
export function fitOf(
  noise: number,
  played: readonly PlayedLevel[],
  rates: readonly number[],
  runs: number,
): Fit {
  const eps = 0.5 / runs;
  let ll = 0;
  let abs = 0;
  let weighted = 0;
  let tries = 0;
  const levels = played.map((p, i) => {
    const agent = rates[i] ?? 0;
    const q = Math.min(1 - eps, Math.max(eps, agent));
    const player = p.wins / p.tries;
    ll += p.wins * Math.log(q) + (p.tries - p.wins) * Math.log(1 - q);
    abs += Math.abs(agent - player);
    weighted += p.tries * Math.abs(agent - player);
    tries += p.tries;
    return { id: p.id, agent, player };
  });
  return {
    noise,
    logLikelihood: ll,
    mae: played.length > 0 ? abs / played.length : 0,
    weightedMae: tries > 0 ? weighted / tries : 0,
    levels,
  };
}

/** The fit with the highest likelihood; the first on a tie. */
export function bestFit(fits: readonly Fit[]): Fit | undefined {
  let best: Fit | undefined;
  for (const f of fits) if (best === undefined || f.logLikelihood > best.logLikelihood) best = f;
  return best;
}
