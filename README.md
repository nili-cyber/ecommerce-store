# Ecommerce Store — Next.js + Spring Boot + PostgreSQL

A full-stack starter: React/Next.js frontend, Spring Boot REST API backend,
PostgreSQL database, JWT-based signup/login.

```
ecommerce-store/
├── backend/     Spring Boot API (Java 17, Maven)
└── frontend/    Next.js app (React, Tailwind CSS)
```

## 1. Backend setup (Spring Boot + PostgreSQL)

### Prerequisites
- Java 17+
- Maven (or use the included `mvnw` if you add one)
- PostgreSQL running locally (or Docker)

### Create the database
```sql
CREATE DATABASE ecommerce_db;
```
Or with Docker:
```bash
docker run --name ecommerce-postgres \
  -e POSTGRES_DB=ecommerce_db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 -d postgres:16
```

### Configure
Edit `backend/src/main/resources/application.properties` if your DB
credentials differ from the defaults. **Change `jwt.secret` before deploying
anywhere real** — ideally load it from an environment variable.

### Run
```bash
cd backend
mvn spring-boot:run
```
The API starts on **http://localhost:8080**. Hibernate will auto-create the
`users` and `products` tables on first run (`ddl-auto=update`).

### Endpoints
| Method | Path                | Auth        | Description               |
|--------|---------------------|-------------|----------------------------|
| POST   | /api/auth/signup    | Public      | Register a new user, returns JWT |
| POST   | /api/auth/login     | Public      | Log in, returns JWT       |
| GET    | /api/products        | Public      | List products             |
| GET    | /api/products/{id}   | Public      | Get one product            |
| POST   | /api/products        | JWT required| Create a product           |
| PUT    | /api/products/{id}   | JWT required| Update a product           |
| DELETE | /api/products/{id}   | JWT required| Delete a product           |

Example signup:
```bash
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Jane Doe","email":"jane@example.com","password":"secret123"}'
```
Response includes a `token` — send it as `Authorization: Bearer <token>` on
protected requests.

## 2. Frontend setup (Next.js)

### Prerequisites
- Node.js 18+

### Install & configure
```bash
cd frontend
npm install
cp .env.local.example .env.local
```
`.env.local` should point at your backend:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api
```

### Run
```bash
npm run dev
```
Visit **http://localhost:3000**. Pages included:
- `/` — product listing (fetched from the backend)
- `/signup` — create account
- `/login` — log in

Auth tokens are stored in a cookie (`token`) and attached automatically to
API calls via an axios interceptor (`lib/api.js`).

## 3. Payments (Stripe)

Checkout uses **Stripe Checkout** (hosted, redirect-based) — cards, Apple Pay,
and Google Pay all work out of the box with no extra frontend code.

1. Create a free Stripe account at https://dashboard.stripe.com/register.
2. Grab your **test** keys from https://dashboard.stripe.com/test/apikeys.
3. Set `stripe.secret-key` in `application.properties` (or `STRIPE_SECRET_KEY`
   env var) to your `sk_test_...` key.
4. For local development, forward webhooks with the Stripe CLI so
   `checkout.session.completed` events reach your backend:
   ```bash
   stripe login
   stripe listen --forward-to localhost:8080/api/payments/webhook
   ```
   This prints a `whsec_...` value — put that in `stripe.webhook-secret`
   (or `STRIPE_WEBHOOK_SECRET`).
5. In production (e.g. the EC2 setup in `deploy/DEPLOY.md`), instead create a
   webhook endpoint in the Stripe dashboard pointing at
   `https://yourdomain.com/api/payments/webhook`, and use the signing secret
   it gives you.
6. Test with Stripe's [test card numbers](https://stripe.com/docs/testing) —
   e.g. `4242 4242 4242 4242`, any future expiry, any CVC.

**Checkout flow**: add items to cart (`/`) → `/cart` → pick a payment
method → for card or Cash App Pay, redirected to Stripe's hosted page; for
PayPal, redirected to PayPal's approval page; for cash-on-delivery, the
order is placed immediately with no redirect → redirected back to
`/checkout/success` (card/Cash App Pay), `/checkout/paypal-return`
(PayPal), or `/checkout/cancel`. The Stripe webhook and the PayPal capture
call — not the redirect itself — are what actually mark an order `PAID`,
so it's safe even if the customer closes the tab right after paying.

### ACH bank transfer (checking / savings accounts)

Also rides on the same Stripe integration as cards and Cash App Pay:
1. Stripe Dashboard → **Settings → Payment methods** → turn on **ACH Direct
   Debit** (sometimes labeled "US bank account").
