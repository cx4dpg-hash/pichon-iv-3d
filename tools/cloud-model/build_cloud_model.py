#!/usr/bin/env python3
"""Genera data/clouds/cloud-model.json (modelo meteorológico de la nubosidad del vuelo de PICHÓN IV).

Entradas:
  --goes-dir  carpeta con subcarpetas ACHA2KMF/, ACTPF/, ACHTF/, ACHAF/ de NetCDF GOES-19 L2
              (bucket público noaa-goes19, ver docs/CLOUD_MODEL.md). Los NetCDF NO se versionan.
  data/clouds/sources/metar/*.csv     METAR crudos (IEM asos.py), versionados.
  data/vuelo/transmissions.json       telemetría in situ (solo como verificación cruzada).
Salidas:
  data/clouds/cloud-model.json
  data/clouds/sources/goes19-zone-stats.json   estadística por zona/escena (extracto pequeño)

Requiere numpy, netCDF4 y pyproj (opcional --pylib para una carpeta con estos paquetes).
Todo valor numérico sale de datos leídos; lo que no se sustenta queda como "unknown".
"""
import argparse, csv, glob, json, os, re, sys
from datetime import datetime, timedelta, timezone

ap = argparse.ArgumentParser()
ap.add_argument('--goes-dir', required=True)
ap.add_argument('--pylib')
ap.add_argument('--repo', default=os.path.join(os.path.dirname(__file__), '..', '..'))
args = ap.parse_args()
if args.pylib: sys.path.insert(0, args.pylib)
import numpy as np, netCDF4
from pyproj import Proj

REPO = os.path.abspath(args.repo)
H = 35786023.0  # altura del satélite (m), GOES-R fixed grid
P = Proj(proj='geos', h=H, lon_0=-75.0, sweep='x', a=6378137.0, b=6356752.31414)  # GOES-19 en -75.0

# ---------------------------------------------------------------- configuración documentada
STATE_TIMES_Z = ['13:20', '13:50', '14:20', '14:50', '15:20', '15:50', '16:20']  # cada 30 min
DAY = '2026-10-11'
LAT_BAND = (-34.7, -33.9)   # franja de muestreo satelital alrededor de la trayectoria (lat -34.38..-34.17)
ZONES = [
    {'id': 'Z1-centro-oeste', 'name': 'Centro-oeste (desde el lanzamiento hasta ~54.2°W)', 'lon': (-55.50, -54.20)},
    {'id': 'Z2-este', 'name': 'Este (desde ~54.2°W hasta la zona de caída)', 'lon': (-54.20, -53.85)},
]
ZONE_DIFF_MIN_M = 150.0  # una zona nueva solo se justifica si las medianas de tope difieren más que esto
METAR_RADIUS_KM = 130.0
SECONDARY_AGREE_M = 300.0
FT = 0.3048
UTC = timezone.utc
LOCAL = timezone(timedelta(hours=-3))

def iso_z(dt): return dt.strftime('%Y-%m-%dT%H:%M:%SZ')
def iso_l(dt): return dt.astimezone(LOCAL).strftime('%Y-%m-%dT%H:%M:%S-03:00')
def state_dt(hhmm): return datetime.fromisoformat(f'{DAY}T{hhmm}:00+00:00')

# ---------------------------------------------------------------- lectura GOES
def window(ds, lat0, lat1, lon0, lon1):
    x = ds.variables['x'][:]; y = ds.variables['y'][:]
    xs, ys = [], []
    for lat in np.linspace(lat0, lat1, 7):
        for lon in np.linspace(lon0, lon1, 7):
            px, py = P(lon, lat); xs.append(px / H); ys.append(py / H)
    xi = np.where((x >= min(xs)) & (x <= max(xs)))[0]; yi = np.where((y >= min(ys)) & (y <= max(ys)))[0]
    return slice(xi.min(), xi.max() + 1), slice(yi.min(), yi.max() + 1), np.asarray(x[xi.min():xi.max() + 1]), np.asarray(y[yi.min():yi.max() + 1])

