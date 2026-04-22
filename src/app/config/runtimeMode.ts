type FacetDeckMode = "oss" | "saas";

function normalizeMode(value: string | undefined): FacetDeckMode {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "saas" ? "saas" : "oss";
}

export const FACETDECK_MODE: FacetDeckMode = normalizeMode(import.meta.env.VITE_FACETDECK_MODE);
export const IS_SAAS_MODE = FACETDECK_MODE === "saas";
export const IS_OSS_MODE = FACETDECK_MODE === "oss";
export const COMMUNITY_FEATURE_ENABLED = IS_SAAS_MODE;
