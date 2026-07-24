import '../styles/globals.css';
import { AuthProvider } from '../lib/AuthContext';
import { CartProvider } from '../lib/CartContext';
import Navbar from '../components/Navbar';

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <CartProvider>
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 py-8">
          <Component {...pageProps} />
        </main>
      </CartProvider>
    </AuthProvider>
  );
}
