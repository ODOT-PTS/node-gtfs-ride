/* global document, fetch, Chart, routes */

let routeId;
let directionId;
let boardAlightData;
const routeSelect = document.querySelector('#route-select');
const directionSelect = document.querySelector('#direction-select');

const chart = new Chart('gtfs-ride-chart', {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Boardings',
      backgroundColor: 'rgb(75, 192, 192)',
      borderColor: 'rgb(75, 192, 192)',
      data: [],
      lineTension: 0,
      fill: false
    }, {
      label: 'Alightings',
      fill: false,
      backgroundColor: 'rgb(255, 99, 132)',
      borderColor: 'rgb(255, 99, 132)',
      data: [],
      lineTension: 0
    }]
  },
  options: {
    responsive: true,
    title: {
      display: true,
      text: 'Ridership'
    },
    tooltips: {
      mode: 'index',
      intersect: false
    },
    hover: {
      mode: 'nearest',
      intersect: true
    },
    scales: {
      xAxes: [{
        display: true,
        scaleLabel: {
          display: true,
          labelString: 'Stop'
        }
      }],
      yAxes: [{
        display: true,
        scaleLabel: {
          display: true,
          labelString: 'Riders'
        }
      }]
    }
  }
});

function formatRouteName(route) {
  const nameParts = [];

  if (route.route_short_name !== '' && route.route_short_name !== null) {
    nameParts.push(route.route_short_name);
  }

  if (route.route_long_name !== '' && route.route_long_name !== null) {
    nameParts.push(route.route_long_name);
  }

  return nameParts.join(' - ');
}

function formatDirectionName(direction) {
  const nameParts = [];

  if (direction.direction_id !== '' && direction.direction_id !== null) {
    nameParts.push(direction.direction_id);
  } else {
    nameParts.push('None');
  }

  if (direction.trip_headsign !== '' && direction.trip_headsign !== null) {
    nameParts.push(direction.trip_headsign);
  }

  return nameParts.join(' - ');
}

async function getBoardAlights() {
  boardAlightData = await fetch(`/api/board-alights?route_id=${routeId}&direction_id=${directionId}`).then(response => response.json());
}

function updateChart() {
  const route = routes.find(route => route.route_id === routeId);

  if (boardAlightData.routeStopOrder.length === 0) {
    alert(`No ridership data available for Route ${formatRouteName(route)}.`);
  }

  const data = boardAlightData.routeStopOrder.map(stopId => {
    const stop = boardAlightData.stops.find(stop => stop.stop_id === stopId);
    return {
      label: stop.stop_name,
      stop_id: stop.stop_id,
      boardings: 0,
      alightings: 0,
      load_count: 0
    };
  });

  for (const boardAlight of boardAlightData.boardAlights) {
    const dataPoint = data.find(item => item.stop_id === boardAlight.stop_id);

    if (boardAlight.boardings !== null) {
      dataPoint.boardings += boardAlight.boardings;
    }

    if (boardAlight.alightings !== null) {
      dataPoint.alightings += boardAlight.alightings;
    }

    if (boardAlight.load_count !== null) {
      dataPoint.load_count += boardAlight.load_count;
    }
  }

  chart.data.labels = data.map(item => item.label);
  chart.data.datasets[0].data = data.map(item => item.boardings);
  chart.data.datasets[1].data = data.map(item => item.alightings);
  chart.options.title.text = `Ridership on Route ${formatRouteName(route)}, direction ${directionId}`;

  chart.update();
}

routeSelect.addEventListener('change', event => {
  directionSelect.length = 0;
  if (event.target.value === '') {
    directionSelect.parentElement.classList.add('hidden');
    return;
  }

  routeId = event.target.value;

  const route = routes.find(route => route.route_id === routeId);

  const option = document.createElement('option');
  option.text = 'Select a direction';
  option.value = '';
  directionSelect.append(option);

  for (const direction of route.directions) {
    const option = document.createElement('option');
    option.text = formatDirectionName(direction);
    option.value = direction.direction_id === null ? 'null' : direction.direction_id;
    directionSelect.append(option);
  }

  directionSelect.parentElement.classList.remove('hidden');
});

directionSelect.addEventListener('change', async event => {
  if (event.target.value === '') {
    return;
  }

  directionId = event.target.value;

  boardAlights = await getBoardAlights();

  updateChart();
});
