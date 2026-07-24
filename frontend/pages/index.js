import { useEffect, useState } from 'react';
import Image from 'next/image';
import { getProducts } from '../lib/api';
import { useCart } from '../lib/CartContext';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(null);
  const { addToCart } = useCart();

  const handleAddToCart = (product) => {
    addToCart(product, 1);
    setAdded(product.id);
    setTimeout(() => setAdded(null), 1200);
  };

  useEffect(() => {
    getProducts()
      .then((res) => setProducts(res.data))
      .catch(() => setError('Could not load products. Is the backend running?'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-500">Loading products...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Shop our products</h1>

      {products.length === 0 ? (
        <p className="text-gray-500">No products yet. Add some via POST /api/products.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((p) => (
            <div key={p.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="relative w-full h-48 bg-gray-100">
                {p.imageUrl && (
                  <Image src={p.imageUrl} alt={p.name} fill style={{ objectFit: 'cover' }} />
                )}
              </div>
              <div className="p-4">
                <h2 className="font-semibold text-gray-800">{p.name}</h2>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.description}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="font-bold text-indigo-600">${Number(p.price).toFixed(2)}</span>
                  <span className="text-xs text-gray-400">{p.stockQuantity} in stock</span>
                </div>
                <button
                  onClick={() => handleAddToCart(p)}
                  disabled={p.stockQuantity === 0}
                  className="mt-3 w-full py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {p.stockQuantity === 0 ? 'Out of stock' : added === p.id ? 'Added ✓' : 'Add to Cart'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
