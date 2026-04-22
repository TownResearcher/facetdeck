import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate, useLocation } from "react-router";
import { Check, Heart, MessageSquare, X, UploadCloud, FileJson, FileCode, Image as ImageIcon, Code2, ArrowRight } from "lucide-react";
import { Header } from "../components/Header";
import { communityStore, useCommunityPosts, Tab, ViewMode } from "../store/communityStore";
import { normalizePluginManifest } from "../types/plugins";

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });

const fileToText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });

export function Community() {
  type TemplateOption = {
    id: string;
    name: string;
    description?: string;
    vibe?: string;
    layout?: string;
    signatureElements?: string;
    animation?: string;
    colors?: {
      primary: string;
      secondary: string;
      bg: string;
      text: string;
    };
    fonts?: {
      title: string;
      body: string;
    };
  };

  const navigate = useNavigate();
  const location = useLocation();
  const normalizeTab = (tab: unknown): Tab => {
    if (tab === "skills") return "templates";
    if (tab === "plugins" || tab === "templates" || tab === "discussions") return tab;
    return "plugins";
  };
  const [activeTab, setActiveTab] = useState<Tab>(() => normalizeTab(location.state?.tab));

  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(normalizeTab(location.state.tab));
    }
  }, [location.state]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  
  // States for interactivity
  const posts = useCommunityPosts();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostDescription, setNewPostDescription] = useState("");
  const [newPostHasFile, setNewPostHasFile] = useState(false);
  const [newPostImageFile, setNewPostImageFile] = useState<File | null>(null);
  const [templateLibrary, setTemplateLibrary] = useState<TemplateOption[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [isLoadingTemplateLibrary, setIsLoadingTemplateLibrary] = useState(false);
  const [pluginManifestText, setPluginManifestText] = useState("");
  const [pluginEntryHtml, setPluginEntryHtml] = useState("");
  const [pluginManifestFile, setPluginManifestFile] = useState<File | null>(null);
  const [pluginEntryHtmlFile, setPluginEntryHtmlFile] = useState<File | null>(null);
  const [pluginDraftError, setPluginDraftError] = useState("");

  const selectedTemplates = templateLibrary.filter((item) => selectedTemplateIds.includes(item.id));

  const loadTemplateLibrary = async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) {
      setTemplateLibrary([]);
      return;
    }
    setIsLoadingTemplateLibrary(true);
    try {
      const response = await fetch("/api/style-presets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        setTemplateLibrary([]);
        return;
      }
      const privatePresets = Array.isArray(data.privatePresets) ? data.privatePresets : [];
      const normalized: TemplateOption[] = privatePresets
        .filter((item: unknown) => item && typeof item === "object")
        .map((item: unknown, index: number) => {
          const preset = item as {
            id?: unknown;
            name?: unknown;
            description?: unknown;
            vibe?: unknown;
            layout?: unknown;
            signatureElements?: unknown;
            animation?: unknown;
            colors?: unknown;
            fonts?: unknown;
          };
          const colors = preset.colors && typeof preset.colors === "object"
            ? preset.colors as Record<string, unknown>
            : {};
          const fonts = preset.fonts && typeof preset.fonts === "object"
            ? preset.fonts as Record<string, unknown>
            : {};
          return {
            id: String(preset.id || `private-template-${index + 1}`),
            name: String(preset.name || "").trim(),
            description: String(preset.description || "").trim(),
            vibe: String(preset.vibe || "").trim(),
            layout: String(preset.layout || "").trim(),
            signatureElements: String(preset.signatureElements || "").trim(),
            animation: String(preset.animation || "").trim(),
            colors: {
              primary: String(colors.primary || "#ff6b35"),
              secondary: String(colors.secondary || "#ff8a5c"),
              bg: String(colors.bg || "#0f172a"),
              text: String(colors.text || "#f8fafc"),
            },
            fonts: {
              title: String(fonts.title || "Manrope"),
              body: String(fonts.body || "Inter"),
            },
          };
        })
        .filter((item: TemplateOption) => item.name);
      setTemplateLibrary(normalized);
    } finally {
      setIsLoadingTemplateLibrary(false);
    }
  };

  useEffect(() => {
    if (isCreateModalOpen && activeTab === "templates") {
      void loadTemplateLibrary();
    }
  }, [isCreateModalOpen, activeTab]);

  useEffect(() => {
    setSelectedTemplateIds((prev) => prev.filter((id) => templateLibrary.some((item) => item.id === id)));
  }, [templateLibrary]);

  const handleOpenCreateModal = () => {
    setIsCreateModalOpen(true);
    setNewPostTitle("");
    setNewPostDescription("");
    setNewPostHasFile(false);
    setNewPostImageFile(null);
    setSelectedTemplateIds([]);
    setPluginDraftError("");
    if (activeTab === "plugins") {
      setPluginManifestText("");
      setPluginEntryHtml("");
      setPluginManifestFile(null);
      setPluginEntryHtmlFile(null);
    } else {
      setPluginManifestText("");
      setPluginEntryHtml("");
      setPluginManifestFile(null);
      setPluginEntryHtmlFile(null);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostTitle.trim() || !newPostDescription.trim()) return;
    if (activeTab === "templates" && selectedTemplates.length === 0) return;
    try {
      let parsedPluginManifest = undefined;
      let normalizedPluginEntryHtml = "";
      if (activeTab === "plugins") {
        let parsedRaw = {};
        try {
          parsedRaw = JSON.parse(pluginManifestText);
        } catch (_error) {
          setPluginDraftError("Plugin manifest must be valid JSON.");
          return;
        }
        parsedPluginManifest = normalizePluginManifest(parsedRaw) || undefined;
        normalizedPluginEntryHtml = String(pluginEntryHtml || "").trim();
        if (!parsedPluginManifest || !normalizedPluginEntryHtml) {
          setPluginDraftError("Plugin manifest and entry HTML are required.");
          return;
        }
      }
      const imageDataUrl = newPostImageFile ? await fileToDataUrl(newPostImageFile) : "";
      await communityStore.addPost({
        type: activeTab,
        title: newPostTitle.trim(),
        description: newPostDescription.trim(),
        hasFile: activeTab === "plugins" ? true : (activeTab === "templates" ? selectedTemplates.length > 0 : newPostHasFile),
        hasImage: Boolean(newPostImageFile),
        imageDataUrl,
        templateAttachments:
          activeTab === "templates"
            ? selectedTemplates.map((item) => ({
                id: item.id,
                name: item.name,
                description: item.description,
                vibe: item.vibe,
                layout: item.layout,
                signatureElements: item.signatureElements,
                animation: item.animation,
                colors: item.colors,
                fonts: item.fonts,
              }))
            : undefined,
        pluginManifest: parsedPluginManifest,
        pluginEntryHtml: normalizedPluginEntryHtml,
      });
      setIsCreateModalOpen(false);
      setPluginDraftError("");
    } catch (_error) {
      // Keep modal open so users can retry publish after fixing inputs/network.
    }
  };

  const filteredPosts = posts.filter(
    (post) =>
      post.type === activeTab &&
      (post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleLike = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation();
    try {
      await communityStore.toggleLike(postId);
    } catch (_error) {
      // Ignore transient network errors in feed interactions.
    }
  };

  return (
    <div className="h-screen w-full relative overflow-hidden bg-[#fafafa] flex flex-col">
      <Header />
      {/* Dynamic Background Blurs */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-[#ff6b35]/10 to-[#ff8a5c]/0 blur-[100px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-[200px] rotate-45 bg-gradient-to-tl from-[#ff8a5c]/10 to-transparent blur-[120px] pointer-events-none" />
      <div className="fixed top-[40%] left-[60%] w-[300px] h-[300px] rounded-full bg-gradient-to-bl from-[#ffb088]/10 to-transparent blur-[80px] pointer-events-none" />

      <div className="pt-24 pb-12 px-8 max-w-[1800px] w-full mx-auto flex-1 flex flex-col lg:flex-row gap-12 relative z-10 overflow-hidden">
        
        {/* Left Side: Navigation & Info (Sticky Asymmetrical Block) */}
        <div className="w-full lg:w-[380px] shrink-0 h-full flex flex-col">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="bg-white/40 backdrop-blur-2xl border border-white/60 p-10 rounded-tr-[60px] rounded-bl-[40px] rounded-tl-2xl rounded-br-2xl shadow-[10px_0_30px_-10px_rgba(255,107,53,0.08)]"
          >
            <div className="mb-10">
              <h1 className="text-4xl font-extrabold text-slate-800 leading-[1.1] mb-4">
                FacetDeck<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff6b35] to-[#ffb088]">
                  Community
                </span>
              </h1>
              <p className="text-slate-500 font-medium text-sm leading-relaxed">
                Discover plugins, explore templates, and connect with other designers crafting pure CSS presentations.
              </p>
            </div>

            {/* Tabs */}
            <div className="flex flex-col gap-3">
              {(["plugins", "templates", "discussions"] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-6 py-4 rounded-2xl font-bold text-left transition-all duration-300 overflow-hidden group ${
                    activeTab === tab 
                      ? "text-white shadow-lg shadow-[#ff6b35]/20" 
                      : "text-slate-600 hover:bg-white/50"
                  }`}
                >
                  {/* Active State Background */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] transition-opacity duration-300 ${
                      activeTab === tab ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  {/* Decorative shape inside active tab */}
                  {activeTab === tab && (
                    <motion.div
                      layoutId="activeTabShape"
                      className="absolute right-[-10px] top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 rounded-full blur-sm"
                    />
                  )}
                  <span className="relative z-10 capitalize tracking-wide">{tab}</span>
                </button>
              ))}
            </div>

            {/* Upload/Action Button based on Tab */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab} // To re-animate if text changes
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="mt-10"
              >
                <button 
                  onClick={handleOpenCreateModal}
                  className="w-full py-4 border-2 border-dashed border-[#ff6b35]/30 rounded-2xl text-[#ff6b35] font-bold hover:bg-[#ff6b35]/5 hover:border-[#ff6b35]/50 transition-colors flex items-center justify-center gap-3"
                >
                  <span className="text-lg">+</span>
                  {activeTab === "discussions" ? "Start a discussion" : `Publish a ${activeTab.slice(0, -1)}`}
                </button>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Right Side: Content Area */}
        <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
          
          {/* Top Bar: Search & View Toggle */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8 flex flex-col sm:flex-row gap-4 relative shrink-0"
          >
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                <div className="w-3 h-3 rounded-full border-2 border-slate-400" />
              </div>
              <input
                type="text"
                placeholder={`Search ${activeTab}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/60 backdrop-blur-md border border-white/80 focus:border-[#ff6b35]/40 rounded-3xl pl-12 pr-6 py-4 text-slate-700 outline-none transition-all placeholder:text-slate-400 font-medium shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)]"
              />
            </div>

            {/* View Toggle */}
            <div className="flex bg-white/60 backdrop-blur-md border border-white/80 rounded-3xl p-1.5 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] shrink-0 h-[58px] items-center">
              <button
                onClick={() => setViewMode("list")}
                className={`w-12 h-full rounded-[20px] flex items-center justify-center transition-all duration-300 ${
                  viewMode === "list" ? "bg-white shadow-md text-[#ff6b35]" : "text-slate-400 hover:text-slate-600"
                }`}
                aria-label="List View"
              >
                {/* Pure CSS List Icon */}
                <div className="flex flex-col gap-[3px]">
                  <div className="w-4 h-[3px] rounded-full bg-current" />
                  <div className="w-4 h-[3px] rounded-full bg-current" />
                  <div className="w-4 h-[3px] rounded-full bg-current" />
                </div>
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`w-12 h-full rounded-[20px] flex items-center justify-center transition-all duration-300 ${
                  viewMode === "grid" ? "bg-white shadow-md text-[#ff6b35]" : "text-slate-400 hover:text-slate-600"
                }`}
                aria-label="Grid View"
              >
                {/* Pure CSS Grid Icon */}
                <div className="grid grid-cols-2 gap-[3px]">
                  <div className="w-[7px] h-[7px] rounded-[2px] bg-current" />
                  <div className="w-[7px] h-[7px] rounded-[2px] bg-current" />
                  <div className="w-[7px] h-[7px] rounded-[2px] bg-current" />
                  <div className="w-[7px] h-[7px] rounded-[2px] bg-current" />
                </div>
              </button>
            </div>
          </motion.div>

          {/* Posts Feed (Scrollable) */}
          <div className="flex-1 overflow-y-auto pr-4 pb-20 custom-scrollbar relative">
            {/* Developer Center Banner (Only visible in Plugins tab) */}
            {activeTab === "plugins" && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 relative overflow-hidden rounded-[32px] bg-gradient-to-r from-[#ff6b35]/10 to-[#ff8a5c]/5 border border-[#ff6b35]/20 p-8 sm:p-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 shadow-sm"
              >
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#ff6b35]/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
                <div className="relative z-10 flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[#ff6b35]/10 flex items-center justify-center">
                      <Code2 className="w-5 h-5 text-[#ff6b35]" />
                    </div>
                    <h3 className="text-2xl font-extrabold text-slate-800">Plugin Developer Center</h3>
                  </div>
                  <p className="text-slate-600 font-medium max-w-xl">
                    Want to build your own plugin? Check out our comprehensive API documentation, SDK reference, and download starter templates to get your first plugin running in 10 minutes.
                  </p>
                </div>
                <button
                  onClick={() => navigate("/community/plugin-developer-center")}
                  className="relative z-10 shrink-0 px-6 py-3.5 rounded-2xl bg-white text-[#ff6b35] font-bold shadow-sm hover:shadow-md hover:bg-slate-50 transition-all flex items-center gap-2 group"
                >
                  Go to Developer Center
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </button>
              </motion.div>
            )}

            <div className={`grid ${viewMode === "grid" ? "grid-cols-1 xl:grid-cols-2" : "grid-cols-1"} gap-6`}>
            {filteredPosts.length > 0 ? (
              filteredPosts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => navigate(`/community/post/${post.id}`)}
                  className={`group cursor-pointer bg-white/70 backdrop-blur-xl border border-white/80 rounded-[32px] p-8 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_40px_-12px_rgba(255,107,53,0.1)] transition-all duration-500 flex flex-col ${
                    viewMode === "grid" ? "justify-between min-h-[240px]" : ""
                  }`}
                >
                  <div className="mb-4">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <div className="w-2 h-2 rounded-full bg-[#ff6b35] shrink-0" />
                      <span className="text-sm font-bold text-slate-800">{post.author}</span>
                      <span className="text-sm font-medium text-slate-400 border-l border-slate-200 pl-3">
                        {post.date}
                      </span>
                    </div>
                    <h2 className={`font-bold text-slate-800 leading-snug group-hover:text-[#ff6b35] transition-colors ${viewMode === "grid" ? "text-xl line-clamp-3" : "text-2xl line-clamp-2"}`}>
                      {post.title}
                    </h2>
                  </div>

                  {/* Description - Hidden in Grid View */}
                  {viewMode === "list" && (
                    <p className="text-slate-600 leading-relaxed mb-6 line-clamp-3">
                      {post.description}
                    </p>
                  )}

                  {/* Interactions */}
                  <div className="flex items-center justify-between gap-4 mt-auto border-t border-slate-200/50 pt-5">
                    <div className="flex items-center gap-6 text-sm font-bold text-slate-500">
                      <button 
                        onClick={(e) => {
                          void handleLike(e, post.id);
                        }}
                        className={`flex items-center gap-2 transition-colors group/like ${post.isLiked ? "text-[#ff6b35]" : "hover:text-[#ff6b35]"}`}
                      >
                        <Heart className={`w-4 h-4 transition-colors ${post.isLiked ? "fill-[#ff6b35] text-[#ff6b35]" : "text-current group-hover/like:text-[#ff6b35]"}`} />
                        <span>{post.likes}</span>
                      </button>
                      <button className="flex items-center gap-2 hover:text-[#ff6b35] transition-none group/comment">
                        <MessageSquare className="w-4 h-4 text-current group-hover/comment:text-[#ff6b35] group-hover/comment:fill-[#ff6b35] transition-none" />
                        <span>{post.comments}</span>
                      </button>
                      {post.hasImage && (
                        <div className="flex items-center gap-1.5 text-slate-400">
                          <div className="w-3.5 h-3.5 border-2 border-current rounded-[4px] relative overflow-hidden">
                            <div className="absolute w-[3px] h-[3px] rounded-full border border-current top-[1px] right-[1px]" />
                            <div className="absolute w-4 h-4 border border-current rounded-full -bottom-2 -left-1" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Add to Library Button */}
                    {post.hasFile && (
                      <button 
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await communityStore.addPostToLibrary(post.id);
                          } catch (_error) {
                            // Keep UI responsive; next refresh will reflect server state.
                          }
                        }} 
                        className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-colors duration-300 flex items-center gap-2 group/btn shrink-0 ${
                          post.isAddedToLibrary
                            ? "bg-[#ff6b35]/10 text-[#ff6b35]"
                            : "bg-slate-100 hover:bg-[#ff6b35] text-slate-600 hover:text-white"
                        }`}
                      >
                        {post.isAddedToLibrary ? (
                          <>
                            <Check className="w-4 h-4 text-[#ff6b35]" strokeWidth={3} />
                            <span className="hidden sm:inline">Added</span>
                          </>
                        ) : (
                          <>
                            <span className="text-lg leading-none transition-transform group-hover/btn:rotate-90">+</span>
                            <span className="hidden sm:inline">Library</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className={`py-20 text-center ${viewMode === "grid" ? "col-span-1 xl:col-span-2" : ""}`}>
                <div className="w-16 h-16 rounded-3xl bg-slate-100 mx-auto mb-6 flex items-center justify-center rotate-12">
                  <div className="w-6 h-6 border-4 border-slate-300 rounded-full" />
                </div>
                <h3 className="text-xl font-bold text-slate-700 mb-2">No results found</h3>
                <p className="text-slate-500 font-medium">Try adjusting your search query.</p>
              </div>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Create Post Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute inset-0 bg-slate-900/20 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-2xl bg-white/80 backdrop-blur-3xl border border-white rounded-[32px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] p-8 sm:p-10 flex flex-col gap-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">
                  {activeTab === "discussions" ? "Start Discussion" : `Publish ${activeTab.slice(0, -1)}`}
                </h2>
                <button 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="w-10 h-10 rounded-full bg-slate-100/50 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreatePost} className="flex flex-col gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Title</label>
                  <input
                    type="text"
                    required
                    value={newPostTitle}
                    onChange={(e) => setNewPostTitle(e.target.value)}
                    placeholder="Give it a catchy title..."
                    className="w-full bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#ff6b35] focus:ring-4 focus:ring-[#ff6b35]/10 rounded-2xl px-5 py-3.5 text-lg text-slate-800 font-semibold outline-none transition-all placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Description</label>
                  <textarea
                    required
                    value={newPostDescription}
                    onChange={(e) => setNewPostDescription(e.target.value)}
                    placeholder="Describe what you're sharing..."
                    rows={4}
                    className="w-full bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-[#ff6b35] focus:ring-4 focus:ring-[#ff6b35]/10 rounded-2xl px-5 py-3.5 text-slate-700 outline-none transition-all placeholder:text-slate-400 font-medium resize-none custom-scrollbar"
                  />
                </div>

                {activeTab === "plugins" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Manifest (.json)</label>
                      <button
                        type="button"
                        onClick={() => document.getElementById("community-plugin-manifest-input")?.click()}
                        className={`w-full h-24 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all ${
                          pluginManifestFile
                            ? "border-[#ff6b35] bg-[#ff6b35]/5 text-[#ff6b35]"
                            : "border-slate-200 hover:border-[#ff6b35]/40 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        <FileJson className={`w-6 h-6 ${pluginManifestFile ? "text-[#ff6b35]" : "text-slate-400"}`} />
                        <span className="font-semibold text-sm px-4 truncate w-full text-center">
                          {pluginManifestFile ? pluginManifestFile.name : "Upload manifest.json"}
                        </span>
                      </button>
                      <input
                        id="community-plugin-manifest-input"
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          if (!file) return;
                          void (async () => {
                            try {
                              const text = await fileToText(file);
                              setPluginManifestFile(file);
                              setPluginManifestText(text);
                              setPluginDraftError("");
                            } catch (_error) {
                              setPluginManifestFile(null);
                              setPluginManifestText("");
                              setPluginDraftError("Failed to read plugin manifest file.");
                            }
                          })();
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Entry File (.html)</label>
                      <button
                        type="button"
                        onClick={() => document.getElementById("community-plugin-entry-input")?.click()}
                        className={`w-full h-24 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all ${
                          pluginEntryHtmlFile
                            ? "border-[#ff6b35] bg-[#ff6b35]/5 text-[#ff6b35]"
                            : "border-slate-200 hover:border-[#ff6b35]/40 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        <FileCode className={`w-6 h-6 ${pluginEntryHtmlFile ? "text-[#ff6b35]" : "text-slate-400"}`} />
                        <span className="font-semibold text-sm px-4 truncate w-full text-center">
                          {pluginEntryHtmlFile ? pluginEntryHtmlFile.name : "Upload entry.html"}
                        </span>
                      </button>
                      <input
                        id="community-plugin-entry-input"
                        type="file"
                        accept=".html,.htm,text/html"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          if (!file) return;
                          void (async () => {
                            try {
                              const text = await fileToText(file);
                              setPluginEntryHtmlFile(file);
                              setPluginEntryHtml(text);
                              setPluginDraftError("");
                            } catch (_error) {
                              setPluginEntryHtmlFile(null);
                              setPluginEntryHtml("");
                              setPluginDraftError("Failed to read plugin entry HTML file.");
                            }
                          })();
                        }}
                      />
                    </div>
                    {pluginDraftError && (
                      <div className="col-span-1 sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        {pluginDraftError}
                      </div>
                    )}
                  </div>
                )}

                {/* Upload Options */}
                <div className="flex flex-col gap-4">
                  {/* Image Upload (Available for all) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Cover Image</label>
                    <button
                      type="button"
                      onClick={() => document.getElementById("community-post-image-input")?.click()}
                      className={`w-full h-24 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-all ${
                        newPostImageFile
                          ? "border-[#ff6b35] bg-[#ff6b35]/5 text-[#ff6b35]" 
                          : "border-slate-200 hover:border-[#ff6b35]/40 text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      <ImageIcon className={`w-6 h-6 ${newPostImageFile ? "text-[#ff6b35]" : "text-slate-400"}`} />
                      <span className="font-semibold text-sm px-4 truncate w-full text-center">
                        {newPostImageFile ? newPostImageFile.name : "Upload Cover Image"}
                      </span>
                    </button>
                    <input
                      id="community-post-image-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setNewPostImageFile(file);
                      }}
                    />
                    {newPostImageFile && (
                      <div className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 flex items-center justify-between gap-3">
                        <span className="truncate font-medium">Selected: {newPostImageFile.name}</span>
                        <button
                          type="button"
                          onClick={() => setNewPostImageFile(null)}
                          className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>

                  {activeTab === "templates" && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between ml-1 mb-1">
                        <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Select Templates</label>
                        <span className="rounded-full bg-[#ff6b35]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#ff6b35]">
                          {selectedTemplateIds.length} selected
                        </span>
                      </div>
                      <div className="w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-2">
                        {isLoadingTemplateLibrary ? (
                          <div className="py-8 text-center text-sm font-medium text-slate-500">Loading templates...</div>
                        ) : templateLibrary.length === 0 ? (
                          <div className="py-8 text-center text-sm font-medium text-slate-500">No private templates found. Create one in the editor preset library first.</div>
                        ) : (
                          <div className="max-h-[200px] overflow-y-auto custom-scrollbar pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {templateLibrary.map((template) => {
                              const isSelected = selectedTemplateIds.includes(template.id);
                              return (
                                <button
                                  key={template.id}
                                  type="button"
                                  onClick={() =>
                                    setSelectedTemplateIds((prev) =>
                                      prev.includes(template.id)
                                        ? prev.filter((id) => id !== template.id)
                                        : [...prev, template.id],
                                    )
                                  }
                                  className={`w-full rounded-xl border p-3 text-left transition-all flex items-start gap-3 ${
                                    isSelected
                                      ? "border-[#ff6b35] bg-white shadow-sm shadow-[#ff6b35]/10 ring-1 ring-[#ff6b35]/20"
                                      : "border-slate-200 bg-white hover:border-[#ff6b35]/40 hover:shadow-sm"
                                  }`}
                                >
                                  <div
                                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                                      isSelected ? "border-[#ff6b35] bg-[#ff6b35]" : "border-slate-300 bg-slate-50"
                                    }`}
                                  >
                                    {isSelected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold text-slate-800">{template.name}</p>
                                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 font-medium">
                                      {template.description || "Private template preset"}
                                    </p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-2 flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-6 py-3 rounded-xl text-slate-500 font-bold hover:bg-slate-100 hover:text-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      !newPostTitle.trim() ||
                      !newPostDescription.trim() ||
                      (activeTab === "templates" && selectedTemplateIds.length === 0) ||
                      (activeTab === "plugins" && (!pluginManifestText.trim() || !pluginEntryHtml.trim()))
                    }
                    className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-[#ff6b35]/30 transition-all active:scale-95 flex items-center gap-2"
                  >
                    <UploadCloud className="w-4 h-4" />
                    Publish Post
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}