# Deploying to AWS (Free Plan, new account)

Since AWS changed its free tier on **July 15, 2025**, a new account no longer
gets 12 months of free EC2/RDS. Instead you get a **Free Plan with $100 in
credit** (up to $200 if you complete the 5 onboarding tasks). Those credits
just get consumed by usage — there's no free ride if you leave things running
indefinitely. This guide is built to minimize what draws down your credits:
**one EC2 instance running everything** (Postgres + backend + frontend, all
in Docker containers), no RDS, no NAT Gateway, no load balancer.

At ~$7.59/month for a t3.micro running 24/7, a $100–200 credit balance
covers roughly 13–26 months if this is your only AWS spend — plenty of
runway for a portfolio project or MVP.

## Step 0 — Before you touch anything: set a billing alarm

AWS will not warn you when you're about to spend money. Do this first, not
last:
1. Sign in to the AWS Console → search **Billing and Cost Management**.
2. Go to **Budgets** → **Create budget** → Zero spend budget (or a custom
   dollar budget like $5).
3. Add your email for alerts.

Also go to **CloudWatch → Alarms → Billing** and create an alarm for
`Total Estimated Charge > $1` as a second tripwire.

## Step 1 — Choose the Free Plan and launch an EC2 instance

1. Create your AWS account, choosing the **Free Plan** when prompted.
2. Go to **EC2 → Launch Instance**.
3. **AMI**: Amazon Linux 2023 (free-tier eligible).
4. **Instance type**: `t3.micro` (or `t2.micro` if unavailable in your
   region) — confirm it shows a "Free tier eligible" label.
5. **Key pair**: create a new one, download the `.pem` file, keep it safe —
   you can't re-download it.
6. **Network settings**: allow SSH (port 22, restrict to "My IP" not
   "Anywhere"), HTTP (port 80), and HTTPS (port 443).
7. **Storage**: 20–30 GB gp3 (stays within the free 30 GB EBS allowance).
8. Launch.

Only allocate the one public IP that comes with the instance — don't
allocate a separate Elastic IP unless you need one, since idle/extra IPs
are billed even under the free plan exceptions.

## Step 2 — Connect and install Docker

```bash
chmod 400 your-key.pem
ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>
```

Once connected:
```bash
sudo dnf update -y
sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
# log out and back in for the group change to apply
exit
```
```bash
ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>
# install docker compose plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version
```

## Step 3 — Get the code onto the instance

Push this project to a Git repo (GitHub/GitLab) first, then:
```bash
git clone <your-repo-url> ecommerce-store
cd ecommerce-store
cp .env.example .env
nano .env   # fill in DB_PASSWORD, JWT_SECRET, and PUBLIC_URL=http://<EC2_PUBLIC_IP>
```
Generate a strong secret quickly with:
```bash
openssl rand -base64 32
```

## Step 4 — Build and run

```bash
docker compose up -d --build
```
This builds the backend jar, builds the frontend, starts Postgres, and
starts nginx listening on port 80. First build takes a few minutes on a
t3.micro (1 GB RAM) — if it runs out of memory during the Maven or npm
build, add swap first:
```bash
sudo dd if=/dev/zero of=/swapfile bs=128M count=16
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

Visit `http://<EC2_PUBLIC_IP>` in your browser — you should see the store.

## Step 5 — (Optional) put a real domain + HTTPS in front of it

Once it's working over plain HTTP:
1. Point an A record for your domain at the EC2 public IP.
2. Install Certbot for a free Let's Encrypt certificate:
   ```bash
   sudo dnf install -y certbot python3-certbot-nginx
   ```
   Since nginx here runs inside a container rather than on the host, the
   simplest path is to run certbot in standalone mode against port 80 with
   the containers briefly stopped, then mount the resulting certs into the
   nginx container and add a TLS `server` block to `deploy/nginx.conf`. If
   you'd like, I can generate that TLS-enabled nginx config for you once you
   have a domain pointed at the instance.
3. Update `.env`'s `PUBLIC_URL` to `https://yourdomain.com` and
   `docker compose up -d --build` again so the frontend rebuilds with the
   right API base URL.

## Step 6 — Wire up the Stripe webhook for production

Locally you'd use `stripe listen` to forward events, but on the real server
Stripe needs a public URL to call:
1. In the Stripe dashboard → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `http://<EC2_PUBLIC_IP>/api/payments/webhook` (or your
   domain once you've set up HTTPS — strongly preferred before going live
   with real charges, since Stripe live-mode webhooks require HTTPS).
3. Select the event `checkout.session.completed`.
4. Copy the **Signing secret** it gives you (`whsec_...`) into your `.env`
   as `STRIPE_WEBHOOK_SECRET`, then `docker compose up -d --build` to pick
   it up.
5. Use Stripe's test card `4242 4242 4242 4242` (any future expiry, any
   CVC) to place a test order end to end and confirm the order flips to
   `PAID` in your database.
6. For PayPal, swap `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` in `.env` from
   your Sandbox app to a Live app's credentials when you're ready for real
   PayPal payments, and change `paypal.base-url` in
   `application.properties` to `https://api-m.paypal.com`.

## Ongoing cost hygiene

- **Stop the instance** (not terminate — that keeps your EBS volume) when
  you're not actively using it, via EC2 console → Instance state → Stop.
  You still pay ~$0.08/month for the 20GB EBS volume while stopped, but
  compute charges stop.
- Check **Billing → Free Tier** page periodically to see credit balance.
- Don't create a NAT Gateway, Load Balancer, or RDS instance unless you
  specifically need them — none are used in this setup, and each has its
  own separate charges.
- If you outgrow a single t3.micro (more concurrent users than it can
  handle), that's the point to reconsider architecture — e.g. RDS for the
  database once you need real backups/scaling, or Amplify for the frontend
  — rather than trying to keep squeezing more onto one instance.

## Updating the app later

```bash
cd ecommerce-store
git pull
docker compose up -d --build
```
