import { startAnalytics, identifyMember } from "./analytics";
import { analyticsEnabled } from "./settings";
import { renderApp } from "./app";
import type { User } from "../db/models";

export function boot(user: User | null) {
  startAnalytics();
  if (user) identifyMember(user);

  renderApp({ showAnalyticsToggle: true, analyticsOn: analyticsEnabled() });
}
