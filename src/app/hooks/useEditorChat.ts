import { useEffect, useRef, useState } from "react";
import { createClientId } from "../utils/id";
import type { EditorChatMessage } from "../types/editor";

export type ChatMessage = EditorChatMessage;

const normalizeChatMessages = (messages: unknown): ChatMessage[] => {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages
    .slice(0, 300)
    .map((item, index) => {
      const source = item && typeof item === "object" ? item as Partial<ChatMessage> : {};
      const isVersionCard = source.isVersionCard === true;
      const version = Number(source.version);
      const text = String(source.text || "").trim();
      const versionTitle = String(source.versionTitle || "").trim();
      if (isVersionCard) {
        if (!Number.isFinite(version) || version <= 0) {
          return null;
        }
        return {
          id: String(source.id || createClientId(`chat-version-${index + 1}`)),
          isUser: false,
          isVersionCard: true,
          version,
          versionTitle: versionTitle.slice(0, 300) || `Version ${version}`,
        } as ChatMessage;
      }
      if (!text) {
        return null;
      }
      return {
        id: String(source.id || createClientId(`chat-msg-${index + 1}`)),
        text: text.slice(0, 8000),
        isUser: source.isUser === true,
      } as ChatMessage;
    })
    .filter((item): item is ChatMessage => Boolean(item));
};

export function useEditorChat() {
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentVersion, setCurrentVersion] = useState(1);
  const [isSwitchingVersion, setIsSwitchingVersion] = useState(false);
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const initialGenerationStartedRef = useRef(false);
  const initialGenerationFinishedRef = useRef(false);
  const pendingGenerationIdeaRef = useRef("");
  const latestVersionRef = useRef(0);

  const isChatDisabled = !chatInput.trim() || isWaitingForAI || isSwitchingVersion;

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleVersionSwitch = (version: number) => {
    setIsSwitchingVersion(true);
    window.setTimeout(() => {
      setCurrentVersion(version);
      setIsSwitchingVersion(false);
    }, 600);
  };

  const appendUserMessage = (text: string) => {
    const message: ChatMessage = {
      id: createClientId("chat-user"),
      text: String(text || "").trim(),
      isUser: true,
    };
    if (!message.text) {
      return null;
    }
    setChatMessages((prev) => [...prev, message]);
    return message;
  };

  const appendAssistantMessage = (text: string) => {
    const normalized = String(text || "").trim();
    if (!normalized) {
      return null;
    }
    const message: ChatMessage = {
      id: createClientId("chat-assistant"),
      text: normalized,
      isUser: false,
    };
    setChatMessages((prev) => [...prev, message]);
    return message;
  };

  const appendVersionCard = (versionTitle: string) => {
    const nextVersion = latestVersionRef.current + 1;
    latestVersionRef.current = nextVersion;
    setCurrentVersion(nextVersion);
    const card: ChatMessage = {
      id: createClientId("chat-version"),
      isUser: false,
      isVersionCard: true,
      version: nextVersion,
      versionTitle: String(versionTitle || "").trim().slice(0, 300) || `Updated selected slides for version ${nextVersion}.`,
    };
    setChatMessages((prev) => [...prev, card]);
    return nextVersion;
  };

  const removeMessageById = (messageId: string) => {
    if (!messageId) return;
    setChatMessages((prev) => prev.filter((message) => message.id !== messageId));
  };

  const startInitialGenerationConversation = (idea: string) => {
    const normalizedIdea = String(idea || "").trim();
    if (!normalizedIdea) {
      return;
    }
    pendingGenerationIdeaRef.current = normalizedIdea;
    initialGenerationStartedRef.current = true;
    initialGenerationFinishedRef.current = false;
    setChatError(null);
    setIsWaitingForAI(true);
    setChatMessages((prev) => [
      ...prev,
      {
        id: createClientId("chat-user"),
        text: normalizedIdea,
        isUser: true,
      },
    ]);
  };

  const completeInitialGenerationConversation = () => {
    if (!initialGenerationStartedRef.current || initialGenerationFinishedRef.current) {
      return;
    }
    initialGenerationFinishedRef.current = true;
    setIsWaitingForAI(false);
    const nextVersion = latestVersionRef.current + 1;
    latestVersionRef.current = nextVersion;
    setCurrentVersion(nextVersion);
    const rawIdea = pendingGenerationIdeaRef.current.replace(/\s+/g, " ").trim();
    const shortIdea = rawIdea.length > 72 ? `${rawIdea.slice(0, 69)}...` : rawIdea;
    setChatMessages((prev) => [
      ...prev,
      {
        id: createClientId("chat-assistant"),
        text: "Initial slides are ready based on your idea.",
        isUser: false,
      },
      {
        id: createClientId("chat-version"),
        isUser: false,
        isVersionCard: true,
        version: nextVersion,
        versionTitle: shortIdea
          ? `Generated an initial slide draft from: "${shortIdea}".`
          : "Generated an initial slide draft from your idea.",
      },
    ]);
  };

  const failInitialGenerationConversation = (message = "Generation failed. Please try again.") => {
    if (!initialGenerationStartedRef.current || initialGenerationFinishedRef.current) {
      return;
    }
    initialGenerationFinishedRef.current = true;
    setIsWaitingForAI(false);
    setChatMessages((prev) => [
      ...prev,
      {
        id: createClientId("chat-assistant"),
        text: message,
        isUser: false,
      },
    ]);
  };

  const hydrateChatMessages = (messages: unknown) => {
    const normalized = normalizeChatMessages(messages);
    setChatMessages(normalized);
    const maxVersion = normalized.reduce((max, item) => {
      if (item.isVersionCard && Number.isFinite(Number(item.version))) {
        return Math.max(max, Number(item.version));
      }
      return max;
    }, 0);
    latestVersionRef.current = maxVersion;
    setCurrentVersion(maxVersion > 0 ? maxVersion : 1);
    initialGenerationStartedRef.current = false;
    initialGenerationFinishedRef.current = false;
    pendingGenerationIdeaRef.current = "";
    setIsWaitingForAI(false);
    setChatError(null);
  };

  const clearChatMessages = () => {
    hydrateChatMessages([]);
  };

  return {
    chatInput,
    setChatInput,
    chatMessages,
    currentVersion,
    isSwitchingVersion,
    isWaitingForAI,
    chatError,
    isChatDisabled,
    chatScrollRef,
    handleVersionSwitch,
    appendUserMessage,
    appendAssistantMessage,
    appendVersionCard,
    removeMessageById,
    setIsWaitingForAI,
    setChatError,
    startInitialGenerationConversation,
    completeInitialGenerationConversation,
    failInitialGenerationConversation,
    hydrateChatMessages,
    clearChatMessages,
  };
}
