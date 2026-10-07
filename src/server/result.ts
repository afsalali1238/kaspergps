// Server result type shared by the console operations.
export interface OpResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export function ok<T>(data: T | undefined, message: string): OpResult<T> {
  return { ok: true, data: data as T, message };
}

export function fail<T = undefined>(error: string): OpResult<T> {
  return { ok: false, error };
}
