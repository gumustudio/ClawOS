export function getBasePath(): string {
  return window.location.pathname.startsWith('/clawos') ? '/clawos' : '';
}

export function withBasePath(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getBasePath()}${normalizedPath}`;
}
