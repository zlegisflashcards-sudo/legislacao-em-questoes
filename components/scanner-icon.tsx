type ScannerIconProps = {
  className?: string;
};

export function ScannerIcon({ className = "h-5 w-5" }: ScannerIconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={`${className} shrink-0 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]`}
    >
      <path d="M7 11V6h5M20 6h5v5M25 21v5h-5M12 26H7v-5" />
      <path d="M11 10h10v12H11z" />
      <path d="M13.5 14h5M13.5 17h5" />
    </svg>
  );
}
