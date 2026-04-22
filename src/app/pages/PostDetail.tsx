import { useState } from "react";
import { useParams, useNavigate } from "react-router";
import { Check, Heart, MessageSquare } from "lucide-react";
import { motion } from "motion/react";
import { communityStore, useCommunityPosts } from "../store/communityStore";

export function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const posts = useCommunityPosts();
  const [commentInput, setCommentInput] = useState("");

  const post = posts.find((p) => p.id === id);

  if (!post) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#fafafa]">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">Post not found</h2>
          <button 
            onClick={() => navigate("/community")}
            className="px-6 py-3 rounded-2xl bg-slate-800 text-white font-bold hover:bg-[#ff6b35] transition-colors"
          >
            Back to Community
          </button>
        </div>
      </div>
    );
  }

  const handleLike = async () => {
    try {
      await communityStore.toggleLike(post.id);
    } catch (_error) {
      // Ignore transient network errors for like actions.
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    try {
      await communityStore.addComment(post.id, commentInput.trim());
      setCommentInput("");
    } catch (_error) {
      // Keep input content so users can retry after network recovers.
    }
  };

  return (
    <div className="h-screen w-full relative overflow-hidden bg-[#fafafa] flex flex-col">
      {/* Dynamic Background Blurs */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-gradient-to-br from-[#ff6b35]/10 to-[#ff8a5c]/0 blur-[100px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[600px] h-[600px] rounded-[200px] rotate-45 bg-gradient-to-tl from-[#ff8a5c]/10 to-transparent blur-[120px] pointer-events-none" />
      <div className="fixed top-[40%] left-[60%] w-[300px] h-[300px] rounded-full bg-gradient-to-bl from-[#ffb088]/10 to-transparent blur-[80px] pointer-events-none" />

      {/* Global Back Button */}
      <button 
        onClick={() => navigate("/community")}
        className="absolute top-8 left-8 z-50 w-12 h-12 rounded-full bg-white/80 backdrop-blur-md border border-slate-200/50 hover:bg-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.1)] hover:shadow-[0_12px_24px_-8px_rgba(255,107,53,0.2)] flex items-center justify-center transition-all duration-300 group"
        aria-label="Go back to Community"
      >
        <div className="w-3.5 h-3.5 border-t-2 border-l-2 border-slate-600 -rotate-45 ml-1 group-hover:border-[#ff6b35] transition-colors" />
      </button>

      <div className="pt-8 sm:pt-10 pb-8 sm:pb-12 px-4 sm:px-8 max-w-[1000px] w-full mx-auto flex-1 flex flex-col relative z-10 overflow-hidden">
        
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex-1 flex flex-col bg-white/70 backdrop-blur-3xl border border-white/80 rounded-[40px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] overflow-hidden h-full"
        >
          {/* Main Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
            {/* Main Post Content */}
            <div className="px-8 pb-8 pt-0 sm:px-12 sm:pb-12 sm:pt-4 border-b border-slate-100 flex-shrink-0 relative">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#ff6b35]" />
                  <span className="text-sm font-bold text-slate-800">{post.author}</span>
                  <span className="text-sm font-medium text-slate-400 border-l border-slate-200 pl-3">
                    {post.date}
                  </span>
                  <span className="text-xs font-bold px-3 py-1 bg-slate-100 text-slate-500 rounded-full ml-auto uppercase tracking-wider">
                    {post.type}
                  </span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-800 leading-snug mb-6 break-words break-all whitespace-pre-wrap">
                  {post.title}
                </h1>
                <p className="text-lg text-slate-600 leading-relaxed break-words break-all whitespace-pre-wrap">
                  {post.description}
                </p>

                {post.hasImage && post.imageUrl && (
                  <div className="mt-8 w-full h-64 sm:h-80 rounded-3xl bg-slate-50 border border-slate-200 overflow-hidden">
                    <img src={post.imageUrl} alt={post.title} className="w-full h-full object-cover" />
                  </div>
                )}

                {post.type === "templates" && post.templateAttachments && post.templateAttachments.length > 0 && (
                  <div className="mt-8 rounded-2xl border border-slate-200 bg-white/70 p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Included Templates</h3>
                      <span className="rounded-full bg-[#ff6b35]/10 px-3 py-1 text-xs font-bold text-[#ff6b35]">
                        {post.templateAttachments.length} items
                      </span>
                    </div>
                    <div className="space-y-2">
                      {post.templateAttachments.map((template) => (
                        <div key={template.id} className="rounded-xl border border-slate-100 bg-white p-3">
                          <p className="text-sm font-bold text-slate-800">{template.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {template.description || "Private template preset"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex flex-wrap items-center gap-4 mt-8 pt-8 border-t border-slate-100/60">
                  <button 
                    onClick={() => {
                      void handleLike();
                    }}
                    className={`flex items-center gap-2 transition-none font-bold text-sm px-5 py-2.5 rounded-xl ${post.isLiked ? "bg-[#fff0ea] text-[#ff6b35] shadow-[0_4px_12px_-4px_rgba(255,107,53,0.2)]" : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-[#ff6b35]"}`}
                  >
                    <Heart className={`w-4 h-4 transition-none ${post.isLiked ? "fill-[#ff6b35] text-[#ff6b35]" : "text-current"}`} />
                    <span>{post.likes} Likes</span>
                  </button>
                  {post.hasFile && (
                    <button 
                      onClick={async () => {
                        try {
                          await communityStore.addPostToLibrary(post.id);
                        } catch (_error) {
                          // Keep button state unchanged on transient failures.
                        }
                      }}
                      className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 flex items-center gap-2 active:translate-y-0 ${
                        post.isAddedToLibrary
                          ? "bg-[#fff0ea] text-[#ff6b35] shadow-none"
                          : "bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] text-white hover:shadow-lg hover:shadow-[#ff6b35]/25 hover:-translate-y-0.5"
                      }`}
                    >
                      {post.isAddedToLibrary ? (
                        <>
                          <Check className="w-5 h-5 mr-0.5" strokeWidth={2.5} />
                          <span>Added to Library</span>
                        </>
                      ) : (
                        <>
                          <span className="text-lg leading-none font-light">+</span>
                          <span>Add to Library</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Comments Section */}
            <div className="flex-1 p-8 sm:p-12 bg-slate-50/50">
              <h3 className="text-xl font-bold text-slate-800 mb-8 flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-current" strokeWidth={2.5} />
                Discussion ({post.comments})
              </h3>
              
              <div className="space-y-6">
                {post.commentsList && post.commentsList.length > 0 ? (
                  post.commentsList.map((comment) => (
                    <div key={comment.id} className="bg-white rounded-[24px] p-6 sm:p-8 shadow-sm border border-slate-100 transition-all hover:shadow-md">
                      <div className="flex items-center gap-4 mb-4">
                        <div>
                          <div className="text-base font-bold text-slate-800">{comment.author}</div>
                          <div className="text-sm font-medium text-slate-400">{comment.date}</div>
                        </div>
                      </div>
                      <p className="text-slate-600 text-base leading-relaxed break-words whitespace-pre-wrap">
                        {comment.content}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-16 px-4 bg-white/50 rounded-3xl border border-dashed border-slate-200">
                    <div className="w-16 h-12 border-[3px] border-slate-200 rounded-xl mx-auto mb-4 flex items-center justify-center">
                      <div className="w-6 h-[3px] bg-slate-200 rounded-full" />
                    </div>
                    <h4 className="text-lg font-bold text-slate-700 mb-2">No comments yet</h4>
                    <p className="text-slate-500 font-medium">Be the first to share your thoughts and start the discussion!</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Comment Input */}
          <div className="p-6 sm:p-8 bg-white border-t border-slate-100 shrink-0">
            <form
              onSubmit={(event) => {
                void handleAddComment(event);
              }}
              className="flex gap-4"
            >
              <input
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder="Write your comment..."
                className="flex-1 bg-slate-50 border border-slate-200 focus:border-[#ff6b35]/50 focus:bg-white rounded-2xl px-6 py-4 text-slate-700 outline-none transition-all placeholder:text-slate-400 font-medium shadow-inner"
              />
              <button 
                type="submit"
                disabled={!commentInput.trim()}
                className="px-8 py-4 rounded-2xl bg-slate-800 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#ff6b35] transition-colors active:scale-95 whitespace-nowrap"
              >
                Post Reply
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}