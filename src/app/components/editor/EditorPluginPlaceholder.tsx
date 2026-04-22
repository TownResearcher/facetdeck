import { useEffect, useMemo, useRef } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import type { InstalledPlugin } from "../../types/plugins";

type EditorPluginPlaceholderProps = {
  activePlugin: InstalledPlugin | null;
  currentPageHtml: string;
  activeSlideId?: number;
  conversationHistory: Array<{ id?: string; role?: string; content?: string; text?: string; createdAt?: number }>;
  selection: Array<{ name?: string; kind?: string; slideId?: number }>;
  selectedPropertyElement: {
    name: string;
    domPath: string;
    tagName: string;
    textContent: string;
    slideId?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  } | null;
  onPatchSlideHtml: (payload: { slideId?: number; nextHtml: string }) => { ok: boolean; error?: string };
  onUpdateElementByDomPath: (payload: {
    slideId?: number;
    domPath: string;
    textPatch?: string;
    stylePatch?: {
      mode?: "absolute" | "offset";
      x?: number;
      y?: number;
      w?: number;
      h?: number;
      css?: Record<string, string>;
    };
  }) => { ok: boolean; error?: string };
  onEnterPickMode: () => void;
  onExitPickMode: () => void;
  isPickModeActive: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canRedo: boolean;
  createTransactionSnapshot: () => Array<{ id: number; html: string }>;
  restoreTransactionSnapshot: (snapshot: Array<{ id?: number; html?: string }>) => { ok: boolean; error?: string };
  onListResources: (payload: { slideId?: number }) => {
    ok: boolean;
    elements?: Array<{
      id: string;
      name: string;
      type: string;
      source?: "slide" | "asset";
      slideId?: number;
      dataUrl?: string;
      url?: string;
    }>;
    error?: string;
  };
  onCreateResource: (payload: {
    id?: string;
    name: string;
    type?: string;
    source?: "slide" | "asset";
    slideId?: number;
    dataUrl?: string;
    url?: string;
    code?: string;
  }) => { ok: boolean; element?: Record<string, unknown>; error?: string };
  onUpdateResource: (payload: {
    id: string;
    patch: Partial<{
      name: string;
      type: string;
      source: "slide" | "asset";
      slideId: number;
      dataUrl: string;
      url: string;
      code: string;
    }>;
  }) => { ok: boolean; element?: Record<string, unknown>; error?: string };
  onDeleteResource: (payload: { id: string }) => { ok: boolean; error?: string };
  onUploadResourceDataUrl: (payload: {
    dataUrl: string;
    fileName?: string;
    slideId?: number;
    createElement?: boolean;
    name?: string;
  }) => Promise<{ ok: boolean; upload?: { url?: string }; element?: Record<string, unknown> | null; error?: string }>;
  onUploadResourceRemoteUrl: (payload: {
    url: string;
    fileName?: string;
    slideId?: number;
    createElement?: boolean;
    name?: string;
  }) => Promise<{ ok: boolean; upload?: { url?: string }; element?: Record<string, unknown> | null; error?: string }>;
  onAddImageToSlide: (payload: {
    slideId?: number;
    name?: string;
    imageUrl?: string;
    dataUrl?: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    createElement?: boolean;
    persistRemoteUrl?: boolean;
  }) => Promise<{
    ok: boolean;
    inserted?: boolean;
    slideId?: number;
    imageUrl?: string;
    element?: Record<string, unknown> | null;
    error?: string;
  }>;
};

type PluginMessage = {
  source: "facetdeck-plugin";
  requestId: string;
  method: string;
  params?: Record<string, unknown>;
  capability?: string;
};

const BRIDGE_SOURCE = "facetdeck-plugin";
const BRIDGE_EVENT_SOURCE = "facetdeck-plugin-event";

