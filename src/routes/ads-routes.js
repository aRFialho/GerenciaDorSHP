const express = require("express");
const { requireAuth } = require("../middlewares/sessionAuth");
const AdsController = require("../controllers/AdsController");

const router = express.Router();
router.use(requireAuth);

router.get("/shops/:shopId/ads/balance", AdsController.balance);
router.get(
  "/shops/:shopId/ads/performance/daily",
  AdsController.dailyPerformance
);
router.get("/shops/:shopId/ads/campaigns/ids", AdsController.listCampaignIds);
router.get(
  "/shops/:shopId/ads/campaigns/settings",
  AdsController.campaignSettings
);
router.get(
  "/shops/:shopId/ads/campaigns/performance/daily",
  AdsController.campaignsDailyPerformance
);
router.post(
  "/shops/:shopId/ads/gms/campaign/performance",
  AdsController.gmsCampaignPerformance
);
router.post(
  "/shops/:shopId/ads/gms/items/performance",
  AdsController.gmsItemsPerformance
);

router.get("/shops/:shopId/ads/gms/eligibility", AdsController.gmsEligibility);

router.post(
  "/shops/:shopId/ads/gms/campaign/create",
  AdsController.gmsCreateCampaign
);
router.post(
  "/shops/:shopId/ads/gms/campaign/edit",
  AdsController.gmsEditCampaign
);

router.post(
  "/shops/:shopId/ads/gms/items/deleted",
  AdsController.gmsDeletedItems
);

module.exports = router;
