import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { LogOut, Save, Trash2, Power, Zap, Pencil, Check, Activity, Loader2, CheckCircle2, XCircle, Blocks, Mail, Copy, Users } from "lucide-react";
import { Header } from "../components/Header";
import { SettingSwitch } from "../components/ui/setting-switch";
import { toast } from "sonner";
import { PROFILE_TABS, INITIAL_PLUGINS, type ProfileTab } from "../constants/profile";
import { buildModelEndpoint } from "../utils/modelEndpoint";
import { getErrorMessage } from "../utils/errors";
import type { InstalledPlugin } from "../types/plugins";
import { COMMUNITY_FEATURE_ENABLED, IS_OSS_MODE } from "../config/runtimeMode";

type ModelConfig = { id: string; key: string; url: string; autoConcat: boolean };
type ModelConfigResponse = {
  providerMode: "managed" | "custom";
  llm: { id: string; url: string; hasKey: boolean; autoConcat: boolean; updatedAt: number | null };
  img: { id: string; url: string; hasKey: boolean; autoConcat: boolean; updatedAt: number | null };
};
type PrivateTemplate = {
  id: string;
  name: string;
  description: string;
  updatedAt?: number;
};
type UsageResponse = {
  usage?: {
    systemCredits?: number;
    cloudDriveUsedBytes?: number;
    cloudDriveQuotaBytes?: number;
  };
};
type InviteResponse = {
  invite?: {
    inviteCode?: string;
    inviteLink?: string;
    rewardPerInvite?: number;
    invitedCount?: number;
    totalRewardCredits?: number;
    invitedUsers?: Array<{
      id: number;
      email: string;
      displayName: string;
      createdAt: number;
    }>;
  };
};

