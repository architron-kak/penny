// Render provides its final HTTPS URL at runtime, before any custom domain is configured.
export function appOrigin() {
  return new URL(
    process.env.APP_URL?.trim() ||
      process.env.RENDER_EXTERNAL_URL?.trim() ||
      "http://localhost:3000",
  ).origin;
}
