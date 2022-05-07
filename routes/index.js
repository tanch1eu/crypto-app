const express = require("express");
const responseTime = require("response-time");

const router = express.Router();
const axios = require("axios");
const redis = require("redis");
const AWS = require("aws-sdk");
require("dotenv").config();

// create and connect redis client to local instance
const client = redis.createClient();

// Print redis error to console
client.on("error", (err) => {
  console.log("Error" + err);
});

// use response-time as a middleware
router.use(responseTime());

/* GET home page. */
router.get("/", function (req, res, next) {
  // Construct API URL, get coin names, slugs, symbols
  // and metrics for the recent cryptocurrency market data
  const api_url =
    "http://data.messari.io/api/v2/assets?fields=name,slug,symbol,metrics/market_data,metrics/marketcap";

  // Set S3 bucket to check
  const bucketName = "n9854tan-cryptoapp-store";
  const s3Key = "crypto-allAssets";
  const params = { Bucket: bucketName, Key: s3Key };

  // Try fetching from Redis first, in case we have it cached
  return client.get("crypto: allAssets", (err, result) => {
    // If that key exist in Redis store
    if (result) {
      const redisJSON = JSON.parse(result);
      const indexes = parseData(redisJSON);
      // Render page to client side
      return res.render("index", { Indexes: indexes });
    }
    // Else if that key does not exist in Redis store
    // Check if it is in S3 store
    else {
      return new AWS.S3({ apiVersion: "2021-11-01" }).getObject(
        params,
        (err, result) => {
          if (result) {
            // Serve from S3
            // console.log(result);
            const s3JSON = JSON.parse(result.Body);
            // Save the Messari API response to Redis store
            client.setex(
              "crypto: allAssets",
              3600,
              JSON.stringify({ source: "Redis Cache", ...s3JSON })
            );
            // Render to client
            const indexes = parseData(s3JSON);
            return res.render("index", { Indexes: indexes });
          }
          // Else if it is also not stored on S3
          // Fetch data directly from Messari API and store it in both S3 and Redis
          else {
            return axios
              .get(api_url)
              .then((response) => {
                const responseJSON = response.data;
                const body = JSON.stringify({
                  source: "S3 Bucket",
                  ...responseJSON,
                });
                const objectParams = {
                  Bucket: bucketName,
                  Key: s3Key,
                  Body: body,
                };
                const uploadPromise = new AWS.S3({
                  apiVersion: "2021-11-01",
                })
                  .putObject(objectParams)
                  .promise();
                uploadPromise.then(function (data) {
                  console.log(
                    "Successfully uploaded data to " + bucketName + "/" + s3Key
                  );
                });
                // Save the Messari API response to Redis store
                client.setex(
                  "crypto: allAssets",
                  3600,
                  JSON.stringify({ source: "Redis Cache", ...responseJSON })
                );
                // Render page to client
                const indexes = parseData(responseJSON);
                return res.render("index", { Indexes: indexes });
              })
              .catch((err) => {
                console.error(err);
                return res.json(err);
              });
          }
        }
      );
    }
  });
});

// Parse data from API server responses
const parseData = (data) => {
  indexes = [];
  for (i = 0; i < data.data.length; i++) {
    item = {};
    marketData = {};
    marketCap = {};
    coin24hStats = {};

    // Extract coins names, symbols
    item.symbol = data.data[i].symbol;
    item.name = data.data[i].name;
    item.slug = data.data[i].slug;

    // Extract coin market cap %dominance
    marketCap = data.data[i].metrics.marketcap;
    item.marketCap = marketCap.marketcap_dominance_percent.toFixed(2);
    item.cap = marketCap.current_marketcap_usd.toFixed(2);

    // Extract coins prices, % change, and volume for last 24hours
    marketData = data.data[i].metrics.market_data;
    item.price = marketData.price_usd.toFixed(2);
    item.change = marketData.percent_change_usd_last_24_hours;
    if (item.change == null) {
      item.change = NaN;
    } else {
      item.change = item.change.toFixed(2);
    }
    item.volume = marketData.volume_last_24_hours.toFixed(2);

    // Extract coins statistics last 24 hours
    coin24hStats = marketData.ohlcv_last_24_hour;
    item.open = coin24hStats.open.toFixed(2);
    item.close = coin24hStats.close.toFixed(2);
    item.high = coin24hStats.high.toFixed(2);
    item.low = coin24hStats.low.toFixed(2);

    // Add item to outputs array
    indexes.push(item);
  }
  // Return crypto assets data
  return indexes;
};

module.exports = router;
