import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  color?: string;
  phone?: string;
}

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isLoading: boolean;
  needsSetup: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const expired = () => setUser(null);
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
  }, []);

  useEffect(() => {
    localStorage.removeItem("mylight_user");
    fetch("/api/setup")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not reach your home server");
        const setup = await response.json();
        setNeedsSetup(setup.needs_setup);
        if (!setup.needs_setup) {
          const session = await fetch("/api/session");
          if (session.ok) setUser((await session.json()).user);
          else if (session.status !== 401)
            throw new Error("Could not check your session");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setIsLoading(false));
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    setNeedsSetup(false);
  };

  const logout = async () => {
    try {
      const response = await fetch("/api/session", {
        method: "DELETE",
        headers: { "X-MyLight-Request": "1" },
      });
      if (!response.ok) {
        setError("Could not sign out. Please try again.");
        return;
      }
      setUser(null);
      setError(null);
      localStorage.removeItem("mylight_user");
    } catch {
      setError("Could not sign out. Please try again.");
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, login, logout, isLoading, needsSetup, error }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
