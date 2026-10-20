"use client"

import IosButton from "./IosButton"

export interface TabItem<T extends string> {
  key: T
  label: string
}

/**
 * The pill tab switch. One component, so the evaluation results page and the
 * evaluation coverage page read identically — and so the switch is not
 * hand-rolled button markup that drifts from the design system.
 */
export default function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: TabItem<T>[]
  active: T
  onChange: (key: T) => void
}) {
  return (
    <div className="flex items-center gap-2">
      {tabs.map((t) => (
        <IosButton
          key={t.key}
          variant={active === t.key ? "primary" : "gray"}
          size="sm"
          className={`rounded-full ${
            active === t.key ? "" : "border border-default hover:border-amber-300 hover:text-secondary"
          }`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </IosButton>
      ))}
    </div>
  )
}
