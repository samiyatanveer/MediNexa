// frontend/src/components/ui/EmptyState.jsx
export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && <div className="text-4xl mb-4 opacity-60">{icon}</div>}
      <h3 className="text-txt-primary font-semibold text-lg mb-2">{title}</h3>
      {description && <p className="text-txt-muted text-sm max-w-xs leading-relaxed mb-6">{description}</p>}
      {action && action}
    </div>
  );
}
