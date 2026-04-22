import { useEffect, useRef, useState, type ComponentType } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import { Header } from "../components/Header";
import {
  AlertTriangle,
  ArrowLeft,
  Bug,
  Code2,
  FileCode,
  FileJson,
  Gauge,
  HelpCircle,
  Layers,
  PlayCircle,
  RefreshCw,
  Shield,
  Terminal,
  UploadCloud,
  Zap,
} from "lucide-react";

const SAMPLE_MANIFEST = `{
  "id": "my-first-plugin",
  "name": "My First Plugin",
  "version": "1.0.0",
  "description": "A simple plugin example.",
  "capabilities": [
    "context.pageHtml.read",
    "editor.slide.read"
  ]
}`;

const SAMPLE_ENTRY = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; padding: 20px; color: #333; }
    button { padding: 8px 16px; background: #ff6b35; color: white; border: none; border-radius: 8px; cursor: pointer; }
  </style>
</head>
<body>
  <h3>Hello from Plugin!</h3>
  <button id="btn">Read Slide HTML</button>
  <pre id="out" style="background:#f4f4f4; padding:10px; border-radius:8px; margin-top:10px; max-height:200px; overflow:auto;"></pre>

  <script>
    document.getElementById("btn").addEventListener("click", async () => {
      try {
        const res = await window.FacetDeck.api.editor.getActiveSlideHtml();
        document.getElementById("out").textContent = String(res?.html || "").slice(0, 500) + "...";
      } catch (e) {
        document.getElementById("out").textContent = "Error: " + (e?.message || e);
      }
    });
  </script>
</body>
</html>`;

type SectionId =
  | "quickstart"
  | "api"
  | "capabilities"
  | "errors"
  | "limits"
  | "publish"
  | "update"
  | "debugging"
  | "faq";

type ApiCategory = "Context" | "AI" | "Storage" | "UI" | "Editor" | "Selector" | "Resources" | "Events";

type ApiDoc = {
  name: string;
  category: ApiCategory;
  purpose: string;
  capability: string;
  signature: string;
  returns: string;
  example: string;
  commonErrors: string;
};

const API_DOCS: ApiDoc[] = [
  {
    name: "context.getConversationHistory(options?)",
    category: "Context",
    purpose: "Read conversation history for plugin reasoning context.",
    capability: "context.history.read",
    signature: "options?: { limit?: number; cursor?: number }",
    returns: "{ ok: true; history: Message[]; nextCursor: number; hasMore: boolean }",
    example: "await api.context.getConversationHistory({ limit: 20 })",
    commonErrors: "PERMISSION_DENIED, REQUEST_TIMEOUT",
  },
  {
    name: "context.getCurrentPageHtml(options?)",
    category: "Context",
    purpose: "Read active page/slide HTML content.",
    capability: "context.pageHtml.read",
    signature: "options?: { maxLength?: number }",
    returns: "{ ok: true; html: string; slideId?: number; truncated: boolean }",
    example: "await api.context.getCurrentPageHtml({ maxLength: 8000 })",
    commonErrors: "PERMISSION_DENIED, INVALID_PAYLOAD",
  },
  {
    name: "context.getSelection()",
    category: "Context",
    purpose: "Read selected tags/objects in editor context.",
    capability: "context.selection.read",
    signature: "()",
    returns: "{ selection: Array<{ name: string; kind: string; slideId?: number }> }",
    example: "await api.context.getSelection()",
    commonErrors: "PERMISSION_DENIED",
  },
  {
    name: "ai.chat.completions.create(payload)",
    category: "AI",
    purpose: "Invoke chat completion via platform LLM gateway.",
    capability: "ai.chat.invoke",
    signature: "payload: { prompt: string; temperature?: number }",
    returns: "{ text: string }",
    example: "await api.ai.chat.completions.create({ prompt: 'Summarize this slide' })",
    commonErrors: "RATE_LIMITED, CREDITS_EXHAUSTED, REQUEST_TIMEOUT",
  },
  {
    name: "ai.image.generate(payload)",
    category: "AI",
    purpose: "Invoke text-to-image model.",
    capability: "ai.image.generate",
    signature: "payload: { prompt: string }",
    returns: "{ imageUrl: string }",
    example: "await api.ai.image.generate({ prompt: 'A minimal gradient icon' })",
    commonErrors: "RATE_LIMITED, CREDITS_EXHAUSTED, REQUEST_TIMEOUT",
  },
  {
    name: "storage.get(key)",
    category: "Storage",
    purpose: "Read plugin private key-value storage.",
    capability: "none",
    signature: "key: string",
    returns: "{ value: string }",
    example: "await api.storage.get('theme')",
    commonErrors: "INVALID_PAYLOAD",
  },
  {
    name: "storage.set(key, value)",
    category: "Storage",
    purpose: "Write plugin private key-value storage.",
    capability: "none",
    signature: "key: string, value: string",
    returns: "{ saved: true }",
    example: "await api.storage.set('theme', 'dark')",
    commonErrors: "INVALID_PAYLOAD",
  },
  {
    name: "ui.toast(payload)",
    category: "UI",
    purpose: "Show host toast notification.",
    capability: "none",
    signature: "payload: { message: string; type?: 'info' | 'success' | 'error' | string }",
    returns: "{ shown?: boolean } | void",
    example: "await api.ui.toast({ message: 'Done', type: 'success' })",
    commonErrors: "INVALID_PAYLOAD",
  },
  {
    name: "ui.openPanel(payload)",
    category: "UI",
    purpose: "Ask host to open a panel/tab.",
    capability: "none",
    signature: "payload: { id?: string }",
    returns: "{ opened?: boolean } | void",
    example: "await api.ui.openPanel({ id: 'plugins' })",
    commonErrors: "INVALID_PAYLOAD",
  },
  {
    name: "editor.getActiveSlideHtml()",
    category: "Editor",
    purpose: "Read current active slide HTML.",
    capability: "editor.slide.read",
    signature: "()",
    returns: "{ slideId?: number; html: string }",
    example: "await api.editor.getActiveSlideHtml()",
    commonErrors: "PERMISSION_DENIED",
  },
  {
    name: "editor.patchSlideHtml(payload)",
    category: "Editor",
    purpose: "Replace target slide HTML in one call.",
    capability: "editor.slide.write",
    signature: "payload: { slideId?: number; nextHtml: string }",
    returns: "{ patched: boolean }",
    example: "await api.editor.patchSlideHtml({ nextHtml })",
    commonErrors: "PERMISSION_DENIED, INVALID_PAYLOAD",
  },
  {
    name: "editor.updateElementByDomPath(payload)",
    category: "Editor",
    purpose: "Update one DOM element by CSS-like path.",
    capability: "editor.slide.write",
    signature:
      "payload: { slideId?: number; domPath: string; textPatch?: string; stylePatch?: { mode?: 'absolute' | 'offset'; x?: number; y?: number; w?: number; h?: number; css?: Record<string,string> } }",
    returns: "{ updated: boolean }",
    example: "await api.editor.updateElementByDomPath({ domPath: 'body > h1', textPatch: 'New title' })",
    commonErrors: "PERMISSION_DENIED, INVALID_PAYLOAD",
  },
  {
    name: "editor.beginTransaction()",
    category: "Editor",
    purpose: "Start batched editor operation transaction.",
    capability: "editor.slide.write",
    signature: "()",
    returns: "{ started: boolean }",
    example: "await api.editor.beginTransaction()",
    commonErrors: "PERMISSION_DENIED",
  },
  {
    name: "editor.commitTransaction()",
    category: "Editor",
    purpose: "Commit current transaction.",
    capability: "editor.slide.write",
    signature: "()",
    returns: "{ committed: boolean }",
    example: "await api.editor.commitTransaction()",
    commonErrors: "PERMISSION_DENIED",
  },
  {
    name: "editor.rollbackTransaction()",
    category: "Editor",
    purpose: "Rollback current transaction.",
    capability: "editor.slide.write",
    signature: "()",
    returns: "{ rolledBack: boolean }",
    example: "await api.editor.rollbackTransaction()",
    commonErrors: "PERMISSION_DENIED",
  },
  {
    name: "editor.undo()",
    category: "Editor",
    purpose: "Trigger host editor undo.",
    capability: "editor.slide.write",
    signature: "()",
    returns: "{ undone: boolean }",
    example: "await api.editor.undo()",
    commonErrors: "PERMISSION_DENIED",
  },
  {
    name: "editor.redo()",
    category: "Editor",
    purpose: "Trigger host editor redo.",
    capability: "editor.slide.write",
    signature: "()",
    returns: "{ redone: boolean }",
    example: "await api.editor.redo()",
    commonErrors: "PERMISSION_DENIED",
  },
  {
    name: "selector.enterPickMode()",
    category: "Selector",
    purpose: "Enter visual pick mode in editor.",
    capability: "editor.slide.read",
    signature: "()",
    returns: "{ active: boolean }",
    example: "await api.selector.enterPickMode()",
    commonErrors: "PERMISSION_DENIED",
  },
  {
    name: "selector.exitPickMode()",
    category: "Selector",
    purpose: "Exit visual pick mode in editor.",
    capability: "editor.slide.read",
    signature: "()",
    returns: "{ active: boolean }",
    example: "await api.selector.exitPickMode()",
    commonErrors: "PERMISSION_DENIED",
  },
  {
    name: "selector.getCurrentSelection()",
    category: "Selector",
    purpose: "Read current picked/selected element details.",
    capability: "editor.slide.read",
    signature: "()",
    returns: "{ selection: SelectionTag[]; selectedPropertyElement?: object | null; isPickModeActive?: boolean }",
    example: "await api.selector.getCurrentSelection()",
    commonErrors: "PERMISSION_DENIED",
  },
  {
    name: "selector.subscribeSelectionChange(handler)",
    category: "Selector",
    purpose: "Subscribe to selection change events.",
    capability: "editor.slide.read",
    signature: "(handler: (payload: unknown) => void)",
    returns: "() => void // unsubscribe",
    example: "const off = api.selector.subscribeSelectionChange(fn)",
    commonErrors: "PERMISSION_DENIED",
  },
  {
    name: "resources.list(payload?)",
    category: "Resources",
    purpose: "List slide resources/elements.",
    capability: "editor.resource.read",
    signature: "payload?: { slideId?: number }",
    returns: "{ elements: ResourceElement[] }",
    example: "await api.resources.list({ slideId: 1 })",
    commonErrors: "PERMISSION_DENIED",
  },
  {
    name: "resources.createElement(payload)",
    category: "Resources",
    purpose: "Create one resource/element record.",
    capability: "editor.resource.write",
    signature: "payload: { id?: string; name: string; type?: string; source?: 'slide' | 'asset'; slideId?: number; dataUrl?: string; url?: string; code?: string }",
    returns: "{ element?: unknown }",
    example: "await api.resources.createElement({ name: 'Logo', type: 'IMAGE', dataUrl })",
    commonErrors: "PERMISSION_DENIED, INVALID_PAYLOAD",
  },
  {
    name: "resources.updateElement(payload)",
    category: "Resources",
    purpose: "Update one resource/element record.",
    capability: "editor.resource.write",
    signature: "payload: { id: string; patch: Partial<{ name: string; type: string; source: 'slide' | 'asset'; slideId: number; dataUrl: string; url: string; code: string }> }",
    returns: "{ element?: unknown }",
    example: "await api.resources.updateElement({ id, patch: { name: 'Logo v2' } })",
    commonErrors: "PERMISSION_DENIED, INVALID_PAYLOAD",
  },
  {
    name: "resources.deleteElement(payload)",
    category: "Resources",
    purpose: "Delete one resource/element record.",
    capability: "editor.resource.write",
    signature: "payload: { id: string }",
    returns: "{ deleted: boolean }",
    example: "await api.resources.deleteElement({ id })",
    commonErrors: "PERMISSION_DENIED, INVALID_PAYLOAD",
  },
  {
    name: "resources.uploadDataUrl(payload)",
    category: "Resources",
    purpose: "Upload image dataUrl to managed storage and optionally create element.",
    capability: "editor.resource.write",
    signature: "payload: { dataUrl: string; fileName?: string; slideId?: number; createElement?: boolean; name?: string }",
    returns: "{ upload: { url?: string }; element?: unknown | null }",
    example: "await api.resources.uploadDataUrl({ dataUrl, createElement: true })",
    commonErrors: "PERMISSION_DENIED, RESOURCE_TOO_LARGE, CLOUD_QUOTA_EXCEEDED",
  },
  {
    name: "resources.uploadRemoteUrl(payload)",
    category: "Resources",
    purpose: "Fetch remote image then persist to managed storage and optionally create element.",
    capability: "editor.resource.write",
    signature: "payload: { url: string; fileName?: string; slideId?: number; createElement?: boolean; name?: string }",
    returns: "{ upload: { url?: string }; element?: unknown | null }",
    example: "await api.resources.uploadRemoteUrl({ url, createElement: true })",
    commonErrors: "PERMISSION_DENIED, NETWORK_ERROR, CLOUD_QUOTA_EXCEEDED",
  },
  {
    name: "resources.addImageToSlide(payload)",
    category: "Resources",
    purpose: "Persist image + optional element record + insert image into slide HTML.",
    capability: "editor.resource.write + editor.slide.write",
    signature: "payload: { slideId?: number; name?: string; imageUrl?: string; dataUrl?: string; x?: number; y?: number; w?: number; h?: number; createElement?: boolean; persistRemoteUrl?: boolean }",
    returns: "{ inserted: boolean; slideId?: number; imageUrl?: string; element?: unknown | null }",
    example: "await api.resources.addImageToSlide({ dataUrl, x: 120, y: 120, w: 240, h: 140 })",
    commonErrors: "PERMISSION_DENIED, INVALID_PAYLOAD, CLOUD_QUOTA_EXCEEDED",
  },
  {
    name: "window.FacetDeck.on(eventName, handler)",
    category: "Events",
    purpose: "Subscribe to host-level SDK events.",
    capability: "none",
    signature: "(eventName: string, handler: (payload: unknown) => void)",
    returns: "() => void // unsubscribe",
    example: "const off = window.FacetDeck.on('selector.selectionChanged', fn)",
    commonErrors: "UNKNOWN_ERROR",
  },
];

const API_CATEGORIES: ApiCategory[] = ["Context", "AI", "Storage", "UI", "Editor", "Selector", "Resources", "Events"];

const UPDATE_FLOW_MERMAID = `
flowchart TD
  A[Start update] --> B{Keep same manifest.id?}
  B -- No --> C[Creates new plugin]
  B -- Yes --> D[Bump manifest.version and update entry.html]
  D --> E[Publish in Community]
  E --> F[System upserts by owner + manifest.id]
  F --> G{Did permissions change?}
  G -- No --> H[Users continue normally]
  G -- Yes --> I[Installed users marked requiresReauth]
  I --> J[Editor shows inline re-authorization gate]
  J --> K[User re-authorizes via Add to Library]
`;

const API_JSON_EXAMPLES: Record<string, { request: string; response: string }> = {
  "context.getConversationHistory(options?)": {
    request: `{
  "limit": 20,
  "cursor": 0
}`,
    response: `{
  "ok": true,
  "history": [
    { "role": "user", "content": "..." }
  ],
  "nextCursor": 20,
  "hasMore": true
}`,
  },
  "context.getCurrentPageHtml(options?)": {
    request: `{
  "maxLength": 8000
}`,
    response: `{
  "ok": true,
  "html": "<!DOCTYPE html><html>...</html>",
  "slideId": 12,
  "truncated": false
}`,
  },
  "context.getSelection()": {
    request: `{}`,
    response: `{
  "selection": [
    { "name": "Title", "kind": "text", "slideId": 12 }
  ]
}`,
  },
  "ai.chat.completions.create(payload)": {
    request: `{
  "prompt": "Summarize this slide",
  "temperature": 0.2
}`,
    response: `{
  "text": "This slide introduces..."
}`,
  },
  "ai.image.generate(payload)": {
    request: `{
  "prompt": "A minimal orange abstract shape"
}`,
    response: `{
  "imageUrl": "data:image/png;base64,iVBORw0K..."
}`,
  },
  "storage.get(key)": {
    request: `{
  "key": "theme"
}`,
    response: `{
  "value": "dark"
}`,
  },
  "storage.set(key, value)": {
    request: `{
  "key": "theme",
  "value": "dark"
}`,
    response: `{
  "saved": true
}`,
  },
  "ui.toast(payload)": {
    request: `{
  "message": "Done",
  "type": "success"
}`,
    response: `{
  "shown": true
}`,
  },
  "ui.openPanel(payload)": {
    request: `{
  "id": "plugins"
}`,
    response: `{
  "opened": true
}`,
  },
  "editor.getActiveSlideHtml()": {
    request: `{}`,
    response: `{
  "slideId": 12,
  "html": "<!DOCTYPE html><html>...</html>"
}`,
  },
  "editor.patchSlideHtml(payload)": {
    request: `{
  "slideId": 12,
  "nextHtml": "<!DOCTYPE html><html><body>...</body></html>"
}`,
    response: `{
  "patched": true
}`,
  },
  "editor.updateElementByDomPath(payload)": {
    request: `{
  "slideId": 12,
  "domPath": "body > h1",
  "textPatch": "New title"
}`,
    response: `{
  "updated": true
}`,
  },
  "editor.beginTransaction()": {
    request: `{}`,
    response: `{
  "started": true
}`,
  },
  "editor.commitTransaction()": {
    request: `{}`,
    response: `{
  "committed": true
}`,
  },
  "editor.rollbackTransaction()": {
    request: `{}`,
    response: `{
  "rolledBack": true
}`,
  },
  "editor.undo()": {
    request: `{}`,
    response: `{
  "undone": true
}`,
  },
  "editor.redo()": {
    request: `{}`,
    response: `{
  "redone": true
}`,
  },
  "selector.enterPickMode()": {
    request: `{}`,
    response: `{
  "active": true
}`,
  },
  "selector.exitPickMode()": {
    request: `{}`,
    response: `{
  "active": false
}`,
  },
  "selector.getCurrentSelection()": {
    request: `{}`,
    response: `{
  "selection": [
    { "name": "Title", "kind": "text", "slideId": 12 }
  ],
  "isPickModeActive": true
}`,
  },
  "selector.subscribeSelectionChange(handler)": {
    request: `{
  "handler": "(payload) => { ... }"
}`,
    response: `{
  "unsubscribe": "function"
}`,
  },
  "resources.list(payload?)": {
    request: `{
  "slideId": 12
}`,
    response: `{
  "elements": [
    {
      "id": "el_8d72",
      "name": "Hero image",
      "type": "IMAGE",
      "slideId": 12,
      "url": "https://oss.example.com/hero.png"
    }
  ]
}`,
  },
  "resources.createElement(payload)": {
    request: `{
  "name": "Logo",
  "type": "IMAGE",
  "slideId": 12,
  "dataUrl": "data:image/png;base64,iVBORw0K..."
}`,
    response: `{
  "element": {
    "id": "el_ab12",
    "name": "Logo",
    "type": "IMAGE",
    "slideId": 12
  }
}`,
  },
  "resources.updateElement(payload)": {
    request: `{
  "id": "el_ab12",
  "patch": {
    "name": "Logo v2"
  }
}`,
    response: `{
  "element": {
    "id": "el_ab12",
    "name": "Logo v2"
  }
}`,
  },
  "resources.deleteElement(payload)": {
    request: `{
  "id": "el_ab12"
}`,
    response: `{
  "deleted": true
}`,
  },
  "resources.uploadDataUrl(payload)": {
    request: `{
  "dataUrl": "data:image/png;base64,iVBORw0K...",
  "fileName": "gen-image.png",
  "slideId": 12,
  "createElement": true,
  "name": "AI image"
}`,
    response: `{
  "upload": { "url": "https://oss.example.com/uploads/gen-image.png" },
  "element": {
    "id": "el_ab12",
    "name": "AI image",
    "type": "IMAGE",
    "slideId": 12
  }
}`,
  },
  "resources.uploadRemoteUrl(payload)": {
    request: `{
  "url": "https://example.com/image.png",
  "slideId": 12,
  "createElement": true
}`,
    response: `{
  "upload": { "url": "https://oss.example.com/uploads/image.png" },
  "element": {
    "id": "el_bc34",
    "name": "Remote image",
    "type": "IMAGE"
  }
}`,
  },
  "resources.addImageToSlide(payload)": {
    request: `{
  "dataUrl": "data:image/png;base64,iVBORw0K...",
  "slideId": 12,
  "x": 120,
  "y": 120,
  "w": 280,
  "h": 180,
  "createElement": true
}`,
    response: `{
  "inserted": true,
  "slideId": 12,
  "imageUrl": "https://oss.example.com/uploads/img.png",
  "element": { "id": "el_cd34", "name": "Inserted image" }
}`,
  },
  "window.FacetDeck.on(eventName, handler)": {
    request: `{
  "eventName": "selector.selectionChanged",
  "handler": "(payload) => { ... }"
}`,
    response: `{
  "unsubscribe": "function"
}`,
  },
};

const getApiJson = (name: string, signature: string, returnsValue: string) =>
  API_JSON_EXAMPLES[name] || {
    request: `{
  "example": "Refer to signature: ${signature.replace(/"/g, '\\"')}"
}`,
    response: `{
  "example": "Refer to returns: ${returnsValue.replace(/"/g, '\\"')}"
}`,
  };

function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderIdRef = useRef(`fd-mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let mounted = true;
    import("mermaid")
      .then((mod) => {
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "loose",
          fontFamily: "Inter, system-ui, sans-serif",
          themeVariables: {
            primaryColor: "#fff7ed",
            primaryTextColor: "#7c2d12",
            primaryBorderColor: "#fb923c",
            lineColor: "#ea580c",
            secondaryColor: "#ffedd5",
            tertiaryColor: "#f8fafc",
            clusterBkg: "#ffffff",
            clusterBorder: "#fdba74",
            edgeLabelBackground: "#fff7ed",
            fontSize: "13px",
          },
          flowchart: {
            curve: "basis",
            nodeSpacing: 40,
            rankSpacing: 50,
            padding: 12,
          },
        });
        return mermaid.render(renderIdRef.current, chart);
      })
      .then(({ svg }) => {
        if (!mounted || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
      })
      .catch(() => {
        if (!mounted || !containerRef.current) return;
        containerRef.current.innerHTML = "<p style='color:#dc2626;font-size:12px;'>Failed to render Mermaid diagram.</p>";
      });
    return () => {
      mounted = false;
    };
  }, [chart]);

  return <div ref={containerRef} className="overflow-x-auto [&_svg]:min-w-[720px] [&_svg]:h-auto" />;
}