const INJECTED_BRIDGE_SCRIPT = `
<script>
(() => {
  const pending = new Map();
  const source = "${BRIDGE_SOURCE}";
  const post = (method, params, capability) => {
    const requestId = Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      parent.postMessage({ source, requestId, method, params, capability }, "*");
      setTimeout(() => {
        if (pending.has(requestId)) {
          pending.delete(requestId);
          reject(new Error("Plugin API timeout"));
        }
      }, 120000);
    });
  };
  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.source !== source || !data.requestId) return;
    const waiter = pending.get(data.requestId);
    if (!waiter) return;
    pending.delete(data.requestId);
    if (data.ok) waiter.resolve(data.result);
    else waiter.reject(new Error(data.error || "Plugin API error"));
  });
  window.FacetDeck = {
    _listeners: new Map(),
    on: (eventName, handler) => {
      const key = String(eventName || "");
      if (!key || typeof handler !== "function") return () => {};
      if (!window.FacetDeck._listeners.has(key)) {
        window.FacetDeck._listeners.set(key, new Set());
      }
      window.FacetDeck._listeners.get(key).add(handler);
      return () => {
        const set = window.FacetDeck._listeners.get(key);
        if (!set) return;
        set.delete(handler);
      };
    },
    _emit: (eventName, payload) => {
      const key = String(eventName || "");
      const set = window.FacetDeck._listeners.get(key);
      if (!set) return;
      set.forEach((handler) => {
        try { handler(payload); } catch (_e) {}
      });
    },
    api: {
      context: {
        getConversationHistory: (options) => post("context.getConversationHistory", options, "context.history.read"),
        getCurrentPageHtml: (options) => post("context.getCurrentPageHtml", options, "context.pageHtml.read"),
        getSelection: () => post("context.getSelection", {}, "context.selection.read"),
      },
      ai: {
        chat: {
          completions: {
            create: (payload) => post("ai.chat.completions.create", payload, "ai.chat.invoke"),
          },
        },
        image: {
          generate: (payload) => post("ai.image.generate", payload, "ai.image.generate"),
        },
      },
      storage: {
        get: (key) => post("storage.get", { key }, "storage.private"),
        set: (key, value) => post("storage.set", { key, value }, "storage.private"),
      },
      ui: {
        toast: (payload) => post("ui.toast", payload, "ui.toast"),
        openPanel: (payload) => post("ui.openPanel", payload, "ui.openPanel"),
      },
      editor: {
        getActiveSlideHtml: () => post("editor.getActiveSlideHtml", {}, "editor.slide.read"),
        patchSlideHtml: (payload) => post("editor.patchSlideHtml", payload, "editor.slide.write"),
        updateElementByDomPath: (payload) => post("editor.updateElementByDomPath", payload, "editor.slide.write"),
        beginTransaction: () => post("editor.beginTransaction", {}, "editor.slide.write"),
        commitTransaction: () => post("editor.commitTransaction", {}, "editor.slide.write"),
        rollbackTransaction: () => post("editor.rollbackTransaction", {}, "editor.slide.write"),
        undo: () => post("editor.undo", {}, "editor.slide.write"),
        redo: () => post("editor.redo", {}, "editor.slide.write"),
      },
      selector: {
        enterPickMode: () => post("selector.enterPickMode", {}, "editor.selector.control"),
        exitPickMode: () => post("selector.exitPickMode", {}, "editor.selector.control"),
        getCurrentSelection: () => post("selector.getCurrentSelection", {}, "context.selection.read"),
        subscribeSelectionChange: (handler) => {
          const unsubscribe = window.FacetDeck.on("selector.selectionChanged", handler);
          post("selector.subscribeSelectionChange", {}, "context.selection.read").catch(() => {});
          return unsubscribe;
        },
      },
      resources: {
        list: (payload) => post("resources.list", payload, "editor.resource.read"),
        createElement: (payload) => post("resources.createElement", payload, "editor.resource.write"),
        updateElement: (payload) => post("resources.updateElement", payload, "editor.resource.write"),
        deleteElement: (payload) => post("resources.deleteElement", payload, "editor.resource.write"),
        uploadDataUrl: (payload) => post("resources.uploadDataUrl", payload, "editor.resource.write"),
        uploadRemoteUrl: (payload) => post("resources.uploadRemoteUrl", payload, "editor.resource.write"),
        addImageToSlide: (payload) => post("resources.addImageToSlide", payload, "editor.resource.write"),
      },
    },
  };
  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.source !== "${BRIDGE_EVENT_SOURCE}" || !data.eventName) return;
    window.FacetDeck._emit(data.eventName, data.payload);
  });
})();
</script>
`;

