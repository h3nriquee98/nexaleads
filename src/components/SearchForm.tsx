"use client";

import { useState } from "react";
import { BR_STATES, NICHE_GROUPS, POPULAR_NICHES } from "@/lib/niches";
import { DEFAULT_LIMIT, MAX_NICHES, validateSearch } from "@/lib/validation";
import type { SearchParams } from "@/lib/types";
import { CheckIcon, LoaderIcon, MapPinIcon, PlusIcon, SearchIcon, XIcon } from "./Icons";

interface Props {
  busy: boolean;
  maxLeads: number;
  initial?: SearchParams | null;
  onSearch: (params: SearchParams) => void;
}

type Errors = Partial<Record<keyof SearchParams, string>>;

export default function SearchForm({ busy, maxLeads, initial, onSearch }: Props) {
  const [city, setCity] = useState(initial?.city ?? "");
  const [state, setState] = useState(initial?.state ?? "SP");
  const [country, setCountry] = useState(initial?.country ?? "Brasil");
  const [niches, setNiches] = useState<string[]>(initial?.niches ?? []);
  const [custom, setCustom] = useState("");
  const [limit, setLimit] = useState(String(initial?.limit ?? DEFAULT_LIMIT));
  const [onlyNoSite, setOnlyNoSite] = useState(initial?.onlyNoSite ?? false);
  const [onlyWhatsApp, setOnlyWhatsApp] = useState(initial?.onlyWhatsApp ?? false);
  const [errors, setErrors] = useState<Errors>({});

  const isBrazil = /^(brasil|brazil)$/i.test(country.trim());
  const customNiches = niches.filter((n) => !POPULAR_NICHES.includes(n));

  function toggleNiche(niche: string) {
    setErrors((e) => ({ ...e, niches: undefined }));
    setNiches((list) => (list.includes(niche) ? list.filter((n) => n !== niche) : [...list, niche]));
  }

  function addCustom() {
    const value = custom.replace(/\s+/g, " ").trim();
    if (!value) return;
    if (!niches.some((n) => n.toLowerCase() === value.toLowerCase())) setNiches((list) => [...list, value]);
    setCustom("");
    setErrors((e) => ({ ...e, niches: undefined }));
  }

  /** Permite digitar "Franca, SP" direto no campo cidade. */
  function splitCityState() {
    const m = /^(.+?)\s*[,/-]\s*([A-Za-z]{2})$/.exec(city.trim());
    if (m && (BR_STATES as readonly string[]).includes(m[2].toUpperCase())) {
      setCity(m[1].trim());
      setState(m[2].toUpperCase());
      setCountry((c) => c || "Brasil");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const pending = custom.trim() ? [...niches, custom.trim()] : niches;
    const result = validateSearch({ city, state, country, niches: pending, limit, onlyNoSite, onlyWhatsApp }, maxLeads);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (custom.trim()) addCustom();
    setErrors({});
    setCity(result.value.city);
    setState(result.value.state);
    onSearch(result.value);
  }

  return (
    <form onSubmit={submit} noValidate className="card p-5 sm:p-6" aria-labelledby="search-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="search-title" className="font-display text-lg font-semibold sm:text-xl">
            Encontrar novos leads
          </h2>
          <p className="text-sm text-muted">Escolha a cidade e os nichos. Empresas sem site aparecem primeiro.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-12">
        <div className="sm:col-span-6">
          <label htmlFor="city" className="mb-1.5 block text-sm font-medium">
            Cidade
          </label>
          <div className="relative">
            <MapPinIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              id="city"
              className="field pl-9"
              placeholder="Ex.: Franca, SP ou Ribeirão Preto, SP"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setErrors((er) => ({ ...er, city: undefined }));
              }}
              onBlur={splitCityState}
              autoComplete="address-level2"
              maxLength={80}
              aria-invalid={Boolean(errors.city)}
              aria-describedby={errors.city ? "city-error" : undefined}
            />
          </div>
          {errors.city && <p id="city-error" className="mt-1 text-xs text-bad">{errors.city}</p>}
        </div>

        <div className="sm:col-span-3">
          <label htmlFor="state" className="mb-1.5 block text-sm font-medium">
            Estado
          </label>
          {isBrazil ? (
            <select
              id="state"
              className="field"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setErrors((er) => ({ ...er, state: undefined }));
              }}
              aria-invalid={Boolean(errors.state)}
            >
              <option value="">UF</option>
              {BR_STATES.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          ) : (
            <input id="state" className="field" value={state} onChange={(e) => setState(e.target.value)} placeholder="Estado/Região" maxLength={40} />
          )}
          {errors.state && <p className="mt-1 text-xs text-bad">{errors.state}</p>}
        </div>

        <div className="sm:col-span-3">
          <label htmlFor="country" className="mb-1.5 block text-sm font-medium">
            País
          </label>
          <input
            id="country"
            className="field"
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              if (!/^(brasil|brazil)$/i.test(e.target.value.trim())) setState("");
            }}
            list="countries"
            maxLength={60}
            aria-invalid={Boolean(errors.country)}
          />
          <datalist id="countries">
            <option value="Brasil" />
            <option value="Portugal" />
            <option value="Estados Unidos" />
          </datalist>
          {errors.country && <p className="mt-1 text-xs text-bad">{errors.country}</p>}
        </div>

        <fieldset className="sm:col-span-12">
          <legend className="mb-1.5 flex w-full flex-wrap items-center justify-between gap-2 text-sm font-medium">
            <span>Nichos</span>
            <span className="text-xs font-normal text-faint">
              {niches.length} selecionado{niches.length === 1 ? "" : "s"} · máx. {MAX_NICHES}
            </span>
          </legend>
          <div className="space-y-3">
            {NICHE_GROUPS.map((group) => (
              <div key={group.label} role="group" aria-label={group.label} className="grid gap-1.5 sm:grid-cols-[9.5rem_1fr] sm:items-start">
                <span className="pt-1.5 text-xs font-semibold uppercase tracking-wide text-faint">{group.label}</span>
                <div className="flex flex-wrap gap-2">
                  {group.niches.map((niche) => {
                    const active = niches.includes(niche);
                    return (
                      <button type="button" key={niche} className="chip" aria-pressed={active} onClick={() => toggleNiche(niche)}>
                        {active && <CheckIcon size={13} />}
                        {niche}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {customNiches.length > 0 && (
              <div role="group" aria-label="Nichos personalizados" className="grid gap-1.5 sm:grid-cols-[9.5rem_1fr] sm:items-start">
                <span className="pt-1.5 text-xs font-semibold uppercase tracking-wide text-faint">Personalizados</span>
                <div className="flex flex-wrap gap-2">
                  {customNiches.map((niche) => (
                    <button
                      type="button"
                      key={niche}
                      className="chip"
                      aria-pressed="true"
                      onClick={() => toggleNiche(niche)}
                      aria-label={`Remover nicho ${niche}`}
                    >
                      {niche}
                      <XIcon size={13} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              className="field"
              placeholder="Outro nicho (ex.: Chaveiros, Gráficas, Hotéis…)"
              value={custom}
              maxLength={60}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              aria-label="Nicho personalizado"
            />
            <button type="button" className="btn btn-ghost shrink-0" onClick={addCustom} disabled={!custom.trim()}>
              <PlusIcon /> Adicionar
            </button>
          </div>
          {errors.niches && <p className="mt-1 text-xs text-bad">{errors.niches}</p>}
        </fieldset>

        <div className="sm:col-span-4">
          <label htmlFor="limit" className="mb-1.5 block text-sm font-medium">
            Quantidade de leads <span className="font-normal text-faint">(opcional)</span>
          </label>
          <input
            id="limit"
            type="number"
            inputMode="numeric"
            min={1}
            max={maxLeads}
            className="field"
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
              setErrors((er) => ({ ...er, limit: undefined }));
            }}
            aria-invalid={Boolean(errors.limit)}
            aria-describedby="limit-help"
          />
          <p id="limit-help" className={`mt-1 text-xs ${errors.limit ? "text-bad" : "text-faint"}`}>
            {errors.limit ?? `Total dividido entre os nichos. Máximo de ${maxLeads} por busca para controlar custos.`}
          </p>
        </div>

        <div className="grid gap-3 sm:col-span-8 sm:grid-cols-2 sm:pt-7">
          <ToggleCard
            checked={onlyNoSite}
            onChange={setOnlyNoSite}
            title="Buscar apenas empresas sem site"
            description="O Google Maps Scraper já filtra na busca: só vêm empresas sem site."
          />
          <ToggleCard
            checked={onlyWhatsApp}
            onChange={setOnlyWhatsApp}
            title="Apenas empresas com WhatsApp"
            description="Descarta quem não tem WhatsApp nem celular. Busca o dobro de empresas para completar a quantidade (consome mais créditos)."
          />
        </div>

        <div className="flex items-end sm:col-span-12 sm:justify-end">
          <button type="submit" className="btn btn-primary h-12 w-full px-6 text-base sm:w-auto" disabled={busy}>
            {busy ? <LoaderIcon className="animate-spin" size={18} /> : <SearchIcon size={18} />}
            {busy ? "Buscando…" : "Encontrar leads"}
          </button>
        </div>
      </div>
    </form>
  );
}

function ToggleCard({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
        checked ? "border-emerald-400/50 bg-emerald-400/10" : "border-line-strong bg-white/[0.02] hover:border-indigo-300/40"
      }`}
    >
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-emerald-400" : "bg-white/15"}`} aria-hidden>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
    </button>
  );
}
