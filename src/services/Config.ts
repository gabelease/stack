import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { branchName, type BranchName } from "../domain/model.ts";

export type Trunk = "dev" | "main" | "master";

export const trunks: ReadonlyArray<Trunk> = ["dev", "main", "master"];

export const parseTrunks = (value?: string | null): ReadonlyArray<string> => {
  const seen = new Set<string>();
  return (value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
};

export const resolveTrunks = (opts: {
  readonly env?: string | undefined;
  readonly git?: string | undefined;
  readonly fallback?: ReadonlyArray<string> | undefined;
}): ReadonlyArray<string> => {
  const env = parseTrunks(opts.env);
  if (env.length > 0) return env;

  const git = parseTrunks(opts.git);
  if (git.length > 0) return git;

  return opts.fallback ?? trunks;
};

export interface StackConfigService {
  readonly root: string;
  readonly store: string;
  readonly journal: string;
  readonly trunks: ReadonlyArray<BranchName>;
  readonly codeHostConcurrency: number;
  readonly codeHostWaitIntervalMillis: number;
}

export class StackConfig extends Context.Service<StackConfig, StackConfigService>()(
  "@stack/Config",
) {
  static readonly layer = (opts: {
    root: string;
    store?: string;
    journal?: string;
    trunks?: ReadonlyArray<string>;
    codeHostConcurrency?: number;
    codeHostWaitIntervalMillis?: number;
  }) =>
    Layer.effect(
      StackConfig,
      Effect.gen(function* () {
        const path = yield* Path.Path;
        return StackConfig.of({
          root: opts.root,
          store: opts.store ?? path.join(opts.root, ".git", "stack", "state.json"),
          journal: opts.journal ?? path.join(opts.root, ".git", "stack", "undo.json"),
          trunks: (opts.trunks ?? trunks).map((name) => branchName(name)),
          codeHostConcurrency: opts.codeHostConcurrency ?? 4,
          codeHostWaitIntervalMillis: opts.codeHostWaitIntervalMillis ?? 5_000,
        });
      }),
    );
}
