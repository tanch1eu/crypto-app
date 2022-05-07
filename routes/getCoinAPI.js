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

// Get daily metrics data for a specific coin
router.get("/coinTrend/:coin", (req, res) => {
  let { coin } = req.params;
  let api_url = `http://data.messari.io/api/v1/assets/${coin}/metrics/price/time-series?timestamp-format=rfc3339&interval=1d&format=json`;

  // Set S3 bucket to check
  const bucketName = "n9854tan-cryptoapp-store";
  const s3Key = `crypto-${coin}`;
  const params = { Bucket: bucketName, Key: s3Key };

  // Try fetching from Redis first, in case we have it cached
  return client.get(`crypto: ${coin}`, (err, result) => {
    // If that key exist in Redis store
    if (result) {
      const redisJSON = JSON.parse(result);
      const values = redisJSON.data.values;
      const historyData = parsePrices(values);
      // console.log(historyData);
      // Return data
      return res.json({ historyData });
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
              `crypto: ${coin}`,
              3600,
              JSON.stringify({ source: "Redis Cache", ...s3JSON })
            );
            const values = s3JSON.data.values;
            const historyData = parsePrices(values);
            // console.log(historyData);
            // Return data
            return res.json({ historyData });
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
                  `crypto: ${coin}`,
                  3600,
                  JSON.stringify({ source: "Redis Cache", ...responseJSON })
                );
                const values = responseJSON.data.values;
                const historyData = parsePrices(values);
                // console.log(historyData);
                // Return data
                return res.json({ historyData });
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
const parsePrices = (data) => {
  let historyData = {
    prices: [],
    timeStamp: [],
  };
  for (i = 0; i < data.length; i++) {
    historyData.timeStamp.push(data[i][0]);
    historyData.prices.push(data[i][1]);
  }
  return historyData;
};

module.exports = router;
