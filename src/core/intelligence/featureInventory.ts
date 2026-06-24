import type { ProjectScan } from "@/types";
import type { FeatureInventoryItem, FeatureInventorySnapshot } from "./types";

const FEATURE_DETECTORS: readonly {
  id: string;
  label: string;
  fileRes?: RegExp;
  contentRes: RegExp;
  depRes?: RegExp;
}[] = [
  {
    id: "routes",
    label: "Routing",
    fileRes: /route|router|pages\/|app\/.*page/i,
    contentRes: /react-router|createBrowserRouter|Routes|Route path|next\/navigation|useRouter/i,
  },
  {
    id: "components",
    label: "React components",
    contentRes: /function\s+[A-Z]\w*\s*\(|const\s+[A-Z]\w*\s*=\s*\(|export\s+default\s+function/i,
  },
  {
    id: "hooks",
    label: "Custom hooks",
    contentRes: /function\s+use[A-Z]\w*|const\s+use[A-Z]\w*\s*=/,
  },
  {
    id: "localstorage",
    label: "LocalStorage persistence",
    contentRes: /localStorage|sessionStorage/,
  },
  {
    id: "auth",
    label: "Authentication",
    contentRes: /signIn|signOut|login|logout|AuthProvider|useAuth|firebase\.auth|supabase\.auth|next-auth|clerk/i,
    depRes: /firebase|@supabase|next-auth|@clerk|auth0/i,
  },
  {
    id: "database",
    label: "Database / backend data",
    contentRes: /prisma|supabase|firestore|mongodb|postgres|sqlite|indexedDB|createClient/i,
    depRes: /prisma|@supabase|firebase|mongodb|postgres|drizzle-orm/i,
  },
  {
    id: "apis",
    label: "API integration",
    contentRes: /fetch\s*\(|axios\.|useQuery|useMutation|api\.(get|post)|trpc/i,
    depRes: /@tanstack\/react-query|axios|trpc/i,
  },
  {
    id: "forms",
    label: "Forms",
    contentRes: /<form|onSubmit|useForm|FormProvider|react-hook-form/i,
    depRes: /react-hook-form|formik/i,
  },
  {
    id: "timers",
    label: "Timers",
    contentRes: /setInterval|setTimeout|useTimer|countdown|stopwatch|elapsed/i,
  },
  {
    id: "statistics",
    label: "Statistics / scoring",
    contentRes: /statistic|leaderboard|highscore|best time|scoreboard|record/i,
  },
  {
    id: "multiplayer",
    label: "Multiplayer / realtime",
    contentRes: /socket\.io|WebSocket|websocket|realtime|multiplayer|pusher/i,
    depRes: /socket\.io|pusher|ably/i,
  },
  {
    id: "notifications",
    label: "Notifications",
    contentRes: /Notification|toast|push notification|showNotification/i,
    depRes: /react-hot-toast|sonner|react-toastify/i,
  },
  {
    id: "payments",
    label: "Payments",
    contentRes: /stripe|checkout|payment|billing|subscription/i,
    depRes: /stripe|@stripe|paypal/i,
  },
];

function dependencyText(scan: ProjectScan): string {
  return (scan.dependencies ?? [])
    .map((d) => `${d.name} ${d.version ?? ""}`)
    .join("\n")
    .toLowerCase();
}

function scanCorpus(scan: ProjectScan): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  for (const file of scan.index) {
    const parts = [
      file.path,
      ...file.imports,
      ...file.exports,
      ...file.components,
      ...file.functions,
      ...file.hooks,
      ...file.referencedNames,
    ];
    out.push({ path: file.path, content: parts.join("\n").toLowerCase() });
  }
  for (const sym of scan.symbols) {
    out.push({ path: sym.path, content: `${sym.name} ${sym.kind}`.toLowerCase() });
  }
  return out;
}

export function buildFeatureInventoryFromScan(
  scan: ProjectScan,
  projectPath: string,
): FeatureInventorySnapshot {
  const corpus = scanCorpus(scan);
  const deps = dependencyText(scan);
  const allPaths = scan.files.map((f) => f.path).join("\n");

  const features: FeatureInventoryItem[] = FEATURE_DETECTORS.map((det) => {
    const evidence: string[] = [];

    if (det.fileRes && det.fileRes.test(allPaths)) {
      const match = scan.files.find((f) => det.fileRes!.test(f.path));
      if (match) evidence.push(`file:${match.path}`);
    }

    for (const entry of corpus) {
      const contentRe = new RegExp(
        det.contentRes.source,
        det.contentRes.flags.includes("i") ? det.contentRes.flags : `${det.contentRes.flags}i`,
      );
      if (contentRe.test(entry.content) || contentRe.test(entry.path)) {
        evidence.push(`code:${entry.path}`);
        if (evidence.length >= 4) break;
      }
    }

    if (det.depRes && det.depRes.test(deps)) {
      evidence.push("dependency:package.json");
    }

    const uniqueEvidence = [...new Set(evidence)].slice(0, 5);
    return {
      id: det.id,
      label: det.label,
      present: uniqueEvidence.length > 0,
      evidence: uniqueEvidence,
    };
  });

  return {
    projectPath,
    updatedAt: Date.now(),
    features,
  };
}

export function presentFeatures(
  inventory: FeatureInventorySnapshot | null,
): FeatureInventoryItem[] {
  return inventory?.features.filter((f) => f.present) ?? [];
}

export function featurePresent(
  inventory: FeatureInventorySnapshot | null,
  id: string,
): boolean {
  return inventory?.features.some((f) => f.id === id && f.present) ?? false;
}
