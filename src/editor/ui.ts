// Small DOM helpers for the editor's panels: elements, buttons and labeled fields that commit
// on change (blur or Enter), so a field being typed in is never overwritten mid-word.

type Child = Node | string | null | false | undefined;

export interface ElProps {
  readonly class?: string;
  readonly title?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly on?: Readonly<Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class !== undefined) node.className = props.class;
  if (props.title !== undefined) node.title = props.title;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) node.setAttribute(k, v);
  for (const [k, f] of Object.entries(props.on ?? {})) node.addEventListener(k, f);
  for (const c of children) {
    if (c === null || c === false || c === undefined) continue;
    node.append(c);
  }
  return node;
}

export function button(
  label: string,
  onClick: () => void,
  options: {
    readonly title?: string;
    readonly primary?: boolean;
    readonly disabled?: boolean;
    readonly pressed?: boolean;
  } = {},
): HTMLButtonElement {
  const b = el('button', {
    class: `ted-btn${options.primary === true ? ' ted-primary' : ''}${options.pressed === true ? ' ted-on' : ''}`,
    text: label,
    attrs: { type: 'button' },
    on: {
      click: () => {
        onClick();
      },
    },
    ...(options.title === undefined ? {} : { title: options.title }),
  });
  b.disabled = options.disabled === true;
  return b;
}

/** A row with a label and a control. */
export function row(label: string, control: Node, hint?: string): HTMLElement {
  return el(
    'label',
    { class: 'ted-row' },
    el('span', { class: 'ted-label', text: label }),
    control,
    hint === undefined ? null : el('span', { class: 'ted-hint', text: hint }),
  );
}

function onCommit(input: HTMLInputElement | HTMLTextAreaElement, commit: () => void): void {
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => {
    const k = e as KeyboardEvent;
    if (k.key === 'Enter' && !(input instanceof HTMLTextAreaElement)) input.blur();
    if (k.key === 'Escape') input.blur();
  });
}

export function textInput(
  value: string,
  commit: (v: string) => void,
  options: { readonly placeholder?: string; readonly invalid?: boolean } = {},
): HTMLInputElement {
  const i = el('input', { class: 'ted-input', attrs: { type: 'text', spellcheck: 'false' } });
  i.value = value;
  if (options.placeholder !== undefined) i.placeholder = options.placeholder;
  if (options.invalid === true) i.classList.add('ted-invalid');
  onCommit(i, () => {
    commit(i.value.trim());
  });
  return i;
}

export function textArea(
  value: string,
  commit: (v: string) => void,
  rows = 3,
): HTMLTextAreaElement {
  const t = el('textarea', { class: 'ted-input ted-area', attrs: { rows: String(rows) } });
  t.value = value;
  onCommit(t, () => {
    commit(t.value.trim());
  });
  return t;
}

/** A number field; an empty field commits null. */
export function numberInput(
  value: number | null,
  commit: (v: number | null) => void,
  options: {
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
    readonly placeholder?: string;
  } = {},
): HTMLInputElement {
  const i = el('input', { class: 'ted-input ted-num', attrs: { type: 'number' } });
  if (options.min !== undefined) i.min = String(options.min);
  if (options.max !== undefined) i.max = String(options.max);
  i.step = String(options.step ?? 1);
  if (options.placeholder !== undefined) i.placeholder = options.placeholder;
  i.value = value === null ? '' : String(value);
  onCommit(i, () => {
    const t = i.value.trim();
    if (t === '') {
      commit(null);
      return;
    }
    const n = Number(t);
    if (Number.isFinite(n)) commit(n);
  });
  return i;
}

export function checkbox(value: boolean, commit: (v: boolean) => void): HTMLInputElement {
  const c = el('input', { class: 'ted-check', attrs: { type: 'checkbox' } });
  c.checked = value;
  c.addEventListener('change', () => {
    commit(c.checked);
  });
  return c;
}

export function select<T extends string>(
  value: T,
  options: readonly (readonly [T, string])[],
  commit: (v: T) => void,
): HTMLSelectElement {
  const s = el('select', { class: 'ted-input ted-select' });
  for (const [v, label] of options) {
    const o = el('option', { text: label });
    o.value = v;
    s.append(o);
  }
  s.value = value;
  s.addEventListener('change', () => {
    const found = options.find(([v]) => v === s.value);
    if (found !== undefined) commit(found[0]);
  });
  return s;
}

/** A collapsible panel section that remembers whether it is open. */
export function section(
  key: string,
  title: string,
  open: ReadonlyMap<string, boolean>,
  setOpen: (key: string, v: boolean) => void,
  ...children: Child[]
): HTMLDetailsElement {
  const d = el('details', { class: 'ted-section' }, el('summary', { text: title }), ...children);
  d.open = open.get(key) ?? true;
  d.addEventListener('toggle', () => {
    setOpen(key, d.open);
  });
  return d;
}

export function isTyping(target: EventTarget | null): boolean {
  return (
    (target instanceof HTMLInputElement && target.type !== 'checkbox') ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
