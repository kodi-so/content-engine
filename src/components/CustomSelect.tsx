import { Check, ChevronDown, Search } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type CustomSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  meta?: string;
  recommendationTag?: string;
  tags?: string[];
};

export type CustomSelectProps = {
  className?: string;
  disabled?: boolean;
  dropdownClassName?: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder: string;
  rich?: boolean;
  searchPlaceholder?: string;
  triggerClassName?: string;
  value?: string;
};

type DropdownPosition = {
  left: number;
  maxHeight: number;
  top: number;
  width: number;
  placement: "above" | "below";
};

const defaultTriggerClass =
  "grid min-h-[2.45rem] w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-[var(--space-3)] py-[var(--space-2)] text-left font-[inherit] text-[var(--color-ink)] outline-none transition hover:border-[var(--color-accent)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_oklch(57%_0.14_166_/_0.13)] disabled:cursor-not-allowed disabled:opacity-60";

function optionMatchesQuery(option: CustomSelectOption, query: string) {
  const haystack = [
    option.label,
    option.description,
    option.meta,
    ...(option.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.trim().toLowerCase());
}

function selectedIndexForOptions(options: CustomSelectOption[], value?: string) {
  const selectedIndex = options.findIndex((option) => option.value === value);
  if (selectedIndex >= 0 && !options[selectedIndex]?.disabled) return selectedIndex;
  return options.findIndex((option) => !option.disabled);
}

export function CustomSelect({
  className,
  disabled = false,
  dropdownClassName,
  onChange,
  options,
  placeholder,
  rich = false,
  searchPlaceholder = "Search",
  triggerClassName,
  value,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = useMemo(
    () => (rich && query.trim() ? options.filter((option) => optionMatchesQuery(option, query)) : options),
    [options, query, rich]
  );

  const updateDropdownPosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const desiredWidth = rich ? Math.max(rect.width, Math.min(384, window.innerWidth - 24)) : rect.width;
    const width = Math.min(desiredWidth, window.innerWidth - viewportPadding * 2);
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
    );
    const belowSpace = window.innerHeight - rect.bottom;
    const aboveSpace = rect.top;
    const placement = belowSpace < 220 && aboveSpace > belowSpace ? "above" : "below";
    const availableSpace = placement === "above" ? aboveSpace : belowSpace;
    const maxHeight = Math.max(180, Math.min(384, availableSpace - viewportPadding - 6));
    const top = placement === "above" ? rect.top - 6 : rect.bottom + 6;

    setDropdownPosition({ left, maxHeight, placement, top, width });
  };

  const closeDropdown = () => {
    setIsOpen(false);
    setQuery("");
  };

  const openDropdown = () => {
    if (disabled) return;
    setIsOpen(true);
  };

  const chooseOption = (option: CustomSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    closeDropdown();
    triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();
    setActiveIndex(Math.max(0, selectedIndexForOptions(filteredOptions, value)));
  }, [filteredOptions, isOpen, rich, value]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      closeDropdown();
    };
    const handleViewportChange = () => updateDropdownPosition();

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen]);

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      closeDropdown();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDropdown();
    }
  };

  const handleDropdownKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      closeDropdown();
      triggerRef.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;

    event.preventDefault();
    if (event.key === "Enter") {
      const option = filteredOptions[activeIndex];
      if (option) chooseOption(option);
      return;
    }

    const direction = event.key === "ArrowDown" ? 1 : -1;
    let nextIndex = activeIndex;
    for (let index = 0; index < filteredOptions.length; index += 1) {
      nextIndex = (nextIndex + direction + filteredOptions.length) % filteredOptions.length;
      if (!filteredOptions[nextIndex]?.disabled) break;
    }
    setActiveIndex(nextIndex);
  };

  const dropdownStyle: CSSProperties | undefined = dropdownPosition
    ? {
        left: dropdownPosition.left,
        maxHeight: dropdownPosition.maxHeight,
        top: dropdownPosition.top,
        transform: dropdownPosition.placement === "above" ? "translateY(-100%)" : undefined,
        width: dropdownPosition.width,
      }
    : undefined;

  const dropdown = isOpen && dropdownPosition
    ? createPortal(
        <div
          className={[
            "fixed z-[1000] grid grid-rows-[auto_minmax(0,1fr)] gap-[var(--space-2)] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-2)] text-[var(--color-ink)] shadow-[var(--shadow-lg)]",
            dropdownClassName,
          ].filter(Boolean).join(" ")}
          onKeyDown={handleDropdownKeyDown}
          ref={dropdownRef}
          role="listbox"
          style={dropdownStyle}
          tabIndex={-1}
        >
          {rich ? (
            <label className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-[var(--space-2)] text-[var(--color-ink-muted)]">
              <Search size={14} />
              <input
                autoFocus
                className="min-w-0 border-0 bg-transparent py-[var(--space-2)] font-[inherit] text-[0.82rem] text-[var(--color-ink)] outline-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                type="search"
                value={query}
              />
            </label>
          ) : null}
          <div className="grid min-h-0 gap-[var(--space-1)] overflow-auto overscroll-contain pr-[0.12rem]">
            {filteredOptions.length ? (
              filteredOptions.map((option, index) => {
                const selected = option.value === value;
                const active = index === activeIndex;
                return (
                  <button
                    aria-selected={selected}
                    className={[
                      "grid w-full cursor-pointer gap-[var(--space-1)] rounded-[var(--radius-sm)] border p-[var(--space-2)] text-left text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-45",
                      selected || active
                        ? "border-[var(--color-border)] bg-[var(--color-primary-soft)]"
                        : "border-transparent bg-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-primary-soft)]",
                    ].join(" ")}
                    disabled={option.disabled}
                    key={option.value}
                    onClick={() => chooseOption(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                    role="option"
                    type="button"
                  >
                    <span className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-[var(--space-2)]">
                      <span className="grid min-w-0 gap-[0.08rem]">
                        <span className="flex min-w-0 flex-wrap items-center gap-[0.35rem]">
                          <strong className="text-[0.84rem] font-[760] leading-[1.2] text-[var(--color-ink)]">
                            {option.label}
                          </strong>
                          {option.recommendationTag ? (
                            <b className="rounded-full border border-[oklch(70%_0.105_155_/_0.38)] bg-[oklch(93%_0.06_155)] px-[0.42rem] py-[0.22rem] text-[0.62rem] font-[820] leading-none text-[oklch(34%_0.105_155)]">
                              {option.recommendationTag}
                            </b>
                          ) : null}
                        </span>
                        {option.meta ? (
                          <em className="text-[0.7rem] font-[690] not-italic text-[var(--color-ink-muted)]">
                            {option.meta}
                          </em>
                        ) : null}
                      </span>
                      {selected ? <Check size={14} /> : null}
                    </span>
                    {option.description ? (
                      <small className="text-[0.72rem] leading-[1.35] text-[var(--color-ink-muted)]">
                        {option.description}
                      </small>
                    ) : null}
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
              <span className="p-[var(--space-2)] text-[0.78rem] text-[var(--color-ink-muted)]">
                No matches
              </span>
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className={["relative min-w-0", className].filter(Boolean).join(" ")}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={[defaultTriggerClass, triggerClassName].filter(Boolean).join(" ")}
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span className="grid min-w-0 gap-[0.12rem]">
          <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.86rem] font-[690] leading-[1.2]">
            {selectedOption?.label ?? placeholder}
          </strong>
          {selectedOption?.description || selectedOption?.meta ? (
            <small className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.72rem] leading-[1.25] text-[var(--color-ink-muted)]">
              {selectedOption.description ?? selectedOption.meta}
            </small>
          ) : null}
        </span>
        <ChevronDown
          className={["transition", isOpen ? "rotate-180" : ""].filter(Boolean).join(" ")}
          size={15}
        />
      </button>
      {dropdown}
    </div>
  );
}
