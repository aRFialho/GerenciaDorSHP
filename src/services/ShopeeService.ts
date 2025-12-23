// src/services/ShopeeService.ts
import axios from 'axios';
import crypto from 'crypto';
import querystring from 'querystring';
import { prisma } from '../index';
import { Token } from '@prisma/client';

interface ShopeeAuthResponse {
  access_token: string;
  refresh_token: string;
  expire_in: number;
  shop_id: number;
  partner_id: number;
}

interface ShopeeErrorResponse {
  message: string;
  request_id: string;
  error: string;
}

export class ShopeeService {
  private partnerId: number;
  private partnerKey: string;
  private redirectUri: string;
  private shopeeApiBase: string;
  private shopId: number; // Shopee's shop_id
  private accessToken: string | null = null;
  private refreshTokenValue: string | null = null;

  constructor(shopId: number) {
      throw new Error('Missing Shopee API environment variables.');
    }
    this.partnerId = parseInt(process.env.SHOPEE_PARTNER_ID, 10);
    this.partnerKey = process.env.SHOPEE_PARTNER_KEY;
    this.redirectUri = process.env.SHOPEE_REDIRECT_URI;
    this.shopeeApiBase = process.env.SHOPEE_API_BASE;
    this.shopId = shopId;
  }

  private generateSign(path: string, timestamp: number, accessToken?: string): string {
    const baseString = `${this.partnerId}${path}${timestamp}${accessToken ? accessToken : ''}${this.shopId}`;
    return crypto.createHmac('sha256', this.partnerKey).update(baseString).digest('hex');
  }

  public getAuthUrl(): string {
    const path = '/api/v2/shop/auth_partner';
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.generateSign(path, timestamp);

    const params = {
      partner_id: this.partnerId,
      timestamp: timestamp,
      sign: sign,
      redirect: this.redirectUri,
    };
    return `${this.shopeeApiBase}${path}?${querystring.stringify(params)}`;
  }

  public async getAccessToken(code: string): Promise<ShopeeAuthResponse> {
    const path = '/api/v2/auth/token/get';
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.generateSign(path, timestamp);

    try {
      const response = await axios.post<ShopeeAuthResponse | ShopeeErrorResponse>(
        `${this.shopeeApiBase}${path}`,
        {
          code: code,
          partner_id: this.partnerId,
          shop_id: this.shopId, // This shop_id comes from the auth callback
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Host': new URL(this.shopeeApiBase).host,
            'Authorization': `SHA256 ${sign}`,
          },
          params: {
            partner_id: this.partnerId,
            timestamp: timestamp,
            sign: sign,
          },
        }
      );

      if ('error' in response.data) {
        throw new Error(`Shopee API Error: ${response.data.message} (${response.data.error})`);
      }

      const authData = response.data as ShopeeAuthResponse;
      this.accessToken = authData.access_token;
      this.refreshTokenValue = authData.refresh_token;

      // Save token to DB
      await prisma.token.upsert({
        where: { shopId: authData.shop_id },
        update: {
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
          expire_in: authData.expire_in,
          expire_time: new Date(Date.now() + authData.expire_in * 1000),
        },
        create: {
          shop: {
            connectOrCreate: {
              where: { shop_id: authData.shop_id },
              create: { shop_id: authData.shop_id },
            },
          },
          shopId: authData.shop_id,
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
          expire_in: authData.expire_in,
          expire_time: new Date(Date.now() + authData.expire_in * 1000),
        },
      });

      return authData;
    } catch (error: any) {
      console.error('Error getting access token:', error.response?.data || error.message);
      throw new Error(`Failed to get access token: ${error.response?.data?.message || error.message}`);
    }
  }

  public async loadTokensFromDb(): Promise<boolean> {
    const token = await prisma.token.findUnique({
      where: { shopId: this.shopId },
    });

    if (token) {
      this.accessToken = token.access_token;
      this.refreshTokenValue = token.refresh_token;
      // Check if token is expired or close to expiration
      if (token.expire_time.getTime() < Date.now() + 60 * 1000) { // Expired or expires in less than 1 minute
        console.log(`Access token for shop ${this.shopId} is expired or near expiration. Attempting to refresh.`);
        await this.refreshToken();
      }
      return true;
    }
    return false;
  }

  public async refreshToken(): Promise<void> {
    if (!this.refreshTokenValue) {
      throw new Error('No refresh token available.');
    }

    const path = '/api/v2/auth/token/refresh';
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.generateSign(path, timestamp);

    try {
      const response = await axios.post<ShopeeAuthResponse | ShopeeErrorResponse>(
        `${this.shopeeApiBase}${path}`,
        {
          refresh_token: this.refreshTokenValue,
          partner_id: this.partnerId,
          shop_id: this.shopId,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Host': new URL(this.shopeeApiBase).host,
            'Authorization': `SHA256 ${sign}`,
          },
          params: {
            partner_id: this.partnerId,
            timestamp: timestamp,
            sign: sign,
          },
        }
      );

      if ('error' in response.data) {
        throw new Error(`Shopee API Error: ${response.data.message} (${response.data.error})`);
      }

      const authData = response.data as ShopeeAuthResponse;
      this.accessToken = authData.access_token;
      this.refreshTokenValue = authData.refresh_token;

      await prisma.token.update({
        where: { shopId: this.shopId },
        data: {
          access_token: authData.access_token,
          refresh_token: authData.refresh_token,
          expire_in: authData.expire_in,
          expire_time: new Date(Date.now() + authData.expire_in * 1000),
        },
      });
      console.log(`Tokens refreshed successfully for shop ${this.shopId}.`);
    } catch (error: any) {
      console.error('Error refreshing token:', error.response?.data || error.message);
      throw new Error(`Failed to refresh token: ${error.response?.data?.message || error.message}`);
    }
  }

  private async makeRequest<T>(method: 'GET' | 'POST', path: string, data?: any): Promise<T> {
    if (!this.accessToken) {
      const loaded = await this.loadTokensFromDb();
      if (!loaded || !this.accessToken) {
        throw new Error('Access token not available. Please authenticate first.');
      }
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const sign = this.generateSign(path, timestamp, this.accessToken!);

    const params = {
      partner_id: this.partnerId,
      timestamp: timestamp,
      access_token: this.accessToken!,
      shop_id: this.shopId,
      sign: sign,
      ...data, // For GET requests, data goes into params
    };

    try {
      const url = `${this.shopeeApiBase}${path}`;
      const config = {
        headers: {
          'Content-Type': 'application/json',
          'Host': new URL(this.shopeeApiBase).host,
        },
        params: method === 'GET' ? params : {
          partner_id: this.partnerId,
          timestamp: timestamp,
          access_token: this.accessToken!,
          shop_id: this.shopId,
          sign: sign,
        },
      };

      const response = await axios.request<T | ShopeeErrorResponse>({
        method,
        url,
        data: method === 'POST' ? data : undefined, // For POST requests, data goes into body
        ...config,
      });

      if ('error' in response.data) {
        throw new Error(`Shopee API Error: ${response.data.message} (${response.data.error})`);
      }

      return response.data as T;
    } catch (error: any) {
      console.error(`Error making Shopee API request to ${path}:`, error.response?.data || error.message);
      throw new Error(`Shopee API request failed: ${error.response?.data?.message || error.message}`);
    }
  }

  // --- Product API Calls ---
  public async getProductsList(offset: number = 0, pageSize: number = 100): Promise<any> {
    const path = '/api/v2/product/get_item_list';
    return this.makeRequest('GET', path, {
      offset,
      page_size: pageSize,
      item_status: 'NORMAL', // You can filter by 'NORMAL', 'UNLIST', 'BANNED', 'DELETED'
      update_time_from: 0, // Unix timestamp, filter by update time
      update_time_to: Math.floor(Date.now() / 1000),
    });
  }

  public async getProductDetails(itemIds: number[]): Promise<any> {
    const path = '/api/v2/product/get_item_base_info';
    return this.makeRequest('GET', path, {
      item_id_list: itemIds.join(','),
      // You can specify response fields to reduce payload size
      // response_optional_fields: 'description,images,attributes,price_info,stock_info,logistics_info',
    });
  }

  // --- Order API Calls ---
  public async getOrdersList(timeRange: { create_time_from: number, create_time_to: number }, pageSize: number = 100, cursor?: string): Promise<any> {
    const path = '/api/v2/order/get_order_list';
    return this.makeRequest('GET', path, {
      time_range_field: 'create_time',
      time_from: timeRange.create_time_from,
      time_to: timeRange.create_time_to,
      page_size: pageSize,
      cursor: cursor,
      order_status: 'ALL', // Get all order statuses
    });
  }

  public async getOrderDetails(orderSnList: string[]): Promise<any> {
    const path = '/api/v2/order/get_order_detail';
    return this.makeRequest('GET', path, {
      order_sn_list: orderSnList.join(','),
      // response_optional_fields: 'recipient_address,actual_shipping_cost,item_list,logistics_info',
    });
  }

  public async getLogisticsInfo(orderSn: string): Promise<any> {
    const path = '/api/v2/logistics/get_tracking_info';
    return this.makeRequest('GET', path, {
      order_sn: orderSn,
    });
  }
}