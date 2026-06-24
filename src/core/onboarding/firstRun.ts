import { isStudioTestMode } from "@/app/workspace";

const STORAGE_KEY = "bryantlabs.onboarding.v1";

export function readOnboardingComplete(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeOnboardingComplete(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function shouldShowWelcomeScreen(hasProject: boolean): boolean {
  if (hasProject || readOnboardingComplete()) return false;
  const env = import.meta.env;
  if (
    isStudioTestMode() &&
    env?.VITE_BRYANTLABS_ONBOARDING_E2E !== "1"
  ) {
    return false;
  }
  return true;
}
