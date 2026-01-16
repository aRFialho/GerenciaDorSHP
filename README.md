
```
DAVANTTI
├─ .prettierignore
├─ package-lock.json
├─ package.json
├─ prisma
│  ├─ migrations
│  │  ├─ 20251223124254_auth_tokens
│  │  │  └─ migration.sql
│  │  ├─ 20251223184759_add_orders
│  │  │  └─ migration.sql
│  │  ├─ 20251223192700_add_products
│  │  │  └─ migration.sql
│  │  ├─ 20251224130942_add_product_image_image_id
│  │  │  └─ migration.sql
│  │  ├─ 20251224132717_add_product_rating_fields
│  │  │  └─ migration.sql
│  │  ├─ 20251224140452_add_product_rating
│  │  │  └─ migration.sql
│  │  ├─ 20251229110856_add_product_shopee_create_time
│  │  │  └─ migration.sql
│  │  ├─ 20251229114741_add_product_itemsku_create_time
│  │  │  └─ migration.sql
│  │  ├─ 20251229120714_add_product_attributes
│  │  │  └─ migration.sql
│  │  ├─ 20251229121612_add_product_extra_fields
│  │  │  └─ migration.sql
│  │  ├─ 20251229142831_add_accounts_users_sessions
│  │  │  └─ migration.sql
│  │  ├─ 20251230130146_add_user_name
│  │  │  └─ migration.sql
│  │  ├─ 20260106143820_ads_campaign_groups
│  │  │  └─ migration.sql
│  │  ├─ 20260113193406_add_order_address_change_alert
│  │  │  └─ migration.sql
│  │  ├─ 20260114160718_add_order_geo_address
│  │  │  └─ migration.sql
│  │  ├─ 20260114185919_fix_geo
│  │  │  └─ migration.sql
│  │  ├─ 20260114204912_add_gmv_cents
│  │  │  └─ migration.sql
│  │  └─ migration_lock.toml
│  ├─ schema.prisma
│  └─ seed.js
├─ public
│  ├─ app.js
│  ├─ css
│  │  ├─ ads.css
│  │  ├─ dashboard.css
│  │  └─ geo-sales.css
│  ├─ index.html
│  ├─ js
│  │  └─ ads.js
│  ├─ json
│  │  └─ Geo.json
│  ├─ login.css
│  ├─ login.html
│  ├─ login.js
│  └─ styles.css
├─ README.md
└─ src
   ├─ app.js
   ├─ config
   │  ├─ addressFingerprint.js
   │  ├─ db.js
   │  ├─ env.js
   │  ├─ queue.js
   │  ├─ redis.js
   │  ├─ shopee.js
   │  └─ shopeeAds.js
   ├─ controllers
   │  ├─ AdsCampaignGroupsController.js
   │  ├─ AdsController.js
   │  ├─ AuthController.js
   │  ├─ DashboardController.js
   │  ├─ DebugController.js
   │  ├─ DebugShopeeController.js
   │  ├─ GeoSalesController.js
   │  ├─ HealthController.js
   │  ├─ OrderAddressAlertsController.js
   │  ├─ OrdersController.js
   │  ├─ OrderSyncController.js
   │  ├─ ProductsController.js
   │  ├─ ProductSyncController.js
   │  └─ WebhookController.js
   ├─ jobs
   │  ├─ orderSync.job.js
   │  └─ productSync.job.js
   ├─ lib
   │  └─ api.js
   ├─ middlewares
   │  ├─ debugToken.js
   │  ├─ errorHandler.js
   │  ├─ requestLogger.js
   │  ├─ resolveShopParam.js
   │  ├─ sessionAuth.js
   │  └─ uploadImages.js
   ├─ public
   │  └─ json
   │     └─ Geo.json
   ├─ repositories
   │  ├─ AlertRepository.js
   │  ├─ OrderRepository.js
   │  ├─ ProductRepository.js
   │  └─ TokenRepository.js
   ├─ routes
   │  ├─ admin.routes.js
   │  ├─ ads.routes.js
   │  ├─ auth.routes.js
   │  ├─ authLocal.routes.js
   │  ├─ debug.routes.js
   │  ├─ health.routes.js
   │  ├─ index.js
   │  ├─ orders.routes.js
   │  ├─ products.routes.js
   │  ├─ session.routes.js
   │  └─ webhooks.routes.js
   ├─ scripts
   │  ├─ buildGeoJson.js
   │  └─ resolveFalseAddressAlerts.js
   ├─ server.js
   ├─ services
   │  ├─ AddressChangeAlertService.js
   │  ├─ AlertService.js
   │  ├─ OrderSyncService.js
   │  ├─ ProductSyncService.js
   │  ├─ ShopeeAdsService.js
   │  ├─ ShopeeAmsService.js
   │  ├─ ShopeeAuthedHttp.js
   │  ├─ ShopeeAuthService.js
   │  ├─ ShopeeHttp.js
   │  ├─ ShopeeMediaService.js
   │  ├─ ShopeeOrderService.js
   │  ├─ ShopeeProductService.js
   │  └─ ShopeeProductWriteService.js
   ├─ utils
   │  ├─ asyncHandler.js
   │  ├─ crypto.js
   │  ├─ hash.js
   │  ├─ resolveShop.js
   │  └─ time.js
   └─ webhooks
      ├─ shopeePushParser.js
      └─ shopeePushVerifier.js

```