def find_scan(prod, hhmm):
    tag = hhmm.replace(':', '')
    hits = sorted(glob.glob(os.path.join(args.goes_dir, prod, f'*_s2026284{tag}*.nc')))
    return hits[0] if hits else None

def load(prod, key, hhmm, box=(-35.2, -33.4, -56.4, -53.0)):
    f = find_scan(prod, hhmm)
    if f is None: return None
    ds = netCDF4.Dataset(f)
    sx, sy, x, y = window(ds, *box)
    ds.set_auto_maskandscale(False)
    var = ds.variables[key]; raw = var[sy, sx]
    sf = getattr(var, 'scale_factor', 1.0); ao = getattr(var, 'add_offset', 0.0); fv = getattr(var, '_FillValue', None)
    arr = raw.astype('float64') * sf + ao
    if fv is not None: arr[raw == fv] = np.nan
    X, Y = np.meshgrid(x * H, y * H); lon, lat = P(X, Y, inverse=True)
    name = os.path.basename(f)
    ds.close()
    return {'arr': arr, 'raw': raw, 'lat': lat, 'lon': lon, 'file': name}

def zone_mask(g, zone, lat_band=LAT_BAND):
    return np.isfinite(g['lat']) & (g['lat'] >= lat_band[0]) & (g['lat'] <= lat_band[1]) & (g['lon'] >= zone['lon'][0]) & (g['lon'] < zone['lon'][1])

def pct(a, q): return float(np.percentile(a, q)) if a.size else None

def zone_stats(hhmm, zone):
    ht = load('ACHA2KMF', 'HT', hhmm); ph = load('ACTPF', 'Phase', hhmm); tt = load('ACHTF', 'TEMP', hhmm)
    out = {'scan': hhmm + 'Z', 'files': {k: (v['file'] if v else None) for k, v in (('ACHA2KMF', ht), ('ACTPF', ph), ('ACHTF', tt))}}
    if ht:
        m = zone_mask(ht, zone); h = ht['arr'][m]; hv = h[np.isfinite(h)]
        out.update(pixelsInZone=int(m.sum()), topPixels=int(hv.size), topMedianM=pct(hv, 50), topP10M=pct(hv, 10), topP90M=pct(hv, 90), topMaxM=float(hv.max()) if hv.size else None)
    if ph:
        m = zone_mask(ph, zone); r = ph['raw'][m]; valid = r != 255
        counts = {int(k): int((r == k).sum()) for k in range(0, 6)}
        cloudy = int((((r >= 1) & (r <= 5)) & valid).sum()); nvalid = int(valid.sum())
        out.update(phaseValidPixels=nvalid, cloudyPixels=cloudy, cloudFraction=(cloudy / nvalid if nvalid else None), phaseCounts=counts)
    if tt:
        m = zone_mask(tt, zone); t = tt['arr'][m]; tv = t[np.isfinite(t)]
        out.update(topTempMedianC=(float(np.median(tv)) - 273.15 if tv.size else None), topTempP10C=(pct(tv, 10) - 273.15 if tv.size else None), topTempP90C=(pct(tv, 90) - 273.15 if tv.size else None))
    return out

# ---------------------------------------------------------------- METAR
LAYER = re.compile(r'\b(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU|///)?')
VV = re.compile(r'\bVV(\d{3})\b')
def load_metars():
    out = {}
    for f in sorted(glob.glob(os.path.join(REPO, 'data', 'clouds', 'sources', 'metar', '*.csv'))):
        for r in csv.DictReader(open(f, encoding='utf-8')):
            valid = datetime.strptime(r['valid'], '%Y-%m-%d %H:%M').replace(tzinfo=UTC)
            layers = [{'cover': m.group(1), 'heightFt': int(m.group(2)) * 100, 'heightM': round(int(m.group(2)) * 100 * FT)} for m in LAYER.finditer(r['metar'])]
            vv = VV.search(r['metar'])
            out.setdefault(r['station'], {'lon': float(r['lon']), 'lat': float(r['lat']), 'obs': {}})['obs'][valid] = {'metar': r['metar'], 'layers': layers, 'verticalVisibilityFt': int(vv.group(1)) * 100 if vv else None,
                'weatherDZ': bool(re.search(r'\b[-+]?DZ\b', r['metar']))}
    return out

