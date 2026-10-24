"use client"

import { useRef } from "react"

interface IosButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
  allowRapidClick?: boolean
  variant?: "primary" | "tinted" | "success" | "destructive" | "gray" | "plain"
  size?: "xs" | "sm" | "md"
  // React 19 passes `ref` to function components as a regular prop, so this is
  // forwarded explicitly rather than via forwardRef (deprecated in 19).
  ref?: React.Ref<HTMLButtonElement>
}

const variantClasses = {
  primary: "btn-ios-primary",
  tinted: "btn-ios-tinted",
  success: "btn-ios-success",
  destructive: "btn-ios-destructive",
  gray: "btn-ios-gray",
  plain: "btn-ios-plain",
}

const sizeClasses = {
  xs: "ios-btn-xs",
  sm: "ios-btn-sm",
  md: "",
}

export default function IosButton({
  children,
  loading = false,
  allowRapidClick = false,
  disabled = false,
  variant = "primary",
  size = "md",
  onClick,
  className = "",
  ref,
  ...props
}: IosButtonProps) {
  const clicked = useRef(false)

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if ((!allowRapidClick && clicked.current) || loading || disabled) {
      e.preventDefault()
      return
    }
    if (!allowRapidClick) {
      clicked.current = true
      setTimeout(() => { clicked.current = false }, 500)
    }
    onClick?.(e)
  }

  return (
    <button
      {...props}
      ref={ref}
      disabled={disabled || loading}
      onClick={handleClick}
      className={`${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin ios-spinner w-3.5 h-3.5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  )
}
