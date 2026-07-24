import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request if present
api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth endpoints
export const signup = (data) => api.post('/auth/signup', data);
export const login = (data) => api.post('/auth/login', data);

// Product endpoints
export const getProducts = () => api.get('/products');
export const getProduct = (id) => api.get(`/products/${id}`);

// Payment endpoints
export const createCheckoutSession = (items, paymentMethodType = 'card') =>
  api.post('/payments/create-checkout-session', { items, paymentMethodType });
export const getSessionStatus = (sessionId) =>
  api.get(`/payments/session/${sessionId}`);

export const createPayPalOrder = (items) =>
  api.post('/payments/paypal/create-order', { items });
export const capturePayPalOrder = (paypalOrderId) =>
  api.post(`/payments/paypal/capture-order/${paypalOrderId}`);

export const cashCheckout = (items) =>
  api.post('/payments/cash-checkout', { items });

export const setAuthCookie = (token) => {
  Cookies.set('token', token, { expires: 1 }); // 1 day
};

export const clearAuthCookie = () => {
  Cookies.remove('token');
};

export const getAuthToken = () => Cookies.get('token');

export default api;
