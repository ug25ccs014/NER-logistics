import React from 'react';
import { getRiskColor, fmtIstTime } from '../utils/geo.js';

// Auto-generated weather report for a route (built server-side from live
// multi-source forecasts -- see api/trip_forecast.py build_report).
// `onPickDeparture(isoUtc)` is optional; when given, the "better time to leave"
// chips re-run the forecast for that departure.
export default function WeatherReportCard({ report, onPickDeparture, updatedAt }) {
  if (!report) return null;
  const color = getRiskColor(report.score, true);
  const confColor = { high: '#3FB950', medium: '#D29922', low: '#F85149' }[report.confidence] || '#999';

  return (
    <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px solid ${color}55` }}>
      <div style={{ fontWeight: 700, color }}>{report.headline}</div>

      <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, color: '#ccc' }}>
        {report.facts.map((f, i) => <li key={i}>{f}</li>)}
      </ul>

      {report.departure_suggestion && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#9ecbff' }}>🕒 {report.departure_suggestion}</div>
      )}

      {report.departure_options?.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {report.departure_options.map((o) => (
            <button
              key={o.depart_at}
              type="button"
              disabled={!onPickDeparture}
              onClick={(e) => { e.stopPropagation(); onPickDeparture?.(o.depart_at); }}
              title={`${o.level} risk (${o.score})`}
              style={{
                fontSize: 11, padding: '3px 8px', borderRadius: 12, cursor: onPickDeparture ? 'pointer' : 'default',
                background: 'transparent', color: getRiskColor(o.score, true), border: `1px solid ${getRiskColor(o.score, true)}`,
              }}
            >
              {o.depart_label.replace(/ IST$/, '').replace(/^\w+ \d+ \w+, /, '')} · {o.score}
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 12, color: '#bbb' }}>
        <b>What to do</b>
        <ul style={{ margin: '3px 0 0', paddingLeft: 18 }}>
          {report.advice.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      </div>

      <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, fontSize: 11, color: '#bbb', background: 'rgba(255,255,255,0.05)' }}>
        <b>Live forecast</b> · Provider: {report.sources.join(' + ') || '—'}
        <br />
        Evaluated {fmtIstTime(report.evaluated_at || report.generated_at) || '—'}
        {fmtIstTime(report.forecast_fetched_at) ? ` · data fetched ${fmtIstTime(report.forecast_fetched_at)}` : ''}
        {fmtIstTime(report.forecast_updated_at) ? ` · provider updated ${fmtIstTime(report.forecast_updated_at)}` : ''}
        {fmtIstTime(report.forecast_valid_until) ? ` · valid until ${fmtIstTime(report.forecast_valid_until)}` : ''} (IST)
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: '#888' }}>
        <span style={{ color: confColor }}>● {report.confidence} confidence</span> — {report.confidence_note}
        <br />
        Sources: {report.sources.join(' + ') || '—'}
        {updatedAt ? ` · updated ${new Date(updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
        {report.data_age_min > 15 ? ` · data ${report.data_age_min} min old` : ''}
      </div>
    </div>
  );
}
