package com.example.ecommerce.controller;

import com.example.ecommerce.dto.CheckoutRequest;
import com.example.ecommerce.model.Order;
import com.example.ecommerce.model.OrderItem;
import com.example.ecommerce.model.Product;
import com.example.ecommerce.model.User;
import com.example.ecommerce.repository.OrderRepository;
import com.example.ecommerce.repository.ProductRepository;
import com.example.ecommerce.repository.UserRepository;
import com.example.ecommerce.service.PayPalService;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.exception.StripeException;
import com.stripe.model.Event;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import com.stripe.param.checkout.SessionCreateParams;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    @Autowired private ProductRepository productRepository;
    @Autowired private OrderRepository orderRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private PayPalService payPalService;

    @Value("${stripe.webhook-secret}")
    private String webhookSecret;

    @Value("${app.frontend-url}")
    private String frontendUrl;

    // ---------------------------------------------------------------
    // Shared: build an Order (with items priced from the DB, never
    // trusting client-supplied prices) from a cart payload. Used by all
    // three payment methods so pricing logic lives in exactly one place.
    // ---------------------------------------------------------------
    private Order buildOrderFromCart(CheckoutRequest request, User user, Order.PaymentMethod method) {
        Order order = new Order();
        order.setUser(user);
        order.setPaymentMethod(method);
        BigDecimal total = BigDecimal.ZERO;

        for (CheckoutRequest.CartLine line : request.getItems()) {
            Product product = productRepository.findById(line.getProductId())
                    .orElseThrow(() -> new RuntimeException("Product not found: " + line.getProductId()));

            if (product.getStockQuantity() < line.getQuantity()) {
                throw new IllegalStateException("Not enough stock for " + product.getName());
            }

            OrderItem orderItem = new OrderItem(order, product, line.getQuantity(), product.getPrice());
            order.getItems().add(orderItem);
            total = total.add(product.getPrice().multiply(BigDecimal.valueOf(line.getQuantity())));
        }

        order.setTotalAmount(total);
        order.setStatus(Order.Status.PENDING);
        return order;
    }

    private void decrementStock(Order order) {
        for (OrderItem item : order.getItems()) {
            Product product = item.getProduct();
            product.setStockQuantity(product.getStockQuantity() - item.getQuantity());
            productRepository.save(product);
        }
    }

    // ---------------------------------------------------------------
    // Card payments (Stripe Checkout)
    // ---------------------------------------------------------------

    /**
     * Creates a Stripe Checkout Session from the cart the client sends up,
     * recording prices from the DB, and returns the Checkout URL for the
     * frontend to redirect to. Stripe Checkout automatically offers Apple
     * Pay / Google Pay on top of "card" for eligible devices. Cash App Pay
     * is requested as its own payment method type when the client asks for
     * it — Cash App Pay must also be turned on in the Stripe Dashboard
     * (Settings → Payment methods) and only supports USD / US accounts.
     */
    @PostMapping("/create-checkout-session")
    public ResponseEntity<?> createCheckoutSession(@Valid @RequestBody CheckoutRequest request,
                                                    Authentication authentication) {
        User user = currentUser(authentication);

        boolean isCashApp = "cashapp".equalsIgnoreCase(request.getPaymentMethodType());
        Order.PaymentMethod paymentMethod = isCashApp ? Order.PaymentMethod.CASH_APP : Order.PaymentMethod.CARD;

        Order order;
        try {
            order = buildOrderFromCart(request, user, paymentMethod);
        } catch (IllegalStateException e) {
            return conflict(e.getMessage());
        }

        List<SessionCreateParams.LineItem> lineItems = new java.util.ArrayList<>();
        for (OrderItem item : order.getItems()) {
            long unitAmountCents = item.getPriceAtPurchase()
                    .multiply(BigDecimal.valueOf(100))
                    .longValueExact();
            lineItems.add(SessionCreateParams.LineItem.builder()
                    .setQuantity(Long.valueOf(item.getQuantity()))
                    .setPriceData(
                            SessionCreateParams.LineItem.PriceData.builder()
                                    .setCurrency("usd")
                                    .setUnitAmount(unitAmountCents)
                                    .setProductData(
                                            SessionCreateParams.LineItem.PriceData.ProductData.builder()
                                                    .setName(item.getProduct().getName())
                                                    .build())
                                    .build())
                    .build());
        }

        try {
            SessionCreateParams.Builder paramsBuilder = SessionCreateParams.builder()
                    .setMode(SessionCreateParams.Mode.PAYMENT)
                    .addAllLineItem(lineItems)
                    .setSuccessUrl(frontendUrl + "/checkout/success?session_id={CHECKOUT_SESSION_ID}")
                    .setCancelUrl(frontendUrl + "/checkout/cancel")
                    .setCustomerEmail(user.getEmail());

            if (isCashApp) {
                paramsBuilder.addPaymentMethodType(SessionCreateParams.PaymentMethodType.CASHAPP);
            } else {
                paramsBuilder.addPaymentMethodType(SessionCreateParams.PaymentMethodType.CARD);
            }

            Session session = Session.create(paramsBuilder.build());

            order.setStripeSessionId(session.getId());
            orderRepository.save(order);

            return ResponseEntity.ok(Map.of("checkoutUrl", session.getUrl()));

        } catch (StripeException e) {
            return badGateway("Could not start checkout: " + e.getMessage());
        }
    }

    /**
     * Stripe calls this directly (not the browser) when a payment completes.
     * This is the source of truth for "did the customer actually pay".
     */
    @PostMapping("/webhook")
    public ResponseEntity<String> handleStripeWebhook(@RequestBody String payload,
                                                        @RequestHeader("Stripe-Signature") String sigHeader) {
        Event event;
        try {
            event = Webhook.constructEvent(payload, sigHeader, webhookSecret);
        } catch (SignatureVerificationException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid signature");
        }

        if ("checkout.session.completed".equals(event.getType())) {
            Session session = (Session) event.getDataObjectDeserializer().getObject().orElse(null);
            if (session != null) {
                orderRepository.findByStripeSessionId(session.getId()).ifPresent(order -> {
                    order.setStatus(Order.Status.PAID);
                    orderRepository.save(order);
                    decrementStock(order);
                });
            }
        }
        return ResponseEntity.ok("received");
    }

    /** Lets the frontend confirm order status after redirect back from Stripe. */
    @GetMapping("/session/{sessionId}")
    public ResponseEntity<?> getSessionStatus(@PathVariable String sessionId) {
        return orderRepository.findByStripeSessionId(sessionId)
                .<ResponseEntity<?>>map(order -> ResponseEntity.ok(orderStatusPayload(order)))
                .orElse(ResponseEntity.notFound().build());
    }

    // ---------------------------------------------------------------
    // PayPal
    // ---------------------------------------------------------------

    /**
     * Creates a local PENDING order plus a matching PayPal order, and
     * returns the PayPal approval URL to redirect the customer to.
     */
    @PostMapping("/paypal/create-order")
    public ResponseEntity<?> createPayPalOrder(@Valid @RequestBody CheckoutRequest request,
                                                Authentication authentication) {
        User user = currentUser(authentication);

        Order order;
        try {
            order = buildOrderFromCart(request, user, Order.PaymentMethod.PAYPAL);
        } catch (IllegalStateException e) {
            return conflict(e.getMessage());
        }

        try {
            String returnUrl = frontendUrl + "/checkout/paypal-return";
            String cancelUrl = frontendUrl + "/checkout/cancel";
            String paypalOrderId = payPalService.createOrder(
                    order.getTotalAmount(), "USD", returnUrl, cancelUrl);

            order.setPaypalOrderId(paypalOrderId);
            orderRepository.save(order);

            String approvalUrl = payPalService.getApprovalLink(paypalOrderId);
            return ResponseEntity.ok(Map.of("approvalUrl", approvalUrl, "paypalOrderId", paypalOrderId));

        } catch (Exception e) {
            return badGateway("Could not start PayPal checkout: " + e.getMessage());
        }
    }

    /**
     * Called by the frontend after PayPal redirects the customer back
     * approved. This actually captures the funds — approval alone does not
     * move money.
     */
    @PostMapping("/paypal/capture-order/{paypalOrderId}")
    public ResponseEntity<?> capturePayPalOrder(@PathVariable String paypalOrderId) {
        Order order = orderRepository.findByPaypalOrderId(paypalOrderId)
                .orElse(null);
        if (order == null) {
            return ResponseEntity.notFound().build();
        }

        try {
            boolean completed = payPalService.captureOrder(paypalOrderId);
            if (completed) {
                order.setStatus(Order.Status.PAID);
                orderRepository.save(order);
                decrementStock(order);
            }
            return ResponseEntity.ok(orderStatusPayload(order));
        } catch (Exception e) {
            return badGateway("Could not capture PayPal payment: " + e.getMessage());
        }
    }

    // ---------------------------------------------------------------
    // Cash on Delivery — no payment network involved. The order is placed
    // and stock reserved immediately; payment happens in person on delivery.
    // ---------------------------------------------------------------

    @PostMapping("/cash-checkout")
    public ResponseEntity<?> cashCheckout(@Valid @RequestBody CheckoutRequest request,
                                           Authentication authentication) {
        User user = currentUser(authentication);

        Order order;
        try {
            order = buildOrderFromCart(request, user, Order.PaymentMethod.CASH_ON_DELIVERY);
        } catch (IllegalStateException e) {
            return conflict(e.getMessage());
        }

        // No external payment to wait on — reserve stock now and leave the
        // order PENDING until cash is collected on delivery.
        orderRepository.save(order);
        decrementStock(order);

        return ResponseEntity.ok(Map.of(
                "orderId", order.getId(),
                "status", order.getStatus().name(),
                "totalAmount", order.getTotalAmount(),
                "message", "Order placed. Pay in cash when it's delivered."
        ));
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    private User currentUser(Authentication authentication) {
        return userRepository.findByEmail(authentication.getName())
                .orElseThrow(() -> new RuntimeException("User not found"));
    }

    private Map<String, Object> orderStatusPayload(Order order) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("status", order.getStatus().name());
        payload.put("orderId", order.getId());
        payload.put("totalAmount", order.getTotalAmount());
        payload.put("paymentMethod", order.getPaymentMethod().name());
        return payload;
    }

    private ResponseEntity<?> conflict(String message) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", message));
    }

    private ResponseEntity<?> badGateway(String message) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("message", message));
    }
}
