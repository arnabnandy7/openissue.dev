"use client";

import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AutocompleteInputProps<T> = {
  value: string;
  onChange: (value: string) => void;
  fetchSuggestions: (query: string) => Promise<T[]> | T[];
  getSuggestionValue: (item: T) => string;
  getSuggestionKey: (item: T) => string;
  renderSuggestion: (item: T, isHighlighted: boolean) => ReactNode;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
  id?: string;
  name?: string;
  ariaLabel?: string;
  icon?: ReactNode;
  emptyMessage?: string;
  debounceMs?: number;
  onSelect?: (item: T) => void;
  className?: string;
  inputClassName?: string;
};

export function AutocompleteInput<T>({
  value,
  onChange,
  fetchSuggestions,
  getSuggestionValue,
  getSuggestionKey,
  renderSuggestion,
  placeholder,
  required,
  disabled,
  maxLength,
  id,
  name,
  ariaLabel,
  icon,
  emptyMessage = "No suggestions found",
  debounceMs = 250,
  onSelect,
  className,
  inputClassName,
}: Readonly<AutocompleteInputProps<T>>) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const load = useCallback(
    async (query: string) => {
      setLoading(true);
      try {
        const results = await fetchSuggestions(query);
        setSuggestions(results);
        setHighlightedIndex(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    },
    [fetchSuggestions],
  );

  useEffect(() => {
    if (!isOpen || disabled) return;
    const timer = setTimeout(() => {
      void load(value);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [value, isOpen, disabled, load, debounceMs]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleFocus() {
    if (disabled) return;
    setIsOpen(true);
    void load(value);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
    if (!isOpen) setIsOpen(true);
  }

  function handleSelect(item: T) {
    const nextVal = getSuggestionValue(item);
    onChange(nextVal);
    onSelect?.(item);
    setIsOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
        void load(value);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1,
      );
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === "Tab") {
      setIsOpen(false);
    }
  }

  function handleClear() {
    onChange("");
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div ref={containerRef} className={cn("relative w-full min-w-0", className)}>
      <div className="relative flex items-center">
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10">
            {icon}
          </span>
        ) : null}
        <Input
          ref={inputRef}
          id={id}
          name={name}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          maxLength={maxLength}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={isOpen ? listboxId : undefined}
          className={cn("h-11 pr-16", icon ? "pl-9" : "", inputClassName)}
        />
        <div className="absolute right-2 flex items-center gap-1 text-muted-foreground">
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded p-0.5 hover:bg-muted hover:text-foreground focus:outline-none"
              aria-label="Clear input"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {isOpen && !disabled && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
        >
          {loading && suggestions.length === 0 ? (
            <li className="p-3 text-center text-xs text-muted-foreground">
              Loading suggestions…
            </li>
          ) : suggestions.length === 0 ? (
            <li className="p-3 text-center text-xs text-muted-foreground">
              {emptyMessage}
            </li>
          ) : (
            suggestions.map((item, index) => {
              const isHighlighted = index === highlightedIndex;
              return (
                <li
                  key={getSuggestionKey(item)}
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseDown={(e) => {
                    // Prevent blur before selection
                    e.preventDefault();
                    handleSelect(item);
                  }}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    "cursor-pointer select-none rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    isHighlighted ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
                  )}
                >
                  {renderSuggestion(item, isHighlighted)}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
