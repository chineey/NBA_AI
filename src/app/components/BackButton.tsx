type BackButtonProps = {
  onClick: () => void;
  label?: string;
};

export function BackButton({ onClick, label = 'Back' }: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
    >
      ← {label}
    </button>
  );
}
