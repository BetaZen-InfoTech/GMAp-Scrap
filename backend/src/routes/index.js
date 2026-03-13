const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'BetaZen G-Map Scraper API v1' });
});

router.use('/devices', require('./devices'));
router.use('/pincodes', require('./pincodes'));
router.use('/niches', require('./niches'));
router.use('/scrape-tracking', require('./scrapeTracking'));
router.use('/scraped-data', require('./scrapedData'));
router.use('/device-history', require('./deviceHistory'));
router.use('/admin', require('./admin'));

module.exports = router;
