import { LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { signOut } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import type { EffectiveHrConfig } from "@/lib/zepp/hr-values";
import type { ThemePrefs } from "@/lib/theme";
import type { AiCredentialMetadata, CoachMemory, Profile } from "@/lib/types";
import type { ZeppConnectionView } from "@/lib/zepp/types";
import { ProfileForm } from "./profile-form";
import { HeatSetting } from "./heat-setting";
import { ThemeSettings } from "./theme-settings";
import { NotificationsSection } from "./notifications-section";
import { GeminiKeySection } from "./gemini-key-section";
import { OpenRouterSection } from "./openrouter-section";
import { TaskModelsSection, type TaskRouteView } from "./task-models-section";
import type { OpenRouterModel } from "@/lib/ai/openrouter-models";
import type { AiTask } from "@/lib/ai/routing";
import type { UsageSummary } from "@/lib/ai/usage";
import { CoachMemorySection } from "./coach-memory-section";
import { ZeppIntegrationSection } from "./zepp-integration-section";
import { IntervalsSection } from "./intervals-section";
import type { IntervalsConnectionView } from "@/lib/intervals/credentials";
import { ApiKeySection } from "./api-key-section";
import { SettingsGroup } from "./settings-group";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SettingsTabs } from "./settings-tabs";

export interface SettingsViewProps {
  tab: string;
  profile: Partial<Profile> | null;
  effectiveHr: EffectiveHrConfig;
  heatAdjust: boolean;
  theme: ThemePrefs;
  vapidPublicKey: string | null;
  credential: AiCredentialMetadata | null;
  focusGemini: boolean;
  memories: CoachMemory[];
  zeppConnection: ZeppConnectionView | null;
  /** undefined = database senza migrazione 0025. */
  intervals: IntervalsConnectionView | null | undefined;
  /** Modelli per compito (migrazione 0024: perTask). */
  aiTasks: { perTask: boolean; keys: { gemini: boolean; openrouter: boolean }; tasks: Record<AiTask, TaskRouteView> };
  /** Spesa AI del mese; null senza la migrazione 0024. */
  aiMonth: UsageSummary | null;
  /** undefined = database senza migrazione 0023. */
  openrouter: { lastFour: string } | null | undefined;
  openRouterModels: OpenRouterModel[];
}

export async function SettingsView(props: SettingsViewProps) {
  const t = await getTranslations("settings");
  const tabs = [
    {
      key: "athlete",
      label: t("tabs.athlete"),
      content: (
        <>
          <SettingsGroup title={t("groups.heart")}>
            <ProfileForm profile={props.profile} effectiveHr={props.effectiveHr} />
          </SettingsGroup>
          <SettingsGroup title={t("groups.training")}>
            <HeatSetting initial={props.heatAdjust} />
          </SettingsGroup>
        </>
      ),
    },
    {
      key: "app",
      label: t("tabs.app"),
      content: (
        <>
          <SettingsGroup title="Lingua / Language">
            <LanguageSwitcher />
          </SettingsGroup>
          <SettingsGroup title={t("groups.appearance")}>
            <ThemeSettings initial={props.theme} />
          </SettingsGroup>
          {props.vapidPublicKey && (
            <SettingsGroup title={t("groups.notifications")}>
              <NotificationsSection vapidPublicKey={props.vapidPublicKey} />
            </SettingsGroup>
          )}
        </>
      ),
    },
    {
      key: "coach",
      label: t("tabs.coach"),
      content: (
        <>
          <SettingsGroup title={t("groups.models")}>
            <TaskModelsSection {...props.aiTasks} models={props.openRouterModels} month={props.aiMonth} />
          </SettingsGroup>
          <SettingsGroup title="Gemini">
            <GeminiKeySection credential={props.credential} focusRequested={props.focusGemini} />
          </SettingsGroup>
          <SettingsGroup title="OpenRouter">
            <OpenRouterSection initial={props.openrouter} />
          </SettingsGroup>
          <SettingsGroup title={t("groups.coachMemory")}>
            <CoachMemorySection memories={props.memories} />
          </SettingsGroup>
        </>
      ),
    },
    {
      key: "links",
      label: t("tabs.links"),
      content: (
        <>
          <SettingsGroup title="Intervals.icu">
            <IntervalsSection initial={props.intervals} />
          </SettingsGroup>
          <SettingsGroup title={t("groups.zepp")}>
            <ZeppIntegrationSection initialConnection={props.zeppConnection} />
          </SettingsGroup>
          <SettingsGroup title={t("groups.autoImport")}>
            <ApiKeySection initialApiKey={props.profile?.api_key ?? null} />
          </SettingsGroup>
        </>
      ),
    },
  ];

  return (
    <AppShell title={t("title")} backHref="/profile" backLabel={t("backLabel")} hideTabBar>
      <SettingsTabs tabs={tabs} initial={props.tab} />
      <form action={signOut} className="mt-2">
        <Button type="submit" variant="ghost" className="w-full text-destructive hover:text-destructive">
          <LogOut size={16} />
          {t("signOut")}
        </Button>
      </form>
    </AppShell>
  );
}
