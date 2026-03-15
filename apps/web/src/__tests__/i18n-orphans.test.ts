import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const messagesDir = resolve(__dirname, "../../messages");
const srcDir = resolve(__dirname, "../");

function parseJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
}

function walkSrc(dir: string, results: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "__tests__") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkSrc(full, results);
    } else {
      const ext = extname(full);
      if (ext === ".ts" || ext === ".tsx") {
        results.push(full);
      }
    }
  }
  return results;
}

const sourceFiles = walkSrc(srcDir);
const allSourceContent = sourceFiles
  .map((f) => readFileSync(f, "utf-8"))
  .join("\n");

describe("i18n orphan guard — primary JSON assertions", () => {
  for (const locale of ["en", "es"]) {
    const parsed = parseJson(join(messagesDir, `${locale}.json`));

    describe(`${locale}.json — conversations section removed`, () => {
      it("conversations top-level key is absent", () => {
        expect((parsed as Record<string, unknown>).conversations).toBeUndefined();
      });
    });

    describe(`${locale}.json — dashboard orphaned keys absent`, () => {
      const dashboard = (parsed as Record<string, Record<string, unknown>>).dashboard;

      it("totalConversations is absent", () => {
        expect(dashboard.totalConversations).toBeUndefined();
      });
      it("intentBreakdown is absent", () => {
        expect(dashboard.intentBreakdown).toBeUndefined();
      });
      it("intent_greeting is absent", () => {
        expect(dashboard.intent_greeting).toBeUndefined();
      });
      it("llmUsage is absent", () => {
        expect(dashboard.llmUsage).toBeUndefined();
      });
      it("viewConversation is absent", () => {
        expect(dashboard.viewConversation).toBeUndefined();
      });
      it("quickStats is absent", () => {
        expect(dashboard.quickStats).toBeUndefined();
      });
      it("unreadNotifications is absent", () => {
        expect(dashboard.unreadNotifications).toBeUndefined();
      });
    });

    describe(`${locale}.json — agentWorkspace orphaned keys absent`, () => {
      const ws = (parsed as Record<string, Record<string, unknown>>).agentWorkspace;

      it("priorityIntentsTitle is absent", () => {
        expect(ws.priorityIntentsTitle).toBeUndefined();
      });
      it("priorityIntentCount is absent", () => {
        expect(ws.priorityIntentCount).toBeUndefined();
      });
      it("viewConversation is absent", () => {
        expect(ws.viewConversation).toBeUndefined();
      });
      it("salesSourceBreakdownTitle is absent", () => {
        expect(ws.salesSourceBreakdownTitle).toBeUndefined();
      });
      it("sourceChannelInstagram is absent", () => {
        expect(ws.sourceChannelInstagram).toBeUndefined();
      });
      it("sourceChannelEmail is absent", () => {
        expect(ws.sourceChannelEmail).toBeUndefined();
      });
      it("sourceChannelVoice is absent", () => {
        expect(ws.sourceChannelVoice).toBeUndefined();
      });
    });

    describe(`${locale}.json — retained keys still present`, () => {
      const dashboard = (parsed as Record<string, Record<string, unknown>>).dashboard;
      const ws = (parsed as Record<string, Record<string, unknown>>).agentWorkspace;

      it("dashboard.pageTitle is present", () => {
        expect(dashboard.pageTitle).not.toBeUndefined();
      });
      it("dashboard.yourAgents is present", () => {
        expect(dashboard.yourAgents).not.toBeUndefined();
      });
      it("dashboard.activityFeed is present", () => {
        expect(dashboard.activityFeed).not.toBeUndefined();
      });
      it("agentWorkspace.sourceChannelWebchat is present", () => {
        expect(ws.sourceChannelWebchat).not.toBeUndefined();
      });
      it("agentWorkspace.sourceChannelWhatsapp is present", () => {
        expect(ws.sourceChannelWhatsapp).not.toBeUndefined();
      });
    });
  }
});

