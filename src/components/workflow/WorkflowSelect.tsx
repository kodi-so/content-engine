import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type WorkflowSelectOption = {
  value: string;
  label: string;
  description?: string;
  meta?: string;
  recommendationTag?: string;
  tags?: string[];
};

export type WorkflowSelectProps = {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: WorkflowSelectOption[];
  placeholder: string;
  rich?: boolean;
  value?: string;
};

export function WorkflowSelect({
  disabled = false,
  onChange,
  options,
  placeholder,
  rich = false,
  value,
}: WorkflowSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = rich && query.trim()
    ? options.filter((option) => {
        const haystack = [
          option.label,
          option.description,
          option.meta,
          ...(option.tags ?? []),
        ].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(query.trim().toLowerCase());
      })
    : options;

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!selectRef.current?.contains(event.target as globalThis.Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  return (
    <div className="relative min-w-0" ref={selectRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className="grid min-h-[2.45rem] w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-[var(--space-3)] py-[var(--space-2)] text-left font-[inherit] text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            setQuery("");
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        type="button"
      >
        <span className="grid min-w-0 gap-[0.12rem]">
          <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.86rem] font-[690] leading-[1.2]">{selectedOption?.label ?? placeholder}</strong>
          {selectedOption?.description || selectedOption?.meta ? (
            <small className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.72rem] leading-[1.25] text-[var(--color-ink-muted)]">{selectedOption.description ?? selectedOption.meta}</small>
          ) : null}
        </span>
        <ChevronDown size={15} />
      </button>

      {isOpen ? (
        <div
          className={`absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[90] grid max-h-[min(24rem,58vh)] grid-rows-[auto_minmax(0,1fr)] gap-[var(--space-2)] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-2)] shadow-[var(--shadow-lg)]${rich ? " min-w-[min(24rem,calc(100vw-2rem))]" : ""}`}
          role="listbox"
        >
          {rich ? (
            <label className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-[var(--space-2)] text-[var(--color-ink-muted)]">
              <Search size={14} />
              <input
                autoFocus
                className="min-w-0 border-0 bg-transparent py-[var(--space-2)] font-[inherit] text-[0.82rem] text-[var(--color-ink)] outline-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search models"
                type="search"
                value={query}
              />
            </label>
          ) : null}
          <div className="grid min-h-0 max-h-[min(18rem,44vh)] gap-[var(--space-1)] overflow-auto overscroll-contain pr-[0.12rem]">
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const selected = option.value === value;
                return (
                  <button
                    aria-selected={selected}
                    className={`grid w-full cursor-pointer gap-[var(--space-1)] rounded-[var(--radius-sm)] border p-[var(--space-2)] text-left text-[var(--color-ink)] ${
                      selected
                        ? "border-[var(--color-border)] bg-[var(--color-primary-soft)]"
                        : "border-transparent bg-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-primary-soft)]"
                    }`}
                    key={option.value}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                      setQuery("");
                    }}
                    role="option"
                    type="button"
                  >
                    <span className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-[var(--space-2)]">
                      <span className="grid min-w-0 gap-[0.08rem]">
                        <span className="flex min-w-0 flex-wrap items-center gap-[0.35rem]">
                          <strong className="text-[0.84rem] font-[760] leading-[1.2] text-[var(--color-ink)]">{option.label}</strong>
                          {option.recommendationTag ? (
                            <b className="rounded-full border border-[oklch(70%_0.105_155_/_0.38)] bg-[oklch(93%_0.06_155)] px-[0.42rem] py-[0.22rem] text-[0.62rem] font-[820] leading-none text-[oklch(34%_0.105_155)]">
                              {option.recommendationTag}
                            </b>
                          ) : null}
                        </span>
                        {option.meta ? <em className="text-[0.7rem] not-italic font-[690] text-[var(--color-ink-muted)]">{option.meta}</em> : null}
                      </span>
                      {selected ? <Check size={14} /> : null}
                    </span>
                    {option.description ? <small className="text-[0.72rem] leading-[1.35] text-[var(--color-ink-muted)]">{option.description}</small> : null}
                    {option.tags?.length ? (
                      <span className="flex min-w-0 flex-wrap gap-[0.25rem]">
                        {option.tags.slice(0, 5).map((tag) => (
                          <b
                            className="rounded-[var(--radius-xs)] bg-[var(--color-surface-muted)] px-[0.38rem] py-[0.28rem] text-[0.66rem] font-[760] leading-none text-[var(--color-ink-soft)]"
                            key={tag}
                          >
                            {tag}
                          </b>
                        ))}
                      </span>
                    ) : null}
                  </button>
                );
              })
            ) : (
              <span className="p-[var(--space-2)] text-[0.78rem] text-[var(--color-ink-muted)]">No matches</span>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
