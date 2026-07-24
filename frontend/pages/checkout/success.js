import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { getSessionStatus } from '../../lib/api';
import { useCart } from '../../lib/CartContext';

export default function CheckoutSuccess() {
  const router = useRouter();
  const { session_id } = router.query;
  const { clearCart } = useCart();

  const [status, setStatus] = useState('checking'); // checking | paid | pending | error

  useEffect(() => {
    if (!session_id) return;

    let attempts = 0;
    const poll = async () => {
      try {
        const res = await getSessionStatus(session_id);
        if (res.data.status === 'PAID') {
          setStatus('paid');
          clearCart();
          return;
        }
        attempts += 1;
        if (attempts < 6) {
          // Webhook may take a couple seconds to arrive — poll briefly
          setTimeout(poll, 1500);
        } else {
          setStatus('pending');
        }
      } catch (e) {
        setStatus('error');
      }
    };

    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session_id]);

  return (
    <div className="max-w-md mx-auto text-center py-16">
      {status === 'checking' && <p className="text-gray-500">Confirming your payment...</p>}

      {status === 'paid' && (
        <>
          <h1 className="text-2xl font-bold text-green-600 mb-2">Payment successful 🎉</h1>
          <p className="text-gray-600 mb-6">Thanks for your order — a confirmation has been recorded.</p>
        </>
      )}

      {status === 'pending' && (
        <>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Almost there</h1>
          <p className="text-gray-600 mb-6">
            Stripe is still confirming your payment. This page will update shortly — feel free to refresh.
          </p>
        </>
      )}

      {status === 'error' && (
        <>
          <h1 className="text-2xl font-bold text-red-600 mb-2">Something went wrong</h1>
          <p className="text-gray-600 mb-6">We couldn&apos;t confirm your order status. Contact support if you were charged.</p>
        </>
      )}

      <Link href="/" className="text-indigo-600 font-medium">Continue shopping</Link>
    </div>
  );
}