def km(a_lat, a_lon, b_lat, b_lon):
    from math import radians, sin, cos, asin, sqrt
    p1, p2 = radians(a_lat), radians(b_lat); dl = radians(b_lon - a_lon); dp = p2 - p1
    return 2 * 6371.0088 * asin(sqrt(sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2))

def nearest_metar(st, dt):
    best = min(st['obs'], key=lambda t: abs((t - dt).total_seconds()))
    return best, st['obs'][best], abs((best - dt).total_seconds()) / 60

# ---------------------------------------------------------------- telemetría in situ (verificación cruzada)
def insitu_top_crosscheck():
    d = json.load(open(os.path.join(REPO, 'data', 'vuelo', 'transmissions.json'), encoding='utf-8'))
    fl = [t for t in d['flight'] if t['frameNumber'] >= 10]
    asc = []
    for t in fl:
        tel = t['telemetry']
        if tel.get('barometricAltitudeM') is None or tel.get('humidityPercent') is None: continue
        if t['packetTimestampUtc'] > '2026-10-11T13:40:00Z': break
        asc.append((t['packetTimestampUtc'], tel['barometricAltitudeM'], tel['humidityPercent'], tel['externalTemperatureC']))
    hmax = max(a[2] for a in asc)
    # mayor caída de humedad entre tramas consecutivas durante el ascenso inicial
    drop = max(zip(asc, asc[1:]), key=lambda p: p[0][2] - p[1][2])
    tmin = min(asc[:12], key=lambda a: a[3])
    return {'humidityMaxPercent': hmax, 'largestHumidityDrop': {'fromAltM': drop[0][1], 'toAltM': drop[1][1], 'fromPct': drop[0][2], 'toPct': drop[1][2], 'utcFrom': drop[0][0], 'utcTo': drop[1][0]},
            'temperatureMinFirst12': {'altM': tmin[1], 'tempC': tmin[3]}}

# ---------------------------------------------------------------- construcción
def conf_top(s):
    if s['topPixels'] >= 50 and (s['topP90M'] - s['topP10M']) <= 500: return 'medium'
    return 'low'

def conf_cover(s):
    if s['phaseValidPixels'] >= 50 and s['cloudFraction'] >= 0.95: return 'high'
    return 'medium' if s['phaseValidPixels'] >= 50 else 'low'

def value(v, method, status, conf, **extra):
    d = {'value': v, 'method': method, 'status': status, 'confidence': conf}
    d.update(extra); return d

