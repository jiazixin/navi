type BrandMarkProps = { className?: string | undefined }

export function BrandMark({ className }: BrandMarkProps): React.JSX.Element {
  return (
    <svg aria-hidden="true" className={className} height="30" viewBox="0 0 32 32" width="30">
      <circle cx="16" cy="16" fill="none" r="14.5" stroke="currentColor" strokeOpacity=".35" />
      <circle
        cx="16"
        cy="16"
        fill="none"
        r="9.5"
        stroke="currentColor"
        strokeDasharray="1.5 2.5"
        strokeOpacity=".22"
      />
      <path d="M16 3.5 19 16h-6Z" fill="var(--accent)" />
      <path d="M16 28.5 13 16h6Z" fill="currentColor" fillOpacity=".45" />
    </svg>
  )
}
