import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export interface RunMetadata {
  runId: string;
  lib: string;
  topic: string;
  sourceUri: string;
  sourceUrl?: string | undefined;
  ruleCount: number;
  appliesTo: string[];
  leafPath: string;
  extractor?: string | undefined;
}

export interface ConvexRecorder {
  record(metadata: RunMetadata): Promise<void>;
}

type RecordRunArgs = {
  runId: string;
  lib: string;
  topic: string;
  sourceUri: string;
  sourceUrl?: string;
  ruleCount: number;
  appliesTo: string[];
  leafPath: string;
  extractor?: string;
} & Record<string, unknown>;

const recordRunRef =
  makeFunctionReference<"mutation", RecordRunArgs, void>(
    "docsIngestRuns:recordRun",
  );

export interface CreateRecorderOptions {
  convexUrl: string | undefined;
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
  clientFactory?: (url: string) => Pick<ConvexHttpClient, "mutation">;
}

class HttpConvexRecorder implements ConvexRecorder {
  constructor(
    private readonly client: Pick<ConvexHttpClient, "mutation">,
    private readonly warn: (msg: string) => void,
  ) {}

  async record(metadata: RunMetadata): Promise<void> {
    try {
      const args: RecordRunArgs = {
        runId: metadata.runId,
        lib: metadata.lib,
        topic: metadata.topic,
        sourceUri: metadata.sourceUri,
        ruleCount: metadata.ruleCount,
        appliesTo: metadata.appliesTo,
        leafPath: metadata.leafPath,
      };
      if (metadata.sourceUrl) args.sourceUrl = metadata.sourceUrl;
      if (metadata.extractor) args.extractor = metadata.extractor;
      await this.client.mutation(recordRunRef, args);
    } catch (err) {
      this.warn(
        `[convex] recordRun failed for ${metadata.lib}/${metadata.topic}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

const NOOP_RECORDER: ConvexRecorder = {
  async record() {
    /* noop */
  },
};

export function createConvexRecorder(
  options: CreateRecorderOptions,
): ConvexRecorder {
  const { convexUrl } = options;
  const log = options.log ?? ((msg: string) => console.log(msg));
  const warn = options.warn ?? ((msg: string) => console.warn(msg));

  if (!convexUrl) {
    log(`[convex] CONVEX_URL not set — skipping live ingestion stream`);
    return NOOP_RECORDER;
  }

  let client: Pick<ConvexHttpClient, "mutation">;
  try {
    client = options.clientFactory
      ? options.clientFactory(convexUrl)
      : new ConvexHttpClient(convexUrl);
  } catch (err) {
    warn(
      `[convex] failed to initialise client for ${convexUrl}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return NOOP_RECORDER;
  }
  log(`[convex] streaming ingestion runs to ${convexUrl}`);
  return new HttpConvexRecorder(client, warn);
}

export function generateRunId(): string {
  // 96-bit random + creation timestamp; collision-resistant for hackathon scale.
  const rand = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return `run_${Date.now().toString(36)}_${rand}`;
}
