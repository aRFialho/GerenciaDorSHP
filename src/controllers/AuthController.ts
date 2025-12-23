// src/controllers/AuthController.ts
import { Request, Response } from 'express';
import { prisma } from '../index';
import { ShopeeService } from '../services/ShopeeService';

export const getAuthUrl = async (req: Request, res: Response) => {
  const { shop_id } = req.query; // shop_id is passed as query param from frontend
  if (!shop_id) {
    return res.status(400).json({ message: 'shop_id is required to generate auth URL.' });
  }
  const shopeeService = new ShopeeService(parseInt(shop_id as string, 10));
  const authUrl = shopeeService.getAuthUrl();
  res.status(200).json({ authUrl });
};

export const shopeeCallback = async (req: Request, res: Response) => {
  const { code, shop_id } = req.query;

  if (!code || !shop_id) {
    return res.status(400).send('Missing code or shop_id in callback.');
  }

  const shopId = parseInt(shop_id as string, 10);

  try {
    const shopeeService = new ShopeeService(shopId);
    const authData = await shopeeService.getAccessToken(code as string);

    // Create or update shop in DB
    await prisma.shop.upsert({
      where: { shop_id: shopId },
      update: { name: `Shop ${shopId}` }, // You might fetch actual shop name later
      create: { shop_id: shopId, name: `Shop ${shopId}` },
    });

    // Redirect to frontend with success message or token info
    const frontendBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    res.redirect(`${frontendBaseUrl}?auth_success=true&shop_id=${shopId}`);
  } catch (error: any) {
    console.error('Shopee callback error:', error);
    const frontendBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    res.redirect(`${frontendBaseUrl}?auth_success=false&error=${encodeURIComponent(error.message)}`);
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  const { shop_id } = req.params;
  const shopId = parseInt(shop_id, 10);

  if (isNaN(shopId)) {
    return res.status(400).json({ message: 'Invalid shop_id provided.' });
  }

  try {
    const shopeeService = new ShopeeService(shopId);
    await shopeeService.loadTokensFromDb(); // This will attempt to refresh if needed
    res.status(200).json({ message: 'Token refreshed successfully (or was already valid).' });
  } catch (error: any) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ message: 'Failed to refresh token.', error: error.message });
  }
};

export const getShopTokens = async (req: Request, res: Response) => {
  const { shop_id } = req.params;
  const shopId = parseInt(shop_id, 10);

  if (isNaN(shopId)) {
    return res.status(400).json({ message: 'Invalid shop_id provided.' });
  }

  try {
    const token = await prisma.token.findUnique({
      where: { shopId: shopId },
      select: {
        access_token: true,
        refresh_token: true,
        expire_time: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!token) {
      return res.status(404).json({ message: 'Tokens not found for this shop.' });
    }

    res.status(200).json(token);
  } catch (error: any) {
    console.error('Error fetching shop tokens:', error);
    res.status(500).json({ message: 'Failed to fetch shop tokens.', error: error.message });
  }
};