type Brands = { brands?: { brand: string }[] };

export function micGuide(): string {
  if (typeof navigator === "undefined") {
    return "Open the site permissions for this page in your browser, find Microphone, and allow it.";
  }

  const agent = navigator.userAgent;
  const brands = (navigator as Navigator & { userAgentData?: Brands }).userAgentData?.brands ?? [];
  const branded = brands.map((entry) => entry.brand).join(" ");

  const iOS =
    /iPad|iPhone|iPod/.test(agent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(agent));
  const android = /Android/.test(agent);
  const edge = /Edg\//.test(agent) || /Microsoft Edge/.test(branded);
  const firefox = /Firefox\//.test(agent);
  const chromium = /Chrome\//.test(agent) || /Chromium/.test(branded);
  const safari = /Safari\//.test(agent) && !chromium;

  if (iOS) {
    return "Open the Settings app, scroll to your browser, tap Microphone and allow it. Then come back here and reload the page.";
  }
  if (android) {
    return "Tap the icon to the left of the web address, then Permissions, then Microphone, and allow it.";
  }
  if (firefox) {
    return "Click the crossed-out microphone near the left of the address bar, then choose Allow.";
  }
  if (safari) {
    return "Open the Safari menu, choose Settings for This Website, then set Microphone to Allow.";
  }
  if (edge || chromium) {
    return "Click the icon at the right-hand end of the address bar, choose Microphone, then Allow.";
  }
  return "Open the site permissions for this page in your browser, find Microphone, and allow it.";
}
