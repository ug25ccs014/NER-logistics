import React, { useEffect, useRef, useState } from 'react';
import { fetchPlaceSuggestions } from '../api.js';

// Ported from the original app's setupPlaceAutocomplete(): debounced
// Nominatim suggestions with keyboard nav. Reused by Route Search and
// the Shipment Board's origin/destination fields.
export default function PlaceAutocomplete({ placeholder, value, onChange, onPick }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef(null);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const handleInput = (text) => {
    onChange(text, null); // typing invalidates a previously picked suggestion (2nd arg = picked place)
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await fetchPlaceSuggestions(text);
      setSuggestions(results);
      setActiveIndex(-1);
      setOpen(results.length > 0);
    }, 350);
  };

  const pick = (s) => {
    onChange(s.display_name, { lat: parseFloat(s.lat), lon: parseFloat(s.lon), label: s.display_name });
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      pick(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="text-input"
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => handleInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#173A59',
            border: '1px solid var(--border)',
            borderRadius: 8,
            zIndex: 10,
            maxHeight: 200,
            overflowY: 'auto',
            color: '#FFFFE3',
          }}
        >
          {suggestions.map((s, i) => (
            <div
              key={i}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              style={{
                padding: '8px 10px',
                fontSize: 13,
                cursor: 'pointer',
                background: i === activeIndex ? '#2F6A8E' : 'transparent',
              }}
            >
              {s.display_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