export function Profile() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ProfileTab>("profile");

  // Profile State
  const [username, setUsername] = useState("FacetDeck_User");
  const [editUsername, setEditUsername] = useState("FacetDeck_User");
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState("");
  const [isSavingUsername, setIsSavingUsername] = useState(false);

  const handleSaveUsername = async (isBlur: boolean = false) => {
    if (isSavingUsername) return;
    const trimmed = editUsername.trim();
    if (!trimmed) {
      if (isBlur) {
        setEditUsername(username);
        setUsernameError("");
        setIsEditingUsername(false);
      } else {
        setUsernameError("Display Name cannot be empty");
      }
      return;
    }
    if (trimmed.length < 3 || trimmed.length > 80) {
      setUsernameError("Display Name must be 3-80 characters");
      if (isBlur) {
        setEditUsername(username);
        setIsEditingUsername(false);
      }
      return;
    }
    if (trimmed === username) {
      setUsernameError("");
      setIsEditingUsername(false);
      return;
    }
    setIsSavingUsername(true);
    try {
      const response = await fetch("/api/profile/display-name", {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ displayName: trimmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Failed to update Display Name");
      }
      const nextName = String(data?.user?.displayName || trimmed).trim();
      setUsername(nextName);
      setEditUsername(nextName);
      setUsernameError("");
      setIsEditingUsername(false);
      const existingUser = JSON.parse(localStorage.getItem("auth_user") || "{}");
      localStorage.setItem("auth_user", JSON.stringify({ ...existingUser, ...data.user }));
    } catch (error) {
      const message = getErrorMessage(error, "Failed to update Display Name");
      if (isBlur) {
        setEditUsername(username);
        setIsEditingUsername(false);
      }
      setUsernameError(message);
    } finally {
      setIsSavingUsername(false);
    }
  };

  const startEditing = () => {
    setEditUsername(username);
    setUsernameError("");
    setIsEditingUsername(true);
  };
  
  // Models State
  const [llmConfig, setLlmConfig] = useState<ModelConfig>({ id: "", key: "", url: "", autoConcat: true });
  const [imgConfig, setImgConfig] = useState<ModelConfig>({ id: "", key: "", url: "", autoConcat: true });
  const [llmHasSavedKey, setLlmHasSavedKey] = useState(false);
  const [imgHasSavedKey, setImgHasSavedKey] = useState(false);
  const [modelConfigNotice, setModelConfigNotice] = useState("");
  const [providerMode, setProviderMode] = useState<"managed" | "custom">(IS_OSS_MODE ? "custom" : "managed");
  const [systemCredits, setSystemCredits] = useState(200000);
  const [cloudDriveUsedBytes, setCloudDriveUsedBytes] = useState(0);
  const [cloudDriveQuotaBytes, setCloudDriveQuotaBytes] = useState(5 * 1024 * 1024 * 1024);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [rewardPerInvite, setRewardPerInvite] = useState(50000);
  const [invitedCount, setInvitedCount] = useState(0);
  const [inviteRewardTotal, setInviteRewardTotal] = useState(0);
  const [invitedUsers, setInvitedUsers] = useState<Array<{ id: number; email: string; displayName: string; createdAt: number }>>([]);

  type TestStatus = "idle" | "testing" | "saving" | "success" | "error";
  const [llmTestStatus, setLlmTestStatus] = useState<TestStatus>("idle");
  const [imgTestStatus, setImgTestStatus] = useState<TestStatus>("idle");
  const [saveStatus, setSaveStatus] = useState<TestStatus>("idle");

  const llmFinalEndpoint = buildModelEndpoint(llmConfig.url, llmConfig.autoConcat, "chat/completions");
  const imgFinalEndpoint = buildModelEndpoint(imgConfig.url, imgConfig.autoConcat, "images/generations");
  const isManagedProviderMode = providerMode === "managed";
  const cloudUsedGb = (cloudDriveUsedBytes / (1024 * 1024 * 1024)).toFixed(2);
  const cloudQuotaGb = (cloudDriveQuotaBytes / (1024 * 1024 * 1024)).toFixed(0);
  const cloudUsagePercent = cloudDriveQuotaBytes > 0
    ? Math.min(100, (cloudDriveUsedBytes / cloudDriveQuotaBytes) * 100)
    : 0;

  const getAuthHeaders = () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      throw new Error("Please sign in again");
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  const fetchModelConfigs = async () => {
    const response = await fetch("/api/model-configs", {
      headers: getAuthHeaders(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || "Failed to load model configs");
    }
    return data as ModelConfigResponse;
  };

  const loadModelConfigs = async () => {
    try {
      const data = await fetchModelConfigs();
      setLlmConfig({
        id: data.llm.id || "",
        key: "",
        url: data.llm.url || "",
        autoConcat: data.llm.autoConcat !== false,
      });
      setImgConfig({
        id: data.img.id || "",
        key: "",
        url: data.img.url || "",
        autoConcat: data.img.autoConcat !== false,
      });
      setLlmHasSavedKey(Boolean(data.llm.hasKey));
      setImgHasSavedKey(Boolean(data.img.hasKey));
      if (data.providerMode === "custom" || data.providerMode === "managed") {
        setProviderMode(IS_OSS_MODE ? "custom" : data.providerMode);
      }
    } catch (error) {
      setModelConfigNotice(getErrorMessage(error, "Failed to load model configs"));
    }
  };

  const loadUsage = async () => {
    try {
      const response = await fetch("/api/profile/usage", {
        headers: getAuthHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as { error?: string })?.error || "Failed to load usage");
      }
      const payload = data as UsageResponse;
      setSystemCredits(Number(payload.usage?.systemCredits) || 0);
      setCloudDriveUsedBytes(Number(payload.usage?.cloudDriveUsedBytes) || 0);
      setCloudDriveQuotaBytes(Number(payload.usage?.cloudDriveQuotaBytes) || 5 * 1024 * 1024 * 1024);
    } catch (_error) {}
  };

  const loadInvite = async () => {
    try {
      const response = await fetch("/api/profile/invite", {
        headers: getAuthHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((data as { error?: string })?.error || "Failed to load invite info");
      }
      const payload = data as InviteResponse;
      setInviteCode(String(payload.invite?.inviteCode || ""));
      setInviteLink(String(payload.invite?.inviteLink || ""));
      setRewardPerInvite(Number(payload.invite?.rewardPerInvite) || 50000);
      setInvitedCount(Number(payload.invite?.invitedCount) || 0);
      setInviteRewardTotal(Number(payload.invite?.totalRewardCredits) || 0);
      setInvitedUsers(Array.isArray(payload.invite?.invitedUsers) ? payload.invite!.invitedUsers! : []);
    } catch (_error) {}
  };

  useEffect(() => {
    const cachedUser = JSON.parse(localStorage.getItem("auth_user") || "{}");
    const cachedDisplayName = String(cachedUser?.displayName || "").trim();
    if (cachedDisplayName) {
      setUsername(cachedDisplayName);
      setEditUsername(cachedDisplayName);
    }
    const loadProfileUser = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          headers: getAuthHeaders(),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return;
        const remoteName = String(data?.user?.displayName || "").trim();
        if (remoteName) {
          setUsername(remoteName);
          setEditUsername(remoteName);
        }
        if (data?.user) {
          localStorage.setItem("auth_user", JSON.stringify(data.user));
        }
      } catch (_error) {}
    };
    void loadProfileUser();
    void loadModelConfigs();
    void loadInstalledPlugins();
    void loadTemplates();
    void loadUsage();
    void loadInvite();
  }, []);

  const handleCopyText = async (text: string, label: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch (_error) {
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  const handleSaveConfig = async () => {
    setModelConfigNotice("");
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/model-configs", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ providerMode: IS_OSS_MODE ? "custom" : providerMode, llm: llmConfig, img: imgConfig }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Save failed");
      }

      setLlmHasSavedKey(Boolean(data?.llm?.hasKey));
      setImgHasSavedKey(Boolean(data?.img?.hasKey));
      if (data?.providerMode === "custom" || data?.providerMode === "managed") {
        setProviderMode(IS_OSS_MODE ? "custom" : data.providerMode);
      }
      setSaveStatus("success");
      setModelConfigNotice("Configurations saved successfully.");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (error) {
      setSaveStatus("error");
      setModelConfigNotice(getErrorMessage(error, "Save failed"));
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const handleTestConnection = async (type: "llm" | "img") => {
    const setStatus = type === "llm" ? setLlmTestStatus : setImgTestStatus;
    const config = type === "llm" ? llmConfig : imgConfig;
    setModelConfigNotice("");
    setStatus("testing");

    try {
      const response = await fetch("/api/model-configs/test", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ type, config }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Connection test failed");
      }
      setStatus("success");
      setModelConfigNotice(data?.message || "Health check succeeded.");
    } catch (error) {
      setStatus("error");
      setModelConfigNotice(getErrorMessage(error, "Connection test failed"));
    } finally {
      setTimeout(() => {
        setStatus("idle");
      }, 3000);
    }
  };

  const [plugins, setPlugins] = useState<InstalledPlugin[]>(() =>
    INITIAL_PLUGINS.map((item) => ({ ...item })),
  );
  const [templates, setTemplates] = useState<PrivateTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    navigate("/login");
  };

  const loadInstalledPlugins = async () => {
    try {
      const response = await fetch("/api/plugins/me", {
        headers: getAuthHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Failed to load plugins");
      }
      const next = Array.isArray(data?.plugins) ? data.plugins : [];
      setPlugins(next);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to load plugins"));
    }
  };

  const togglePlugin = async (id: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/plugins/${id}/toggle`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Failed to toggle plugin");
      }
      setPlugins((prev) => prev.map((plugin) => (plugin.id === id ? { ...plugin, enabled } : plugin)));
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to toggle plugin"));
    }
  };

  const uninstallPlugin = async (id: string) => {
    try {
      const response = await fetch(`/api/plugins/${id}/install`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Failed to uninstall plugin");
      }
      setPlugins((prev) => prev.filter((plugin) => plugin.id !== id));
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to uninstall plugin"));
    }
  };

  const loadTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const response = await fetch("/api/style-presets", {
        headers: getAuthHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Failed to load templates");
      }
      const privatePresets = Array.isArray(data.privatePresets) ? data.privatePresets : [];
      const normalized = privatePresets
        .filter((item: unknown) => item && typeof item === "object")
        .map((item: unknown, index: number) => {
          const preset = item as { id?: unknown; name?: unknown; description?: unknown; updatedAt?: unknown };
          const name = String(preset.name || "").trim();
          if (!name) return null;
          return {
            id: String(preset.id || `private-template-${index + 1}`),
            name,
            description: String(preset.description || "").trim(),
            updatedAt: Number(preset.updatedAt) || undefined,
          };
        })
        .filter(Boolean) as PrivateTemplate[];
      setTemplates(normalized);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to load templates"));
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const uninstallTemplate = async (id: string) => {
    try {
      const response = await fetch(`/api/style-presets/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Failed to delete template");
      }
      setTemplates((prev) => prev.filter((template) => template.id !== id));
      toast.success("Template deleted");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to delete template"));
    }
  };

  return (
    <>
      <Header />
      <div className="h-screen box-border bg-[#fafafa] pt-28 pb-12 px-6 sm:px-12 relative overflow-hidden flex justify-center">
      {/* Liquid Glass Background Elements */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-[#ff6b35]/20 to-[#ff8a5c]/0 blur-[100px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-[200px] rotate-45 bg-gradient-to-tl from-[#ff8a5c]/20 to-transparent blur-[120px] pointer-events-none" />

      <div className="w-full max-w-6xl flex flex-col md:flex-row gap-8 relative z-10 h-full">
        
        {/* Left Sidebar */}
        <motion.div 
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full md:w-80 flex-shrink-0 md:h-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          <div className="bg-white/60 backdrop-blur-2xl border border-white/80 rounded-[32px] p-6 shadow-[0_8px_32px_0_rgba(255,107,53,0.05)] min-h-full flex flex-col">
            <div className="flex flex-col gap-2 mb-8 px-4">
              <h2 className="font-bold text-slate-800 text-xl">{username}</h2>
              <div className="inline-block px-3 py-1 bg-[#ff6b35]/10 rounded-lg w-max">
                <p className="text-xs font-bold text-[#ff6b35] uppercase tracking-wider">Free Member</p>
              </div>
            </div>

            <nav className="flex flex-col gap-2 flex-1">
              {PROFILE_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 font-bold text-sm ${
                      isActive 
                        ? "bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] text-white shadow-md shadow-[#ff6b35]/20 scale-[1.02]" 
                        : "text-slate-500 hover:bg-white/80 hover:text-slate-800 hover:scale-[1.02]"
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-current"}`} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>

            <div className="mt-8 pt-6 border-t border-[#ff6b35]/10">
              <button 
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-[#ff6b35]/10 hover:bg-[#ff6b35]/20 text-[#ff6b35] rounded-2xl font-bold transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span>Sign Out of FacetDeck</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Right Content Area */}
        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="flex-1 bg-white/60 backdrop-blur-2xl border border-white/80 rounded-[40px] shadow-[0_12px_40px_0_rgba(0,0,0,0.05)] overflow-hidden flex flex-col h-full"
        >
          <div className="flex-1 overflow-y-auto h-full [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200/60 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300/80 transition-colors">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.4 }}
                className="p-8 sm:p-12 min-h-full"
              >
              
              {/* --- Profile Tab --- */}
              {activeTab === "profile" && (
                <div className="space-y-12">
                  <h2 className="text-3xl font-extrabold text-slate-800">Account Details</h2>
                  
                  <div className="space-y-8">
                    {/* Username Update */}
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-bold text-slate-500 uppercase tracking-wider">Display Name</label>
                      <div className="flex items-center gap-3 relative">
                        {isEditingUsername ? (
                          <div className="flex flex-col w-full max-w-xs gap-1">
                            <div className="flex items-center gap-2">
                              <input 
                                type="text" 
                                value={editUsername}
                                onChange={(e) => {
                                  setEditUsername(e.target.value);
                                  setUsernameError("");
                                }}
                                onBlur={() => {
                                  void handleSaveUsername(true);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    void handleSaveUsername(false);
                                  }
                                  if (e.key === 'Escape') {
                                    setEditUsername(username);
                                    setUsernameError("");
                                    setIsEditingUsername(false);
                                  }
                                }}
                                autoFocus
                                disabled={isSavingUsername}
                                className={`flex-1 bg-transparent border-b-2 ${usernameError ? 'border-red-500 text-red-500' : 'border-[#ff6b35] text-slate-800'} text-3xl font-extrabold outline-none py-1 transition-colors`}
                              />
                              <button 
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  void handleSaveUsername(false);
                                }}
                                disabled={isSavingUsername}
                                className={`p-2 ${usernameError ? 'text-red-500 hover:bg-red-500/10' : 'text-[#ff6b35] hover:bg-[#ff6b35]/10'} rounded-xl transition-colors shrink-0`}
                              >
                                <Check className="w-6 h-6" />
                              </button>
                            </div>
                            <AnimatePresence>
                              {usernameError && (
                                <motion.span 
                                  initial={{ opacity: 0, x: -5 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: -5 }}
                                  className="text-red-500 text-sm font-semibold absolute top-full left-0 mt-1"
                                >
                                  {usernameError}
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 group cursor-pointer" onClick={startEditing}>
                            <h3 className="text-3xl font-extrabold text-slate-800">{username}</h3>
                            <button 
                              className="p-2 text-slate-800 hover:text-[#ff6b35] hover:bg-[#ff6b35]/10 rounded-xl transition-colors"
                              title="Edit Display Name"
                            >
                              <Pencil className="w-5 h-5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Capacity Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-gradient-to-br from-[#ff6b35]/10 to-transparent rounded-[24px] p-8 border border-[#ff6b35]/20 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform duration-500">
                          <Zap className="w-24 h-24 text-[#ff6b35]" />
                        </div>
                        <h3 className="text-sm font-bold text-[#ff6b35] mb-2 uppercase tracking-wider">System Credits</h3>
                        <div className="text-4xl font-extrabold text-slate-800 mb-2">{systemCredits.toLocaleString()}</div>
                        <p className="text-sm font-medium text-slate-500">Available tokens for generation</p>
                      </div>
                      
                      <div className="bg-gradient-to-bl from-slate-100 to-transparent rounded-[24px] p-8 border border-slate-200 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform duration-500">
                          <Blocks className="w-24 h-24 text-slate-800" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-500 mb-2 uppercase tracking-wider">Cloud Drive Usage</h3>
                        <div className="text-4xl font-extrabold text-slate-800 mb-2">{cloudUsedGb} <span className="text-xl text-slate-400">/ {cloudQuotaGb} GB</span></div>
                        <div className="w-full h-2 bg-slate-200 rounded-full mt-4 overflow-hidden">
                          <div className="h-full bg-slate-800 rounded-full transition-all" style={{ width: `${cloudUsagePercent}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Invite Program */}
                    <div className="bg-white/80 rounded-[28px] p-6 border border-slate-200/80 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                        <div>
                          <h3 className="text-xl font-extrabold text-slate-800">Invite Program</h3>
                          <p className="text-sm text-slate-500 font-medium">Invite friends and earn {rewardPerInvite.toLocaleString()} credits per successful signup.</p>
                        </div>
                        <div className="rounded-xl bg-[#ff6b35]/10 text-[#ff6b35] px-4 py-2 text-sm font-bold">
                          Total earned: {inviteRewardTotal.toLocaleString()} credits
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">My Invite Code</p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-sm font-bold text-slate-800 bg-white border border-slate-200 rounded-xl px-3 py-2">{inviteCode || "-"}</code>
                            <button
                              type="button"
                              onClick={() => {
                                void handleCopyText(inviteCode, "Invite code");
                              }}
                              className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-[#ff6b35] hover:border-[#ff6b35]/40 transition-colors"
                              title="Copy invite code"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">My Invite Link</p>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl px-3 py-2 truncate">{inviteLink || "-"}</code>
                            <button
                              type="button"
                              onClick={() => {
                                void handleCopyText(inviteLink, "Invite link");
                              }}
                              className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-[#ff6b35] hover:border-[#ff6b35]/40 transition-colors"
                              title="Copy invite link"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <Users className="w-4 h-4 text-[#ff6b35]" />
                            Invited users
                          </p>
                          <span className="text-xs font-semibold text-slate-500">{invitedCount} joined</span>
                        </div>
                        {invitedUsers.length === 0 ? (
                          <p className="text-sm text-slate-500">No invited users yet. Share your code to start earning rewards.</p>
                        ) : (
                          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                            {invitedUsers.map((item) => (
                              <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-800 truncate">{item.displayName}</p>
                                  <p className="text-xs text-slate-500 truncate">{item.email}</p>
                                </div>
                                <span className="text-xs font-semibold text-[#ff6b35] whitespace-nowrap">+{rewardPerInvite.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* --- Models Tab --- */}
              {activeTab === "models" && (
                <div className="space-y-10">
                  <h2 className="text-3xl font-extrabold text-slate-800">Model Configuration</h2>
                  <div className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-800">Use FacetDeck managed models</p>
                      <p className="text-xs text-slate-500">
                        {IS_OSS_MODE
                          ? "OSS mode is enabled. Managed providers are disabled and only custom credentials are available."
                          : "Turn on to use official shared providers. Turn off to use your own model credentials."}
                      </p>
                    </div>
                    <SettingSwitch
                      checked={isManagedProviderMode}
                      onCheckedChange={(checked) => setProviderMode(checked ? "managed" : "custom")}
                      disabled={IS_OSS_MODE}
                      label={isManagedProviderMode ? "Managed" : "Custom"}
                    />
                  </div>
                  {modelConfigNotice && (
                    <div className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-3 text-sm font-semibold text-slate-600">
                      {modelConfigNotice}
                    </div>
                  )}
                  {isManagedProviderMode && (
                    <div className="rounded-2xl border border-[#ff6b35]/20 bg-[#ff6b35]/5 px-5 py-4 text-sm font-semibold text-[#ff6b35]">
                      Managed mode is enabled. Official model configuration is applied automatically.
                    </div>
                  )}
                  
                  {!isManagedProviderMode && (
                  <div className="grid grid-cols-1 gap-8">
                    {/* LLM Config */}
                    <div className="bg-white/80 rounded-[32px] p-8 border border-slate-100 shadow-sm">
                      <div className="flex items-center justify-between gap-4 mb-8">
                        <div>
                          <h3 className="text-xl font-bold text-slate-800">LLM Provider</h3>
                          <p className="text-sm font-medium text-slate-500">Configure your text generation model</p>
                        </div>
                        <button 
                          onClick={() => handleTestConnection("llm")}
                          disabled={llmTestStatus === "testing"}
                          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all
                            ${llmTestStatus === "idle" ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : ""}
                            ${llmTestStatus === "testing" ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}
                            ${llmTestStatus === "success" ? "bg-emerald-500/10 text-emerald-600" : ""}
                            ${llmTestStatus === "error" ? "bg-red-500/10 text-red-600" : ""}
                          `}
                        >
                          {llmTestStatus === "idle" && <><Activity className="w-4 h-4" /><span>Test Connection</span></>}
                          {llmTestStatus === "testing" && <><Loader2 className="w-4 h-4 animate-spin" /><span>Testing...</span></>}
                          {llmTestStatus === "success" && <><CheckCircle2 className="w-4 h-4" /><span>Connected</span></>}
                          {llmTestStatus === "error" && <><XCircle className="w-4 h-4" /><span>Failed</span></>}
                        </button>
                      </div>
                      
                      <div className="space-y-5">
                        <div>
                          <label className="block text-sm font-bold text-slate-500 mb-2 pl-1">Model ID</label>
                          <input type="text" disabled={isManagedProviderMode} placeholder="e.g. gpt-4-turbo" value={llmConfig.id} onChange={e => setLlmConfig({...llmConfig, id: e.target.value})} className="w-full bg-slate-50/50 border border-slate-200 focus:border-[#ff6b35]/50 focus:bg-white rounded-xl px-5 py-3.5 text-slate-800 outline-none transition-all font-medium disabled:opacity-70 disabled:cursor-not-allowed" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-slate-500 mb-2 pl-1">API Key</label>
                          <input type="password" disabled={isManagedProviderMode} placeholder="sk-..." value={llmConfig.key} onChange={e => setLlmConfig({...llmConfig, key: e.target.value})} className="w-full bg-slate-50/50 border border-slate-200 focus:border-[#ff6b35]/50 focus:bg-white rounded-xl px-5 py-3.5 text-slate-800 outline-none transition-all font-medium disabled:opacity-70 disabled:cursor-not-allowed" />
                          {llmHasSavedKey && !llmConfig.key && (
                            <p className="mt-2 text-xs font-medium text-slate-500">
                              Existing key is saved. Leave blank to keep it unchanged.
                            </p>
                          )}
                        </div>
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3 pl-1">
                            <label className="block text-sm font-bold text-slate-500">API Base URL</label>
                            <SettingSwitch
                              checked={llmConfig.autoConcat}
                              onCheckedChange={(checked) => setLlmConfig({ ...llmConfig, autoConcat: checked })}
                              disabled={isManagedProviderMode}
                              label="Auto append"
                            />
                          </div>
                          <input type="text" disabled={isManagedProviderMode} placeholder="https://api.openai.com/v1" value={llmConfig.url} onChange={e => setLlmConfig({...llmConfig, url: e.target.value})} className="w-full bg-slate-50/50 border border-slate-200 focus:border-[#ff6b35]/50 focus:bg-white rounded-xl px-5 py-3.5 text-slate-800 outline-none transition-all font-medium disabled:opacity-70 disabled:cursor-not-allowed" />
                          <p className="mt-2 text-xs font-medium text-slate-500 break-all">
                            Final endpoint: {llmFinalEndpoint || "(please enter API URL)"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Image Model Config */}
                    <div className="bg-white/80 rounded-[32px] p-8 border border-slate-100 shadow-sm">
                      <div className="flex items-center justify-between gap-4 mb-8">
                        <div>
                          <h3 className="text-xl font-bold text-slate-800">Text-to-Image Provider</h3>
                          <p className="text-sm font-medium text-slate-500">Configure your visual generation model</p>
                        </div>
                        <button 
                          onClick={() => handleTestConnection("img")}
                          disabled={imgTestStatus === "testing"}
                          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all
                            ${imgTestStatus === "idle" ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : ""}
                            ${imgTestStatus === "testing" ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}
                            ${imgTestStatus === "success" ? "bg-emerald-500/10 text-emerald-600" : ""}
                            ${imgTestStatus === "error" ? "bg-red-500/10 text-red-600" : ""}
                          `}
                        >
                          {imgTestStatus === "idle" && <><Activity className="w-4 h-4" /><span>Test Connection</span></>}
                          {imgTestStatus === "testing" && <><Loader2 className="w-4 h-4 animate-spin" /><span>Testing...</span></>}
                          {imgTestStatus === "success" && <><CheckCircle2 className="w-4 h-4" /><span>Connected</span></>}
                          {imgTestStatus === "error" && <><XCircle className="w-4 h-4" /><span>Failed</span></>}
                        </button>
                      </div>
                      
                      <div className="space-y-5">
                        <div>
                          <label className="block text-sm font-bold text-slate-500 mb-2 pl-1">Model ID</label>
                          <input type="text" disabled={isManagedProviderMode} placeholder="e.g. midjourney-v6" value={imgConfig.id} onChange={e => setImgConfig({...imgConfig, id: e.target.value})} className="w-full bg-slate-50/50 border border-slate-200 focus:border-[#ff6b35]/50 focus:bg-white rounded-xl px-5 py-3.5 text-slate-800 outline-none transition-all font-medium disabled:opacity-70 disabled:cursor-not-allowed" />
                        </div>
                        <div>
                          <label className="block text-sm font-bold text-slate-500 mb-2 pl-1">API Key</label>
                          <input type="password" disabled={isManagedProviderMode} placeholder="sk-..." value={imgConfig.key} onChange={e => setImgConfig({...imgConfig, key: e.target.value})} className="w-full bg-slate-50/50 border border-slate-200 focus:border-[#ff6b35]/50 focus:bg-white rounded-xl px-5 py-3.5 text-slate-800 outline-none transition-all font-medium disabled:opacity-70 disabled:cursor-not-allowed" />
                          {imgHasSavedKey && !imgConfig.key && (
                            <p className="mt-2 text-xs font-medium text-slate-500">
                              Existing key is saved. Leave blank to keep it unchanged.
                            </p>
                          )}
                        </div>
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-3 pl-1">
                            <label className="block text-sm font-bold text-slate-500">API Base URL</label>
                            <SettingSwitch
                              checked={imgConfig.autoConcat}
                              onCheckedChange={(checked) => setImgConfig({ ...imgConfig, autoConcat: checked })}
                              disabled={isManagedProviderMode}
                              label="Auto append"
                            />
                          </div>
                          <input type="text" disabled={isManagedProviderMode} placeholder="https://api.custom.com/v1" value={imgConfig.url} onChange={e => setImgConfig({...imgConfig, url: e.target.value})} className="w-full bg-slate-50/50 border border-slate-200 focus:border-[#ff6b35]/50 focus:bg-white rounded-xl px-5 py-3.5 text-slate-800 outline-none transition-all font-medium disabled:opacity-70 disabled:cursor-not-allowed" />
                          <p className="mt-2 text-xs font-medium text-slate-500 break-all">
                            Final endpoint: {imgFinalEndpoint || "(please enter API URL)"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-4">
                      <button 
                        onClick={handleSaveConfig}
                        disabled={saveStatus === "saving"}
                        className={`px-8 py-4 rounded-2xl font-bold transition-all flex items-center gap-2 
                          ${saveStatus === "idle" ? "bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] hover:shadow-lg hover:shadow-[#ff6b35]/30 text-white" : ""}
                          ${saveStatus === "saving" ? "bg-slate-100 text-slate-400 cursor-not-allowed" : ""}
                          ${saveStatus === "success" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30" : ""}
                          ${saveStatus === "error" ? "bg-red-500 text-white shadow-lg shadow-red-500/30" : ""}
                        `}
                      >
                        {saveStatus === "idle" && <><Save className="w-5 h-5" /><span>Save Configurations</span></>}
                        {saveStatus === "saving" && <><Loader2 className="w-5 h-5 animate-spin" /><span>Saving...</span></>}
                        {saveStatus === "success" && <><CheckCircle2 className="w-5 h-5" /><span>Successfully Saved</span></>}
                        {saveStatus === "error" && <><XCircle className="w-5 h-5" /><span>Save Failed</span></>}
                      </button>
                    </div>
                    <p className="text-xs font-medium text-slate-500">
                      Connection test uses a preset health-check prompt/message and validates provider response. Health checks send real requests, so use with caution. Usage-based models may incur additional costs, which you are responsible for.
                    </p>
                  </div>
                  )}
                </div>
              )}

              {/* --- Plugins Tab --- */}
              {activeTab === "plugins" && (
                <div className="space-y-8">
                  <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-8 gap-6">
                    <div>
                      <h2 className="text-3xl font-extrabold text-slate-800 mb-2">My Plugins</h2>
                      <p className="text-slate-500 font-medium">Manage extensions installed from the repository.</p>
                    </div>
                    {COMMUNITY_FEATURE_ENABLED && (
                      <div className="w-full sm:w-auto">
                        <button 
                          onClick={() => navigate('/community', { state: { tab: 'plugins' } })}
                          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] hover:shadow-lg hover:shadow-[#ff6b35]/30 text-white rounded-2xl font-bold transition-all"
                        >
                          <span>+ Plugins</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4">
                    {plugins.length > 0 ? plugins.map((plugin) => (
                      <div key={plugin.id} className="bg-white/80 border border-slate-100 rounded-[24px] p-6 flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-slate-800 mb-1">
                            {plugin.name}
                            <span className="ml-2 text-xs font-semibold text-slate-400">v{plugin.version}</span>
                          </h3>
                          <p className="text-slate-500 text-sm font-medium">{plugin.description || "Community plugin"}</p>
                          <p className="mt-2 text-xs text-slate-400">by {plugin.author || "Community Author"}</p>
                          {plugin.requiresReauth && (
                            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                              New permissions detected: {(plugin.missingPermissions || []).join(", ")}.{COMMUNITY_FEATURE_ENABLED ? " Please re-authorize this plugin via Community." : " Please reinstall this plugin locally to re-authorize."}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          {plugin.requiresReauth && COMMUNITY_FEATURE_ENABLED && (
                            <button
                              onClick={() => navigate('/community', { state: { tab: 'plugins' } })}
                              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors bg-amber-100 text-amber-800 hover:bg-amber-200"
                            >
                              Re-authorize
                            </button>
                          )}
                          <button 
                            onClick={() => {
                              void togglePlugin(plugin.id, !plugin.enabled);
                            }}
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors ${
                              plugin.enabled 
                                ? "bg-slate-100 text-slate-700 hover:bg-slate-200" 
                                : "bg-[#ff6b35]/10 text-[#ff6b35] hover:bg-[#ff6b35]/20"
                            }`}
                          >
                            <Power className="w-4 h-4" />
                            {plugin.enabled ? "Disable" : "Enable"}
                          </button>
                          <button 
                            onClick={() => {
                              void uninstallPlugin(plugin.id);
                            }}
                            className="p-2.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Uninstall"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    )) : (
                      <div className="py-16 text-center text-slate-500 font-medium bg-white/50 rounded-[32px] border border-dashed border-slate-200">
                        No plugins installed yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* --- Templates Tab --- */}
              {activeTab === "templates" && (
                <div className="space-y-8">
                  <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-8 gap-6">
                    <div>
                      <h2 className="text-3xl font-extrabold text-slate-800 mb-2">My Templates</h2>
                      <p className="text-slate-500 font-medium">Manage private templates in your library.</p>
                    </div>
                    {COMMUNITY_FEATURE_ENABLED && (
                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <button 
                          onClick={() => navigate('/community', { state: { tab: 'templates' } })}
                          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] hover:shadow-lg hover:shadow-[#ff6b35]/30 text-white rounded-2xl font-bold transition-all"
                        >
                          <span>+ Templates</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4">
                    {isLoadingTemplates ? (
                      <div className="py-16 text-center text-slate-500 font-medium bg-white/50 rounded-[32px] border border-dashed border-slate-200">
                        Loading templates...
                      </div>
                    ) : templates.length > 0 ? templates.map((template) => (
                      <div key={template.id} className="bg-white/80 border border-slate-100 rounded-[24px] p-6 flex flex-col sm:flex-row gap-6 justify-between items-start sm:items-center shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-slate-800 mb-1">{template.name}</h3>
                          <p className="text-slate-500 text-sm font-medium">{template.description || "Private template preset"}</p>
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <button 
                            onClick={() =>
                              navigate("/editor", {
                                state: {
                                  newProject: true,
                                  openWizardSetup: true,
                                  preferPresetMode: true,
                                  presetId: template.id,
                                  presetName: template.name,
                                },
                              })
                            }
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors bg-[#ff6b35]/10 text-[#ff6b35] hover:bg-[#ff6b35]/20"
                          >
                            Use
                          </button>
                          <button 
                            onClick={() => {
                              void uninstallTemplate(template.id);
                            }}
                            className="p-2.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Uninstall"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    )) : (
                      <div className="py-16 text-center text-slate-500 font-medium bg-white/50 rounded-[32px] border border-dashed border-slate-200">
                        No templates in your library yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* --- Contact Tab --- */}
              {activeTab === "contact" && (
                <div className="space-y-8 h-full flex flex-col">
                  <div>
                    <h2 className="text-3xl font-extrabold text-slate-800 mb-2">Contact Developers</h2>
                    <p className="text-slate-500 font-medium">We'd love to hear from you.</p>
                  </div>
                  
                  <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 bg-gradient-to-b from-white/80 to-slate-50/80 rounded-[32px] border border-slate-100">
                    <div className="w-20 h-20 rounded-[24px] bg-gradient-to-br from-[#ff6b35] to-[#ff8a5c] flex items-center justify-center shadow-lg shadow-[#ff6b35]/20 mb-10 transform -rotate-6">
                      <Mail className="w-10 h-10 text-white" />
                    </div>
                    
                    <div className="space-y-10 text-center max-w-2xl">
                      <div>
                        <p className="text-xl font-bold text-slate-800 leading-relaxed mb-1">
                          Should you wish to get in touch with our development team, please feel free to send an email to <a href="mailto:shaungladtoseeu@gmail.com" className="text-[#ff6b35] hover:underline decoration-2 underline-offset-4">shaungladtoseeu@gmail.com</a>. We warmly welcome your correspondence.
                        </p>
                      </div>

                      <div className="w-16 h-1 bg-slate-200 rounded-full mx-auto" />

                      <div>
                        <p className="text-lg font-bold text-slate-600 leading-relaxed mb-1">
                          如需联系开发团队，请发送邮件至 <a href="mailto:shaungladtoseeu@gmail.com" className="text-[#ff6b35] hover:underline decoration-2 underline-offset-4">shaungladtoseeu@gmail.com</a>。期待您的来信。
                        </p>
                      </div>

                      <div className="w-16 h-1 bg-slate-200 rounded-full mx-auto" />

                      <div>
                        <p className="text-lg font-bold text-slate-600 leading-relaxed">
                          開発チームへのご連絡は、<a href="mailto:shaungladtoseeu@gmail.com" className="text-[#ff6b35] hover:underline decoration-2 underline-offset-4">shaungladtoseeu@gmail.com</a> までメールをお送りください。皆様からのご連絡を心よりお待ちしております。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
    </>
  );
}