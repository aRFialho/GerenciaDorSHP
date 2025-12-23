// src/controllers/ProductController.ts
import { Request, Response } from 'express';
import { prisma } from '../index';
import { ShopeeService } from '../services/ShopeeService';

export const syncProducts = async (req: Request, res: Response) => {
  const { shop_id } = req.params;
  const shopId = parseInt(shop_id, 10);

  if (isNaN(shopId)) {
    return res.status(400).json({ message: 'Invalid shop_id provided.' });
  }

  try {
    const shopeeService = new ShopeeService(shopId);
    await shopeeService.loadTokensFromDb(); // Ensure tokens are loaded and refreshed if needed

    let hasMore = true;
    let offset = 0;
    const pageSize = 100; // Max page size for get_item_list

    while (hasMore) {
      const productListResponse = await shopeeService.getProductsList(offset, pageSize);
      const itemIds = productListResponse.response.item.map((item: any) => item.item_id);

      if (itemIds.length > 0) {
        const productDetailsResponse = await shopeeService.getProductDetails(itemIds);
        for (const item of productDetailsResponse.response.item_list) {
          await prisma.product.upsert({
            where: { item_id: item.item_id },
            update: {
              product_name: item.item_name,
              description: item.description,
              price: item.price_info[0]?.current_price || 0,
              stock: item.stock_info[0]?.current_stock || 0,
              rating_star: item.rating_star,
              sales: item.sales,
              views: item.views,
              images: item.images,
              attributes: item.attribute_list,
              updatedAt: new Date(),
            },
            create: {
              shopId: shopId,
              item_id: item.item_id,
              product_name: item.item_name,
              description: item.description,
              price: item.price_info[0]?.current_price || 0,
              stock: item.stock_info[0]?.current_stock || 0,
              rating_star: item.rating_star,
              sales: item.sales,
              views: item.views,
              images: item.images,
              attributes: item.attribute_list,
            },
          });
        }
      }

      hasMore = productListResponse.response.has_next_page;
      offset += pageSize;
    }

    await prisma.syncLog.create({
      data: {
        shopId: shopId,
        sync_type: 'PRODUCT',
        status: 'SUCCESS',
        message: 'Product synchronization completed successfully.',
      },
    });

    res.status(200).json({ message: 'Products synchronized successfully.' });
  } catch (error: any) {
    console.error('Error syncing products:', error);
    await prisma.syncLog.create({
      data: {
        shopId: shopId,
        sync_type: 'PRODUCT',
        status: 'FAILED',
        message: `Product synchronization failed: ${error.message}`,
      },
    });
    res.status(500).json({ message: 'Failed to synchronize products.', error: error.message });
  }
};

export const getProducts = async (req: Request, res: Response) => {
  const { shop_id } = req.params;
  const shopId = parseInt(shop_id, 10);

  if (isNaN(shopId)) {
    return res.status(400).json({ message: 'Invalid shop_id provided.' });
  }

  try {
    const products = await prisma.product.findMany({
      where: { shopId: shopId },
      orderBy: { updatedAt: 'desc' },
    });
    res.status(200).json(products);
  } catch (error: any) {
    console.error('Error fetching products:', error);
    res.status(500).json({ message: 'Failed to fetch products.', error: error.message });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  const { shop_id, item_id } = req.params;
  const shopId = parseInt(shop_id, 10);
  const itemId = parseInt(item_id, 10);

  if (isNaN(shopId) || isNaN(itemId)) {
    return res.status(400).json({ message: 'Invalid shop_id or item_id provided.' });
  }

  try {
    const product = await prisma.product.findUnique({
      where: { item_id: itemId, shopId: shopId },
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found.' });
    }
    res.status(200).json(product);
  } catch (error: any) {
    console.error('Error fetching product by ID:', error);
    res.status(500).json({ message: 'Failed to fetch product.', error: error.message });
  }
};