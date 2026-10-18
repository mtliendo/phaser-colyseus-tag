export type Axis = { dx: number; dy: number };

export function attachJoystick(root: HTMLElement, onChange: (axis: Axis) => void): () => void {
  const knob = root.querySelector<HTMLElement>(".joystick-knob");
  if (!knob) throw new Error("joystick knob missing");

  let active = false;
  const max = 48;

  const setKnob = (dx: number, dy: number) => {
    knob.style.transform = `translate(calc(-50% + ${dx * max}px), calc(-50% + ${dy * max}px))`;
  };

  const read = (event: PointerEvent): Axis => {
    const rect = root.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = (event.clientX - cx) / max;
    let dy = (event.clientY - cy) / max;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    return { dx, dy };
  };

  const down = (event: PointerEvent) => {
    active = true;
    root.setPointerCapture(event.pointerId);
    const axis = read(event);
    setKnob(axis.dx, axis.dy);
    onChange(axis);
    event.preventDefault();
  };

  const move = (event: PointerEvent) => {
    if (!active) return;
    const axis = read(event);
    setKnob(axis.dx, axis.dy);
    onChange(axis);
    event.preventDefault();
  };

  const up = (event: PointerEvent) => {
    active = false;
    setKnob(0, 0);
    onChange({ dx: 0, dy: 0 });
    event.preventDefault();
  };

  root.addEventListener("pointerdown", down);
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerup", up);
  root.addEventListener("pointercancel", up);

  return () => {
    root.removeEventListener("pointerdown", down);
    root.removeEventListener("pointermove", move);
    root.removeEventListener("pointerup", up);
    root.removeEventListener("pointercancel", up);
  };
}

export function preventPageGestures(target: HTMLElement = document.body): void {
  const block = (event: Event) => event.preventDefault();
  target.addEventListener("touchmove", block, { passive: false });
  target.addEventListener("gesturestart", block as EventListener);
}
