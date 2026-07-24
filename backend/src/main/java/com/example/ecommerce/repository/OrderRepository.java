package com.example.ecommerce.repository;

import com.example.ecommerce.model.Order;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {
    Optional<Order> findByStripeSessionId(String stripeSessionId);
    Optional<Order> findByPaypalOrderId(String paypalOrderId);
    List<Order> findByUserIdOrderByCreatedAtDesc(Long userId);
}
