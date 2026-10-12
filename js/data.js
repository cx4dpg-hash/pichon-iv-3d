// Carga y preparación de datos. Todo se lee de los JSON estáticos; no se duplican datos aquí.

const TRANSMISSIONS_URL = "data/vuelo/transmissions.json";
const STATIONS_URL = "data/estaciones/stations.json";
const FLIGHT_URL = "data/vuelo/flight.json";

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${url} (HTTP ${response.status})`);
  }
  return response.json();
}

export async function loadData() {
  const [transmissions, stationsFile, flightMeta] = await Promise.all([
    fetchJson(TRANSMISSIONS_URL),
    fetchJson(STATIONS_URL),
    fetchJson(FLIGHT_URL),
  ]);

  // La trayectoria principal usa únicamente "flight". preFlight y postFlight quedan
  // disponibles pero no forman parte de la trayectoria visible.
  const flight = transmissions.flight;
  if (!Array.isArray(flight) || flight.length < 2) {
    throw new Error("transmissions.json no contiene un array 'flight' utilizable");
  }

  const times = flight.map((tx) => Date.parse(tx.packetTimestampUtc));
  for (let i = 0; i < times.length; i++) {
    if (Number.isNaN(times[i])) {
      throw new Error(`packetTimestampUtc inválido en la transmisión ${flight[i].id}`);
    }
    if (i > 0 && times[i] <= times[i - 1]) {
      throw new Error(`Las transmisiones de 'flight' no están en orden temporal estricto (${flight[i].id})`);
    }
  }

  // Transmisión de máxima altitud GPS, calculada desde los datos (no se asume ningún frame).
  let maxIndex = 0;
  for (let i = 1; i < flight.length; i++) {
    if (flight[i].altitudeGpsM > flight[maxIndex].altitudeGpsM) maxIndex = i;
  }

  const stations = stationsFile.stations;
  const stationByCallsign = new Map(stations.map((s) => [s.callsign, s]));

  const estimates = flightMeta.visualEstimates;
  return {
    meta: transmissions.meta,
    flightMeta,
    initialBalloonDiameterM: estimates.initialBalloonDiameterM.value,
    payloadDimensionsM: estimates.payloadDimensionsM,
    flight,
    times,
    preFlight: transmissions.preFlight,
    postFlight: transmissions.postFlight,
    maxIndex,
    stations,
    stationByCallsign,
  };
}