2. That's it — picking "Bank Account (ACH)" in the cart requests
   `paymentMethodType: "ach"`, which asks Stripe for a bank-only Checkout
   page. The customer connects their bank (instant verification) or enters
   routing/account numbers manually (slower, verified via two small test
   deposits).
3. **Important difference from cards**: ACH is not instant. A customer
   approving payment starts a 1–4 business day clearing process — the order
   stays `PENDING` until Stripe confirms the funds actually arrived (a
   separate `checkout.session.async_payment_succeeded` webhook event, not
   the initial `checkout.session.completed` one). This is handled correctly
   in `PaymentController`, but worth knowing if you're wondering why an ACH
   order doesn't flip to `PAID` immediately in testing — <a
   href="https://docs.stripe.com/payments/ach-direct-debit#testing">Stripe's
   test bank accounts</a> let you simulate both instant-verification and
   microdeposit flows without actually waiting days.
4. US-only — same constraint as Cash App Pay.

### Cash App Pay

Cash App Pay rides on the same Stripe integration as cards — no separate
account or SDK needed, just one extra setting:
1. Stripe Dashboard → **Settings → Payment methods** → turn on **Cash App
   Pay**.
2. That's it for test mode — picking "Cash App Pay" in the cart hits the
   same `/api/payments/create-checkout-session` endpoint with
   `paymentMethodType: "cashapp"`, which asks Stripe for a Cash-App-only
   Checkout page instead of a card one.
3. In test mode, "paying" redirects to a mock approval page instead of the
   real Cash App; in live mode it redirects to the actual Cash App mobile
   app (or shows a QR code on desktop).
4. **Constraint to know about**: Cash App Pay only supports USD and only
   works for Stripe accounts registered as a US business — not something
   more code changes if you're outside the US.

### PayPal setup

1. Create a free developer account at https://developer.paypal.com.
2. Dashboard → **Apps & Credentials** → **Create App** (Sandbox, for
   testing) → copy the **Client ID** and **Secret**.
3. Set `paypal.client-id` / `paypal.client-secret` in
   `application.properties` (or `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`
   env vars).
4. Test with a Sandbox buyer account — the dashboard's **Sandbox Accounts**
   tab has a pre-made test buyer login (personal account) you can use to
   "pay" without real money.
5. To go live: create a Live app in the same dashboard, swap the
   credentials, and change `paypal.base-url` from
   `https://api-m.sandbox.paypal.com` to `https://api-m.paypal.com`.

### Cash on Delivery

No external service, no keys needed — `/api/payments/cash-checkout` places
the order and reserves stock immediately, and the order sits `PENDING`
until you (manually, outside this app for now) mark it fulfilled once
payment is collected in person.

New endpoints:
| Method | Path                              | Auth        | Description |
|--------|------------------------------------|-------------|--------------|
| POST   | /api/payments/create-checkout-session | JWT required | Builds a Stripe Checkout session from the cart |
| POST   | /api/payments/webhook             | Stripe signature (public) | Stripe's payment confirmation callback |
| GET    | /api/payments/session/{sessionId}  | JWT required | Poll Stripe order status after redirect back |
| POST   | /api/payments/paypal/create-order | JWT required | Creates a PayPal order, returns approval URL |
| POST   | /api/payments/paypal/capture-order/{id} | JWT required | Captures funds after PayPal approval |
| POST   | /api/payments/cash-checkout       | JWT required | Places a Cash-on-Delivery order |

## 4. Adding products
There's no admin UI yet — add products directly via the API (or build an
admin page reusing the same patterns as the product listing page):
```bash
curl -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt>" \
  -d '{
    "name": "Wireless Headphones",
    "description": "Noise-cancelling, 30hr battery",
    "price": 79.99,
    "stockQuantity": 25,
    "imageUrl": "https://images.example.com/headphones.jpg",
    "category": "Electronics"
  }'
```

## 5. Notable production TODOs
This is a working starting point, not a production-hardened app. Before
shipping, you'd want to add:
- Refresh tokens / token revocation (current JWTs just expire after 24h)
- Switch Stripe from test keys (`sk_test_...`) to live keys before real charges
- An order history page for users, and an admin view of all orders
- Input sanitization / rate limiting on auth endpoints
- Email verification & password reset flow
- Move `jwt.secret` and DB credentials to environment variables / a secrets manager
- HTTPS in front of both services, and tightened CORS origins
- Pagination and search on `/api/products`
- Tests (JUnit for backend, React Testing Library for frontend)