def build():
    metars = load_metars()
    zstats = {z['id']: {} for z in ZONES}
    for z in ZONES:
        for t in STATE_TIMES_Z: zstats[z['id']][t] = zone_stats(t, z)
    # serie de 10 min (ACHAF, 10 km) para justificar la resolución temporal
    series10 = {z['id']: [] for z in ZONES}
    tags10 = [f'{h:02d}:{m:02d}' for h in range(13, 17) for m in range(0, 60, 10) if (h, m) >= (13, 0) and (h, m) <= (16, 30)]
    for z in ZONES:
        for t in tags10:
            g = load('ACHAF', 'HT', t)
            if not g: continue
            m = zone_mask(g, z); h = g['arr'][m]; hv = h[np.isfinite(h)]
            if hv.size >= 5: series10[z['id']].append({'scan': t + 'Z', 'topMedianM': float(np.median(hv)), 'pixels': int(hv.size)})
    def maxstep(seq): return max((abs(b['topMedianM'] - a['topMedianM']) for a, b in zip(seq, seq[1:])), default=None)
    temporal = {'stepMinutes': 30, 'nStates': len(STATE_TIMES_Z), 'nZones': len(ZONES),
        'justification': 'Los METAR (única fuente de la base) son horarios; el tope y la temperatura de 2 km se tomaron en las escenas de :20 y :50, la primera de las cuales coincide con el inicio del vuelo (13:21Z), y cubren los 3 h 02 min con 7 estados. La serie de 10 min del tope de 10 km (ACHAF, 22 escenas) varía como máximo ~80 m entre escenas consecutivas (ver evidence10min), muy por debajo de la dispersión entre píxeles (cientos de m), y no aporta información independiente sobre base ni tipo; un paso de 10 min no estaría sustentado por los datos de base.',
        'evidence10min': {z['id']: {'scans': len(series10[z['id']]), 'maxStepMedianTop10kmM': maxstep(series10[z['id']]),
                                    'rangeMedianTop10kmM': ([min(s['topMedianM'] for s in series10[z['id']]), max(s['topMedianM'] for s in series10[z['id']])] if series10[z['id']] else None)} for z in ZONES}}
    # separación entre zonas (justifica la zonificación)
    sep = {t: abs(zstats[ZONES[0]['id']][t]['topMedianM'] - zstats[ZONES[1]['id']][t]['topMedianM']) for t in STATE_TIMES_Z}
    zoning_ok = all(v > ZONE_DIFF_MIN_M for v in sep.values())
    insitu = insitu_top_crosscheck()

    states = []
    for t in STATE_TIMES_Z:
        dt = state_dt(t)
        zrecs = []
        for z in ZONES:
            s = zstats[z['id']][t]
            clat = (LAT_BAND[0] + LAT_BAND[1]) / 2 - 0.0; clat = -34.28
            clon = (z['lon'][0] + z['lon'][1]) / 2
            near = sorted(((km(clat, clon, st['lat'], st['lon']), name) for name, st in metars.items()))
            used = [(d, n) for d, n in near if d <= METAR_RADIUS_KM]
            station_obs = []
            for d, n in used:
                tobs, o, dtmin = nearest_metar(metars[n], dt)
                cl = [l for l in o['layers'] if l['cover'] in ('BKN', 'OVC')]
                ceil = min((l['heightM'] for l in cl), default=None)
                station_obs.append({'station': n, 'distanceKm': round(d), 'obsUtc': iso_z(tobs), 'obsOffsetMin': round(dtmin), 'metar': o['metar'], 'ceilingM': ceil,
                                    'ceilingLayersM': [l['heightM'] for l in cl], 'allLayersM': [(l['cover'], l['heightM']) for l in o['layers']], 'drizzle': o['weatherDZ']})
            prim = station_obs[0] if station_obs else None
            base_all = [h for so in station_obs for h in so['ceilingLayersM']]
            sources = [{'id': 'goes19-achaf-acha2km', 'product': 'ABI-L2-ACHA2KMF', 'file': s['files']['ACHA2KMF']}, {'id': 'goes19-actp', 'product': 'ABI-L2-ACTPF', 'file': s['files']['ACTPF']}, {'id': 'goes19-acht', 'product': 'ABI-L2-ACHTF', 'file': s['files']['ACHTF']}]
            # cobertura
            cover = value(round(s['cloudFraction'] * 100, 1), 'Fracción de píxeles de 2 km clasificados como nube por ACTP (fase ≠ cielo despejado) dentro de la zona; es cobertura de columna, no por capa', 'derived', conf_cover(s), unit='%')
            # tope
            top = value(round(s['topMedianM']), 'Mediana del tope de nube ACHA (2 km) dentro de la zona; rango = percentiles 10–90 de los píxeles', 'derived', conf_top(s), unit='m', range=[round(s['topP10M']), round(s['topP90M'])],
                        topTemperatureC={'median': round(s['topTempMedianC'], 1), 'range': [round(s['topTempP10C'], 1), round(s['topTempP90C'], 1)]})
            # fase
            pc = s['phaseCounts']; tot = max(sum(pc[k] for k in range(1, 6)), 1)
            liq = pc[1] + pc[2]
            phase_lbl = 'liquid' if liq / tot >= 0.9 else ('mixed-or-ice' if (pc[3] + pc[4]) / tot >= 0.5 else 'undetermined')
            phase = value(phase_lbl, 'Moda de la fase ACTP en la zona (líquida si ≥90 % de los píxeles nublados son agua líquida o líquida superenfriada)', 'derived', 'medium',
                          fractions={'liquid': round(pc[1] / tot, 3), 'supercooledLiquid': round(pc[2] / tot, 3), 'mixed': round(pc[3] / tot, 3), 'ice': round(pc[4] / tot, 3), 'unknown': round(pc[5] / tot, 3)})
            # base
            if prim and prim['ceilingM'] is not None:
                near_ok = prim['distanceKm'] <= 80
                agree = (max(base_all) - min(base_all) <= SECONDARY_AGREE_M) if len(station_obs) > 1 and len(base_all) > 1 else None
                bconf = 'medium' if (near_ok and agree is True) else 'low'
                base = value(prim['ceilingM'], f"Techo (capa BKN/OVC más baja) del METAR de {prim['station']} ({prim['distanceKm']} km) a las {prim['obsUtc'][11:16]}Z, desplazado a la zona sin interpolar; metros AGL de estación (elevación no aplicada)", 'inferred', bconf,
                             unit='m', range=([min(base_all), max(base_all)] if base_all else None), reference='AGL en la estación METAR (no MSL)', stationObservations=station_obs)
            else:
                base = value(None, 'Sin METAR con techo BKN/OVC dentro de %d km' % METAR_RADIUS_KM, 'unknown', 'low', unit='m', stationObservations=station_obs)
            # espesor
            if base['value'] is not None:
                rng = base['range'] or [base['value'], base['value']]
                thick = value(s['topMedianM'] - base['value'] if False else round(top['value'] - base['value']), 'Tope ACHA (mediana) − techo METAR; asume base ≈ MSL (sin corregir elevación de la estación) y que el techo METAR representa la base de la misma capa', 'inferred', 'low', unit='m',
                              range=[max(round(top['value'] - rng[1]), 0), round(top['value'] - rng[0])])
            else:
                thick = value(None, 'No hay base sustentada', 'unknown', 'low', unit='m')
            # tipo probable
            lowest_any = min((m for so in station_obs for (_, m) in so['allLayersM']), default=None)
            if phase_lbl == 'liquid' and top['value'] < 2500 and base['value'] is not None and base['value'] < 1000:
                drizzle = any(so['drizzle'] for so in station_obs)
                ctype = value('stratus/stratocumulus (capa estratiforme baja, probable)', 'Regla cualitativa: fase líquida + tope < 2,5 km + techo METAR < 1 km + cobertura ≥ BKN; no hay clasificación automática de género disponible en los datos usados' + ('; llovizna (DZ) reportada en un METAR de la zona' if drizzle else ''),
                              'inferred', 'medium' if base['confidence'] == 'medium' else 'low', fragmentsBelowM=lowest_any if (lowest_any is not None and lowest_any < base['value']) else None)
            else:
                ctype = value(None, 'Los datos no sustentan una clasificación', 'unknown', 'low')
            overall_rank = {'low': 0, 'medium': 1, 'high': 2}
            overall = min((cover['confidence'], top['confidence'], base['confidence']), key=lambda c: overall_rank[c])
            notes = []
            if top['range'][1] - top['range'][0] > 500: notes.append('Dispersión del tope entre píxeles > 500 m: capa heterogénea o varias capas.')
            if prim and prim['obsOffsetMin'] >= 20: notes.append(f"METAR a {prim['obsOffsetMin']} min del estado (sin interpolación).")
            notes.append('Sin radiosondeo ni ceilómetro a lo largo de la trayectoria: la base no está medida en la zona.')
            if t == '13:20' and z['id'] == ZONES[0]['id']:
                d = insitu['largestHumidityDrop']
                notes.append(f"Verificación cruzada in situ (no usada en los valores): en el ascenso inicial la humedad del sensor del globo cae de {d['fromPct']} % a {d['toPct']} % entre {d['fromAltM']} y {d['toAltM']} m barométricos ({d['utcFrom'][11:19]}–{d['utcTo'][11:19]}Z), compatible con el tope de una capa húmeda cerca de esa altura (ACHA da ~1,2–1,5 km); el sensor nunca superó {insitu['humidityMaxPercent']} % (no se observó saturación), por lo que no confirma ni descarta nube dentro de la capa.")
            zrecs.append({'zoneId': z['id'], 'zoneName': z['name'],
                          'area': {'type': 'bbox', 'minLat': LAT_BAND[0], 'maxLat': LAT_BAND[1], 'minLon': z['lon'][0], 'maxLon': z['lon'][1]},
                          'cloudCoverage': cover, 'cloudTypeProbable': ctype, 'cloudBaseM': base, 'cloudTopM': top, 'cloudThicknessM': thick, 'cloudPhase': phase,
                          'sourceRefs': ['goes19-acha2kmf', 'goes19-actpf', 'goes19-achtf'] + ([f"metar-{so['station']}" for so in station_obs]) + (['balloon-telemetry-insitu'] if (t == '13:20' and z['id'] == ZONES[0]['id']) else []),
                          'confidence': overall, 'notes': notes,
                          'evidence': {'goes19': {k: s[k] for k in ('scan', 'pixelsInZone', 'topPixels', 'phaseValidPixels', 'cloudyPixels', 'phaseCounts')}}})
        states.append({'id': 'S' + t.replace(':', ''), 'timestampUtc': iso_z(dt), 'timestampLocal': iso_l(dt),
                       'satelliteScanStartUtc': iso_z(dt),
                       'timeNote': 'Hora nominal = inicio del escaneo GOES-19; la zona (≈34°S) se observa unos minutos después (≈6 min estimados, ver docs/CLOUDS_FEASIBILITY.md).',
                       'zones': zrecs})
    return states, zstats, temporal, sep, zoning_ok, insitu, metars