export function PluginDeveloperCenter() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SectionId>("quickstart");

  const sections: Array<{ id: SectionId; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: "quickstart", label: "Quickstart", icon: Zap },
    { id: "api", label: "API Reference", icon: Terminal },
    { id: "capabilities", label: "Capabilities", icon: Shield },
    { id: "errors", label: "Errors", icon: AlertTriangle },
    { id: "limits", label: "Limits & Quota", icon: Gauge },
    { id: "publish", label: "Publish Flow", icon: UploadCloud },
    { id: "update", label: "Update Plugin", icon: RefreshCw },
    { id: "debugging", label: "Debugging", icon: Bug },
    { id: "faq", label: "FAQ", icon: HelpCircle },
  ];

  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-[#fafafa] flex flex-col">
      <Header />
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-[#ff6b35]/10 to-[#ff8a5c]/0 blur-[100px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-[200px] rotate-45 bg-gradient-to-tl from-[#ff8a5c]/10 to-transparent blur-[120px] pointer-events-none" />

      <div className="pt-24 pb-12 px-8 max-w-[1320px] w-full mx-auto flex-1 flex flex-col relative z-10">
        <button
          onClick={() => navigate("/community", { state: { tab: "plugins" } })}
          className="flex items-center gap-2 text-slate-500 hover:text-[#ff6b35] font-semibold transition-colors mb-8 w-fit group"
        >
          <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
          Back to Community
        </button>

        <div className="mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#ff6b35] to-[#ff8a5c] shadow-lg shadow-[#ff6b35]/20 mb-6">
            <Code2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-800 tracking-tight mb-4">Plugin Developer Center</h1>
          <p className="text-lg text-slate-600 max-w-3xl leading-relaxed">
            Documentation center for building FacetDeck plugins. This page includes end-to-end guidance for SDK usage,
            permissions, quota behavior, error handling, publish flow, and debugging.
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-[32px] p-8 mb-10 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.04)] flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Starter Files</h3>
            <p className="text-slate-500 font-medium">Download starter templates and publish your first plugin in minutes.</p>
          </div>
          <div className="flex gap-4 w-full md:w-auto">
            <button
              onClick={() => downloadFile("manifest.json", SAMPLE_MANIFEST)}
              className="flex-1 md:flex-none px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors flex items-center justify-center gap-2"
            >
              <FileJson className="w-4 h-4" />
              manifest.json
            </button>
            <button
              onClick={() => downloadFile("entry.html", SAMPLE_ENTRY)}
              className="flex-1 md:flex-none px-6 py-3 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] text-white font-bold hover:shadow-lg hover:shadow-[#ff6b35]/30 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <FileCode className="w-4 h-4" />
              entry.html
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-10">
          <div className="w-full md:w-64 shrink-0">
            <div className="sticky top-24 flex flex-col gap-2">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`px-5 py-3.5 rounded-2xl font-bold text-left transition-all flex items-center gap-3 ${
                      activeSection === section.id ? "bg-white text-[#ff6b35] shadow-sm" : "text-slate-500 hover:bg-white/50"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {section.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 bg-white/60 backdrop-blur-xl border border-white/80 rounded-[32px] p-8 md:p-10 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.04)]">
            {activeSection === "quickstart" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-none">
                <h2 className="text-2xl font-bold text-slate-800 mb-4 tracking-tight">Quickstart</h2>
                <p className="text-[15px] leading-7 text-slate-600 mb-6">
                  FacetDeck plugins run in frontend iframe sandbox and call host features through <code>window.FacetDeck.api</code>.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <Shield className="w-6 h-6 text-emerald-500 mb-3" />
                    <h4 className="font-bold text-slate-800 mb-2">Security model</h4>
                    <p className="text-sm text-slate-500">No direct backend or local disk access. Everything goes through permissions and API broker.</p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                    <Layers className="w-6 h-6 text-blue-500 mb-3" />
                    <h4 className="font-bold text-slate-800 mb-2">Editor integration</h4>
                    <p className="text-sm text-slate-500">Installed plugins render as editor right-panel tabs, same level as Copilot and Properties.</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-5">
                  <p className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-4">5-step setup</p>
                  <ol className="space-y-3">
                    <li className="text-sm text-slate-700 font-medium">Create <code>manifest.json</code> and <code>entry.html</code>.</li>
                    <li className="text-sm text-slate-700 font-medium">Declare minimal capabilities only.</li>
                    <li className="text-sm text-slate-700 font-medium">Publish through Community plugin post.</li>
                    <li className="text-sm text-slate-700 font-medium">Add to library and enable in profile.</li>
                    <li className="text-sm text-slate-700 font-medium">Open editor and run your plugin tab.</li>
                  </ol>
                </div>
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                  <p className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Runnable sample project</p>
                  <p className="text-sm text-slate-600 mb-3">
                    Use the complete Vite sample instead of two loose files: <code>examples/facetdeck-plugin-vite-sample</code>
                  </p>
                  <pre className="bg-slate-900 text-slate-50 p-3 rounded-lg overflow-x-auto text-xs">
                    <code>{`facetdeck-plugin-vite-sample/
  package.json
  vite.config.js
  public/manifest.json
  src/main.js
  index.html`}</code>
                  </pre>
                  <p className="text-sm text-slate-600 mt-3">
                    Run locally: <code>cd examples/facetdeck-plugin-vite-sample && npm install && npm run dev</code>
                  </p>
                </div>
              </motion.div>
            )}

            {activeSection === "api" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="prose prose-slate max-w-none">
                <h2 className="text-2xl font-bold text-slate-800 mb-6">API Reference (Full)</h2>
                <p className="text-slate-600 mb-8">All methods are async and exposed under <code>window.FacetDeck.api</code>. Expand each API card for role, capability, signature, return type, example, and common errors.</p>
                <div className="space-y-8 not-prose">
                  {API_CATEGORIES.map((category) => {
                    const items = API_DOCS.filter((doc) => doc.category === category);
                    return (
                      <section key={category}>
                        <h3 className="text-lg font-bold text-slate-800 mb-3 border-b border-slate-200 pb-2">{category}</h3>
                        <div className="space-y-3">
                          {items.map((doc) => (
                            <details key={doc.name} className="group rounded-xl border border-slate-200 bg-white/90 open:shadow-sm">
                              <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-slate-800 flex items-center justify-between gap-3">
                                <span className="font-mono text-sm">{doc.name}</span>
                                <span className="text-xs rounded-full bg-[#ff6b35]/10 text-[#ff6b35] px-2 py-1">{doc.capability}</span>
                              </summary>
                              <div className="border-t border-slate-100 px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">What it does</p>
                                  <p className="text-slate-700">{doc.purpose}</p>
                                </div>
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Common errors</p>
                                  <p className="text-slate-700">{doc.commonErrors}</p>
                                </div>
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Signature</p>
                                  <code className="text-[12px] text-slate-700 break-all">{doc.signature}</code>
                                </div>
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Returns</p>
                                  <code className="text-[12px] text-slate-700 break-all">{doc.returns}</code>
                                </div>
                                <div className="md:col-span-2">
                                  <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Example</p>
                                  <code className="block text-[12px] bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 break-all">{doc.example}</code>
                                </div>
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Request JSON</p>
                                  <pre className="bg-slate-900 text-slate-50 rounded-lg p-3 overflow-x-auto text-[11px]">
                                    <code>{getApiJson(doc.name, doc.signature, doc.returns).request}</code>
                                  </pre>
                                </div>
                                <div>
                                  <p className="text-xs uppercase tracking-wide text-slate-400 mb-1">Response JSON</p>
                                  <pre className="bg-slate-900 text-slate-50 rounded-lg p-3 overflow-x-auto text-[11px]">
                                    <code>{getApiJson(doc.name, doc.signature, doc.returns).response}</code>
                                  </pre>
                                </div>
                              </div>
                            </details>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {activeSection === "capabilities" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="prose prose-slate max-w-none">
                <h2 className="text-2xl font-bold text-slate-800 mb-6">Capabilities</h2>
                <p className="text-slate-600 mb-6">Capabilities are declared in <code>manifest.json</code> and enforced by host runtime checks.</p>
                <pre className="bg-slate-900 text-slate-50 p-5 rounded-xl overflow-x-auto text-sm">
                  <code>{`{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Example",
  "capabilities": [
    "context.history.read",
    "context.pageHtml.read",
    "context.selection.read",
    "ai.chat.invoke",
    "ai.image.generate",
    "editor.slide.read",
    "editor.slide.write",
    "editor.resource.read",
    "editor.resource.write"
  ]
}`}</code>
                </pre>
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                  Request least privilege only. High-risk actions may require additional user confirmation at runtime.
                </div>
              </motion.div>
            )}

            {activeSection === "errors" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="prose prose-slate max-w-none">
                <h2 className="text-2xl font-bold text-slate-800 mb-6">Error Mapping</h2>
                <p className="text-slate-600 mb-6">Map host errors into stable UI codes for consistent plugin UX.</p>
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left">
                        <th className="px-4 py-3 font-bold text-slate-700">Code</th>
                        <th className="px-4 py-3 font-bold text-slate-700">Match Rule</th>
                        <th className="px-4 py-3 font-bold text-slate-700">User Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {[
                        ["AUTH_REQUIRED", "Unauthorized / Invalid token", "Login expired. Please sign in again."],
                        ["PERMISSION_DENIED", "Capability not granted", "This action needs extra permission."],
                        ["RATE_LIMITED", "rate limit / too many requests", "Too many requests. Please retry later."],
                        ["CREDITS_EXHAUSTED", "credits / insufficient", "Managed credits are exhausted."],
                        ["CLOUD_QUOTA_EXCEEDED", "cloud quota / capacity", "Cloud storage quota reached."],
                        ["RESOURCE_TOO_LARGE", "too large", "File is too large."],
                        ["INVALID_PAYLOAD", "invalid / missing", "Request payload is invalid."],
                        ["REQUEST_TIMEOUT", "timeout", "Request timed out."],
                        ["NETWORK_ERROR", "network/fetch errors", "Network error. Check connection."],
                        ["UNKNOWN_ERROR", "fallback", "Something went wrong. Please retry."],
                      ].map(([code, rule, message]) => (
                        <tr key={code}>
                          <td className="px-4 py-3 font-semibold text-[#ff6b35]">{code}</td>
                          <td className="px-4 py-3 text-slate-600">{rule}</td>
                          <td className="px-4 py-3 text-slate-700">{message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {activeSection === "limits" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="prose prose-slate max-w-none">
                <h2 className="text-2xl font-bold text-slate-800 mb-6">Limits & Quota</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 not-prose">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <p className="font-bold text-slate-800 mb-2">Managed AI usage</p>
                    <p className="text-sm text-slate-600">Plugin-triggered managed model calls consume user credits.</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <p className="font-bold text-slate-800 mb-2">Storage accounting</p>
                    <p className="text-sm text-slate-600">Resource uploads consume cloud storage quota.</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <p className="font-bold text-slate-800 mb-2">Rate limits</p>
                    <p className="text-sm text-slate-600">API calls can be throttled by plugin/user-level limits.</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <p className="font-bold text-slate-800 mb-2">Timeouts and payload sizes</p>
                    <p className="text-sm text-slate-600">Long-running or oversized requests may fail and should be retried gracefully.</p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === "publish" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-none">
                <h2 className="text-2xl font-bold text-slate-800 mb-4 tracking-tight">Publish Flow</h2>
                <p className="text-[15px] leading-7 text-slate-600 mb-6">
                  Plugins are distributed via Community posts only. Follow this guided flow to publish, install, and run.
                </p>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-5">
                  <ol className="space-y-3">
                    <li className="text-sm text-slate-700 font-medium">Prepare <code>manifest.json</code> and <code>entry.html</code>.</li>
                    <li className="text-sm text-slate-700 font-medium">Go to Community, open Plugins tab, click publish.</li>
                    <li className="text-sm text-slate-700 font-medium">Upload files and publish as plugin post.</li>
                    <li className="text-sm text-slate-700 font-medium">Install via Add to Library from the post.</li>
                    <li className="text-sm text-slate-700 font-medium">Enable plugin in Profile if needed.</li>
                    <li className="text-sm text-slate-700 font-medium">Open editor to run plugin tab.</li>
                  </ol>
                </div>
                <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 leading-6">
                  <p className="font-bold text-slate-800 mb-1">Double-ID mode</p>
                  <p>
                    <code>manifest.id</code> is semantic and developer-defined; system maintains globally unique plugin UID.
                    Different owners can use same manifest id, while each owner keeps unique update lineage.
                  </p>
                </div>
              </motion.div>
            )}

            {activeSection === "update" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-none">
                <h2 className="text-2xl font-bold text-slate-800 mb-4 tracking-tight">Update Plugin</h2>
                <p className="text-[15px] leading-7 text-slate-600 mb-6">
                  Keep the same <code>manifest.id</code> and publish a new version to update an existing plugin. If you add new
                  capabilities, existing users must complete re-authorization.
                </p>

                <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 mb-6">
                  <p className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Update flowchart</p>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <MermaidDiagram chart={UPDATE_FLOW_MERMAID} />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white/80 p-5">
                  <p className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Permission change decision table</p>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr className="text-left">
                          <th className="px-4 py-3 font-bold text-slate-700">Change type</th>
                          <th className="px-4 py-3 font-bold text-slate-700">User impact</th>
                          <th className="px-4 py-3 font-bold text-slate-700">Action required</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        <tr>
                          <td className="px-4 py-3 text-slate-700">Code/UI only (no permission change)</td>
                          <td className="px-4 py-3 text-slate-600">No reauth required</td>
                          <td className="px-4 py-3 text-slate-700">Publish new version and share changelog</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-slate-700">Add optional capability</td>
                          <td className="px-4 py-3 text-slate-600">Feature may be gated until reauth</td>
                          <td className="px-4 py-3 text-slate-700">Prompt users to re-authorize for new feature</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-slate-700">Add required capability</td>
                          <td className="px-4 py-3 text-slate-600">Plugin marked <code>requiresReauth</code> for installed users</td>
                          <td className="px-4 py-3 text-slate-700">User must re-authorize before plugin can run</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-slate-700">Remove capability</td>
                          <td className="px-4 py-3 text-slate-600">No extra user action needed</td>
                          <td className="px-4 py-3 text-slate-700">Publish update and note reduced permission scope</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-3 text-slate-700">Change <code>manifest.id</code></td>
                          <td className="px-4 py-3 text-slate-600">Treated as a new plugin</td>
                          <td className="px-4 py-3 text-slate-700">Avoid unless intentionally creating a separate plugin</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === "debugging" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-none">
                <h2 className="text-2xl font-bold text-slate-800 mb-4 tracking-tight">Debugging</h2>
                <p className="text-[15px] leading-7 text-slate-600 mb-6">
                  Use this checklist to quickly isolate install/permission/runtime issues.
                </p>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-5">
                  <ul className="space-y-2">
                    <li className="text-sm text-slate-700 font-medium">Confirm plugin is installed and enabled.</li>
                    <li className="text-sm text-slate-700 font-medium">Check required capabilities are declared in manifest.</li>
                    <li className="text-sm text-slate-700 font-medium">Wrap all API calls in try/catch and surface meaningful UI errors.</li>
                    <li className="text-sm text-slate-700 font-medium">Use browser console logs from iframe and host for cross-checking.</li>
                  </ul>
                </div>
                <h3 className="text-lg font-bold text-slate-800 mt-6 mb-3">Safe call helper</h3>
                <pre className="bg-slate-900 text-slate-50 p-4 rounded-xl overflow-x-auto text-sm">
                  <code>{`async function callWithToast(task) {
  try {
    return await task();
  } catch (err) {
    await window.FacetDeck.api.ui.toast({ message: String(err), type: "error" });
    throw err;
  }
}`}</code>
                </pre>
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <p className="text-sm font-bold text-amber-800 mb-2">Permission failure demo</p>
                  <pre className="bg-slate-900 text-slate-50 p-3 rounded-lg overflow-x-auto text-xs mb-3">
                    <code>{`try {
  await window.FacetDeck.api.editor.patchSlideHtml({ nextHtml: "<html>...</html>" });
} catch (err) {
  const msg = String(err || "");
  if (msg.toLowerCase().includes("capability") || msg.toLowerCase().includes("not granted")) {
    await window.FacetDeck.api.ui.toast({
      type: "error",
      message: "Missing permission. Re-install this plugin and grant editor.slide.write."
    });
  }
}`}</code>
                  </pre>
                  <p className="text-sm text-amber-700 leading-6">
                    If capability is missing, API call fails with permission-related error. Guide user to <b>Community plugin post &gt; Add to Library</b> (re-authorize), then ensure plugin is enabled in <b>Profile &gt; Plugins</b>.
                  </p>
                </div>
              </motion.div>
            )}

            {activeSection === "faq" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="prose prose-slate max-w-none">
                <h2 className="text-2xl font-bold text-slate-800 mb-6">FAQ</h2>
                <div className="space-y-6">
                  <div>
                    <p className="font-bold text-slate-800 mb-1">Can plugins access backend runtime directly?</p>
                    <p className="text-slate-600">No. Plugins can only use exposed host APIs from sandbox.</p>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 mb-1">Can plugin UI be custom designed?</p>
                    <p className="text-slate-600">Yes. The plugin controls its own HTML/CSS/JS in entry file.</p>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 mb-1">How to update plugin releases?</p>
                    <p className="text-slate-600">Publish again with same owner + manifest id; system resolves update chain.</p>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 mb-1">Can generated images be saved as slide resources?</p>
                    <p className="text-slate-600">Yes, use <code>resources.uploadDataUrl</code> or <code>resources.addImageToSlide</code>.</p>
                  </div>
                </div>
                <div className="mt-8 flex items-center gap-2 text-sm text-slate-500">
                  <PlayCircle className="w-4 h-4" />
                  Keep <code>PLUGIN_SDK.md</code> as the normative spec and this page as developer portal UI.
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
