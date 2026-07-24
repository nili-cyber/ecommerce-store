import { createContext, useContext, useEffect, useState } from 'react';
import Cookies from 'js-cookie';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = Cookies.get('user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch (e) {
        Cookies.remove('user');
      }
    }
    setLoading(false);
  }, []);

  const loginUser = (authResponse) => {
    const { token, userId, fullName, email, role } = authResponse;
    Cookies.set('token', token, { expires: 1 });
    const userData = { userId, fullName, email, role };
    Cookies.set('user', JSON.stringify(userData), { expires: 1 });
    setUser(userData);
  };

  const logoutUser = () => {
    Cookies.remove('token');
    Cookies.remove('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginUser, logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
