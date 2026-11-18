import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';
import { Row } from './kit';
import { SheetHeader, closeSheet } from './Sheet';

/** Eine Option aus einer kurzen Liste wählen (schliesst sich danach). */
export function ChoiceSheet({ title, hint, options, value, onPick }: { title: string; hint?: string; options: { value: string; label: ComponentChildren }[]; value: string; onPick: (v: string) => void }) {
  return (
    <>
      <SheetHeader title={title} />
      <div class="sheet-body">
        <div class="list">
          {options.map((o) => (
            <Row
              title={o.label}
              trail={
                <span class={`check ${o.value === value ? 'on' : ''}`}>
                  <Icon name="check" stroke={3} />
                </span>
              }
              onClick={() => {
                onPick(o.value);
                closeSheet();
              }}
            />
          ))}
        </div>
        {hint && <p class="hint">{hint}</p>}
      </div>
    </>
  );
}