def main():
    states, zstats, temporal, sep, zoning_ok, insitu, metars = build()
    sources = [
        {'id': 'goes19-acha2kmf', 'name': 'GOES-19 ABI L2 Cloud Top Height (ACHA, 2 km, disco completo)', 'type': 'satellite-retrieval', 'provider': 'NOAA/NESDIS vía AWS Open Data', 'url': 'https://noaa-goes19.s3.amazonaws.com/ABI-L2-ACHA2KMF/2026/284/', 'usedFor': 'cloudTopM', 'cadenceMin': 30},
        {'id': 'goes19-actpf', 'name': 'GOES-19 ABI L2 Cloud Top Phase (ACTP, 2 km)', 'type': 'satellite-retrieval', 'provider': 'NOAA/NESDIS vía AWS Open Data', 'url': 'https://noaa-goes19.s3.amazonaws.com/ABI-L2-ACTPF/2026/284/', 'usedFor': 'cloudCoverage, cloudPhase', 'cadenceMin': 10},
        {'id': 'goes19-achtf', 'name': 'GOES-19 ABI L2 Cloud Top Temperature (ACHT, 2 km)', 'type': 'satellite-retrieval', 'provider': 'NOAA/NESDIS vía AWS Open Data', 'url': 'https://noaa-goes19.s3.amazonaws.com/ABI-L2-ACHTF/2026/284/', 'usedFor': 'cloudTopM (temperatura del tope)', 'cadenceMin': 30},
        {'id': 'goes19-achaf', 'name': 'GOES-19 ABI L2 Cloud Top Height (ACHA, 10 km)', 'type': 'satellite-retrieval', 'provider': 'NOAA/NESDIS vía AWS Open Data', 'url': 'https://noaa-goes19.s3.amazonaws.com/ABI-L2-ACHAF/2026/284/', 'usedFor': 'resolución temporal (serie de 10 min)', 'cadenceMin': 10},
        {'id': 'balloon-telemetry-insitu', 'name': 'Telemetría del propio globo (humedad, temperatura, altitud barométrica)', 'type': 'in-situ', 'provider': 'data/vuelo/transmissions.json', 'usedFor': 'verificación cruzada solamente', 'caveat': 'Sensores sin calibración documentada; la humedad no llegó a saturación.'},
    ] + [{'id': f'metar-{n}', 'name': f'METAR {n}', 'type': 'surface-observation', 'provider': 'Iowa Environmental Mesonet (asos.py), METAR de DINACIA/INUMET', 'url': 'https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py', 'usedFor': 'cloudBaseM (techo)', 'cadenceMin': 60, 'location': {'lat': st['lat'], 'lon': st['lon']}, 'file': f'data/clouds/sources/metar/{n}.csv'} for n, st in sorted(metars.items())]
    model = {
        'schemaVersion': '1.0',
        'status': 'draft-for-review',
        'description': 'Modelo meteorológico documentado de la nubosidad sobre la trayectoria de PICHÓN IV (CX1AA-11). NO es una representación 3D: es la base de evidencia para una futura nube volumétrica. Cada valor lleva method, status (observed|derived|inferred|unknown) y confidence (high|medium|low).',
        'statusLegend': {'observed': 'Valor tomado tal cual de una observación directa en el punto/zona.',
                         'derived': 'Calculado con una regla explícita a partir de productos satelitales (resultado de algoritmo de recuperación, no medición directa) o de otros valores.',
                         'inferred': 'Transferido o estimado con un supuesto (p. ej. observación de una estación a 70–120 km aplicada a la zona; regla cualitativa).',
                         'unknown': 'Los datos disponibles no lo sustentan.'},
        'period': {'startUtc': '2026-10-11T13:21:39Z', 'endUtc': '2026-10-11T16:23:46Z', 'startLocal': '2026-10-11T10:21:39-03:00', 'endLocal': '2026-10-11T13:23:46-03:00', 'timezone': 'America/Montevideo (UTC-3)',
                   'note': 'Vuelo efectivo (frames 10–157). El fin local coincide con la última transmisión del dataset maestro.'},
        'extent': {'minLat': LAT_BAND[0], 'maxLat': LAT_BAND[1], 'minLon': ZONES[0]['lon'][0], 'maxLon': ZONES[-1]['lon'][1], 'note': 'Franja alrededor de la trayectoria (lat −34.38…−34.17, lon −55.36…−53.99). No se modela fuera de ella.'},
        'zoning': {'rule': f'Se separan zonas solo si las medianas de tope ACHA difieren más de {ZONE_DIFF_MIN_M:.0f} m. El corte (~54,2°W) sale de un ajuste por tramos constantes de la media temporal del tope por bandas de 0,2° de longitud (3 tramos: <55,8°W ≈2,1 km; 55,8–54,2°W ≈1,4 km; >54,2°W ≈0,9 km); el tramo occidental queda fuera de la trayectoria.',
                   'separationByStateM': {k: round(v) for k, v in sep.items()}, 'ruleSatisfiedInAllStates': bool(zoning_ok),
                   'caveat': 'El borde real es gradual (≈0,2° ≈ 19 km); el corte de 54,2°W es aproximado.'},
        'temporalResolution': temporal,
        'sources': sources,
        'states': states,
        'undetermined': [
            'Base de nube medida a lo largo de la trayectoria (no hay ceilómetro, lidar ni radiosondeo; el radiosondeo de Carrasco/Ezeiza 12Z de ese día no estaba disponible).',
            'Género de nube por clasificación automática (el producto de tipo de nube no se descargó/validó).',
            'Estructura vertical interna (número de capas reales, huecos entre capas) y contenido de agua.',
            'Cobertura por capa (solo hay cobertura de columna por satélite y oktas de los METAR lejanos).',
            'Existencia de nubes por encima de 2,5 km: el satélite no las detecta como tope principal, pero ACHA solo da el tope más alto visible.',
            'Corrección de paralaje (≈1 km de desplazamiento hacia el sureste para tope ≈1 km: menor que la resolución usada).'],
        'insituCrossCheck': insitu,
        'generator': {'script': 'tools/cloud-model/build_cloud_model.py', 'inputs': ['NetCDF GOES-19 L2 (no versionados)', 'data/clouds/sources/metar/*.csv', 'data/vuelo/transmissions.json']},
    }
    out = os.path.join(REPO, 'data', 'clouds', 'cloud-model.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f: json.dump(model, f, ensure_ascii=False, indent=2); f.write('\n')
    ext = os.path.join(REPO, 'data', 'clouds', 'sources', 'goes19-zone-stats.json')
    with open(ext, 'w', encoding='utf-8') as f: json.dump({'description': 'Extracto de estadística por zona y escena GOES-19 L2 (derivado de NetCDF no versionados).', 'zones': zstats}, f, ensure_ascii=False, indent=2); f.write('\n')
    print('wrote', out, 'and', ext)

if __name__ == '__main__': main()
