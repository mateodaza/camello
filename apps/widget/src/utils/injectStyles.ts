let injected = false;

/**
 * Inject widget CSS animations into document.head once.
 * Uses camello- prefixed class names to avoid host-page collisions.
 */
export function injectWidgetStyles(): void {
  if (injected) return;
  injected = true;

  const style = document.createElement('style');
  style.textContent = `
@keyframes camello-bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
}
@keyframes camello-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.camello-typing-dot {
  display: inline-block; width: 6px; height: 6px;
  margin: 0 1px; border-radius: 50%;
  background-color: currentColor;
  animation: camello-bounce 1.2s infinite;
}
.camello-typing-dot:nth-child(2) { animation-delay: 0.2s; }
.camello-typing-dot:nth-child(3) { animation-delay: 0.4s; }
.camello-msg-enter {
  animation: camello-fade-in 0.2s ease-out both;
}
  `.trim();

  document.head.appendChild(style);
}
