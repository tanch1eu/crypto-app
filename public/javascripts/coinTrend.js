// Fetch daily coin trading data from server API

// Prepare Canvas to plot charts
var ctx = document.getElementById("plotChart").getContext("2d");
var emptyCanvas = true;

// Event listener handle onClick for each Crypto asset
const coins = document.getElementsByClassName("getCoin");
for (let coin of coins) {
  coin.addEventListener("click", (event) => {
    fetchCoin(event);
  });
}

// Function to handle onClick for each Crypto asset
// retrieve data from server, then plot charts.
const fetchCoin = (event) => {
  const coin = event.target.textContent;
  fetch(`/api/coinTrend/${coin}`)
    .then((res) => res.json())
    .then((data) => {
      // console.log(data);
      const xLabels = data.historyData.timeStamp;
      // console.log(xLabels);
      const yData = data.historyData.prices;
      // console.log(yData);
      getChart(xLabels, yData, coin);
    })
    .catch((error) => console.log(error));
};

// Function to plot Chart, inspired by ChartJS
function getChart(xs, ys, coin) {
  if (emptyCanvas === true) {
    var plotChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: xs,
        datasets: [
          {
            label: coin,
            data: ys,
            backgroundColor: "rgba(255, 99, 132, 0.2)",
            borderColor: "rgba(255, 99, 132, 1)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        layout: {
          padding: 20,
        },
        scales: {
          y: {
            ticks: {
              // Include a dollar sign in the ticks
              callback: function (value) {
                return "$ " + value;
              },
            },
          },
        },
      },
    });
  } else {
    removeData(plotChart);
    addData(plotChart, xs, ys);
  }
}
function addData(chart, label, data) {
  chart.data.labels.push(label);
  chart.data.datasets.forEach((dataset) => {
    dataset.data.push(data);
  });
  chart.update();
}
function removeData(chart) {
  chart.data.labels.pop();
  chart.data.datasets.forEach((dataset) => {
    dataset.data.pop();
  });
  chart.update();
}
