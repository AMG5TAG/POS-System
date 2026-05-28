let _pendingCart: string | null = null;

export function setPendingCart(data: unknown): void {
  _pendingCart = JSON.stringify(data);
}

export function takePendingCart(): string | null {
  const v = _pendingCart;
  _pendingCart = null;
  return v;
}
