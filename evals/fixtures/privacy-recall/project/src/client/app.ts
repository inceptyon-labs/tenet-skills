export function renderApp(opts: { showAnalyticsToggle: boolean; analyticsOn: boolean }) {
  document.body.dataset.analytics = String(opts.analyticsOn);
}
