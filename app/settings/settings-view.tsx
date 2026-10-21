import { LogOut } from "lucide-react";
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
import { ProviderSetting } from "./provider-setting";
import type { AiSwitchState } from "@/components/ai-provider-switch";
import type { OpenRouterModel } from "@/lib/ai/openrouter";
import { CoachMemorySection } from "./coach-memory-section";
import { ZeppIntegrationSection } from "./zepp-integration-section";
import { ApiKeySection } from "./api-key-section";
import { SettingsGroup } from "./settings-group";
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
  ai: AiSwitchState;
  /** undefined = database senza migrazione 0023. */
  openrouter: { lastFour: string | null; model: string | null } | null | undefined;
  openRouterModels: OpenRouterModel[];
  suggestedModels: OpenRouterModel[];
}

export function SettingsView(props: SettingsViewProps) {
  const tabs = [
    {
      key: "athlete",
      label: "Atleta",
      content: (
        <>
          <SettingsGroup title="Cuore e dati personali">
            <ProfileForm profile={props.profile} effectiveHr={props.effectiveHr} />
          </SettingsGroup>
          <SettingsGroup title="Allenamento">
            <HeatSetting initial={props.heatAdjust} />
          </SettingsGroup>
        </>
      ),
    },
    {
      key: "app",
      label: "App",
      content: (
        <>
          <SettingsGroup title="Aspetto">
            <ThemeSettings initial={props.theme} />
          </SettingsGroup>
          {props.vapidPublicKey && (
            <SettingsGroup title="Notifiche">
              <NotificationsSection vapidPublicKey={props.vapidPublicKey} />
            </SettingsGroup>
          )}
        </>
      ),
    },
    {
      key: "coach",
      label: "Coach",
      content: (
        <>
          <SettingsGroup title="Chi risponde">
            <ProviderSetting initial={props.ai} />
          </SettingsGroup>
          <SettingsGroup title="Gemini">
            <GeminiKeySection credential={props.credential} focusRequested={props.focusGemini} />
          </SettingsGroup>
          <SettingsGroup title="OpenRouter">
            <OpenRouterSection initial={props.openrouter} models={props.openRouterModels} suggested={props.suggestedModels} />
          </SettingsGroup>
          <SettingsGroup title="Cosa ricorda il coach">
            <CoachMemorySection memories={props.memories} />
          </SettingsGroup>
        </>
      ),
    },
    {
      key: "links",
      label: "Collegamenti",
      content: (
        <>
          <SettingsGroup title="Orologio Zepp">
            <ZeppIntegrationSection initialConnection={props.zeppConnection} />
          </SettingsGroup>
          <SettingsGroup title="Import automatici">
            <ApiKeySection initialApiKey={props.profile?.api_key ?? null} />
          </SettingsGroup>
        </>
      ),
    },
  ];

  return (
    <AppShell title="Impostazioni" backHref="/profile" backLabel="Profilo" hideTabBar>
      <SettingsTabs tabs={tabs} initial={props.tab} />
      <form action={signOut} className="mt-2">
        <Button type="submit" variant="ghost" className="w-full text-destructive hover:text-destructive">
          <LogOut size={16} />
          Esci dall&apos;account
        </Button>
      </form>
    </AppShell>
  );
}
