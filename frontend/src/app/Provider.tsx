import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { CheckCircle2, X, AlertCircle } from "lucide-react";
import { repository } from "../services/repository";
import { supabase } from "../services/supabase";
import { configuration, isMock } from "../services/config";
import { SessionAccessError } from "../services/supabaseRepository";
import type { Role } from "../types";
interface Session {
  userId: string | null;
  setUserId: (id: string | null) => void;
  switchRole: (role: Role) => void;
  toast: (message: string, error?: boolean) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  sessionLoading: boolean;
  sessionError: string;
  requiresPassword: boolean;
  passwordReady: () => void;
  isMock: boolean;
  configurationError: string;
}
const Context = createContext<Session | null>(null);
export const useData = () =>
  useSyncExternalStore(repository.subscribe, repository.getSnapshot);
export function useApp() {
  const context = useContext(Context);
  if (!context) throw new Error("App provider is missing");
  const data = useData();
  return {
    ...context,
    user: data.staff.find((s) => s.id === context.userId),
    data,
    repository,
  };
}
export function AppProvider({ children }: { children: ReactNode }) {
  const [userId, updateUserId] = useState<string | null>(isMock ? "u1" : null);
  const currentId = useRef(userId);
  const generation = useRef(0);
  const signInPending = useRef(false);
  const [sessionLoading, setSessionLoading] = useState(
    !isMock && !configuration.error,
  );
  const [sessionError, setSessionError] = useState("");
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [notification, setNotification] = useState<{
    id: number;
    message: string;
    error: boolean;
  } | null>(null);
  const data = useData();
  const toast = useCallback((message: string, error = false) => {
    const id = Date.now();
    setNotification({ id, message, error });
    setTimeout(
      () => setNotification((current) => (current?.id === id ? null : current)),
      4500,
    );
  }, []);
  const clear = useCallback(() => {
    generation.current++;
    currentId.current = null;
    updateUserId(null);
    repository.reset();
    setSessionLoading(false);
  }, []);
  const loadIdentity = useCallback(
    async (id: string, blocking = true) => {
      const ticket = ++generation.current;
      if (blocking) setSessionLoading(true);
      try {
        await repository.refresh();
        if (ticket !== generation.current) return;
        const verifiedId = repository.getIdentity?.() ?? id;
        if (
          !repository
            .getSnapshot()
            .staff.some((s) => s.id === verifiedId && s.active)
        )
          throw new SessionAccessError(
            "Your account is inactive. Contact your administrator.",
          );
        currentId.current = verifiedId;
        updateUserId(verifiedId);
        setSessionError("");
      } catch (error) {
        if (ticket !== generation.current) return;
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load your workspace.";
        if (error instanceof SessionAccessError || blocking) {
          clear();
          if (error instanceof SessionAccessError && supabase)
            await supabase.auth.signOut({ scope: "local" });
        }
        setSessionError(message);
        if (!blocking) toast(message, true);
        throw error;
      } finally {
        if (ticket === generation.current) setSessionLoading(false);
      }
    },
    [clear, toast],
  );
  useEffect(() => {
    if (isMock || !supabase) return;
    let disposed = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Defer Auth/DB work to avoid holding the SDK's Auth callback lock.
      if (event === "PASSWORD_RECOVERY") setRequiresPassword(true);
      if (event === "SIGNED_OUT" || !session) {
        clear();
        return;
      }
      if (event === "SIGNED_IN" && signInPending.current) return;
      if (event === "TOKEN_REFRESHED" && currentId.current === session.user.id)
        return;
      const scheduledGeneration = generation.current;
      setTimeout(() => {
        if (!disposed && scheduledGeneration === generation.current)
          void loadIdentity(session.user.id, !currentId.current).catch(
            () => {},
          );
      }, 0);
    });
    return () => {
      disposed = true;
      generation.current++;
      subscription.unsubscribe();
      repository.reset();
    };
  }, [clear, loadIdentity]);
  const refresh = useCallback(async () => {
    if (!isMock && currentId.current)
      await loadIdentity(currentId.current, false);
  }, [loadIdentity]);
  useEffect(() => {
    if (isMock || !userId) return;
    const onFocus = () => {
      void refresh().catch(() => {});
    };
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") onFocus();
    }, 30000);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, refresh]);
  const signIn = async (email: string, password: string) => {
    setSessionError("");
    if (isMock) {
      const account = data.staff.find(
        (s) => s.email.toLowerCase() === email.toLowerCase() && s.active,
      );
      if (!account || password !== "diwali2026")
        throw new Error("Use an active demo account with password diwali2026.");
      currentId.current = account.id;
      updateUserId(account.id);
      return;
    }
    if (!supabase)
      throw new Error(configuration.error || "Supabase is not configured.");
    signInPending.current = true;
    try {
      const { data: auth, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error || !auth.user)
        throw new Error(
          "Unable to sign in. Check your credentials and try again.",
        );
      await loadIdentity(auth.user.id);
    } finally {
      signInPending.current = false;
    }
  };
  const signOut = async () => {
    if (isMock) {
      currentId.current = null;
      updateUserId(null);
      return;
    }
    clear();
    setSessionError("");
    setRequiresPassword(false);
    const result = await supabase?.auth.signOut({ scope: "local" });
    if (result?.error)
      toast(
        "Signed out of the workspace. Supabase could not confirm session revocation; retry when connected.",
        true,
      );
  };
  const setUserId = (id: string | null) => {
    if (!isMock)
      throw new Error("Role preview is only available in mock mode.");
    currentId.current = id;
    updateUserId(id);
  };
  const switchRole = (role: Role) =>
    setUserId(data.staff.find((s) => s.role === role && s.active)?.id ?? null);
  return (
    <Context.Provider
      value={{
        userId,
        setUserId,
        switchRole,
        toast,
        signIn,
        signOut,
        refresh,
        sessionLoading,
        sessionError,
        requiresPassword,
        passwordReady: () => setRequiresPassword(false),
        isMock,
        configurationError: configuration.error,
      }}
    >
      <MotionConfig
        reducedMotion={data.settings.reduceMotion ? "always" : "user"}
      >
        {children}
        <AnimatePresence>
          {notification && (
            <motion.div
              role={notification.error ? "alert" : "status"}
              className={`toast ${notification.error ? "error" : ""}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              {notification.error ? (
                <AlertCircle size={20} />
              ) : (
                <CheckCircle2 size={20} />
              )}
              <span>{notification.message}</span>
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotification(null)}
              >
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </Context.Provider>
  );
}
