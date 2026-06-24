/** Application domain — drives suggestions, audit rules, and context labels. */
export type AppDomain =
  | "saas"
  | "dashboard"
  | "crm"
  | "marketplace"
  | "comparison"
  | "social"
  | "productivity"
  | "utility"
  | "game_puzzle"
  | "game_arcade"
  | "unknown";

export interface AppDomainProfile {
  readonly domain: AppDomain;
  readonly confidence: number;
  readonly signals: readonly string[];
  readonly displayName: string;
}

export interface ClassifyAppDomainInput {
  readonly prompt?: string | null;
  readonly appSource?: string | null;
  readonly cssSource?: string | null;
  readonly projectName?: string | null;
}
