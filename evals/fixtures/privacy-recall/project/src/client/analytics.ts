import posthog from "posthog-js";
import type { User } from "../db/models";

export function startAnalytics() {
  posthog.init("phc_public_project_key", { api_host: "https://eu.posthog.com" });
}

export function identifyMember(user: User) {
  posthog.identify(user.id, { email: user.email, name: user.fullName, plan: user.plan });
}

export function trackPlanChange(userId: string, plan: string) {
  posthog.capture("plan_changed", { plan });
}
