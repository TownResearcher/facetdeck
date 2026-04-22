const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

export function buildModelEndpoint(url: string, autoConcat: boolean, endpointSuffix: string): string {
  const base = normalizeBaseUrl(url);
  if (!base) return "";
  if (!autoConcat) return base;

  const normalizedSuffix = endpointSuffix.replace(/^\/+/, "");
  const fullSuffix = `/v1/${normalizedSuffix}`;

  if (base.endsWith(fullSuffix)) return base;
  if (base.endsWith("/v1")) return `${base}/${normalizedSuffix}`;
  if (base.endsWith(`/${normalizedSuffix}`)) {
    const prefix = base.slice(0, -`/${normalizedSuffix}`.length).replace(/\/v1$/, "");
    return `${prefix}/v1/${normalizedSuffix}`;
  }
  return `${base}/v1/${normalizedSuffix}`;
}
