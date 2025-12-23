import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';

const router = Router();
const authController = new AuthController();

router.get('/shopee/auth-url', authController.getAuthUrl);
router.get('/shopee/callback', authController.shopeeCallback);

export default router;