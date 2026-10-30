export const RADIOENGE_KEEP_ALIVE_MAX_INTERVAL_SECONDS = 2;
export const RADIOENGE_KEEP_ALIVE_ESCALATION_SECONDS = RADIOENGE_KEEP_ALIVE_MAX_INTERVAL_SECONDS * 2;

export function isRadioengeKeepAliveFailure(input: {
  brand?: string | null;
  qualifier?: string | null;
  eventCode?: string | null;
}) {
  return input.brand?.trim().toUpperCase() === "RADIOENGE"
    && input.qualifier === "E"
    && input.eventCode === "361";
}

export function isRadioengeKeepAliveRestoration(input: {
  brand?: string | null;
  qualifier?: string | null;
  eventCode?: string | null;
}) {
  return input.brand?.trim().toUpperCase() === "RADIOENGE"
    && input.qualifier === "R"
    && input.eventCode === "361";
}

export function getRadioengeKeepAliveObservationUntil(receivedAt: Date) {
  return new Date(receivedAt.getTime() + RADIOENGE_KEEP_ALIVE_ESCALATION_SECONDS * 1000);
}

export function isRadioengeObservationWithinWindow(observationUntil: Date | null | undefined, now = new Date()) {
  return Boolean(observationUntil && observationUntil.getTime() > now.getTime());
}
