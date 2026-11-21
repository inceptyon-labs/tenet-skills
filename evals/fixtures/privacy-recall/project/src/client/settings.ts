const KEY = "analyticsEnabled";

export function analyticsEnabled(): boolean {
  return localStorage.getItem(KEY) !== "false";
}

export function setAnalyticsEnabled(on: boolean) {
  localStorage.setItem(KEY, String(on));
}