export function EditorPluginPlaceholder({
  activePlugin,
  currentPageHtml,
  activeSlideId,
  conversationHistory,
  selection,
  selectedPropertyElement,
  onPatchSlideHtml,
  onUpdateElementByDomPath,
  onEnterPickMode,
  onExitPickMode,
  isPickModeActive,
  onUndo,
  onRedo,
  canRedo,
  createTransactionSnapshot,
  restoreTransactionSnapshot,
  onListResources,
  onCreateResource,
  onUpdateResource,
  onDeleteResource,
  onUploadResourceDataUrl,
  onUploadResourceRemoteUrl,
  onAddImageToSlide,
}: EditorPluginPlaceholderProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const approvedCapabilitiesRef = useRef<Set<string>>(new Set());
  const transactionSnapshotRef = useRef<Array<{ id: number; html: string }> | null>(null);

  useEffect(() => {
    if (!activePlugin) return;
    approvedCapabilitiesRef.current = new Set();
  }, [activePlugin?.id]);

  useEffect(() => {
    const listener = async (event: MessageEvent<PluginMessage>) => {
      const message = event.data;
      if (!message || message.source !== BRIDGE_SOURCE || !message.requestId || !activePlugin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const send = (payload: { ok: boolean; result?: unknown; error?: string }) => {
        iframeRef.current?.contentWindow?.postMessage(
          { source: BRIDGE_SOURCE, requestId: message.requestId, ...payload },
          "*",
        );
      };
      try {
        const capability = String(message.capability || "").trim();
        if (capability && !activePlugin.grantedPermissions.includes(capability as never)) {
          throw new Error(`Capability not granted: ${capability}`);
        }
        const needsSecondConfirm = capability === "ai.image.generate" || capability === "context.pageHtml.read";
        if (needsSecondConfirm && !approvedCapabilitiesRef.current.has(capability)) {
          const accepted = window.confirm(
            `Plugin "${activePlugin.name}" requests "${capability}". Allow this capability in current session?`,
          );
          if (!accepted) {
            throw new Error("User denied capability");
          }
          approvedCapabilitiesRef.current.add(capability);
        }
        const token = localStorage.getItem("auth_token");
        if (!token) throw new Error("Unauthorized");
        if (message.method === "context.getConversationHistory") {
          const response = await fetch(`/api/plugins/${activePlugin.id}/context/history`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              history: conversationHistory.map((item, index) => ({
                id: String(item.id || `msg-${index + 1}`),
                role: String(item.role || "assistant"),
                text: String(item.text || item.content || ""),
                createdAt: Number(item.createdAt) || Date.now(),
              })),
              ...(message.params || {}),
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data?.error || "Failed to load conversation history");
          send({ ok: true, result: data });
          return;
        }
        if (message.method === "context.getCurrentPageHtml") {
          const response = await fetch(`/api/plugins/${activePlugin.id}/context/page-html`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              html: currentPageHtml,
              slideId: activeSlideId,
              ...(message.params || {}),
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data?.error || "Failed to load current page html");
          send({ ok: true, result: data });
          return;
        }
        if (message.method === "context.getSelection") {
          const response = await fetch(`/api/plugins/${activePlugin.id}/invoke`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              capability: "context.selection.read",
              method: "context.getSelection",
              params: { selection },
            }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data?.error || "Failed to read selection");
          send({ ok: true, result: data?.data || { selection } });
          return;
        }
        if (message.method === "selector.getCurrentSelection") {
          send({
            ok: true,
            result: {
              selection,
              selectedPropertyElement,
              isPickModeActive,
            },
          });
          return;
        }
        if (message.method === "selector.enterPickMode") {
          onEnterPickMode();
          send({ ok: true, result: { active: true } });
          return;
        }
        if (message.method === "selector.exitPickMode") {
          onExitPickMode();
          send({ ok: true, result: { active: false } });
          return;
        }
        if (message.method === "selector.subscribeSelectionChange") {
          send({ ok: true, result: { subscribed: true } });
          return;
        }
        if (message.method === "editor.getActiveSlideHtml") {
          send({
            ok: true,
            result: {
              slideId: activeSlideId,
              html: currentPageHtml,
            },
          });
          return;
        }
        if (message.method === "editor.patchSlideHtml") {
          const params = message.params && typeof message.params === "object" ? message.params : {};
          const result = onPatchSlideHtml({
            slideId: Number(params.slideId) || activeSlideId,
            nextHtml: String(params.nextHtml || ""),
          });
          if (!result.ok) throw new Error(result.error || "Failed to patch slide html");
          send({ ok: true, result: { patched: true } });
          return;
        }
        if (message.method === "editor.updateElementByDomPath") {
          const params = message.params && typeof message.params === "object" ? message.params : {};
          const result = onUpdateElementByDomPath({
            slideId: Number(params.slideId) || activeSlideId,
            domPath: String(params.domPath || ""),
            textPatch: params.textPatch === undefined ? undefined : String(params.textPatch || ""),
            stylePatch: params.stylePatch && typeof params.stylePatch === "object"
              ? {
                  mode: params.stylePatch.mode === "absolute" ? "absolute" : "offset",
                  x: Number(params.stylePatch.x),
                  y: Number(params.stylePatch.y),
                  w: Number(params.stylePatch.w),
                  h: Number(params.stylePatch.h),
                  css: params.stylePatch.css && typeof params.stylePatch.css === "object"
                    ? params.stylePatch.css as Record<string, string>
                    : undefined,
                }
              : undefined,
          });
          if (!result.ok) throw new Error(result.error || "Failed to update element");
          send({ ok: true, result: { updated: true } });
          return;
        }
        if (message.method === "editor.beginTransaction") {
          transactionSnapshotRef.current = createTransactionSnapshot();
          send({ ok: true, result: { started: true } });
          return;
        }
        if (message.method === "editor.commitTransaction") {
          transactionSnapshotRef.current = null;
          send({ ok: true, result: { committed: true } });
          return;
        }
        if (message.method === "editor.rollbackTransaction") {
          const snapshot = transactionSnapshotRef.current;
          if (!snapshot) {
            send({ ok: true, result: { rolledBack: false, reason: "No active transaction" } });
            return;
          }
          const result = restoreTransactionSnapshot(snapshot);
          if (!result.ok) throw new Error(result.error || "Failed to rollback transaction");
          transactionSnapshotRef.current = null;
          send({ ok: true, result: { rolledBack: true } });
          return;
        }
        if (message.method === "editor.undo") {
          onUndo();
          send({ ok: true, result: { undone: true } });
          return;
        }
        if (message.method === "editor.redo") {
          if (!canRedo) {
            send({ ok: true, result: { redone: false, reason: "No redo item" } });
            return;
          }
          onRedo();
          send({ ok: true, result: { redone: true } });
          return;
        }
        if (message.method === "resources.list") {
          const params = message.params && typeof message.params === "object" ? message.params : {};
          const result = onListResources({
            slideId: Number(params.slideId) || activeSlideId,
          });
          if (!result.ok) throw new Error(result.error || "Failed to list resources");
          send({ ok: true, result: { elements: result.elements || [] } });
          return;
        }
        if (message.method === "resources.createElement") {
          const params = message.params && typeof message.params === "object" ? message.params : {};
          const result = onCreateResource({
            id: params.id === undefined ? undefined : String(params.id || ""),
            name: String(params.name || ""),
            type: params.type === undefined ? undefined : String(params.type || ""),
            source: params.source === "slide" ? "slide" : "asset",
            slideId: Number(params.slideId) || activeSlideId,
            dataUrl: params.dataUrl === undefined ? undefined : String(params.dataUrl || ""),
            url: params.url === undefined ? undefined : String(params.url || ""),
            code: params.code === undefined ? undefined : String(params.code || ""),
          });
          if (!result.ok) throw new Error(result.error || "Failed to create element");
          send({ ok: true, result: { element: result.element || null } });
          return;
        }
        if (message.method === "resources.updateElement") {
          const params = message.params && typeof message.params === "object" ? message.params : {};
          const patch = params.patch && typeof params.patch === "object" ? params.patch : {};
          const result = onUpdateResource({
            id: String(params.id || ""),
            patch: {
              ...(patch.name !== undefined ? { name: String(patch.name || "") } : {}),
              ...(patch.type !== undefined ? { type: String(patch.type || "") } : {}),
              ...(patch.source !== undefined ? { source: patch.source === "slide" ? "slide" : "asset" } : {}),
              ...(patch.slideId !== undefined ? { slideId: Number(patch.slideId) || 0 } : {}),
              ...(patch.dataUrl !== undefined ? { dataUrl: String(patch.dataUrl || "") } : {}),
              ...(patch.url !== undefined ? { url: String(patch.url || "") } : {}),
              ...(patch.code !== undefined ? { code: String(patch.code || "") } : {}),
            },
          });
          if (!result.ok) throw new Error(result.error || "Failed to update element");
          send({ ok: true, result: { element: result.element || null } });
          return;
        }
        if (message.method === "resources.deleteElement") {
          const params = message.params && typeof message.params === "object" ? message.params : {};
          const result = onDeleteResource({ id: String(params.id || "") });
          if (!result.ok) throw new Error(result.error || "Failed to delete element");
          send({ ok: true, result: { deleted: true } });
          return;
        }
        if (message.method === "resources.uploadDataUrl") {
          const params = message.params && typeof message.params === "object" ? message.params : {};
          const result = await onUploadResourceDataUrl({
            dataUrl: String(params.dataUrl || ""),
            fileName: params.fileName === undefined ? undefined : String(params.fileName || ""),
            slideId: Number(params.slideId) || activeSlideId,
            createElement: params.createElement === false ? false : true,
            name: params.name === undefined ? undefined : String(params.name || ""),
          });
          if (!result.ok) throw new Error(result.error || "Failed to upload resource");
          send({
            ok: true,
            result: {
              upload: result.upload || {},
              element: result.element || null,
            },
          });
          return;
        }
        if (message.method === "resources.uploadRemoteUrl") {
          const params = message.params && typeof message.params === "object" ? message.params : {};
          const result = await onUploadResourceRemoteUrl({
            url: String(params.url || ""),
            fileName: params.fileName === undefined ? undefined : String(params.fileName || ""),
            slideId: Number(params.slideId) || activeSlideId,
            createElement: params.createElement === false ? false : true,
            name: params.name === undefined ? undefined : String(params.name || ""),
          });
          if (!result.ok) throw new Error(result.error || "Failed to upload remote resource");
          send({
            ok: true,
            result: {
              upload: result.upload || {},
              element: result.element || null,
            },
          });
          return;
        }
        if (message.method === "resources.addImageToSlide") {
          const params = message.params && typeof message.params === "object" ? message.params : {};
          const result = await onAddImageToSlide({
            slideId: Number(params.slideId) || activeSlideId,
            name: params.name === undefined ? undefined : String(params.name || ""),
            imageUrl: params.imageUrl === undefined ? undefined : String(params.imageUrl || ""),
            dataUrl: params.dataUrl === undefined ? undefined : String(params.dataUrl || ""),
            x: Number(params.x),
            y: Number(params.y),
            w: Number(params.w),
            h: Number(params.h),
            createElement: params.createElement === false ? false : true,
            persistRemoteUrl: params.persistRemoteUrl === false ? false : true,
          });
          if (!result.ok) throw new Error(result.error || "Failed to add image to slide");
          send({
            ok: true,
            result: {
              inserted: result.inserted === true,
              slideId: result.slideId,
              imageUrl: result.imageUrl,
              element: result.element || null,
            },
          });
          return;
        }
        if (message.method === "ui.toast") {
          const payload = message.params && typeof message.params === "object" ? message.params : {};
          const text = String(payload.message || "Plugin message");
          toast(text);
          send({ ok: true, result: { shown: true } });
          return;
        }
        if (message.method === "ui.openPanel") {
          send({ ok: true, result: { opened: true } });
          return;
        }
        const invokeResponse = await fetch(`/api/plugins/${activePlugin.id}/invoke`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            capability,
            method: message.method,
            params: message.params || {},
          }),
        });
        const invokeData = await invokeResponse.json().catch(() => ({}));
        if (!invokeResponse.ok) throw new Error(invokeData?.error || "Plugin invoke failed");
        send({ ok: true, result: invokeData?.data || invokeData });
      } catch (error) {
        send({ ok: false, error: error instanceof Error ? error.message : "Plugin runtime error" });
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [
    activePlugin,
    conversationHistory,
    currentPageHtml,
    activeSlideId,
    selection,
    selectedPropertyElement,
    onPatchSlideHtml,
    onUpdateElementByDomPath,
    onEnterPickMode,
    onExitPickMode,
    isPickModeActive,
    onUndo,
    onRedo,
    canRedo,
    createTransactionSnapshot,
    restoreTransactionSnapshot,
    onListResources,
    onCreateResource,
    onUpdateResource,
    onDeleteResource,
    onUploadResourceDataUrl,
    onUploadResourceRemoteUrl,
    onAddImageToSlide,
  ]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        source: BRIDGE_EVENT_SOURCE,
        eventName: "selector.selectionChanged",
        payload: {
          selection,
          selectedPropertyElement,
          isPickModeActive,
        },
      },
      "*",
    );
  }, [selection, selectedPropertyElement, isPickModeActive, activePlugin?.id]);

  const srcDoc = useMemo(() => {
    if (!activePlugin?.entryHtml) return "";
    const source = String(activePlugin.entryHtml || "");
    const lower = source.toLowerCase();
    const bodyCloseIndex = lower.lastIndexOf("</body>");
    if (bodyCloseIndex >= 0) {
      return `${source.slice(0, bodyCloseIndex)}${INJECTED_BRIDGE_SCRIPT}</body>${source.slice(bodyCloseIndex + 7)}`;
    }
    return `${source}\n${INJECTED_BRIDGE_SCRIPT}`;
  }, [activePlugin?.entryHtml]);

  if (!activePlugin) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 opacity-80">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        className="w-16 h-16 rounded-2xl border-2 border-dashed border-[#ff6b35]/40 flex items-center justify-center relative"
      >
        <div className="w-6 h-6 bg-gradient-to-br from-[#ff6b35] to-[#ff8a5c] rounded-lg" />
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-white border border-[#ff6b35]/40 rounded-full" />
      </motion.div>
      <div className="space-y-2">
          <div className="text-sm font-bold uppercase tracking-widest text-[#ff6b35]">No Installed Plugins</div>
          <div className="text-xs font-medium text-slate-500 max-w-[220px] mx-auto leading-relaxed">
            Install a community plugin first, then enable it in your profile.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      <iframe
        ref={iframeRef}
        title={activePlugin.name}
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        className="w-full flex-1 min-h-0 rounded-2xl border border-white/50 bg-white/10 backdrop-blur-xl overflow-hidden shadow-sm"
      />
    </div>
  );
}
