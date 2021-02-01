/* global document, fetch, alert, Chart, luxon, _, routes */

let routeId;
let directionId;
let selectedDay;
let graphType;
let boardAlightData;
const routeSelect = document.querySelector('#route-select');
const graphTypeSelect = document.querySelector('#graph-type-select');
const directionSelect = document.querySelector('#direction-select');
const daySelect = document.querySelector('#day-select');

const stopGraph = new Chart('stop-graph', {
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

const dayGraph = new Chart('day-graph', {
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
  let directionParameter = '';

  if (graphType === 'stop') {
    directionParameter = `&direction_id=${directionId}`;
  }

  boardAlightData = await fetch(`/api/board-alights?route_id=${routeId}${directionParameter}`).then(response => response.json());
}

function updateStopGraph() {
  const route = routes.find(route => route.route_id === routeId);

  if (boardAlightData.routeStopOrder.length === 0) {
    /* eslint-disable-next-line no-alert */
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
    if (selectedDay !== undefined && selectedDay !== 'all' && selectedDay !== boardAlight.service_date.toString()) {
      continue;
    }

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

  stopGraph.data.labels = data.map(item => item.label);
  stopGraph.data.datasets[0].data = data.map(item => item.boardings);
  stopGraph.data.datasets[1].data = data.map(item => item.alightings);
  stopGraph.options.title.text = `Ridership on Route ${formatRouteName(route)}, direction ${directionId}`;

  hideGraphs();
  document.querySelector('#stop-graph').style.display = 'block';
  stopGraph.update();
}

function updateDayGraph() {
  const route = routes.find(route => route.route_id === routeId);

  if (boardAlightData.boardAlights.length === 0) {
    /* eslint-disable-next-line no-alert */
    alert(`No ridership data available for Route ${formatRouteName(route)}.`);
  }

  const data = [];

  for (const boardAlight of boardAlightData.boardAlights) {
    let dataPoint = data.find(item => item.service_date === boardAlight.service_date);

    if (!dataPoint) {
      dataPoint = {
        label: luxon.DateTime.fromFormat(boardAlight.service_date.toString(), 'yyyyMMdd').toISODate(),
        service_date: boardAlight.service_date,
        boardings: 0,
        alightings: 0,
        load_count: 0
      };
      data.push(dataPoint);
    }

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

  const sortedData = _.sortBy(data, 'service_date');

  dayGraph.data.labels = sortedData.map(item => item.label);
  dayGraph.data.datasets[0].data = sortedData.map(item => item.boardings);
  dayGraph.data.datasets[1].data = sortedData.map(item => item.alightings);
  dayGraph.options.title.text = `Ridership on Route ${formatRouteName(route)}`;

  hideGraphs();
  document.querySelector('#day-graph').style.display = 'block';
  dayGraph.update();
}

function hideGraphSelect() {
  graphTypeSelect.selectedIndex = 0;
  graphTypeSelect.parentElement.classList.add('hidden');
}

function hideDirectionSelect() {
  directionSelect.length = 0;
  directionSelect.parentElement.classList.add('hidden');
}

function hideDaySelect() {
  daySelect.length = 0;
  daySelect.parentElement.classList.add('hidden');
}

function hideGraphs() {
  document.querySelector('#day-graph').style.display = 'none';
  document.querySelector('#stop-graph').style.display = 'none';
}

routeSelect.addEventListener('change', event => {
  hideDirectionSelect();
  hideDaySelect();
  if (event.target.value === '') {
    hideGraphSelect();
    return;
  }

  graphTypeSelect.selectedIndex = 0;
  hideGraphs();

  routeId = event.target.value;

  graphTypeSelect.parentElement.classList.remove('hidden');
});

graphTypeSelect.addEventListener('change', async event => {
  hideDirectionSelect();
  hideDaySelect();
  if (event.target.value === '') {
    return;
  }

  graphType = event.target.value;

  if (graphType === 'stop') {
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
    hideGraphs();
  } else if (graphType === 'day') {
    directionSelect.length = 0;
    daySelect.length = 0;
    daySelect.parentElement.classList.add('hidden');
    directionSelect.parentElement.classList.add('hidden');

    await getBoardAlights();

    updateDayGraph();
  }
});

directionSelect.addEventListener('change', async event => {
  hideDaySelect();
  if (event.target.value === '') {
    return;
  }

  directionId = event.target.value;

  await getBoardAlights();

  updateStopGraph();

  const option = document.createElement('option');
  option.text = 'all';
  option.value = 'all';
  daySelect.append(option);
  const days = _.map(_.uniqBy(boardAlightData.boardAlights, 'service_date'), 'service_date');
  for (const day of days) {
    const option = document.createElement('option');
    option.text = luxon.DateTime.fromFormat(day.toString(), 'yyyyMMdd').toISODate();
    option.value = day;
    daySelect.append(option);
  }

  daySelect.parentElement.classList.remove('hidden');
});

daySelect.addEventListener('change', async event => {
  selectedDay = event.target.value;
  updateStopGraph();
});
