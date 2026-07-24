import Link from 'next/link';

export default function CheckoutCancel() {
  return (
    <div className="max-w-md mx-auto text-center py-16">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Checkout canceled</h1>
      <p className="text-gray-600 mb-6">No payment was made. Your cart is still saved.</p>
      <Link href="/cart" className="text-indigo-600 font-medium">Back to cart</Link>
    </div>
  );
}
