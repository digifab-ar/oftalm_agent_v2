const MAX_RETRIES = 2;
const RETRY_BASE_MS = 400;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esReintetable(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

/**
 * POST /api/examen/turno con el mismo body en cada reintento (idempotencia de timestamp).
 */
export async function postExamenTurno(
  url: string,
  body: Record<string, unknown>
): Promise<{ response: Response; data: Record<string, unknown> }> {
  const payload = JSON.stringify(body);
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });

      let data: Record<string, unknown> = {};
      try {
        data = (await response.json()) as Record<string, unknown>;
      } catch {
        data = {};
      }

      if (response.ok) {
        return { response, data };
      }

      if (!esReintetable(response.status)) {
        return { response, data };
      }

      lastError = new Error(
        typeof data.error === 'string'
          ? data.error
          : `HTTP ${response.status}`
      );
    } catch (err) {
      lastError = err;
    }

    if (attempt < MAX_RETRIES) {
      await esperar(RETRY_BASE_MS * (attempt + 1));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? 'postExamenTurno failed'));
}
