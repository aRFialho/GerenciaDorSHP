// src/controllers/OrderController.ts
import { Request, Response } from 'express';
import { prisma } from '../index';
import { ShopeeService } from '../services/ShopeeService';
import { OrderStatus } from '@prisma/client'; // Assuming you might have an enum for order status

export const syncOrders = async (req: Request, res: Response) => {
  const { shop_id } = req.params;
  const shopId = parseInt(shop_id, 10);

  if (isNaN(shopId)) {
    return res.status(400).json({ message: 'Invalid shop_id provided.' });
  }

  try {
    const shopeeService = new ShopeeService(shopId);
    await shopeeService.loadTokensFromDb();

    // Fetch orders from the last 7 days (adjust as needed)
    const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    const now = Math.floor(Date.now() / 1000);

    let hasMore = true;
    let cursor: string | undefined = undefined;
    const pageSize = 100; // Max page size for get_order_list

    while (hasMore) {
      const orderListResponse = await shopeeService.getOrdersList(
        { create_time_from: sevenDaysAgo, create_time_to: now },
        pageSize,
        cursor
      );

      const orderSnList = orderListResponse.response.order_list.map((order: any) => order.order_sn);

      if (orderSnList.length > 0) {
        const orderDetailsResponse = await shopeeService.getOrderDetails(orderSnList);

        for (const orderDetail of orderDetailsResponse.response.order_list) {
          const existingOrder = await prisma.order.findUnique({
            where: { order_sn: orderDetail.order_sn },
            include: { alerts: true },
          });

          // Check for address change
          if (existingOrder && existingOrder.recipient_address &&
            JSON.stringify(existingOrder.recipient_address) !== JSON.stringify(orderDetail.recipient_address)) {
            await prisma.alert.create({
              data: {
                shopId: shopId,
                orderId: existingOrder.id,
                type: 'ADDRESS_CHANGE',
                message: `Endereço de entrega do pedido ${orderDetail.order_sn} foi alterado.`,
              },
            });
          }

          // Check for shipping delay risk (simplified example)
          // This would require more sophisticated logic, e.g., comparing expected ship date with current date
          // For now, let's assume if order_status is 'READY_TO_SHIP' for too long, it's a risk.
          if (orderDetail.order_status === 'READY_TO_SHIP' && existingOrder &&
            existingOrder.create_time && (Date.now() - existingOrder.create_time.getTime() > 3 * 24 * 60 * 60 * 1000) && // 3 days
            !existingOrder.alerts.some(alert => alert.type === 'SHIPPING_DELAY_RISK' && !alert.is_resolved)) {
            await prisma.alert.create({
              data: {
                shopId: shopId,
                orderId: existingOrder.id,
                type: 'SHIPPING_DELAY_RISK',
                message: `Risco de atraso na expedição do pedido ${orderDetail.order_sn}. Status: ${orderDetail.order_status}.`,
              },
            });
          }

          const upsertedOrder = await prisma.order.upsert({
            where: { order_sn: orderDetail.order_sn },
            update: {
              order_status: orderDetail.order_status,
              shipping_carrier: orderDetail.shipping_carrier,
              total_amount: orderDetail.total_amount,
              recipient_address: orderDetail.recipient_address,
              pay_time: orderDetail.pay_time ? new Date(orderDetail.pay_time * 1000) : null,
              create_time: orderDetail.create_time ? new Date(orderDetail.create_time * 1000) : null,
              update_time: orderDetail.update_time ? new Date(orderDetail.update_time * 1000) : null,
              updatedAt: new Date(),
            },
            create: {
              shopId: shopId,
              order_sn: orderDetail.order_sn,
              order_status: orderDetail.order_status,
              shipping_carrier: orderDetail.shipping_carrier,
              total_amount: orderDetail.total_amount,
              recipient_address: orderDetail.recipient_address,
              pay_time: orderDetail.pay_time ? new Date(orderDetail.pay_time * 1000) : null,
              create_time: orderDetail.create_time ? new Date(orderDetail.create_time * 1000) : null,
              update_time: orderDetail.update_time ? new Date(orderDetail.update_time * 1000) : null,
            },
          });

          // Sync order items
          for (const item of orderDetail.item_list) {
            await prisma.orderItem.upsert({
              where: {
                orderId_item_id_model_id: { // Composite unique key for order items
                  orderId: upsertedOrder.id,
                  item_id: item.item_id,
                  model_id: item.model_id || 0, // Use 0 if model_id is null/undefined
                },
              },
              update: {
                item_name: item.item_name,
                item_sku: item.item_sku,
                model_name: item.model_name,
                model_sku: item.model_sku,
                quantity: item.model_quantity || item.item_quantity,
                unit_price: item.model_original_price || item.item_original_price,
                updatedAt: new Date(),
              },
              create: {
                orderId: upsertedOrder.id,
                item_id: item.item_id,
                item_name: item.item_name,
                item_sku: item.item_sku,
                model_id: item.model_id,
                model_name: item.model_name,
                model_sku: item.model_sku,
                quantity: item.model_quantity || item.item_quantity,
                unit_price: item.model_original_price || item.item_original_price,
              },
            });
          }
        }
      }

      hasMore = orderListResponse.response.has_more;
      cursor = orderListResponse.response.next_cursor;
    }

    await prisma.syncLog.create({
      data: {
        shopId: shopId,
        sync_type: 'ORDER',
        status: 'SUCCESS',
        message: 'Order synchronization completed successfully.',
      },
    });

    res.status(200).json({ message: 'Orders synchronized successfully.' });
  } catch (error: any) {
    console.error('Error syncing orders:', error);
    await prisma.syncLog.create({
      data: {
        shopId: shopId,
        sync_type: 'ORDER',
        status: 'FAILED',
        message: `Order synchronization failed: ${error.message}`,
      },
    });
    res.status(500).json({ message: 'Failed to synchronize orders.', error: error.message });
  }
};

export const getOrders = async (req: Request, res: Response) => {
  const { shop_id } = req.params;
  const shopId = parseInt(shop_id, 10);

  if (isNaN(shopId)) {
    return res.status(400).json({ message: 'Invalid shop_id provided.' });
  }

  try {
    const orders = await prisma.order.findMany({
      where: { shopId: shopId },
      include: { items: true, alerts: { where: { is_resolved: false } } },
      orderBy: { create_time: 'desc' },
    });
    res.status(200).json(orders);
  } catch (error: any) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ message: 'Failed to fetch orders.', error: error.message });
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  const { shop_id, order_sn } = req.params;
  const shopId = parseInt(shop_id, 10);

  if (isNaN(shopId)) {
    return res.status(400).json({ message: 'Invalid shop_id provided.' });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { order_sn: order_sn, shopId: shopId },
      include: { items: true, alerts: true },
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }
    res.status(200).json(order);
  } catch (error: any) {
    console.error('Error fetching order by SN:', error);
    res.status(500).json({ message: 'Failed to fetch order.', error: error.message });
  }
};

export const resolveAlert = async (req: Request, res: Response) => {
  const { alert_id } = req.params;
  const alertId = parseInt(alert_id, 10);

  if (isNaN(alertId)) {
    return res.status(400).json({ message: 'Invalid alert_id provided.' });
  }

  try {
    const alert = await prisma.alert.update({
      where: { id: alertId },
      data: { is_resolved: true },
    });
    res.status(200).json({ message: 'Alert resolved successfully.', alert });
  } catch (error: any) {
    console.error('Error resolving alert:', error);
    res.status(500).json({ message: 'Failed to resolve alert.', error: error.message });
  }
};