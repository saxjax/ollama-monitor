export function preferredMonitorLocation(preferredView) {
  if (!preferredView || !["variant", "custom"].includes(preferredView.mode)) return null;
  const parameters = new URLSearchParams({ prototype: "monitor", surface: "default" });
  if (preferredView.mode === "custom") parameters.set("layout", "custom");
  else parameters.set("variant", preferredView.variant || "A");
  return `/monitor/?${parameters}`;
}
