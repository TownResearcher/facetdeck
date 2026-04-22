import { useEffect, useState } from "react";
import { createClientId } from "../utils/id";

type SelectedItem = {
  id: string;
  name: string;
  kind: "slide" | "resource" | "element";
  slideId?: number;
  elementId?: string;
  domPath?: string;
  tagName?: string;
  textContent?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};
type HoveredRect = { top: number; left: number; width: number; height: number };

export function useEditorSelector() {
  const [isSelectorMode, setIsSelectorMode] = useState(false);
  const [selectedTags, setSelectedTags] = useState<SelectedItem[]>([]);
  const [isPropertiesSelectorMode, setIsPropertiesSelectorMode] = useState(false);
  const [selectedPropertyElement, setSelectedPropertyElement] = useState<SelectedItem | null>(null);
  const [hoveredRect, setHoveredRect] = useState<HoveredRect | null>(null);

  useEffect(() => {
    if (!isSelectorMode && !isPropertiesSelectorMode) {
      setHoveredRect(null);
      return;
    }

    const getIframeInnerTarget = (event: MouseEvent, iframeEl: HTMLIFrameElement | null) => {
      if (!iframeEl) return null;
      try {
        const frameDoc = iframeEl.contentDocument;
        if (!frameDoc) return null;
        const frameRect = iframeEl.getBoundingClientRect();
        if (frameRect.width <= 0 || frameRect.height <= 0) return null;
        const scaleX = frameRect.width / Math.max(1, iframeEl.clientWidth);
        const scaleY = frameRect.height / Math.max(1, iframeEl.clientHeight);
        const x = (event.clientX - frameRect.left) / Math.max(scaleX, 0.001);
        const y = (event.clientY - frameRect.top) / Math.max(scaleY, 0.001);
        const innerTarget = frameDoc.elementFromPoint(x, y) as HTMLElement | null;
        if (!innerTarget || innerTarget === frameDoc.body || innerTarget === frameDoc.documentElement) {
          return null;
        }
        return { innerTarget, frameRect, scaleX, scaleY };
      } catch (_error) {
        return null;
      }
    };

    const getMeaningfulMainAreaTarget = (rawTarget: HTMLElement, mainContentArea: HTMLElement) => {
      const mainRect = mainContentArea.getBoundingClientRect();
      const mainArea = Math.max(1, mainRect.width * mainRect.height);
      let node: HTMLElement | null = rawTarget;
      while (node && node !== mainContentArea) {
        const rect = node.getBoundingClientRect();
        const areaRatio = (rect.width * rect.height) / mainArea;
        const text = node.innerText?.trim() || "";
        const isSemanticTag = ["button", "a", "input", "textarea", "img", "svg", "path", "p", "span", "h1", "h2", "h3", "li"].includes(
          node.tagName.toLowerCase(),
        );
        if (areaRatio < 0.7 && (text.length > 0 || isSemanticTag)) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    };

    const buildDomPath = (node: HTMLElement) => {
      const parts: string[] = [];
      let current: HTMLElement | null = node;
      while (current && current.tagName.toLowerCase() !== "body") {
        const tag = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (!parent) break;
        const siblings = Array.from(parent.children).filter(
          (sibling) => sibling.tagName.toLowerCase() === tag,
        );
        const index = Math.max(1, siblings.indexOf(current) + 1);
        parts.unshift(`${tag}:nth-of-type(${index})`);
        current = parent;
      }
      return parts.length > 0 ? `body > ${parts.join(" > ")}` : "";
    };

    const readElementTextPreservingNewlines = (node: HTMLElement) => {
      const withBreaks = String(node.innerHTML || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|blockquote|pre|tr|section|article|ul|ol)>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "- ");
      const stripped = withBreaks.replace(/<[^>]+>/g, "");
      const textarea = document.createElement("textarea");
      textarea.innerHTML = stripped;
      const decoded = String(textarea.value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
      if (decoded.trim().length > 0) {
        return decoded;
      }
      return String(node.innerText || node.textContent || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
    };

    const buildSelectedPropertyFromElement = (node: HTMLElement): SelectedItem => {
      const text = readElementTextPreservingNewlines(node);
      const rect = node.getBoundingClientRect();
      const compactText = text.replace(/\s+/g, " ").trim();
      const displayName =
        compactText.length > 0
          ? `${compactText.slice(0, 20)}${compactText.length > 20 ? "..." : ""}`
          : node.tagName.toLowerCase();
      return {
        id: createClientId("selected-property"),
        name: displayName,
        kind: "element",
        domPath: buildDomPath(node),
        tagName: node.tagName.toLowerCase(),
        textContent: text,
        x: Number.isFinite(rect.left) ? rect.left : 0,
        y: Number.isFinite(rect.top) ? rect.top : 0,
        width: Number.isFinite(rect.width) ? rect.width : 0,
        height: Number.isFinite(rect.height) ? rect.height : 0,
      };
    };

    const setHoverFromIframeElement = (innerTarget: HTMLElement, iframeEl: HTMLIFrameElement) => {
      const frameRect = iframeEl.getBoundingClientRect();
      if (frameRect.width <= 0 || frameRect.height <= 0) {
        return;
      }
      const innerRect = innerTarget.getBoundingClientRect();
      const frameDoc = iframeEl.contentDocument;
      const frameWindow = iframeEl.contentWindow;
      if (!frameDoc || !frameWindow) {
        return;
      }
      const docEl = frameDoc.documentElement;
      const scrollX = frameWindow.scrollX || docEl?.scrollLeft || 0;
      const scrollY = frameWindow.scrollY || docEl?.scrollTop || 0;
      const scaleX = frameRect.width / Math.max(1, iframeEl.clientWidth);
      const scaleY = frameRect.height / Math.max(1, iframeEl.clientHeight);
      setHoveredRect({
        top: frameRect.top + (innerRect.top + scrollY) * scaleY,
        left: frameRect.left + (innerRect.left + scrollX) * scaleX,
        width: innerRect.width * scaleX,
        height: innerRect.height * scaleY,
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const rightPanel = document.getElementById("right-panel");

      if (rightPanel?.contains(target) || target.id === "selector-overlay") {
        setHoveredRect(null);
        return;
      }

      const slideEl = target.closest("[data-slide-title]") as HTMLElement | null;
      const resourceEl = target.closest("[data-resource-name]") as HTMLElement | null;
      const mainContentArea = document.getElementById("main-content-area") as HTMLElement | null;

      let rectTarget: HTMLElement | null = null;

      if (isSelectorMode) {
        if (slideEl) {
          rectTarget = slideEl;
        } else if (resourceEl) {
          rectTarget = resourceEl;
        } else if (mainContentArea?.contains(target) && target !== mainContentArea) {
          const iframeEl = target.closest("iframe") as HTMLIFrameElement | null;
          const iframeInner = getIframeInnerTarget(e, iframeEl);
          if (iframeInner) {
            const innerRect = iframeInner.innerTarget.getBoundingClientRect();
            setHoveredRect({
              top: iframeInner.frameRect.top + innerRect.top * iframeInner.scaleY,
              left: iframeInner.frameRect.left + innerRect.left * iframeInner.scaleX,
              width: innerRect.width * iframeInner.scaleX,
              height: innerRect.height * iframeInner.scaleY,
            });
            return;
          }
          rectTarget = getMeaningfulMainAreaTarget(target, mainContentArea);
        }
      } else if (isPropertiesSelectorMode) {
        if (mainContentArea?.contains(target) && target !== mainContentArea) {
          const iframeEl = target.closest("iframe") as HTMLIFrameElement | null;
          const iframeInner = getIframeInnerTarget(e, iframeEl);
          if (iframeInner) {
            const innerRect = iframeInner.innerTarget.getBoundingClientRect();
            setHoveredRect({
              top: iframeInner.frameRect.top + innerRect.top * iframeInner.scaleY,
              left: iframeInner.frameRect.left + innerRect.left * iframeInner.scaleX,
              width: innerRect.width * iframeInner.scaleX,
              height: innerRect.height * iframeInner.scaleY,
            });
            return;
          }
          rectTarget = getMeaningfulMainAreaTarget(target, mainContentArea);
        }
      }

      if (!rectTarget) {
        setHoveredRect(null);
        return;
      }

      const rect = rectTarget.getBoundingClientRect();
      setHoveredRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (target.closest("#selector-toggle-btn") || target.closest("#properties-selector-toggle-btn")) return;

      const rightPanel = document.getElementById("right-panel");
      if (rightPanel?.contains(target)) return;

      e.preventDefault();
      e.stopPropagation();

      const slideEl = target.closest("[data-slide-title]");
      const resourceEl = target.closest("[data-resource-name]");
      const mainContentArea = document.getElementById("main-content-area") as HTMLElement | null;

      let selectedItem: SelectedItem | null = null;

      if (isSelectorMode) {
        if (slideEl) {
          const rawSlideId = Number(slideEl.getAttribute("data-slide-id"));
          const slideId = Number.isFinite(rawSlideId) && rawSlideId > 0 ? rawSlideId : undefined;
          selectedItem = {
            id: createClientId("selected-tag"),
            name: `Slide: ${slideEl.getAttribute("data-slide-title") || "Untitled"}`,
            kind: "slide",
            slideId,
          };
        } else if (resourceEl) {
          selectedItem = {
            id: createClientId("selected-tag"),
            name: `Resource: ${resourceEl.getAttribute("data-resource-name") || "Item"}`,
            kind: "resource",
          };
        } else if (mainContentArea?.contains(target) && target !== mainContentArea) {
          const iframeEl = target.closest("iframe") as HTMLIFrameElement | null;
          const iframeInner = getIframeInnerTarget(e, iframeEl);
          if (iframeInner) {
            const text = iframeInner.innerTarget.innerText?.trim();
            selectedItem = {
              id: createClientId("selected-tag"),
              name: text ? `${text.slice(0, 20).replace(/\n/g, " ")}${text.length > 20 ? "..." : ""}` : iframeInner.innerTarget.tagName.toLowerCase(),
              kind: "element",
            };
          } else {
            const meaningful = getMeaningfulMainAreaTarget(target, mainContentArea);
            if (!meaningful) return;
            const text = meaningful.innerText?.trim();
            selectedItem = {
              id: createClientId("selected-tag"),
              name: text ? `${text.slice(0, 20).replace(/\n/g, " ")}${text.length > 20 ? "..." : ""}` : meaningful.tagName.toLowerCase(),
              kind: "element",
            };
          }
        }

        if (selectedItem?.name) {
          setSelectedTags((prev) => {
            if (prev.find((item) => item.name === selectedItem.name && item.slideId === selectedItem.slideId)) return prev;
            return [...prev, selectedItem];
          });
        }
        return;
      }

      if (isPropertiesSelectorMode && mainContentArea?.contains(target) && target !== mainContentArea) {
        let name = "";
        const iframeEl = target.closest("iframe") as HTMLIFrameElement | null;
        const iframeInner = getIframeInnerTarget(e, iframeEl);
        if (iframeInner) {
          const text = iframeInner.innerTarget.innerText?.trim();
          name = text ? `${text.slice(0, 20).replace(/\n/g, " ")}${text.length > 20 ? "..." : ""}` : iframeInner.innerTarget.tagName.toLowerCase();
        } else {
          const meaningful = getMeaningfulMainAreaTarget(target, mainContentArea);
          if (!meaningful) return;
          const text = meaningful.innerText?.trim();
          name = text ? `${text.slice(0, 20).replace(/\n/g, " ")}${text.length > 20 ? "..." : ""}` : meaningful.tagName.toLowerCase();
        }

        if (name) {
          if (iframeInner?.innerTarget) {
            setSelectedPropertyElement(buildSelectedPropertyFromElement(iframeInner.innerTarget));
          } else {
            setSelectedPropertyElement({
              id: createClientId("selected-property"),
              name,
              kind: "element",
            });
          }
          setIsPropertiesSelectorMode(false);
        }
      }
    };

    const attachIframeListeners = () => {
      const mainContentArea = document.getElementById("main-content-area") as HTMLElement | null;
      const iframeEl = mainContentArea?.querySelector("iframe") as HTMLIFrameElement | null;
      if (!iframeEl) return () => {};
      try {
        const frameDoc = iframeEl.contentDocument;
        if (!frameDoc) return () => {};
        const handleFrameMouseMove = (event: MouseEvent) => {
          if (!isSelectorMode && !isPropertiesSelectorMode) return;
          const target = event.target as HTMLElement | null;
          if (!target || target === frameDoc.body || target === frameDoc.documentElement) {
            setHoveredRect(null);
            return;
          }
          setHoverFromIframeElement(target, iframeEl);
        };
        const handleFrameClick = (event: MouseEvent) => {
          if (!isSelectorMode && !isPropertiesSelectorMode) return;
          const target = event.target as HTMLElement | null;
          if (!target || target === frameDoc.body || target === frameDoc.documentElement) return;
          event.preventDefault();
          event.stopPropagation();
          if (isSelectorMode) {
            const text = target.innerText?.trim();
            const name = text ? `${text.slice(0, 20).replace(/\n/g, " ")}${text.length > 20 ? "..." : ""}` : target.tagName.toLowerCase();
            if (name) {
              setSelectedTags((prev) => {
                if (prev.find((item) => item.name === name && item.kind === "element")) return prev;
                return [...prev, { id: createClientId("selected-tag"), name, kind: "element" }];
              });
            }
          } else if (isPropertiesSelectorMode) {
            const text = target.innerText?.trim();
            const name = text ? `${text.slice(0, 20).replace(/\n/g, " ")}${text.length > 20 ? "..." : ""}` : target.tagName.toLowerCase();
            if (name) {
              setSelectedPropertyElement(buildSelectedPropertyFromElement(target));
              setIsPropertiesSelectorMode(false);
            }
          }
        };
        frameDoc.addEventListener("mousemove", handleFrameMouseMove);
        frameDoc.addEventListener("click", handleFrameClick, true);
        return () => {
          frameDoc.removeEventListener("mousemove", handleFrameMouseMove);
          frameDoc.removeEventListener("click", handleFrameClick, true);
        };
      } catch (_error) {
        return () => {};
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("click", handleClick, { capture: true });
    const detachIframeListeners = attachIframeListeners();
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("click", handleClick, { capture: true });
      detachIframeListeners();
    };
  }, [isSelectorMode, isPropertiesSelectorMode]);

  const removeTag = (idToRemove: string) => {
    setSelectedTags((prev) => prev.filter((item) => item.id !== idToRemove));
  };

  const clearSelectedTags = () => {
    setSelectedTags([]);
  };

  const addSelectedTag = (item: { name: string; kind: "slide" | "resource" | "element"; slideId?: number; elementId?: string }) => {
    const name = String(item.name || "").trim();
    if (!name) return;
    setSelectedTags((prev) => {
      if (prev.find((tag) => tag.name === name && tag.kind === item.kind && tag.slideId === item.slideId)) {
        return prev;
      }
      return [...prev, { id: createClientId("selected-tag"), name, kind: item.kind, slideId: item.slideId, elementId: item.elementId }];
    });
  };

  const toggleSelectorMode = () => {
    setIsSelectorMode((prev) => {
      if (!prev) {
        setIsPropertiesSelectorMode(false);
      }
      return !prev;
    });
  };

  const restoreSelectedTags = (
    items: Array<{ name: string; kind: "slide" | "resource" | "element"; slideId?: number; elementId?: string }>,
  ) => {
    setSelectedTags(
      (Array.isArray(items) ? items : [])
        .filter((item) => String(item?.name || "").trim())
        .map((item) => ({
          id: createClientId("selected-tag"),
          name: String(item.name || "").trim(),
          kind: item.kind,
          slideId: typeof item.slideId === "number" ? item.slideId : undefined,
          elementId: String(item.elementId || "").trim() || undefined,
        })),
    );
  };

  const togglePropertiesSelectorMode = () => {
    setIsPropertiesSelectorMode((prev) => {
      if (!prev) {
        setIsSelectorMode(false);
      }
      return !prev;
    });
  };

  const selectedSlideIds = Array.from(
    new Set(
      selectedTags
        .filter((item) => item.kind === "slide" && Number.isFinite(item.slideId))
        .map((item) => Number(item.slideId)),
    ),
  );

  return {
    isSelectorMode,
    selectedTags,
    selectedSlideIds,
    isPropertiesSelectorMode,
    selectedPropertyElement,
    hoveredRect,
    setSelectedPropertyElement,
    removeTag,
    clearSelectedTags,
    addSelectedTag,
    restoreSelectedTags,
    toggleSelectorMode,
    togglePropertiesSelectorMode,
  };
}
