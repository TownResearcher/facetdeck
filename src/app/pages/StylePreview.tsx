import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";

type StoredPreview = {
  id?: string;
  name?: string;
  previewHtml?: string;
};

export function StylePreview() {
  const { previewId = "" } = useParams();
  const [preview, setPreview] = useState<StoredPreview | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("ppt_style_previews_v1");
    if (!raw) {
      setNotFound(true);
      return;
    }
    try {
      const styles = JSON.parse(raw);
      const nextPreview = Array.isArray(styles)
        ? styles.find((item) => String(item?.id || "") === previewId)
        : null;
      if (!nextPreview || !nextPreview.previewHtml) {
        setNotFound(true);
        return;
      }
      setPreview(nextPreview);
    } catch (_error) {
      setNotFound(true);
    }
  }, [previewId]);

  const pageTitle = useMemo(() => {
    if (preview?.name) return `${preview.name} · HTML Preview`;
    return "Style HTML Preview";
  }, [preview?.name]);

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-lg w-full rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-xl space-y-4">
          <h1 className="text-2xl font-bold text-slate-800">Preview not found</h1>
          <p className="text-slate-600 text-sm">
            This preview may have expired. Please go back to the editor and regenerate style previews.
          </p>
          <Link
            to="/editor"
            className="inline-flex items-center rounded-xl bg-orange-500 px-4 py-2.5 text-white font-medium hover:bg-orange-600 transition-colors"
          >
            Back to Editor
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col">
      <div className="h-14 shrink-0 px-4 border-b border-white/15 bg-slate-900/80 backdrop-blur flex items-center justify-between">
        <div className="text-sm text-white/90 font-medium truncate pr-4">{pageTitle}</div>
        <div className="flex items-center gap-2">
          <Link
            to="/editor"
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium transition-colors"
          >
            Back to Editor
          </Link>
        </div>
      </div>
      <iframe
        title={pageTitle}
        className="flex-1 w-full border-0 bg-white"
        srcDoc={preview?.previewHtml || ""}
        sandbox="allow-scripts"
      />
    </div>
  );
}
