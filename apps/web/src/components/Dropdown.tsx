import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, CheckmarkCircle01Icon } from '@hugeicons/core-free-icons';

export interface DropdownOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface DropdownProps {
  value?: string;
  onChange?: (value: string) => void;
  options?: Array<string | DropdownOption>;
  children?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  style?: CSSProperties;
  className?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
}

export function Dropdown({
  value,
  onChange,
  options,
  children,
  placeholder = '— select —',
  disabled = false,
  required = false,
  style,
  className = '',
  id,
  name,
  'aria-label': ariaLabel,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpwards, setOpenUpwards] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const generatedId = useId();
  const dropdownId = id ?? generatedId;

  // Elevate parent cards and containers above all sibling cards when open
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    // Detect if we should open upwards when close to viewport bottom
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow < 240 && spaceAbove > spaceBelow) {
      setOpenUpwards(true);
    } else {
      setOpenUpwards(false);
    }

    // Elevate ancestor card and section elements so later cards don't overlap the dropdown
    let el: HTMLElement | null = containerRef.current.parentElement;
    const elevatedElements: Array<{ element: HTMLElement; prevZ: string; prevPos: string }> = [];

    while (el && el !== document.body) {
      if (
        el.classList.contains('fp-card') ||
        el.classList.contains('fp-tile') ||
        el.tagName === 'SECTION' ||
        el.tagName === 'FORM'
      ) {
        elevatedElements.push({
          element: el,
          prevZ: el.style.zIndex,
          prevPos: el.style.position,
        });
        el.style.zIndex = '1000';
        if (!el.style.position || el.style.position === 'static') {
          el.style.position = 'relative';
        }
        el.classList.add('fp-card-active-dropdown');
      }
      el = el.parentElement;
    }

    return () => {
      for (const item of elevatedElements) {
        item.element.style.zIndex = item.prevZ;
        item.element.style.position = item.prevPos;
        item.element.classList.remove('fp-card-active-dropdown');
      }
    };
  }, [isOpen]);

  // Normalize options from array prop or <option> children
  const parsedOptions: DropdownOption[] = useMemo(() => {
    if (options && options.length > 0) {
      return options.map((opt) =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt,
      );
    }
    if (children) {
      const items: DropdownOption[] = [];
      React.Children.forEach(children, (child) => {
        if (React.isValidElement(child)) {
          const val = (child.props as { value?: unknown }).value !== undefined ? String((child.props as { value?: unknown }).value) : '';
          const lbl = (child.props as { children?: ReactNode }).children ?? val;
          items.push({
            value: val,
            label: lbl,
            disabled: Boolean((child.props as { disabled?: boolean }).disabled),
          });
        }
      });
      return items;
    }
    return [];
  }, [options, children]);

  const selectedOption = parsedOptions.find((opt) => opt.value === value);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  // Adjust scroll when navigating by keyboard
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listboxRef.current) {
      const itemEl = listboxRef.current.children[highlightedIndex] as HTMLElement;
      if (itemEl) {
        itemEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = useCallback(
    (optVal: string) => {
      onChange?.(optVal);
      setIsOpen(false);
    },
    [onChange],
  );

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(
          selectedOption ? parsedOptions.findIndex((o) => o.value === selectedOption.value) : 0,
        );
      } else {
        setHighlightedIndex((prev) => (prev < parsedOptions.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(
          selectedOption
            ? parsedOptions.findIndex((o) => o.value === selectedOption.value)
            : parsedOptions.length - 1,
        );
      } else {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : parsedOptions.length - 1));
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < parsedOptions.length) {
        const item = parsedOptions[highlightedIndex];
        if (item && !item.disabled) {
          handleSelect(item.value);
        }
      } else {
        setIsOpen((prev) => !prev);
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      if (isOpen) {
        setIsOpen(false);
      }
    }
  }

  // Separate wrapper dimensions (width, flex, margin) from inner button styling
  const wrapperStyle: CSSProperties = {
    position: 'relative',
    display: style?.display ?? (style?.width ? 'inline-block' : 'block'),
    width: style?.width ?? '100%',
    flex: style?.flex,
    minWidth: style?.minWidth,
    maxWidth: style?.maxWidth,
    boxSizing: 'border-box',
    margin: style?.margin,
    zIndex: isOpen ? (style?.zIndex ?? 99999) : undefined,
  };

  const triggerHeight = style?.height ?? 52;

  return (
    <div
      ref={containerRef}
      style={wrapperStyle}
      className={`fp-dropdown-wrapper ${isOpen ? 'is-open' : ''} ${className}`}
    >
      {/* Hidden input for HTML form validation & submission */}
      <input
        type="hidden"
        name={name}
        value={value ?? ''}
        required={required}
      />

      <button
        id={dropdownId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className="fp-dropdown-trigger"
        style={{
          width: '100%',
          height: triggerHeight,
          boxSizing: 'border-box',
          padding: '0 0.85rem',
          borderRadius: 8,
          border: 'none',
          background: 'var(--panel-2)',
          color: selectedOption?.label ? 'var(--text)' : 'var(--muted)',
          fontSize: style?.fontSize ?? '0.95rem',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          boxShadow: isOpen ? '0 0 0 2px var(--accent-glow)' : 'none',
          transition: 'box-shadow 0.2s ease, background 0.2s ease',
          opacity: disabled ? 0.6 : 1,
          textAlign: 'left',
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: isOpen ? 'var(--accent)' : 'var(--muted)',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s ease, color 0.2s ease',
            flexShrink: 0,
          }}
        >
          <HugeiconsIcon icon={ArrowDown01Icon} size={16} />
        </span>
      </button>

      {/* Floating Popover Menu */}
      {isOpen && (
        <ul
          ref={listboxRef}
          role="listbox"
          aria-labelledby={dropdownId}
          className="fp-dropdown-menu"
          style={{
            position: 'absolute',
            top: openUpwards ? undefined : 'calc(100% + 4px)',
            bottom: openUpwards ? 'calc(100% + 4px)' : undefined,
            left: 0,
            width: '100%',
            minWidth: style?.width && typeof style.width === 'number' && style.width < 140 ? 140 : '100%',
            maxHeight: 260,
            overflowY: 'auto',
            background: 'var(--panel)',
            border: 'none',
            borderRadius: 10,
            boxShadow: 'var(--shadow-lift)',
            zIndex: 99999,
            padding: '4px 0',
            margin: 0,
            listStyle: 'none',
            boxSizing: 'border-box',
            animation: 'fp-fade-up 0.15s ease both',
          }}
        >
          {parsedOptions.length === 0 ? (
            <li
              style={{
                padding: '0.6rem 0.85rem',
                color: 'var(--muted)',
                fontSize: '0.85rem',
                textAlign: 'center',
              }}
            >
              No options
            </li>
          ) : (
            parsedOptions.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlighted = idx === highlightedIndex;

              return (
                <li
                  key={opt.value + '-' + idx}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled}
                  onClick={() => !opt.disabled && handleSelect(opt.value)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '0.55rem 0.85rem',
                    background: isSelected
                      ? 'var(--accent-soft)'
                      : isHighlighted
                        ? 'var(--panel-2)'
                        : 'transparent',
                    color: isSelected ? 'var(--accent)' : 'var(--text)',
                    fontSize: '0.9rem',
                    fontWeight: isSelected ? 600 : 400,
                    cursor: opt.disabled ? 'not-allowed' : 'pointer',
                    opacity: opt.disabled ? 0.5 : 1,
                    transition: 'background 0.15s ease',
                    userSelect: 'none',
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                  >
                    {opt.label}
                  </span>
                  {isSelected && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        color: 'var(--accent)',
                        flexShrink: 0,
                      }}
                    >
                      <HugeiconsIcon icon={CheckmarkCircle01Icon} size={15} />
                    </span>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
