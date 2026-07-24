import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { capturePayPalOrder } from '../../lib/api';
import { useCart } from '../../lib/CartContext';

export default function PayPalReturn() {
  const router = useRouter();
  const { token: paypalOrderId } = router.query; // PayPal appends ?token=<order-id>
  const { clearCart } = useCart();

  const [status, setStatus] = useState('capturing'); // capturing | paid | failed

  useEffect(() => {
    if (!paypalOrderId) return;

    capturePayPalOrder(paypalOrderId)
      .then((res) => {
        if (res.data.status === 'PAID') {
          setStatus('paid');
          clearCart();
        } else {
          setStatus('failed');
        }
      })
      .catch(() => setStatus('failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paypalOrderId]);

  return (
    <div className="max-w-md mx-auto text-center py-16">
      {status === 'capturing' && <p className="text-gray-500">Finalizing your PayPal payment...</p>}

      {status === 'paid' && (
        <>
          <h1 className="text-2xl font-bold text-green-600 mb-2">Payment successful 🎉</h1>
          <p className="text-gray-600 mb-6">Thanks for your order — paid via PayPal.</p>
        </>
      )}

      {status === 'failed' && (
        <>
          <h1 className="text-2xl font-bold text-red-600 mb-2">Payment didn&apos;t complete</h1>
          <p className="text-gray-600 mb-6">Nothing was charged. You can try again from your cart.</p>
        </>
      )}

      <Link href="/" className="text-indigo-600 font-medium">Continue shopping</Link>
    </div>
  );
}
