import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/AuthContext';
import { useCart } from '../lib/CartContext';

export default function Navbar() {
  const { user, logoutUser } = useAuth();
  const { totalItems } = useCart();
  const router = useRouter();

  const handleLogout = () => {
    logoutUser();
    router.push('/login');
  };

  return (
    <nav className="bg-white shadow-sm sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-indigo-600">
          ShopSphere
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-gray-600 hover:text-indigo-600">Products</Link>
          <Link href="/cart" className="text-gray-600 hover:text-indigo-600">
            Cart{totalItems > 0 ? ` (${totalItems})` : ''}
          </Link>
          {user ? (
            <>
              <span className="text-gray-500">Hi, {user.fullName?.split(' ')[0]}</span>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-gray-600 hover:text-indigo-600">Login</Link>
              <Link
                href="/signup"
                className="px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
