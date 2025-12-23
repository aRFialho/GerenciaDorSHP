// src/routes/index.ts
import { Router } from 'express';
import { getAuthUrl, shopeeCallback, refreshToken, getShopTokens } from '../controllers/AuthController';
import { syncProducts, getProducts, getProductById } from '../controllers/ProductController';
import { syncOrders, getOrders, getOrderById, resolveAlert } from '../controllers/OrderController';

const router = Router();

// Auth Routes
router.get('/auth/shopee/url', getAuthUrl);
router.get('/auth/shopee/callback', shopeeCallback);
router.post('/auth/shopee/:shop_id/refresh', refreshToken);
router.get('/auth/shopee/:shop_id/tokens', getShopTokens);

// Product Routes
router.post('/products/:shop_id/sync', syncProducts);
router.get('/products/:shop_id', getProducts);
router.get('/products/:shop_id/:item_id', getProductById);

// Order Routes
router.post('/orders/:shop_id/sync', syncOrders);
router.get('/orders/:shop_id', getOrders);
router.get('/orders/:shop_id/:order_sn', getOrderById);
router.put('/alerts/:alert_id/resolve', resolveAlert);

export default router;