describe("i18n orphan guard — secondary source-scan assertions", () => {
  it("no source file uses useTranslations('conversations')", () => {
    const matches = sourceFiles.filter((f) =>
      readFileSync(f, "utf-8").includes("useTranslations('conversations')")
    );
    expect(matches).toHaveLength(0);
  });

  it("no dashboard-namespace file references t('intentBreakdown')", () => {
    const dashboardFiles = sourceFiles.filter((f) => {
      const content = readFileSync(f, "utf-8");
      return (
        content.includes("useTranslations('dashboard')") &&
        content.includes("t('intentBreakdown')")
      );
    });
    expect(dashboardFiles).toHaveLength(0);
  });

  it("no source file references getTranslations('conversations')", () => {
    const matches = sourceFiles.filter((f) =>
      readFileSync(f, "utf-8").includes("getTranslations('conversations')")
    );
    expect(matches).toHaveLength(0);
  });

  it("no source file uses useTranslations('analytics')", () => {
    const matches = sourceFiles.filter((f) =>
      readFileSync(f, "utf-8").includes("useTranslations('analytics')")
    );
    expect(matches).toHaveLength(0);
  });

  it("no source file uses useTranslations('help')", () => {
    const matches = sourceFiles.filter((f) =>
      readFileSync(f, "utf-8").includes("useTranslations('help')")
    );
    expect(matches).toHaveLength(0);
  });
});

describe("i18n orphan guard — NC-280 primary JSON assertions", () => {
  for (const locale of ["en", "es"]) {
    const parsed = parseJson(join(messagesDir, `${locale}.json`));

    describe(`${locale}.json — NC-280 orphaned namespaces removed`, () => {
      it("analytics top-level namespace is absent", () => {
        expect((parsed as Record<string, unknown>).analytics).toBeUndefined();
      });
      it("help top-level namespace is absent", () => {
        expect((parsed as Record<string, unknown>).help).toBeUndefined();
      });
      it("sidebar.analytics key is absent", () => {
        const sidebar = (parsed as Record<string, Record<string, unknown>>).sidebar;
        expect(sidebar.analytics).toBeUndefined();
      });
      it("sidebar.help key is absent", () => {
        const sidebar = (parsed as Record<string, Record<string, unknown>>).sidebar;
        expect(sidebar.help).toBeUndefined();
      });
      it("landing.features.analytics is still present (not accidentally deleted)", () => {
        const landing = (parsed as Record<string, Record<string, Record<string, unknown>>>).landing;
        const features = landing.features as Record<string, unknown>;
        expect(features.analytics).toBeDefined();
      });
    });
  }
});

describe("i18n orphan guard — NC-282 primary JSON assertions", () => {
  for (const locale of ["en", "es"]) {
    const parsed = parseJson(join(messagesDir, `${locale}.json`));
    const sidebar = (parsed as Record<string, Record<string, unknown>>).sidebar;

    describe(`${locale}.json — NC-282 orphaned sidebar keys absent`, () => {
      it("sidebar.overview is absent", () => {
        expect(sidebar.overview).toBeUndefined();
      });
      it("sidebar.conversations is absent", () => {
        expect(sidebar.conversations).toBeUndefined();
      });
      it("sidebar.agents is absent", () => {
        expect(sidebar.agents).toBeUndefined();
      });
      it("sidebar.billing is absent", () => {
        expect(sidebar.billing).toBeUndefined();
      });
      it("sidebar.profile is absent", () => {
        expect(sidebar.profile).toBeUndefined();
      });
      it("sidebar.home is absent", () => {
        expect(sidebar.home).toBeUndefined();
      });
    });

    describe(`${locale}.json — NC-282 retained sidebar keys present`, () => {
      it("sidebar.inbox is present", () => {
        expect(sidebar.inbox).not.toBeUndefined();
      });
      it("sidebar.agent is present", () => {
        expect(sidebar.agent).not.toBeUndefined();
      });
      it("sidebar.openMenu is present", () => {
        expect(sidebar.openMenu).not.toBeUndefined();
      });
    });
  }
});

describe("i18n orphan guard — NC-282 secondary source-scan assertions", () => {
  it("sidebar navItems has exactly 4 items", () => {
    const sidebarPath = resolve(__dirname, "../components/sidebar.tsx");
    const content = readFileSync(sidebarPath, "utf-8");
    const matches = content.match(/labelKey:/g);
    expect(matches).toHaveLength(4);
  });
});
