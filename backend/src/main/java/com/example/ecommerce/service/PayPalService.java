package com.example.ecommerce.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Talks to PayPal's REST API (Orders v2) directly over HTTPS rather than
 * pulling in a full SDK — keeps the dependency surface small and avoids
 * SDK-version churn. See https://developer.paypal.com/docs/api/orders/v2/
 */
@Service
public class PayPalService {

    @Value("${paypal.client-id}")
    private String clientId;

    @Value("${paypal.client-secret}")
    private String clientSecret;

    @Value("${paypal.base-url}")
    private String baseUrl;

    private final HttpClient httpClient = HttpClient.newHttpClient();
    private final ObjectMapper mapper = new ObjectMapper();

    private String getAccessToken() throws Exception {
        String credentials = Base64.getEncoder().encodeToString(
                (clientId + ":" + clientSecret).getBytes(StandardCharsets.UTF_8));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/v1/oauth2/token"))
                .header("Authorization", "Basic " + credentials)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString("grant_type=client_credentials"))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 300) {
            throw new RuntimeException("PayPal auth failed: " + response.body());
        }
        JsonNode json = mapper.readTree(response.body());
        return json.get("access_token").asText();
    }

    /** Creates a PayPal order for the given amount and returns its PayPal order ID. */
    public String createOrder(BigDecimal amount, String currency, String returnUrl, String cancelUrl) throws Exception {
        String token = getAccessToken();

        String body = """
                {
                  "intent": "CAPTURE",
                  "purchase_units": [{
                    "amount": { "currency_code": "%s", "value": "%s" }
                  }],
                  "application_context": {
                    "return_url": "%s",
                    "cancel_url": "%s",
                    "user_action": "PAY_NOW"
                  }
                }
                """.formatted(currency, amount.setScale(2, java.math.RoundingMode.HALF_UP), returnUrl, cancelUrl);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/v2/checkout/orders"))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 300) {
            throw new RuntimeException("PayPal create order failed: " + response.body());
        }
        JsonNode json = mapper.readTree(response.body());
        return json.get("id").asText();
    }

    /** Returns the approval link the frontend should redirect the customer to. */
    public String getApprovalLink(String paypalOrderId) throws Exception {
        String token = getAccessToken();
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/v2/checkout/orders/" + paypalOrderId))
                .header("Authorization", "Bearer " + token)
                .GET()
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        JsonNode json = mapper.readTree(response.body());
        for (JsonNode link : json.get("links")) {
            if ("approve".equals(link.get("rel").asText())) {
                return link.get("href").asText();
            }
        }
        throw new RuntimeException("No approval link returned by PayPal");
    }

    /** Captures payment for an approved order. Returns true if COMPLETED. */
    public boolean captureOrder(String paypalOrderId) throws Exception {
        String token = getAccessToken();

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/v2/checkout/orders/" + paypalOrderId + "/capture"))
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(""))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 300) {
            throw new RuntimeException("PayPal capture failed: " + response.body());
        }
        JsonNode json = mapper.readTree(response.body());
        return "COMPLETED".equals(json.get("status").asText());
    }
}
