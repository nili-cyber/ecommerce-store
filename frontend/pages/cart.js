import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useCart } from '../lib/CartContext';
import { useAuth } from '../lib/AuthContext';
import { createCheckoutSession, createPayPalOrder, cashCheckout } from '../lib/api';

const METHODS = [
  { id: 'card', label: 'Credit / Debit Card', hint: 'Also supports Apple Pay & Google Pay' },
  { id: 'cashapp', label: 'Cash App Pay', hint: 'Pay with your Cash App balance or linked card' },
  { id: 'ach', label: 'Bank Account (ACH)', hint: 'Pay directly from checking or savings — takes 1-4 business days to clear' },
  { id: 'paypal', label: 'PayPal', hint: 'Pay with your PayPal account or a card via PayPal' },
  { id: 'cash', label: 'Cash on Delivery', hint: 'Pay in person when your order arrives' },
];

export default function Cart() {
  const { items, updateQuantity, removeFromCart, totalAmount, clearCart } = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const [method, setMethod] = useState('card');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [placedOrder, setPlacedOrder] = useState(null);

  const cartLines = () => items.map((i) => ({ productId: i.product.id, quantity: i.quantity }));

  const handleCheckout = async () => {
    if (!user) {
      router.push('/login?next=/cart');
      return;
    }
    setError('');
    setLoading(true);

    try {
      if (method === 'card' || method === 'cashapp' || method === 'ach') {
        const res = await createCheckoutSession(cartLines(), method);
        window.location.href = res.data.checkoutUrl;
        return; // page is navigating away
      }

      if (method === 'paypal') {
        const res = await createPayPalOrder(cartLines());
        window.location.href = res.data.approvalUrl;
        return; // page is navigating away
      }

      if (method === 'cash') {
        const res = await cashCheckout(cartLines());
        setPlacedOrder(res.data);
        clearCart();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Checkout failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (placedOrder) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <h1 className="text-2xl font-bold text-green-600 mb-2">Order placed 🎉</h1>
        <p className="text-gray-600 mb-2">Order #{placedOrder.orderId}</p>
        <p className="text-gray-600 mb-6">{placedOrder.message}</p>
        <Link href="/" className="text-indigo-600 font-medium">Continue shopping</Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 mb-4">Your cart is empty.</p>
        <Link href="/" className="text-indigo-600 font-medium">Browse products</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Your Cart</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow-sm divide-y">
        {items.map(({ product, quantity }) => (
          <div key={product.id} className="flex items-center gap-4 p-4">
            <div className="flex-1">
              <p className="font-medium text-gray-800">{product.name}</p>
              <p className="text-sm text-gray-500">${Number(product.price).toFixed(2)} each</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateQuantity(product.id, quantity - 1)}
                className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                −
              </button>
              <span className="w-6 text-center">{quantity}</span>
              <button
                onClick={() => updateQuantity(product.id, quantity + 1)}
                className="w-7 h-7 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
              >
                +
              </button>
            </div>
            <p className="w-20 text-right font-semibold text-gray-800">
              ${(product.price * quantity).toFixed(2)}
            </p>
            <button
              onClick={() => removeFromCart(product.id)}
              className="text-gray-400 hover:text-red-600 text-sm"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-6 p-4 bg-white rounded-lg shadow-sm">
        <span className="text-lg font-semibold text-gray-800">Total</span>
        <span className="text-lg font-bold text-indigo-600">${totalAmount.toFixed(2)}</span>
      </div>

      <div className="mt-6 bg-white rounded-lg shadow-sm p-4">
        <p className="font-medium text-gray-800 mb-3">Payment method</p>
        <div className="space-y-2">
          {METHODS.map((m) => (
            <label
              key={m.id}
              className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer ${
                method === m.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value={m.id}
                checked={method === m.id}
                onChange={() => setMethod(m.id)}
                className="mt-1"
              />
              <span>
                <span className="block font-medium text-gray-800">{m.label}</span>
                <span className="block text-xs text-gray-500">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="mt-4 w-full py-3 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 disabled:opacity-60"
      >
        {loading
          ? 'Processing...'
          : method === 'cash'
          ? 'Place Order (Pay on Delivery)'
          : 'Continue to Payment'}
      </button>
      {!user && (
        <p className="text-xs text-gray-500 mt-2 text-center">
          You&apos;ll need to log in first — we&apos;ll bring you right back here.
        </p>
      )}
    </div>
  );
}
