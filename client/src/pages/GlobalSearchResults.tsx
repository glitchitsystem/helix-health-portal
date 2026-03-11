/**
 * GlobalSearchResults — unified search across patients, providers, appointments, notes.
 * Debounced 300ms. Role-based type tabs. Click results to navigate.
 * Route: /search (all authenticated)
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import type { SearchResult, SearchResults } from '../types';

type SearchType = 'all' | 'patients' | 'providers' | 'appointments' | 'notes';

const TYPE_ICON: Record<SearchType, string> = {
  all: '🔍',
  patients: '👤',
  providers: '🩺',
  appointments: '📅',
  notes: '📋',
};

const ResultCard: React.FC<{ result: SearchResult; onNavigate: (url: string) => void }> = ({
  result,
  onNavigate,
}) => (
  <button
    onClick={() => onNavigate(result.url)}
    className="w-full text-left flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-indigo-400 hover:shadow-sm transition"
  >
    <span className="text-xl flex-shrink-0">
      {TYPE_ICON[result.type as SearchType] ?? '📄'}
    </span>
    <div className="min-w-0">
      <p className="font-medium text-gray-900 truncate">{result.title}</p>
      <p className="text-sm text-gray-500 truncate">{result.subtitle}</p>
      <span className="mt-1 inline-block text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded capitalize">
        {result.type}
      </span>
    </div>
  </button>
);

const ResultSection: React.FC<{
  label: string;
  icon: string;
  results: SearchResult[];
  onNavigate: (url: string) => void;
}> = ({ label, icon, results, onNavigate }) => {
  if (results.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        {icon} {label} ({results.length})
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {results.map((r) => (
          <ResultCard key={`${r.type}-${r.id}`} result={r} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
};

const GlobalSearchResults: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const isPatient = user?.roles?.includes('patient') && !user?.roles?.some((r: string) =>
    ['admin', 'provider', 'nurse', 'billing'].includes(r),
  );

  const initialQ = searchParams.get('q') ?? '';
  const initialType = (searchParams.get('type') as SearchType) ?? 'all';

  const [query, setQuery] = useState(initialQ);
  const [activeType, setActiveType] = useState<SearchType>(initialType);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    (q: string, type: SearchType) => {
      if (!q.trim()) {
        setResults(null);
        setSearched(false);
        return;
      }
      setLoading(true);
      api
        .get<SearchResults>(`/search?q=${encodeURIComponent(q)}&type=${type}`)
        .then((r) => {
          setResults(r.data);
          setSearched(true);
        })
        .catch(() => setSearched(true))
        .finally(() => setLoading(false));
    },
    [],
  );

  /* Debounced search on query/type change */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchParams(query ? { q: query, type: activeType } : {}, { replace: true });
      doSearch(query, activeType);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, activeType, doSearch, setSearchParams]);

  const tabs: { type: SearchType; label: string }[] = [
    { type: 'all', label: 'All' },
    ...(!isPatient ? [{ type: 'patients' as SearchType, label: 'Patients' }] : []),
    { type: 'providers', label: 'Providers' },
    { type: 'appointments', label: 'Appointments' },
    { type: 'notes', label: 'Notes' },
  ];

  const handleNavigate = (url: string) => navigate(url);

  const hasResults =
    results &&
    (results.patients.length > 0 ||
      results.providers.length > 0 ||
      results.appointments.length > 0 ||
      results.notes.length > 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Search</h1>

      {/* Search bar */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patients, providers, appointments, notes…"
          className="w-full pl-10 pr-4 py-3 border rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-base"
          autoFocus
        />
      </div>

      {/* Type tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6 flex-wrap">
          {tabs.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`pb-3 text-sm font-medium border-b-2 transition ${
                activeType === type
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {TYPE_ICON[type]} {label}
              {results &&
                type !== 'all' &&
                results[type as keyof Omit<SearchResults, 'total' | 'query'>]?.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-600">
                    {results[type as keyof Omit<SearchResults, 'total' | 'query'>].length}
                  </span>
                )}
            </button>
          ))}
        </nav>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8">
          <p className="text-gray-400">Searching…</p>
        </div>
      )}

      {/* No results */}
      {!loading && searched && !hasResults && (
        <div className="text-center py-12">
          <p className="text-5xl mb-3">🔍</p>
          <p className="text-gray-600">No results found for "{query}"</p>
          <p className="text-sm text-gray-400 mt-1">Try a different search term or filter type.</p>
        </div>
      )}

      {/* Prompt */}
      {!loading && !searched && !query && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🔎</p>
          <p>Type to search across the portal.</p>
        </div>
      )}

      {/* Results */}
      {!loading && results && hasResults && (
        <div className="space-y-8">
          {(activeType === 'all' || activeType === 'patients') && !isPatient && (
            <ResultSection
              label="Patients"
              icon="👤"
              results={results.patients}
              onNavigate={handleNavigate}
            />
          )}
          {(activeType === 'all' || activeType === 'providers') && (
            <ResultSection
              label="Providers"
              icon="🩺"
              results={results.providers}
              onNavigate={handleNavigate}
            />
          )}
          {(activeType === 'all' || activeType === 'appointments') && (
            <ResultSection
              label="Appointments"
              icon="📅"
              results={results.appointments}
              onNavigate={handleNavigate}
            />
          )}
          {(activeType === 'all' || activeType === 'notes') && !isPatient && (
            <ResultSection
              label="Clinical Notes"
              icon="📋"
              results={results.notes}
              onNavigate={handleNavigate}
            />
          )}
          <p className="text-xs text-gray-400 text-right pt-2">
            {results.total} total result{results.total !== 1 ? 's' : ''} for "{results.query}"
          </p>
        </div>
      )}
    </div>
  );
};

export default GlobalSearchResults;
