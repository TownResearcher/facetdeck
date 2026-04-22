import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Link, useNavigate, useLocation } from "react-router";
import { RefreshCw } from "lucide-react";

type AuthMode = "login" | "register" | "forgot_password";
type Notification = { type: "error" | "success"; message: string } | null;
type CaptchaPayload = { captchaId: string; captchaSvg: string };

function toReadableError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "Auth API is offline. Start `npm run dev:api` and refresh.";
    }
    return error.message;
  }
  return fallback;
}

async function postJson<T>(url: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Request failed");
  }
  return data as T;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Request failed");
  }
  return data as T;
}

export function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaId, setCaptchaId] = useState("");
  const [captchaSvg, setCaptchaSvg] = useState("");
  const [captchaText, setCaptchaText] = useState("");
  const [isLoadingCaptcha, setIsLoadingCaptcha] = useState(false);
  const [notification, setNotification] = useState<Notification>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Determine mode from URL path
  const mode: AuthMode = 
    location.pathname === "/register" ? "register" :
    location.pathname === "/forgot-password" ? "forgot_password" :
    "login";

  const needsCode = mode === "register" || mode === "forgot_password";

  useEffect(() => {
    if (mode !== "register") {
      setInviteCode("");
      return;
    }
    const inviteFromQuery = new URLSearchParams(location.search).get("invite") || "";
    setInviteCode(inviteFromQuery.trim().toUpperCase());
  }, [location.search, mode]);

  const showNotification = (type: "error" | "success", message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const loadCaptcha = async () => {
    if (!needsCode) {
      return;
    }
    try {
      setIsLoadingCaptcha(true);
      const data = await getJson<CaptchaPayload>("/api/auth/captcha");
      setCaptchaId(data.captchaId);
      setCaptchaSvg(data.captchaSvg);
      setCaptchaText("");
    } catch (error) {
      showNotification("error", toReadableError(error, "Failed to load captcha"));
    } finally {
      setIsLoadingCaptcha(false);
    }
  };

  useEffect(() => {
    if (needsCode) {
      void loadCaptcha();
    }
  }, [needsCode]);

  const handleSendCode = async (e: MouseEvent) => {
    e.preventDefault();
    if (!email) {
      showNotification("error", "Please enter your email first");
      return;
    }
    if (!captchaId || !captchaText.trim()) {
      showNotification("error", "Please complete captcha first");
      return;
    }

    const endpoint =
      mode === "register"
        ? "/api/auth/register/send-code"
        : "/api/auth/forgot-password/send-code";

    try {
      setIsSendingCode(true);
      await postJson(endpoint, { email, captchaId, captchaText: captchaText.trim() });
      setIsCodeSent(true);
      showNotification("success", "Verification code sent to " + email);
    } catch (error) {
      showNotification("error", toReadableError(error, "Failed to send code"));
      await loadCaptcha();
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!email) {
      showNotification("error", "Email is required");
      return;
    }

    if (password.length < 6) {
      showNotification("error", "Password must be at least 6 characters");
      return;
    }

    if (needsCode) {
      if (!verificationCode) {
        showNotification("error", "Verification code is required");
        return;
      }
      if (password !== confirmPassword) {
        showNotification("error", "Passwords do not match");
        return;
      }
    }

    try {
      setIsSubmitting(true);

      if (mode === "login") {
        const data = await postJson<{ token: string; user: { id: number; email: string } }>(
          "/api/auth/login",
          { email, password },
        );
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        showNotification("success", "Welcome back to FacetDeck!");
        setTimeout(() => navigate("/home"), 1000);
        return;
      }

      if (mode === "register") {
        const data = await postJson<{ token: string; user: { id: number; email: string } }>(
          "/api/auth/register",
          { email, password, code: verificationCode, inviteCode: inviteCode.trim() || undefined },
        );
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        showNotification("success", "Account created successfully!");
        setTimeout(() => navigate("/home"), 1000);
        return;
      }

      await postJson<{ message: string }>(
        "/api/auth/forgot-password/reset",
        { email, password, code: verificationCode },
      );
      showNotification("success", "Password reset successfully!");
      setTimeout(() => navigate("/login"), 1000);
    } catch (error) {
      showNotification("error", toReadableError(error, "Authentication failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = (newMode: AuthMode) => {
    setPassword("");
    setConfirmPassword("");
    setVerificationCode("");
    setIsCodeSent(false);
    setNotification(null);
    
    // Navigate to the corresponding route
    if (newMode === "login") navigate("/login");
    else if (newMode === "register") navigate("/register");
    else if (newMode === "forgot_password") navigate("/forgot-password");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 py-12 relative">
      {/* Main Asymmetrical Container */}
      <div className="w-full max-w-6xl min-h-[760px] flex relative z-10">
        {/* Left Visual Area - Pure CSS / Warm Colors / Liquid Glass */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="hidden md:flex flex-1 relative overflow-hidden rounded-l-[40px] bg-white/40 backdrop-blur-xl border border-white/60 p-12 flex-col justify-between shadow-[20px_0_40px_-15px_rgba(255,107,53,0.1)] z-10"
        >
          {/* Abstract Geometric Shapes */}
          <div className="absolute top-[-10%] left-[-10%] w-[300px] h-[300px] rounded-full bg-gradient-to-br from-[#ff6b35]/20 to-[#ff8a5c]/0 blur-3xl" />
          <div className="absolute bottom-[20%] right-[-20%] w-[400px] h-[400px] rounded-[100px] rotate-45 bg-gradient-to-tl from-[#ff8a5c]/20 to-transparent blur-2xl" />

          <motion.div
            animate={{
              y: [0, -10, 0],
              rotate: [0, 5, 0],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute top-[30%] right-[10%] w-24 h-24 rounded-tr-3xl rounded-bl-3xl bg-gradient-to-br from-[#ff6b35] to-[#ffb088] opacity-80"
          />
          <motion.div
            animate={{
              x: [0, 15, 0],
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="absolute bottom-[15%] left-[15%] w-32 h-16 rounded-full border-4 border-[#ff8a5c]/30 backdrop-blur-md"
          />

          <div className="relative z-10">
            <Link to="/home" className="inline-block">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-[#ff6b35] to-[#ff8a5c] bg-clip-text text-transparent tracking-tight">
                FacetDeck
              </h1>
            </Link>
          </div>

          <div className="relative z-10 max-w-md">
            <motion.h2
              key={mode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl font-bold text-slate-800 leading-[1.1] mb-6"
            >
              {mode === "login" &&
                "Craft Your Ideas Into Reality."}
              {mode === "register" &&
                "Join the Presentation Revolution."}
              {mode === "forgot_password" &&
                "Let's Get You Back In."}
            </motion.h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              Experience the future of presentation creation
              with pure CSS, asymmetric intelligence, and
              beautiful warm aesthetics.
            </p>
          </div>
        </motion.div>

        {/* Right Form Area - Glassy, offset, overlapping */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full md:w-[480px] bg-white/80 backdrop-blur-2xl border border-white/80 shadow-2xl rounded-[40px] md:-ml-8 z-20 flex flex-col justify-center p-10 md:p-14 relative"
        >
          {/* Subtle top reflection */}
          <div className="absolute top-0 left-8 right-8 h-px bg-gradient-to-r from-transparent via-white to-transparent" />

          {/* Custom Notification Alert */}
          <AnimatePresence>
            {notification && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute top-6 left-10 right-10 z-50 pointer-events-none"
              >
                <div className={`p-4 rounded-2xl backdrop-blur-2xl border shadow-xl flex items-center gap-4 ${
                  notification.type === "error" 
                    ? "bg-white/90 border-red-200/50 shadow-[0_10px_40px_-10px_rgba(239,68,68,0.15)]" 
                    : "bg-white/90 border-[#ff6b35]/20 shadow-[0_10px_40px_-10px_rgba(255,107,53,0.15)]"
                }`}>
                  {/* Geometric Shape Icon */}
                  <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                      className={`absolute inset-0 rounded-sm opacity-20 ${
                        notification.type === "error" ? "bg-red-500" : "bg-[#ff6b35]"
                      }`} 
                    />
                    <div className={`w-2 h-2 rounded-full relative z-10 ${
                      notification.type === "error" ? "bg-red-500" : "bg-[#ff6b35]"
                    }`} />
                  </div>
                  <p className={`text-sm font-bold tracking-wide flex-1 ${
                    notification.type === "error" ? "text-red-500" : "text-[#ff6b35]"
                  }`}>
                    {notification.message}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="w-full flex flex-col justify-center flex-1"
            >
              <div className="mb-10">
                <h3 className="text-3xl font-bold text-slate-800 mb-2">
                  {mode === "login" && "Welcome Back"}
                  {mode === "register" && "Create Account"}
                  {mode === "forgot_password" &&
                    "Reset Password"}
                </h3>
                <p className="text-slate-500 text-sm font-medium">
                  {mode === "login" &&
                    "Enter your credentials to access your workspace."}
                  {mode === "register" &&
                    "Sign up to start building beautiful presentations."}
                  {mode === "forgot_password" &&
                    "Enter your email to receive a verification code."}
                </p>
              </div>

              <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-5"
                noValidate
              >
                {/* Email Field */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex flex-col gap-1.5"
                >
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider pl-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-white/50 border border-slate-200 focus:border-[#ff6b35]/50 focus:bg-white rounded-2xl px-5 py-3.5 text-slate-800 outline-none transition-all placeholder:text-slate-400 font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                    placeholder="you@example.com"
                  />
                </motion.div>

                {/* Verification Code (Only for Register & Forgot Password) */}
                {needsCode && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="flex flex-col gap-1.5 overflow-hidden"
                  >
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider pl-1">
                      Captcha
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={captchaText}
                        onChange={(e) => setCaptchaText(e.target.value.toUpperCase())}
                        required
                        className="w-[96px] sm:w-[150px] bg-white/50 border border-slate-200 focus:border-[#ff6b35]/50 focus:bg-white rounded-2xl px-3 py-3.5 text-slate-800 outline-none transition-all placeholder:text-slate-400 font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] shrink-0"
                        placeholder="Captcha"
                      />
                      <div className="h-[52px] w-[150px] rounded-xl border border-slate-200 bg-white/80 overflow-hidden flex items-center justify-center shrink-0">
                        {captchaSvg ? (
                          <img src={captchaSvg} alt="captcha" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs text-slate-400">
                            {isLoadingCaptcha ? "Loading..." : "Captcha unavailable"}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadCaptcha()}
                        disabled={isLoadingCaptcha}
                        className="h-[52px] w-[52px] inline-flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition-colors border border-slate-200/50 shrink-0"
                        aria-label="Refresh captcha"
                      >
                        <RefreshCw className={`w-4 h-4 ${isLoadingCaptcha ? "animate-spin" : ""}`} />
                      </button>
                    </div>
                  </motion.div>
                )}

                {mode === "register" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="flex flex-col gap-1.5 overflow-hidden"
                  >
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider pl-1">
                      Invite Code (Optional)
                    </label>
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      className="w-full bg-white/50 border border-slate-200 focus:border-[#ff6b35]/50 focus:bg-white rounded-2xl px-5 py-3.5 text-slate-800 outline-none transition-all placeholder:text-slate-400 font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                      placeholder="Enter invite code if you have one"
                    />
                  </motion.div>
                )}

                {needsCode && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex flex-col gap-1.5 overflow-hidden"
                  >
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider pl-1">
                      Verification Code
                    </label>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(e) =>
                          setVerificationCode(e.target.value)
                        }
                        required
                        className="flex-1 bg-white/50 border border-slate-200 focus:border-[#ff6b35]/50 focus:bg-white rounded-2xl px-5 py-3.5 text-slate-800 outline-none transition-all placeholder:text-slate-400 font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                        placeholder="6-digit code"
                      />
                      <button
                        type="button"
                        onClick={handleSendCode}
                        disabled={isSendingCode}
                        className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-2xl transition-colors whitespace-nowrap text-sm border border-slate-200/50"
                      >
                        {isSendingCode ? "Sending..." : isCodeSent ? "Resend" : "Send Code"}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Password Field */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-col gap-1.5"
                >
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider pl-1">
                    {mode === "forgot_password"
                      ? "New Password"
                      : "Password"}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    required
                    minLength={6}
                    className="w-full bg-white/50 border border-slate-200 focus:border-[#ff6b35]/50 focus:bg-white rounded-2xl px-5 py-3.5 text-slate-800 outline-none transition-all placeholder:text-slate-400 font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                    placeholder="Min. 6 characters"
                  />
                </motion.div>

                {/* Confirm Password (Only for Register & Forgot Password) */}
                {needsCode && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="flex flex-col gap-1.5 overflow-hidden"
                  >
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider pl-1">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) =>
                        setConfirmPassword(e.target.value)
                      }
                      required
                      minLength={6}
                      className="w-full bg-white/50 border border-slate-200 focus:border-[#ff6b35]/50 focus:bg-white rounded-2xl px-5 py-3.5 text-slate-800 outline-none transition-all placeholder:text-slate-400 font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                      placeholder="Confirm your password"
                    />
                  </motion.div>
                )}

                {/* Forgot Password Link in Login Mode */}
                {mode === "login" && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="flex justify-end"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        switchMode("forgot_password")
                      }
                      className="text-sm font-semibold text-[#ff6b35] hover:text-[#ff8a5c] transition-colors"
                    >
                      Forgot password?
                    </button>
                  </motion.div>
                )}

                {/* Submit Button */}
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-4 w-full relative group overflow-hidden rounded-2xl bg-gradient-to-r from-[#ff6b35] to-[#ffb088] px-6 py-4 shadow-lg shadow-[#ff6b35]/20 hover:shadow-[#ff6b35]/40 transition-all duration-300 flex items-center justify-center border border-white/20"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-[#ff8a5c] to-[#ff6b35] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <span className="relative z-10 text-white font-bold text-lg tracking-wide drop-shadow-sm">
                    {isSubmitting
                      ? "Processing..."
                      : mode === "login"
                        ? "Sign In"
                        : mode === "register"
                          ? "Create Account"
                          : "Reset Password"}
                  </span>
                </motion.button>
              </form>

              {/* Toggle Modes */}
              <div className="mt-8 text-center border-t border-slate-200/50 pt-6">
                {mode === "login" ? (
                  <p className="text-sm font-medium text-slate-500">
                    Don't have an account?{" "}
                    <button
                      onClick={() => switchMode("register")}
                      className="text-[#ff6b35] hover:text-[#ff8a5c] font-bold transition-colors ml-1"
                    >
                      Sign up
                    </button>
                  </p>
                ) : (
                  <p className="text-sm font-medium text-slate-500">
                    Already have an account?{" "}
                    <button
                      onClick={() => switchMode("login")}
                      className="text-[#ff6b35] hover:text-[#ff8a5c] font-bold transition-colors ml-1"
                    >
                      Sign in
                    </button>
                  </p>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}